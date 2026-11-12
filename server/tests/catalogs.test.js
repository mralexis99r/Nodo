import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { catalogValue, groupRecords } from '../../shared/catalogs.js';
import { blockSchema } from '../schema.js';
import { createTestApp, registerVerified, headers } from './helpers.js';
import { qaPackage } from './qa-fixture.js';
import {
  caseNameFromReference,
  referenceNamePatch,
  completeReferenceNames,
} from '../../shared/qa.js';

test('ATC references derive names while manual names and imported histories stay intact', () => {
  assert.equal(caseNameFromReference('ATC_FT_001_login'), 'login');
  assert.equal(
    caseNameFromReference('ATC_FT-002_ConfiguracionPromocionTipoNormal'),
    'ConfiguracionPromocionTipoNormal',
  );
  assert.equal(caseNameFromReference('ATC_FT_001_login_payments'), 'login_payments');
  assert.equal(caseNameFromReference('ATC_FT_001'), '');
  assert.deepEqual(
    referenceNamePatch({ reference: 'ATC_FT_001_login', title: 'login' }, 'ATC_FT_002_payments'),
    { reference: 'ATC_FT_002_payments', title: 'payments' },
  );
  assert.deepEqual(
    referenceNamePatch(
      { reference: 'ATC_FT_001_login', title: 'My custom analysis' },
      'ATC_FT_002_payments',
    ),
    { reference: 'ATC_FT_002_payments' },
  );
  const old = { id: randomUUID(), reference: 'ATC_FT_001_login', title: 'login' };
  const blocks = [
    { type: 'qa', kind: 'cases', rows: [{ ...old, reference: 'ATC_FT_002_payments' }] },
  ];
  assert.equal(
    completeReferenceNames(blocks, [{ type: 'qa', kind: 'cases', rows: [old] }])[0].rows[0].title,
    'payments',
  );
});

test('catalogs group known equivalents and preserve ambiguous source categories without mutation', () => {
  const data = qaPackage();
  const rows = data.pages[0].blocks[0].rows;
  rows[0].classification = 'CODE/DATA';
  rows[1].classification = 'DATA/CODE';
  rows[2].classification = 'FUNCTIONAL?';
  const before = structuredClone(data);
  const report = groupRecords(data.pages, 'cases', 'classification');
  assert.equal(report.total, 3);
  assert.equal(report.groups.find((group) => group.key === 'code_data').count, 2);
  assert.equal(report.groups.find((group) => group.key === 'original:FUNCTIONAL?').count, 1);
  assert.equal(catalogValue('automation', 'Corregida'), 'fixed');
  assert.equal(catalogValue('automation', 'Pendiente separar cobertura'), null);
  assert.deepEqual(data, before);
  assert.equal(groupRecords(data.pages, 'bugs', 'status').total, 2);
});

test('reports validate dataset dimensions and older tasks remain reportable as tasks', () => {
  const report = {
    id: randomUUID(),
    type: 'record-report',
    title: 'Work',
    dataset: 'tasks',
    field: 'itemType',
  };
  assert.equal(blockSchema.parse(report).scope, 'project');
  assert.throws(() => blockSchema.parse({ ...report, field: 'automation' }));
  assert.throws(() => blockSchema.parse({ ...report, dataset: 'cases', field: 'priority' }));
  const rows = [
    { id: randomUUID(), title: 'Legacy task', status: 'todo', priority: 'medium', url: '' },
  ];
  assert.equal(
    groupRecords([{ blocks: [{ type: 'table', rows }] }], 'tasks', 'itemType').groups[0].key,
    'task',
  );
});

test('standard catalog edits preserve legacy data, reject new free text, and reminders stay private and stop when completed', async (t) => {
  const app = createTestApp({ authLimit: 500 });
  t.after(() => app.locals.db.close());
  const owner = request.agent(app),
    other = request.agent(app);
  for (const [agent, email] of [
    [owner, 'catalog-owner@example.test'],
    [other, 'catalog-other@example.test'],
  ])
    await registerVerified(app, agent, {
      name: 'Work owner',
      email,
      password: 'Catalog-test-private-2026',
    });
  const data = qaPackage();
  data.pages[0].blocks[0].rows[0].classification = 'FUNCTIONAL?';
  const id = (await owner.post('/api/projects/import').set(headers).send(data).expect(201)).body.id;
  let page = (await owner.get(`/api/projects/${id}`)).body.pages[0];
  page.title = 'Changed title';
  page = (await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200)).body;
  assert.equal(page.blocks[0].rows[0].classification, 'FUNCTIONAL?');
  const invalid = structuredClone(page);
  invalid.blocks[0].rows[0].classification = 'Anything new';
  assert.equal(
    (await owner.put(`/api/pages/${page.id}`).set(headers).send(invalid).expect(400)).body.error,
    'INVALID_CATALOG_VALUE',
  );
  page.blocks[0].rows[0].classification = 'functional';
  page.blocks[0].rows[1].automation = 'fixed';
  page = (await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200)).body;
  page.blocks.push({
    id: randomUUID(),
    type: 'table',
    kind: 'development',
    title: 'Stories',
    rows: [
      {
        id: randomUUID(),
        title: 'Review a story',
        status: 'todo',
        priority: 'high',
        url: '',
        itemType: 'story',
        classification: 'backend',
        reminderDate: '2026-12-01',
      },
    ],
  });
  page.blocks.push({
    id: randomUUID(),
    type: 'record-report',
    title: 'Work types',
    dataset: 'tasks',
    field: 'itemType',
    scope: 'project',
    view: 'bars',
  });
  page = (await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200)).body;
  let dashboard = (await owner.get('/api/dashboard')).body;
  assert.equal(dashboard.reminders[0].title, 'Review a story');
  assert.equal(dashboard.reminders[0].projectId, id);
  assert.equal((await other.get('/api/dashboard')).body.reminders.length, 0);
  const badDate = structuredClone(page);
  badDate.blocks[1].rows[0].reminderDate = '2026-02-30';
  await owner.put(`/api/pages/${page.id}`).set(headers).send(badDate).expect(400);
  page.blocks[1].rows[0].status = 'done';
  await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200);
  dashboard = (await owner.get('/api/dashboard')).body;
  assert.equal(dashboard.reminders.length, 0);
});
