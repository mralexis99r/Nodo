import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { createTestApp, headers, registerVerified } from './helpers.js';
import { matrixCases, matrixPackage } from '../../shared/matrix-import.js';
import { readXlsx } from '../../src/xlsx.js';
import { importProjectSchema } from '../schema.js';
import { bugReport } from '../../shared/bugs.js';
import { progressDetails } from '../../shared/report-records.js';
import { translateTitle } from '../title-translation.js';
import { clonePageBlocks } from '../../shared/clone-pages.js';

const cells = (values) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
const matrix = () => [
  {
    name: 'Matriz de Casos de Prueba',
    rows: {
      13: cells({ F: 'Id Caso de Prueba', L: 'Descripción del Paso', M: 'Resultado Esperado' }),
      14: cells({
        F: 'MTC_FT_001',
        G: 'MTC_FT_002 - Validar login',
        H: 'Description',
        I: 'Signed in',
        J: 'Data',
        K: '1',
        L: 'Open',
        M: 'Visible',
      }),
      15: cells({ K: '2', L: 'Click', M: 'Saved' }),
      16: cells({
        F: 'MTC-FT-002',
        G: 'MTC-FT-002 - Logout',
        K: '1',
        L: 'Exit',
        M: 'Signed out',
        N: 'Failed',
      }),
    },
  },
];

test('matrix conversion groups continuation steps, renames MTC references and preserves original details', async () => {
  const result = matrixCases(matrix());
  assert.equal(result.cases.length, 2);
  assert.equal(result.cases[0].reference, 'ATC_FT001_ValidarLogin');
  assert.equal(result.cases[0].steps.length, 2);
  assert.equal(result.cases[0].steps[1].expected, 'Saved');
  assert.equal(result.cases[0].sourceReference, 'MTC_FT_001');
  assert.equal(result.cases[0].description, 'Description');
  assert.equal(result.cases[1].status, 'FAIL');
  assert.equal(result.warnings[0].type, 'idMismatch');
  const data = importProjectSchema.parse(
    await matrixPackage(matrix(), 'matrix.xlsx', 'fingerprint'),
  );
  assert.deepEqual(
    data,
    importProjectSchema.parse(await matrixPackage(matrix(), 'matrix.xlsx', 'fingerprint')),
  );
  const duplicate = matrix();
  duplicate[0].rows[16].F.value = 'MTC-FT-001';
  assert.throws(() => matrixCases(duplicate), /DUPLICATE_MATRIX_CASE/);
});

test('XLSX reader handles shared and inline text without evaluating formulas and rejects entity documents', () => {
  const base = {
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="r"><sheets><sheet name="TestCase" r:id="r1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Id Caso de Prueba</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<worksheet><sheetData><row r="13"><c r="F13" t="s"><v>0</v></c></row><row r="14"><c r="F14" t="inlineStr"><is><t>MTC-FT-001</t></is></c><c r="G14" t="inlineStr"><is><t>MTC-FT-001 - Login</t></is></c><c r="K14"><f>1+1</f><v>2</v></c><c r="L14" t="inlineStr"><is><t>Click</t></is></c></row></sheetData></worksheet>',
    ),
  };
  const sheets = readXlsx(zipSync(base), DOMParser);
  assert.equal(matrixCases(sheets).cases[0].steps[0].number, '2');
  assert.equal(sheets[0].rows[14].K.formula, true);
  base['xl/workbook.xml'] = strToU8('<!DOCTYPE doc [<!ENTITY x "bad">]><workbook/>');
  assert.throws(() => readXlsx(zipSync(base), DOMParser), /INVALID_MATRIX/);
});

test('progress drill-down counts are disjoint and match both page and entire-project scopes', () => {
  const page = {
    id: 'a',
    title: 'A',
    blocks: [
      {
        id: 'qa',
        type: 'qa',
        kind: 'cases',
        rows: ['PASS', 'BUG', 'FAIL', 'BLOQUEADO', 'PENDIENTE', 'EN VALIDACIÓN'].map((status) => ({
          id: status,
          status,
        })),
      },
    ],
  };
  const other = { id: 'b', title: 'B', blocks: [{ type: 'table', rows: [{ status: 'done' }] }] };
  const result = progressDetails({}, [page, other], page, 'page');
  assert.deepEqual(result.counts, { todo: 1, progress: 1, blocked: 1, done: 1, failed: 2 });
  assert.equal(progressDetails({}, [page, other], page, 'project').counts.done, 2);
  assert.equal(
    Object.values(result.counts).reduce((a, b) => a + b),
    result.records.length,
  );
});

async function setup(t, options = {}) {
  const app = createTestApp(options);
  t.after(() => app.locals.db.close());
  const owner = request.agent(app),
    other = request.agent(app);
  for (const [agent, email] of [
    [owner, 'release@example.test'],
    [other, 'release-other@example.test'],
  ])
    await registerVerified(app, agent, { name: 'Owner', email, password: 'Private-release-2026' });
  const project = (
    await owner.post('/api/projects').set(headers).send({ title: 'Release' }).expect(201)
  ).body;
  return { app, owner, other, project };
}

test('bug edits synchronize all connections, preserve test outcomes, reject stale and foreign writes', async (t) => {
  const { owner, other, project } = await setup(t);
  const row = (status, id) => ({
    id: randomUUID(),
    reference: `ATC_FT${id}_Login`,
    title: 'Login',
    status,
    workItemId: '42',
    url: 'https://dev.azure.com/org/project/_workitems/edit/42',
  });
  const feature = (
    await owner
      .post(`/api/projects/${project.id}/pages`)
      .set(headers)
      .send({
        title: 'Feature',
        blocks: [
          {
            id: randomUUID(),
            type: 'qa',
            kind: 'cases',
            title: 'Cases',
            rows: [row('FAIL', 1), row('PASS', 2)],
          },
        ],
      })
      .expect(201)
  ).body;
  const register = (
    await owner
      .post(`/api/projects/${project.id}/pages`)
      .set(headers)
      .send({
        title: 'Bug source',
        blocks: [
          { id: randomUUID(), type: 'qa', kind: 'bugs', title: 'Bugs', rows: [row('BUG', 3)] },
        ],
      })
      .expect(201)
  ).body;
  const pages = (await owner.get(`/api/projects/${project.id}`)).body.pages;
  const bug = bugReport(pages)[0];
  assert.equal(bug.cases.length, 2);
  assert.equal(bugReport(pages, 'page', feature.id).length, 1);
  const body = {
    key: bug.key,
    revision: bug.revision,
    title: 'Login defect',
    status: 'CERRADO',
    note: 'Retested',
    history: 'Validated in QA',
  };
  await other.put(`/api/projects/${project.id}/bugs`).set(headers).send(body).expect(404);
  const saved = (
    await owner.put(`/api/projects/${project.id}/bugs`).set(headers).send(body).expect(200)
  ).body;
  assert.equal(bugReport(saved.pages).length, 1);
  assert.equal(bugReport(saved.pages)[0].status, 'CERRADO');
  const cases = saved.pages.find((p) => p.id === feature.id).blocks[0].rows;
  assert.deepEqual(
    cases.map((r) => r.status),
    ['FAIL', 'PASS'],
  );
  assert.ok(cases.every((r) => r.defect.note === 'Retested'));
  await owner.put(`/api/projects/${project.id}/bugs`).set(headers).send(body).expect(409);
  const fresh = saved.pages.find((p) => p.id === register.id);
  fresh.blocks[0].rows[0].note = 'Changed in bug register';
  await owner.put(`/api/pages/${fresh.id}`).set(headers).send(fresh).expect(200);
  assert.equal(
    bugReport((await owner.get(`/api/projects/${project.id}`)).body.pages)[0].note,
    'Changed in bug register',
  );
  const unrelated = [
    {
      id: 'other',
      blocks: [
        {
          type: 'qa',
          kind: 'cases',
          rows: [
            { ...row('BUG', 4), url: 'https://dev.azure.com/different/project/_workitems/edit/42' },
          ],
        },
      ],
    },
  ];
  assert.equal(bugReport([...saved.pages, ...unrelated]).length, 2);
});

test('matrix page import is private and repeatable without resetting edited cases', async (t) => {
  const { owner, other, project } = await setup(t);
  const data = importProjectSchema.parse(
    await matrixPackage(matrix(), 'matrix.xlsx', 'fingerprint'),
  );
  const path = `/api/projects/${project.id}/import-cases`;
  await other.post(path).set(headers).send(data.pages[0]).expect(404);
  const result = (await owner.post(path).set(headers).send(data.pages[0]).expect(201)).body;
  const page = result.page;
  page.blocks[1].rows[0].status = 'PASS';
  await owner.put(`/api/pages/${page.id}`).set(headers).send(page).expect(200);
  const repeated = (await owner.post(path).set(headers).send(data.pages[0]).expect(200)).body;
  assert.equal(repeated.page.id, page.id);
  assert.equal(repeated.page.blocks[1].rows[0].status, 'PASS');
});

test('an inferred case bug remains linked after the case passes and does not invent an Azure status', async (t) => {
  const { owner, project } = await setup(t);
  const created = (
    await owner
      .post(`/api/projects/${project.id}/pages`)
      .set(headers)
      .send({
        title: 'Feature',
        blocks: [
          {
            id: randomUUID(),
            type: 'qa',
            kind: 'cases',
            title: 'Cases',
            rows: [
              {
                id: randomUUID(),
                reference: 'ATC_FT001_Login',
                title: 'Login',
                status: 'FAIL',
                workItemId: '42',
                url: 'https://dev.azure.com/org/project/_workitems/edit/42',
              },
            ],
          },
        ],
      })
      .expect(201)
  ).body;
  const loaded = (await owner.get(`/api/projects/${project.id}`).expect(200)).body.pages.find(
    (page) => page.id === created.id,
  );
  assert.equal(loaded.blocks[0].rows[0].defect.status, 'POR CONFIRMAR');
  loaded.blocks[0].rows[0].status = 'PASS';
  await owner.put(`/api/pages/${loaded.id}`).set(headers).send(loaded).expect(200);
  const report = bugReport((await owner.get(`/api/projects/${project.id}`).expect(200)).body.pages);
  assert.equal(report.length, 1);
  assert.equal(report[0].cases[0].status, 'PASS');
});

test('title translation sends only the name, caches by language and invalidates renamed titles', async (t) => {
  const calls = [];
  const { owner, other, project } = await setup(t, {
    titleTranslator: async (...args) => {
      calls.push(args);
      return 'My notes';
    },
  });
  const page = (
    await owner
      .post(`/api/projects/${project.id}/pages`)
      .set(headers)
      .send({ title: 'Mis apuntes privados', titleLanguage: 'es', blocks: [] })
      .expect(201)
  ).body;
  const path = `/api/projects/${project.id}/translate-titles`;
  await other.post(path).set(headers).send({ language: 'en' }).expect(404);
  const translated = (await owner.post(path).set(headers).send({ language: 'en' }).expect(200))
    .body;
  assert.equal(translated.pages[0].titleTranslations.en, 'My notes');
  assert.deepEqual(calls, [['Mis apuntes privados', 'es', 'en']]);
  await owner.post(path).set(headers).send({ language: 'en' }).expect(200);
  await owner.post(path).set(headers).send({ language: 'es' }).expect(200);
  assert.equal(calls.length, 1);
  const renamed = (
    await owner
      .put(`/api/pages/${page.id}`)
      .set(headers)
      .send({ ...page, title: 'Otras notas' })
      .expect(200)
  ).body;
  assert.deepEqual(renamed.titleTranslations, {});
});

test('translation provider validates results, known names and quota failures without sending content', async () => {
  assert.equal(
    await translateTitle('Notas', 'es', 'en', () => {
      throw Error();
    }),
    'Notes',
  );
  const result = await translateTitle('Mi página', 'es', 'en', async (url, options) => {
    assert.equal(url.hostname, 'api.mymemory.translated.net');
    assert.deepEqual([...url.searchParams.keys()], ['q', 'langpair']);
    assert.equal(options.redirect, 'error');
    return {
      ok: true,
      json: async () => ({
        responseStatus: 200,
        responseData: { translatedText: 'My &quot;page&quot;' },
      }),
    };
  });
  assert.equal(result, 'My "page"');
  await assert.rejects(
    translateTitle('Mi página', 'es', 'en', async () => ({
      ok: true,
      json: async () => ({
        responseStatus: 429,
        responseData: { translatedText: 'Quota reached' },
      }),
    })),
    /TRANSLATION_UNAVAILABLE/,
  );
});

test('duplicating pages preserves local bug relationships using the copied source IDs', () => {
  const bugId = randomUUID();
  const pages = [
    {
      id: 'feature',
      version: 1,
      blocks: [
        {
          id: randomUUID(),
          type: 'qa',
          kind: 'cases',
          rows: [
            {
              id: randomUUID(),
              reference: 'ATC_FT001_Login',
              title: 'Login',
              status: 'FAIL',
              defect: { id: `local:${bugId}`, title: 'Defect', status: 'BUG' },
            },
          ],
        },
      ],
    },
    {
      id: 'overview',
      version: 1,
      blocks: [
        {
          id: randomUUID(),
          type: 'bug-report',
          rows: [{ id: bugId, title: 'Defect', status: 'BUG' }],
        },
      ],
    },
  ];
  const copies = clonePageBlocks(pages, randomUUID);
  const bugs = bugReport(copies);
  assert.equal(bugs.length, 1);
  assert.equal(bugs[0].cases.length, 1);
  assert.notEqual(bugs[0].key, `local:${bugId}`);
  assert.equal(bugReport(pages)[0].key, `local:${bugId}`);
});
