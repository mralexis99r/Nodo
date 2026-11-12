import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { azureWorkItemId, applyWorkItemPatch, normalizeWorkItem } from '../../shared/work-links.js';
import { createTestApp, registerVerified, headers } from './helpers.js';
import { qaPackage } from './qa-fixture.js';

const link = (id) => `https://dev.azure.com/team/Project%20QA/_workitems/edit/${id}`;

test('Azure IDs are extracted from modern and legacy links, including queries and fragments', () => {
  for (const url of [
    link('384430'),
    `${link('384430')}/?view=edit#details`,
    'https://team.visualstudio.com/Project/_workitems/edit/384430',
    'https://dev.azure.com/team/Project/_workitems?id=384430',
    'https://dev.azure.com/team/Project/_workitems/edit?id=384430',
  ])
    assert.equal(azureWorkItemId(url), '384430');
  for (const url of [
    '',
    'not a link',
    'javascript:alert(1)',
    'https://dev.azure.com.evil.example/team/_workitems/edit/384430',
    'https://example.com/_workitems/edit/384430',
    `${link('384430')}extra`,
    'https://dev.azure.com/team/Project/_workitems/edit/',
  ])
    assert.equal(azureWorkItemId(url), '');
});

test('link and ID edits stay consistent, preserve other data and do not reuse stale IDs', () => {
  const row = {
    id: 'case',
    title: 'Manual title',
    status: 'BUG',
    history: 'Keep history',
    url: '',
    workItemId: '',
  };
  const pasted = applyWorkItemPatch(row, { url: link('123') });
  assert.equal(pasted.workItemId, '123');
  assert.equal(pasted.history, row.history);
  assert.equal(row.workItemId, '');
  assert.equal(applyWorkItemPatch(pasted, { url: link('456') }).workItemId, '456');
  assert.equal(applyWorkItemPatch(pasted, { url: '' }).workItemId, '');
  assert.equal(applyWorkItemPatch(pasted, { url: 'https://example.com/design' }).workItemId, '');
  assert.equal(
    applyWorkItemPatch(
      pasted,
      { workItemId: '789' },
      'https://dev.azure.com/other/Other/_workitems/edit/',
    ).url,
    link('789'),
  );
  assert.equal(applyWorkItemPatch(pasted, { workItemId: '' }).url, '');
  assert.equal(normalizeWorkItem({ ...pasted, workItemId: '999' }).workItemId, '123');
});

test('saved URLs populate the ID and existing URL-only records are repaired on read without changing stored states', async (t) => {
  const app = createTestApp({ authLimit: 500 });
  t.after(() => app.locals.db.close());
  const owner = request.agent(app);
  await registerVerified(app, owner, {
    name: 'Link owner',
    email: 'links@example.test',
    password: 'Private-link-test-2026',
  });
  const data = qaPackage();
  const id = (await owner.post('/api/projects/import').set(headers).send(data).expect(201)).body.id;
  let page = (await owner.get(`/api/projects/${id}`)).body.pages[0];
  const oldStatus = page.blocks[0].rows[0].status;
  page.blocks[0].rows[0].url = link('384430');
  page.blocks[0].rows[0].workItemId = '';
  page = (await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200)).body;
  assert.equal(page.blocks[0].rows[0].workItemId, '384430');
  const stored = app.locals.db.prepare('SELECT blocks FROM pages WHERE id = ?').get(page.id);
  const blocks = JSON.parse(stored.blocks);
  blocks[0].rows[0].workItemId = '';
  app.locals.db
    .prepare('UPDATE pages SET blocks = ? WHERE id = ?')
    .run(JSON.stringify(blocks), page.id);
  page = (await owner.get(`/api/projects/${id}`)).body.pages[0];
  assert.equal(page.blocks[0].rows[0].workItemId, '384430');
  assert.equal(page.blocks[0].rows[0].status, oldStatus);
  assert.equal(
    JSON.parse(
      app.locals.db.prepare('SELECT blocks FROM pages WHERE id = ?').get(page.id).blocks,
    )[0].rows[0].workItemId,
    '',
  );
  page.blocks[0].rows[0].url = link('384431');
  page = (await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200)).body;
  assert.equal(page.blocks[0].rows[0].workItemId, '384431');
});
