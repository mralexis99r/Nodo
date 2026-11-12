import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestApp, headers, registerVerified } from './helpers.js';
import { qaPackage } from './qa-fixture.js';
import { importProjectSchema } from '../schema.js';
import { summarize } from '../db.js';
import { summarizeQA } from '../../shared/qa.js';

test('QA metrics keep case outcomes independent from unique bug states and exclude historical references', () => {
  const data = importProjectSchema.parse(qaPackage());
  data.pages[0].blocks.push({ ...data.pages[0].blocks[0], kind: 'references' });
  const summary = summarize(data.pages);
  assert.equal(summary.total, 3);
  assert.equal(summary.done, 2);
  assert.equal(summary.qa.passed, 1);
  assert.equal(summary.qa.closed, 1);
  assert.equal(summary.qa.openBugs, 1);
  assert.equal(summary.qa.bugs, 2);
  assert.equal(summary.qa.missingReference, 1);
  data.pages[1].blocks[0].rows[0].status = 'CERRADO';
  assert.equal(summarizeQA(data.pages).openBugs, 0);
  assert.equal(summarizeQA(data.pages).affected, 1);
});

test('QA imports are private, atomic, repeatable, concurrent-safe, editable and recoverable', async (t) => {
  const app = createTestApp({ authLimit: 500 });
  t.after(() => app.locals.db.close());
  const owner = request.agent(app),
    other = request.agent(app);
  for (const [agent, email] of [
    [owner, 'qa-owner@example.test'],
    [other, 'qa-other@example.test'],
  ]) {
    await registerVerified(app, agent, {
      name: 'QA owner',
      email,
      password: 'Private-qa-import-2026',
    });
  }
  const data = qaPackage();
  await request(app).post('/api/projects/import').set(headers).send(data).expect(401);
  const invalid = structuredClone(data);
  invalid.pages[1].blocks[0].rows[0].url = 'javascript:alert(1)';
  await owner.post('/api/projects/import').set(headers).send(invalid).expect(400);
  assert.equal((await owner.get('/api/projects')).body.total, 0);
  const results = await Promise.all(
    [1, 2].map(() => owner.post('/api/projects/import').set(headers).send(data)),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.equal(results[0].body.id, results[1].body.id);
  const id = results[0].body.id;
  const project = (await owner.get(`/api/projects/${id}`).expect(200)).body;
  assert.equal(project.summary.qa.total, 3);
  assert.equal(project.pages[0].blocks[0].rows[1].history, 'Preserve accents: corrección');
  await other.get(`/api/projects/${id}`).expect(404);
  const ownCopy = await other.post('/api/projects/import').set(headers).send(data).expect(201);
  assert.notEqual(ownCopy.body.id, id);
  const page = project.pages[0];
  page.blocks[0].rows[1].status = 'CORREGIDO';
  await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200);
  assert.equal((await owner.get(`/api/projects/${id}`)).body.summary.qa.corrected, 1);
  const duplicateId = (await owner.post(`/api/projects/${id}/duplicate`).set(headers).expect(201))
    .body.id;
  const duplicate = (await owner.get(`/api/projects/${duplicateId}`)).body;
  assert.notEqual(duplicate.pages[0].blocks[0].rows[0].id, page.blocks[0].rows[0].id);
  await owner.delete(`/api/projects/${id}`).set(headers).expect(204);
  const again = await owner.post('/api/projects/import').set(headers).send(data).expect(200);
  assert.equal(again.body.inTrash, true);
  await owner.post(`/api/projects/${id}/restore`).set(headers).expect(204);
  assert.equal((await owner.get(`/api/projects/${id}`)).body.summary.qa.corrected, 1);
});
