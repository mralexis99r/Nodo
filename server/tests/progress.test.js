import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { progressReport, progressScope } from '../../shared/progress.js';
import { createTestApp, headers, registerVerified } from './helpers.js';

const page = (id, status) => ({
  id,
  title: id,
  status: 'todo',
  blocks: [{ type: 'qa', kind: 'cases', rows: [{ reference: '', status }] }],
});

test('legacy feature reports stay local while overview reports consolidate the project', () => {
  const feature = page('feature', 'PASS');
  const other = page('other', 'BUG');
  const overview = { id: 'overview', blocks: [{ type: 'report' }] };
  const pages = [overview, feature, other];
  const local = progressReport({}, pages, feature);
  assert.equal(local.scope, 'page');
  assert.equal(local.total, 1);
  assert.equal(local.progress, 100);
  assert.equal(local.status, 'done');
  const general = progressReport({}, pages, overview);
  assert.equal(general.scope, 'project');
  assert.equal(general.total, 2);
  assert.equal(general.progress, 50);
  assert.equal(general.counts.blocked, 1);
  assert.equal(progressScope({}, { blocks: [{ type: 'qa', kind: 'cases', rows: [] }] }), 'page');
  assert.equal(progressScope({}, { blocks: [{ type: 'table', rows: [] }] }), 'page');
});

test('explicit scope wins and reports use the current draft without mixing features or counting bugs twice', () => {
  const saved = page('feature', 'PENDIENTE');
  const draft = page('feature', 'PASS');
  const other = page('other', 'BUG');
  other.blocks.push({ type: 'qa', kind: 'bugs', rows: [{ status: 'BUG' }] });
  const pages = [saved, other];
  const snapshot = structuredClone(pages);
  assert.equal(progressReport({}, pages, draft).progress, 100);
  const general = progressReport({ scope: 'project' }, pages, draft);
  assert.equal(general.progress, 50);
  assert.equal(general.total, 2);
  assert.equal(general.counts.todo, 0);
  assert.deepEqual(pages, snapshot);
  const tasks = { id: 'dev', blocks: [{ type: 'table', rows: [{ status: 'progress' }] }] };
  assert.equal(progressReport({}, [tasks, other], tasks).counts.progress, 1);
  assert.equal(progressReport({}, [tasks, other], tasks).counts.blocked, 0);
});

test('report scope survives saving and duplication; invalid scopes are rejected', async (t) => {
  const app = createTestApp();
  t.after(() => app.locals.db.close());
  const agent = request.agent(app);
  await registerVerified(app, agent, {
    name: 'Report owner',
    email: 'report@example.test',
    password: 'Private-report-2026',
  });
  const project = (
    await agent.post('/api/projects').set(headers).send({ title: 'Scope' }).expect(201)
  ).body;
  const created = (
    await agent
      .post(`/api/projects/${project.id}/pages`)
      .set(headers)
      .send({ title: 'Feature' })
      .expect(201)
  ).body;
  const blocks = [{ id: randomUUID(), type: 'report', title: 'Progress', scope: 'page' }];
  const saved = (
    await agent
      .put(`/api/pages/${created.id}`)
      .set(headers)
      .send({ ...created, blocks })
      .expect(200)
  ).body;
  assert.equal(saved.blocks[0].scope, 'page');
  await agent
    .put(`/api/pages/${created.id}`)
    .set(headers)
    .send({ ...saved, blocks: [{ ...blocks[0], scope: 'account' }] })
    .expect(400);
  const general = (
    await agent
      .put(`/api/pages/${created.id}`)
      .set(headers)
      .send({ ...saved, blocks: [{ ...blocks[0], scope: 'project' }] })
      .expect(200)
  ).body;
  assert.equal(general.blocks[0].scope, 'project');
  const copy = (await agent.post(`/api/projects/${project.id}/duplicate`).set(headers).expect(201))
    .body;
  const read = (await agent.get(`/api/projects/${copy.id}`).expect(200)).body;
  assert.equal(read.pages[0].blocks[0].scope, 'project');
});
