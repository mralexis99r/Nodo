import { randomUUID } from 'node:crypto';

export function qaPackage() {
  return {
    format: 'nodo-project',
    version: 1,
    project: { title: 'QA test project', icon: 'code', color: 'blue' },
    warnings: ['Keep source states.'],
    pages: [
      {
        title: 'Feature A',
        blocks: [
          {
            id: randomUUID(),
            type: 'qa',
            title: 'Cases',
            kind: 'cases',
            rows: [
              {
                id: randomUUID(),
                reference: 'ATC-001',
                title: 'Case one',
                status: 'PASS',
                workItemId: '42',
              },
              {
                id: randomUUID(),
                reference: '',
                title: 'Case two',
                status: 'BUG RELACIONADO',
                workItemId: '42',
                sourceRow: 8,
                history: 'Preserve accents: corrección',
              },
              {
                id: randomUUID(),
                reference: 'ATC-003',
                title: 'Case three',
                status: 'CERRADO',
                workItemId: '43',
              },
            ],
          },
        ],
      },
      {
        title: 'Bugs',
        blocks: [
          {
            id: randomUUID(),
            type: 'qa',
            title: 'Bug register',
            kind: 'bugs',
            rows: [
              { id: randomUUID(), workItemId: '42', title: 'One bug', status: 'BUG' },
              { id: randomUUID(), workItemId: '43', title: 'Old bug', status: 'CERRADO' },
            ],
          },
        ],
      },
    ],
  };
}
