import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../app.js';
import { createTestApp, registerVerified } from './helpers.js';
import { summarize } from '../db.js';
import { sampleProject } from '../sample.js';
import { pageSchema } from '../schema.js';
import { messages, translate } from '../../src/i18n.js';

const app = createTestApp({ authLimit: 500 });
const alice = request.agent(app),
  bob = request.agent(app);
const header = { 'X-Nodo-Client': 'web' };
const password = 'Testing-a-local-workspace-2026';
let projectId, pageId;
const call = (agent, method, path, body) =>
  agent[method](path)
    .set(header)
    .send(
      path === '/api/auth/register' && body ? { emailConfirmation: body.email, ...body } : body,
    );

before(async () => {
  await registerVerified(app, alice, {
    name: 'Alicia',
    email: 'alice@example.test',
    password,
  });
  await registerVerified(app, bob, {
    name: 'Bob',
    email: 'bob@example.test',
    password,
    language: 'en',
  });
  const project = await call(alice, 'post', '/api/projects/sample').expect(201);
  projectId = project.body.id;
  const detail = await alice.get(`/api/projects/${projectId}`).expect(200);
  pageId = detail.body.pages[1].id;
});
after(() => app.locals.db.close());

test('registration validates email, password, and duplicate accounts', async () => {
  await call(request(app), 'post', '/api/auth/register', {
    name: 'Test',
    email: 'not-an-email',
    password: 'short',
  }).expect(400);
  await call(request(app), 'post', '/api/auth/register', {
    name: 'Test',
    email: 'ALICE@example.test',
    password,
  }).expect(409);
});
test('private API rejects anonymous requests', async () => {
  await request(app).get('/api/projects').expect(401);
  await request(app).get(`/api/projects/${projectId}`).expect(401);
});
test('session is HttpOnly and stores only a hash in the database', async () => {
  const result = await call(request(app), 'post', '/api/auth/login', {
    email: 'alice@example.test',
    password,
  }).expect(200);
  const cookie = result.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api/);
  assert.doesNotMatch(JSON.stringify(result.body), /password/);
  const token = cookie.match(/nodo_session=([^;]+)/)[1];
  assert.equal(
    app.locals.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(token),
    undefined,
  );
  assert.notEqual(
    app.locals.db.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash,
    password,
  );
});
test('login rejects incorrect credentials', async () => {
  await call(request(app), 'post', '/api/auth/login', {
    email: 'alice@example.test',
    password: 'incorrect-password',
  }).expect(401);
  await call(request(app), 'post', '/api/auth/login', {
    email: 'missing@example.test',
    password,
  }).expect(401);
});
test('writes reject missing CSRF header and foreign origins', async () => {
  await alice.post('/api/projects').send({ title: 'CSRF' }).expect(403);
  await alice
    .post('/api/projects')
    .set(header)
    .set('Origin', 'https://foreign.example')
    .send({ title: 'CSRF' })
    .expect(403);
  await alice
    .post('/api/projects')
    .set(header)
    .set('Origin', 'http://127.0.0.1:5173')
    .send({ title: 'Allowed' })
    .expect(201);
});
test('another user cannot read, edit, delete, restore, duplicate, or add pages to a project', async () => {
  await bob.get(`/api/projects/${projectId}`).expect(404);
  for (const [method, suffix, body] of [
    ['patch', '', { title: 'Stolen' }],
    ['delete', ''],
    ['post', '/restore'],
    ['post', '/duplicate'],
    ['post', '/pages', { title: 'Stolen' }],
  ]) {
    await call(bob, method, `/api/projects/${projectId}${suffix}`, body).expect(404);
  }
  const result = await bob.get('/api/projects').expect(200);
  assert.equal(result.body.total, 0);
  assert.equal((await bob.get('/api/dashboard')).body.projects, 0);
});
test('another user cannot edit, delete, restore, or duplicate a page', async () => {
  for (const [method, suffix] of [
    ['put', ''],
    ['delete', ''],
    ['post', '/restore'],
    ['post', '/duplicate'],
  ]) {
    await call(bob, method, `/api/pages/${pageId}${suffix}`, { title: 'Stolen' }).expect(404);
  }
});
test('updating tasks recalculates project and dashboard summaries', async () => {
  const detail = (await alice.get(`/api/projects/${projectId}`)).body;
  const page = detail.pages.find((item) => item.id === pageId);
  const updated = {
    ...page,
    blocks: page.blocks.map((block) =>
      block.type === 'table'
        ? { ...block, rows: block.rows.map((row) => ({ ...row, status: 'done' })) }
        : block,
    ),
  };
  await call(alice, 'put', `/api/pages/${page.id}`, updated).expect(200);
  const result = (await alice.get(`/api/projects/${projectId}`)).body;
  assert.equal(result.summary.progress, 60);
  assert.equal(result.summary.done, 3);
  assert.equal(result.summary.counts.progress, 0);
  assert.equal((await alice.get('/api/dashboard')).body.completed, 3);
});
test('stale page versions cannot overwrite a newer edit', async () => {
  const detail = (await alice.get(`/api/projects/${projectId}`)).body;
  const page = detail.pages[0];
  await call(alice, 'put', `/api/pages/${page.id}`, { ...page, title: 'Newest title' }).expect(200);
  await call(alice, 'put', `/api/pages/${page.id}`, { ...page, title: 'Stale title' }).expect(409);
  assert.equal((await alice.get(`/api/projects/${projectId}`)).body.pages[0].title, 'Newest title');
});
test('link blocks reject executable and malformed URLs', async () => {
  const page = (await alice.get(`/api/projects/${projectId}`)).body.pages[0];
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'not-a-link']) {
    await call(alice, 'put', `/api/pages/${page.id}`, {
      ...page,
      blocks: [{ id: randomUUID(), type: 'link', title: 'Unsafe', url, preview: true }],
    }).expect(400);
  }
});
test('rich text rejects executable links and unsupported nodes', async () => {
  const page = (await alice.get(`/api/projects/${projectId}`)).body.pages[0];
  const block = {
    id: randomUUID(),
    type: 'text',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Unsafe',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    },
  };
  await call(alice, 'put', `/api/pages/${page.id}`, { ...page, blocks: [block] }).expect(400);
  block.content.content = [{ type: 'script', text: 'alert(1)' }];
  await call(alice, 'put', `/api/pages/${page.id}`, { ...page, blocks: [block] }).expect(400);
});
test('project duplication creates independent pages, blocks, and rows', async () => {
  const copy = await call(alice, 'post', `/api/projects/${projectId}/duplicate`).expect(201);
  const original = (await alice.get(`/api/projects/${projectId}`)).body;
  const duplicated = (await alice.get(`/api/projects/${copy.body.id}`)).body;
  assert.notEqual(duplicated.id, original.id);
  assert.equal(duplicated.pages.length, original.pages.length);
  assert.notEqual(duplicated.pages[1].id, original.pages[1].id);
  assert.notEqual(duplicated.pages[1].blocks[1].id, original.pages[1].blocks[1].id);
  assert.notEqual(duplicated.pages[1].blocks[1].rows[0].id, original.pages[1].blocks[1].rows[0].id);
  await call(alice, 'delete', `/api/projects/${copy.body.id}`).expect(204);
});
test('page duplication keeps the original and appends a separate tab', async () => {
  const copy = await call(alice, 'post', `/api/pages/${pageId}/duplicate`).expect(201);
  assert.notEqual(copy.body.id, pageId);
  await call(alice, 'delete', `/api/pages/${copy.body.id}`).expect(204);
});
test('deleted pages leave summaries and can be restored', async () => {
  await call(alice, 'delete', `/api/pages/${pageId}`).expect(204);
  assert.equal((await alice.get(`/api/projects/${projectId}`)).body.summary.done, 0);
  assert.ok((await alice.get('/api/trash')).body.pages.some((page) => page.id === pageId));
  await call(bob, 'post', `/api/pages/${pageId}/restore`).expect(404);
  await call(alice, 'post', `/api/pages/${pageId}/restore`).expect(204);
  assert.equal((await alice.get(`/api/projects/${projectId}`)).body.summary.done, 3);
});
test('soft deletion hides a project and all nested pages until restoration', async () => {
  await call(alice, 'delete', `/api/projects/${projectId}`).expect(204);
  await alice.get(`/api/projects/${projectId}`).expect(404);
  await call(alice, 'put', `/api/pages/${pageId}`, { title: 'Hidden page' }).expect(404);
  assert.ok(
    (await alice.get('/api/trash')).body.projects.some((project) => project.id === projectId),
  );
  assert.ok(
    !(await bob.get('/api/trash')).body.projects.some((project) => project.id === projectId),
  );
  await call(alice, 'post', `/api/projects/${projectId}/restore`).expect(204);
  assert.ok(
    (await alice.get(`/api/projects/${projectId}`)).body.pages.some((page) => page.id === pageId),
  );
});
test('favorites, searches, filters, and pagination stay scoped to the owner', async () => {
  await call(alice, 'patch', `/api/projects/${projectId}`, { favorite: true }).expect(200);
  const found = await alice.get('/api/projects?q=Nodo&favorite=true&limit=1&page=1').expect(200);
  assert.equal(found.body.items[0].id, projectId);
  assert.equal(found.body.total, 1);
  assert.equal((await bob.get('/api/projects?favorite=true&q=Nodo')).body.total, 0);
  assert.equal((await alice.get('/api/projects?status=done&q=Nodo')).body.total, 0);
  await alice.get('/api/projects?page=-1').expect(400);
});
test('language, icon avatar, and theme preferences persist', async () => {
  await call(bob, 'patch', '/api/me', {
    name: 'Roberto',
    avatar: 'terminal',
    language: 'es',
    theme: 'dark',
  }).expect(200);
  const result = (await bob.get('/api/me')).body;
  assert.equal(result.name, 'Roberto');
  assert.equal(result.avatar, 'terminal');
  assert.equal(result.theme, 'dark');
  assert.equal(result.language, 'es');
});
test('sample projects are valid in both languages', () => {
  for (const language of ['es', 'en'])
    for (const page of sampleProject(language).pages) assert.ok(pageSchema.safeParse(page).success);
});
test('translations have matching keys and valid Spanish text', () => {
  const keys = (obj, prefix = '') =>
    Object.entries(obj)
      .flatMap(([key, value]) =>
        typeof value === 'object' ? keys(value, `${prefix}${key}.`) : `${prefix}${key}`,
      )
      .sort();
  assert.deepEqual(keys(messages.es), keys(messages.en));
  assert.equal(messages.es.description, 'Descripción');
  assert.equal(translate('es', 'pageCount', { count: 1 }), '1 página');
  assert.equal(translate('en', 'pageCount', { count: 2 }), '2 pages');
  assert.doesNotMatch(JSON.stringify(messages), /\uFFFD|Ã|Â/);
});
test('summary uses page states when there are no tasks and blockers take precedence', () => {
  assert.equal(
    summarize([
      { blocks: [], status: 'done' },
      { blocks: [], status: 'todo' },
    ]).progress,
    50,
  );
  assert.equal(
    summarize([
      { blocks: [], status: 'blocked' },
      { blocks: [], status: 'progress' },
    ]).status,
    'blocked',
  );
  assert.equal(summarize([]).status, 'todo');
});
test('logout invalidates the server-side session', async () => {
  const agent = request.agent(app);
  await call(agent, 'post', '/api/auth/login', { email: 'alice@example.test', password }).expect(
    200,
  );
  await call(agent, 'post', '/api/auth/logout').expect(204);
  await agent.get('/api/me').expect(401);
});

test('accounts, sessions, and projects persist after reopening SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nodo-persistence-'));
  const databasePath = join(directory, 'test.sqlite');
  let current = createTestApp({ databasePath });
  try {
    const registration = await registerVerified(current, request(current), {
      name: 'Persistencia',
      email: 'persistence@example.test',
      password,
    });
    const cookie = registration.headers['set-cookie'][0].split(';')[0];
    const result = await request(current)
      .post('/api/projects')
      .set(header)
      .set('Cookie', cookie)
      .send({ title: 'Proyecto persistente' })
      .expect(201);
    current.locals.db.close();
    current = createTestApp({ databasePath });
    const stored = await request(current)
      .get(`/api/projects/${result.body.id}`)
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(stored.body.title, 'Proyecto persistente');
  } finally {
    current.locals.db.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${databasePath}${suffix}`, { force: true });
    rmdirSync(directory);
  }
});

test('production sessions set Secure cookies', async () => {
  const productionApp = createTestApp({
    databasePath: ':memory:',
    production: true,
    origin: 'https://nodo.example.com',
  });
  try {
    const response = await registerVerified(productionApp, request(productionApp), {
      name: 'Production',
      email: 'production@example.test',
      password,
    });
    assert.match(response.headers['set-cookie'][0], /; Secure/);
  } finally {
    productionApp.locals.db.close();
  }
});

test('authentication attempts are rate limited', async () => {
  const limitedApp = createApp({ databasePath: ':memory:', authLimit: 2 });
  try {
    for (let attempt = 0; attempt < 2; attempt++)
      await call(request(limitedApp), 'post', '/api/auth/login', {
        email: 'unknown@example.test',
        password,
      }).expect(401);
    await call(request(limitedApp), 'post', '/api/auth/login', {
      email: 'unknown@example.test',
      password,
    }).expect(429);
  } finally {
    limitedApp.locals.db.close();
  }
});

test('overly nested rich text is rejected before recursive parsing', () => {
  let content = { type: 'paragraph' };
  for (let level = 0; level < 100; level++) content = { type: 'blockquote', content: [content] };
  assert.equal(
    pageSchema.safeParse({
      title: 'Deep document',
      blocks: [{ id: randomUUID(), type: 'text', content: { type: 'doc', content: [content] } }],
    }).success,
    false,
  );
});
