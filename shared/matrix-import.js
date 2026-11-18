const normalize = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const caseId = (value) => value.trim().match(/^(?:MTC|ATC)[_-]FT[_-]?(\d+)(?=[_\s-]|$)/i);

export function matrixCases(sheets) {
  const sheet = sheets.find((item) =>
    Object.values(item.rows).some((row) =>
      Object.values(row).some((cell) => normalize(cell.value || '') === 'idcasodeprueba'),
    ),
  );
  if (!sheet) throw new Error('INVALID_MATRIX');
  const warnings = [],
    cases = [];
  let current;
  const ids = new Set();
  for (const [number, row] of Object.entries(sheet.rows)) {
    const value = (column) => (row[column]?.value || '').trim();
    const match = caseId(value('F'));
    if (match) {
      const numberId = match[1].padStart(3, '0');
      if (ids.has(numberId)) throw new Error('DUPLICATE_MATRIX_CASE');
      ids.add(numberId);
      const originalTitle = value('G');
      const namedId = caseId(originalTitle);
      if (namedId && Number(namedId[1]) !== Number(match[1]))
        warnings.push({
          type: 'idMismatch',
          row: Number(number),
          id: value('F'),
          titleId: namedId[0],
        });
      const title =
        originalTitle.replace(/^(?:MTC|ATC)[_-]FT[_-]?\d+\s*[-–—_:]?\s*/i, '') || value('H');
      const suffix =
        title
          .match(/[\p{L}\p{N}]+/gu)
          ?.map((word) => word[0].toUpperCase() + word.slice(1))
          .join('') || 'TestCase';
      const rawStatus = value('N');
      const statusAliases = {
        '': 'PENDIENTE',
        pendiente: 'PENDIENTE',
        pass: 'PASS',
        passed: 'PASS',
        aprobado: 'PASS',
        fail: 'FAIL',
        failed: 'FAIL',
        fallido: 'FAIL',
        bug: 'BUG',
        bloqueado: 'BLOQUEADO',
        blocked: 'BLOQUEADO',
      };
      const status = statusAliases[normalize(rawStatus)] || 'PENDIENTE';
      if (rawStatus && status === 'PENDIENTE' && normalize(rawStatus) !== 'pendiente')
        warnings.push({ type: 'unknownStatus', row: Number(number), value: rawStatus });
      current = {
        reference: `ATC_FT${numberId}_${suffix}`,
        title,
        status,
        classification: 'functional',
        automation: value('E').toLowerCase() === 'manual' ? 'not_automated' : '',
        sourceRow: Number(number),
        sourceReference: value('F'),
        originalTitle,
        description: value('H'),
        prerequisites: value('I'),
        testData: value('J'),
        testType: value('E'),
        sourceStatus: rawStatus,
        sourcePriority: value('O'),
        requirement: value('B'),
        useCase: value('C'),
        steps: [],
      };
      cases.push(current);
    }
    if (current && (value('L') || value('M')))
      current.steps.push({
        number: value('K') || String(current.steps.length + 1),
        action: value('L'),
        expected: value('M'),
      });
  }
  if (!cases.length || cases.length > 500) throw new Error('INVALID_MATRIX');
  return { cases, warnings, sheet: sheet.name };
}

export async function matrixPackage(sheets, filename, fingerprint) {
  const { cases, warnings, sheet } = matrixCases(sheets);
  const id = async (key) => {
    const bytes = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${fingerprint}:${key}`)),
    );
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes.slice(0, 16)].map((v) => v.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  return {
    format: 'nodo-project',
    version: 1,
    project: {
      title: 'Espacio Promocional',
      description: 'Casos de prueba funcionales',
      icon: 'code',
      color: 'blue',
    },
    pages: [
      {
        title: 'Espacio Promocional',
        titleLanguage: 'es',
        icon: 'code',
        status: 'todo',
        blocks: [
          {
            id: await id('progress'),
            type: 'report',
            title: 'Progreso de la página',
            scope: 'page',
          },
          {
            id: await id('cases'),
            type: 'qa',
            kind: 'cases',
            title: 'Casos de prueba',
            source: `${filename} / ${sheet}`,
            rows: await Promise.all(
              cases.map(async (row) => ({ ...row, id: await id(row.sourceReference) })),
            ),
          },
          {
            id: await id('bugs'),
            type: 'bug-report',
            title: 'Reporte de bugs',
            scope: 'page',
            rows: [],
          },
        ],
      },
    ],
    warnings: warnings.map((warning) =>
      warning.type === 'idMismatch'
        ? `Fila ${warning.row}: el ID ${warning.id} no coincide con ${warning.titleId} en el nombre. Se utilizó la columna Id Caso de Prueba y se conservó el nombre original.`
        : `Fila ${warning.row}: estado original "${warning.value}" sin equivalencia. Se conserva el valor original y se importa como PENDIENTE.`,
    ),
  };
}
