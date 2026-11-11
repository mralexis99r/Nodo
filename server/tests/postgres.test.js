import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { createPostgresStorage, postgresOptions, postgresSql, createStorage } from '../storage.js';
import { createTestApp, registerVerified, headers } from './helpers.js';
import { openDatabase } from '../db.js';
import { importSQLite } from '../import-sqlite.js';

// Run the same tests against real PostgreSQL in CI and embedded PostgreSQL locally.
async function embeddedPool() {
  const engine = new PGlite();
  let tail = Promise.resolve();
  function enqueue(action) {
    const next = tail.then(action);
    tail = next.catch(() => {});
    return next;
  }
  async function query(sql, params) {
    const result = await engine.query(sql, params);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  }
  return {
    query: (sql, params) => enqueue(() => query(sql, params)),
    connect() {
      let acquired, unlock;
      const ready = new Promise((resolve) => {
        acquired = resolve;
      });
      const held = new Promise((resolve) => {
        unlock = resolve;
      });
      enqueue(async () => {
        acquired({ query, release: unlock });
        await held;
      });
      return ready;
    },
    async end() {
      await tail;
      await engine.close();
    },
  };
}

let store, app, owner, other, projectId;
const password = 'Postgres-test-password-2026';
const post = (agent, path, body) => agent.post(path).set(headers).send(body);
before(async () => {
  store = createPostgresStorage(
    process.env.TEST_DATABASE_URL
      ? { connectionString: process.env.TEST_DATABASE_URL }
      : { pool: await embeddedPool() },
  );
  await store.ready;
  app = createTestApp({ storage: { store, debugDb: store }, authLimit: 500 });
  owner = request.agent(app);
  other = request.agent(app);
  await registerVerified(app, owner, {
    name: 'Postgres owner',
    email: 'pg.owner@example.test',
    password,
  });
  await registerVerified(app, other, {
    name: 'Other user',
    email: 'pg.other@example.test',
    password,
  });
  projectId = (await post(owner, '/api/projects/sample').expect(201)).body.id;
});
after(async () => {
  await store?.close();
});

test('PostgreSQL preserves project pages, summaries, favorites, and user privacy', async () => {
  const detail = (await owner.get(`/api/projects/${projectId}`).expect(200)).body;
  assert.equal(detail.pages.length, 3);
  assert.equal(detail.summary.tasks, 5);
  assert.equal(detail.summary.progress, 20);
  await other.get(`/api/projects/${projectId}`).expect(404);
  await other
    .put(`/api/pages/${detail.pages[0].id}`)
    .set(headers)
    .send(detail.pages[0])
    .expect(404);
  await owner.patch(`/api/projects/${projectId}`).set(headers).send({ favorite: true }).expect(200);
  assert.equal((await owner.get('/api/projects?favorite=true').expect(200)).body.total, 1);
  assert.equal((await owner.get('/api/dashboard').expect(200)).body.completed, 1);
});

test('PostgreSQL rejects stale edits and recalculates task summaries', async () => {
  const detail = (await owner.get(`/api/projects/${projectId}`)).body;
  const page = detail.pages[1];
  const changed = {
    ...page,
    blocks: page.blocks.map((block) =>
      block.type === 'table'
        ? { ...block, rows: block.rows.map((row) => ({ ...row, status: 'done' })) }
        : block,
    ),
  };
  await owner.put(`/api/pages/${page.id}`).set(headers).send(changed).expect(200);
  await owner.put(`/api/pages/${page.id}`).set(headers).send(changed).expect(409);
  assert.equal((await owner.get(`/api/projects/${projectId}`)).body.summary.progress, 60);
});

test('PostgreSQL preserves page trash metadata and recovers nested content', async () => {
  const detail = (await owner.get(`/api/projects/${projectId}`)).body;
  const page = detail.pages[0];
  await owner.delete(`/api/pages/${page.id}`).set(headers).expect(204);
  const trash = (await owner.get('/api/trash').expect(200)).body;
  assert.equal(trash.pages[0].projectTitle, detail.title);
  await post(other, `/api/pages/${page.id}/restore`).expect(404);
  await post(owner, `/api/pages/${page.id}/restore`).expect(204);
  const duplicate = await post(owner, `/api/projects/${projectId}/duplicate`).expect(201);
  const copy = (await owner.get(`/api/projects/${duplicate.body.id}`).expect(200)).body;
  assert.equal(copy.pages.length, 3);
  await owner.delete(`/api/projects/${copy.id}`).set(headers).expect(204);
  await owner.get(`/api/projects/${copy.id}`).expect(404);
  await post(owner, `/api/projects/${copy.id}/restore`).expect(204);
  await owner.get(`/api/projects/${copy.id}`).expect(200);
});

test('PostgreSQL consumes a verification code only once under concurrent requests', async () => {
  const input = {
    name: 'Concurrent',
    email: 'pg.concurrent@example.test',
    emailConfirmation: 'pg.concurrent@example.test',
    password,
  };
  await post(request(app), '/api/auth/register', input).expect(202);
  const code = app.locals.outbox.get(input.email).code;
  const responses = await Promise.all([
    post(request(app), '/api/auth/verify-email', { ...input, code }),
    post(request(app), '/api/auth/verify-email', { ...input, code }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
});

test('PostgreSQL rolls back multi-statement changes on failure', async () => {
  await assert.rejects(
    store.transaction(async () => {
      await store
        .prepare('UPDATE projects SET title = ? WHERE id = ?')
        .run('Must roll back', projectId);
      throw new Error('Simulated failure');
    }),
  );
  assert.equal((await owner.get(`/api/projects/${projectId}`)).body.title, 'Nodo');
});

test('SQL parameters and database TLS cannot be weakened by a remote connection string', () => {
  assert.equal(
    postgresSql("SELECT '?' AS literal, ? AS value, 'it''s ?' AS quoted"),
    "SELECT '?' AS literal, $1 AS value, 'it''s ?' AS quoted",
  );
  const options = postgresOptions(
    'postgresql://user:password@db.example.com/nodo?sslmode=require',
    { production: true },
  );
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.ok(!options.connectionString.includes('sslmode'));
  assert.throws(() =>
    postgresOptions('postgres://user:password@db.example.com/nodo?sslmode=disable'),
  );
  assert.throws(
    () => createStorage({ production: true, databasePath: ':memory:' }),
    /DATABASE_URL_REQUIRED/,
  );
});

test('SQLite import preserves content and refuses overwrites without copying sessions or codes', async () => {
  const target = createPostgresStorage({ pool: await embeddedPool() });
  const source = openDatabase(':memory:');
  try {
    source
      .prepare(
        'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('import-user', 'import@example.test', 'preserved-hash', 'María', '2026-11-11');
    source
      .prepare(
        'INSERT INTO projects (id, user_id, title, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'import-project',
        'import-user',
        'Diseño de Nodo',
        'book',
        'blue',
        '2026-11-11',
        '2026-11-11',
      );
    source
      .prepare(
        'INSERT INTO pages (id, project_id, title, icon, blocks, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'import-page',
        'import-project',
        'Decisiones',
        'file',
        '[]',
        3,
        '2026-11-11',
        '2026-11-11',
      );
    source
      .prepare('INSERT INTO sessions VALUES (?, ?, ?)')
      .run('unused-session', 'import-user', Date.now() + 60000);
    source
      .prepare('INSERT INTO email_verifications (user_id, code_hash) VALUES (?, ?)')
      .run('import-user', 'unused-code');
    assert.deepEqual(await importSQLite(source, target), { users: 1, projects: 1, pages: 1 });
    assert.equal((await target.prepare('SELECT name FROM users').get()).name, 'María');
    assert.equal(
      (await target.prepare('SELECT password_hash FROM users').get()).password_hash,
      'preserved-hash',
    );
    assert.equal(
      (await target.prepare('SELECT email_verified_at FROM users').get()).email_verified_at,
      null,
    );
    assert.equal((await target.prepare('SELECT version FROM pages').get()).version, 3);
    assert.equal(
      Number((await target.prepare('SELECT COUNT(*) AS count FROM sessions').get()).count),
      0,
    );
    assert.equal(
      Number(
        (await target.prepare('SELECT COUNT(*) AS count FROM email_verifications').get()).count,
      ),
      0,
    );
    await assert.rejects(importSQLite(source, target), /IMPORT_REQUIRES_EMPTY_DATABASE/);
    assert.equal(
      Number((await target.prepare('SELECT COUNT(*) AS count FROM users').get()).count),
      1,
    );
  } finally {
    source.close();
    await target.close();
  }
});
