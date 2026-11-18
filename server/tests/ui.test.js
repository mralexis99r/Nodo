import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { pageSchema } from '../schema.js';
import { randomUUID } from 'node:crypto';
import { translate } from '../../src/i18n.js';
import { bugReport, applyBugUpdate } from '../../shared/bugs.js';

test('project UI translates page names, opens progress details, preserves steps and edits linked bugs', async () => {
  await mkdir(resolve('node_modules/.cache'), { recursive: true });
  const temporary = await mkdtemp(resolve('node_modules/.cache/nodo-ui-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  const previous = new Map(
    ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  for (const key of ['window', 'document', 'navigator', 'HTMLElement'])
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? dom.window : dom.window[key],
    });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  let root;
  try {
    const outfile = resolve(temporary, 'Project.mjs');
    await build({
      entryPoints: ['src/Project.jsx'],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      jsx: 'automatic',
      logLevel: 'silent',
    });
    const { default: Project } = await import(pathToFileURL(outfile).href);
    const caseId = randomUUID();
    const data = {
      id: 'project',
      title: 'Project',
      description: '',
      icon: 'code',
      color: 'blue',
      favorite: false,
      pages: [
        {
          ...pageSchema.parse({
            title: 'Mis casos',
            titleLanguage: 'es',
            blocks: [
              { id: randomUUID(), type: 'report', title: 'Progress', scope: 'page' },
              {
                id: randomUUID(),
                type: 'qa',
                kind: 'cases',
                title: 'Cases',
                rows: [
                  {
                    id: caseId,
                    reference: 'ATC_FT001_Login',
                    title: 'Login',
                    status: 'FAIL',
                    workItemId: '42',
                    url: 'https://dev.azure.com/org/project/_workitems/edit/42',
                    steps: [
                      { number: '1', action: 'Click sign in', expected: 'Dashboard visible' },
                    ],
                  },
                ],
              },
              {
                id: randomUUID(),
                type: 'bug-report',
                title: 'Bug report',
                scope: 'page',
                rows: [],
              },
            ],
          }),
          id: 'page',
          version: 1,
          titleTranslations: {},
        },
      ],
    };
    let updatedBug;
    globalThis.fetch = async (url, options = {}) => {
      let payload = data;
      if (url.endsWith('/translate-titles'))
        payload = {
          pages: [{ id: 'page', title: 'Mis casos', titleTranslations: { en: 'My cases' } }],
          failures: [],
        };
      if (url.endsWith('/bugs')) {
        updatedBug = JSON.parse(options.body);
        data.pages = applyBugUpdate(data.pages, bugReport(data.pages)[0], updatedBug).map(
          (page) => ({ ...page, version: page.version + 1 }),
        );
      }
      return { ok: true, status: 200, json: async () => payload };
    };
    root = createRoot(document.getElementById('root'));
    const props = {
      projectId: 'project',
      pageId: 'page',
      locale: 'en',
      t: (key, values) => translate('en', key, values),
      navigate: async () => {},
      refresh: 0,
      invalidate: () => {},
      run: (fn) => fn(),
      saveGuard: { current: null },
      actionProject: () => {},
    };
    await act(async () => root.render(React.createElement(Project, props)));
    assert.equal(document.querySelector('input[aria-label="Page name"]').value, 'My cases');
    const button = (text) =>
      [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
    await act(async () => document.querySelector('button[aria-label="Failed or bugs: 1"]').click());
    assert.match(document.querySelector('dialog').textContent, /ATC_FT001_Login/);
    await act(async () => document.querySelector('dialog button[aria-label="Close"]').click());
    await act(async () => button('ATC_FT001_Login').click());
    assert.match(document.querySelector('dialog').textContent, /Test steps/);
    assert.equal(
      [...document.querySelectorAll('dialog textarea')].some(
        (node) => node.value === 'Dashboard visible',
      ),
      true,
    );
    await act(async () => document.querySelector('dialog button[aria-label="Close"]').click());
    await act(async () => button('#42 Login').click());
    const status = document.querySelector('dialog select');
    await act(async () => {
      status.value = 'CERRADO';
      status.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await act(async () =>
      document
        .querySelector('dialog form')
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
    );
    assert.equal(updatedBug.status, 'CERRADO');
    assert.equal(data.pages[0].blocks[1].rows[0].status, 'FAIL');
    assert.equal(data.pages[0].blocks[1].rows[0].defect.status, 'CERRADO');
    await act(async () =>
      root.render(
        React.createElement(Project, {
          ...props,
          locale: 'es',
          t: (key, values) => translate('es', key, values),
        }),
      ),
    );
    assert.equal(
      document.querySelector('input[aria-label="Nombre de la página"]').value,
      'Mis casos',
    );
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
