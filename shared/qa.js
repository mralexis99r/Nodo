export const qaStatuses = [
  'PENDIENTE',
  'EN VALIDACIÓN',
  'PASS',
  'CORREGIDO',
  'CERRADO',
  'BUG',
  'BUG RELACIONADO',
  'CANCELADO',
  'NO APLICA',
  'BLOQUEADO',
  'POSIBLE BUG',
  'ACTIVE',
  'POR CONFIRMAR',
];

export function caseNameFromReference(reference = '') {
  return reference.trim().match(/^ATC(?:[_-][a-z]+)*[_-]\d+[_-](.+)$/i)?.[1] || '';
}

export function referenceNamePatch(row, reference) {
  const automatic =
    !row.title?.trim() ||
    row.title === row.reference ||
    row.title === caseNameFromReference(row.reference);
  return { reference, ...(automatic ? { title: caseNameFromReference(reference) } : {}) };
}

export function completeReferenceNames(blocks, previous = []) {
  const oldRows = new Map(
    previous
      .filter((block) => block.type === 'qa' && block.kind === 'cases')
      .flatMap((block) => block.rows.map((row) => [row.id, row])),
  );
  return blocks.map((block) =>
    block.type !== 'qa' || block.kind !== 'cases'
      ? block
      : {
          ...block,
          rows: block.rows.map((row) => {
            const old = oldRows.get(row.id);
            const changed = !old || old.reference !== row.reference;
            if (!row.title.trim()) return { ...row, title: caseNameFromReference(row.reference) };
            if (changed && row.title === row.reference)
              return { ...row, title: caseNameFromReference(row.reference) || row.title };
            if (changed && old && row.title === old.title)
              return { ...row, ...referenceNamePatch(old, row.reference) };
            return row;
          }),
        },
  );
}

export function qaCategory(status) {
  if (['PASS', 'CORREGIDO'].includes(status)) return 'validated';
  if (['CERRADO', 'CANCELADO', 'NO APLICA'].includes(status)) return 'closed';
  if (['BUG', 'BUG RELACIONADO'].includes(status)) return 'bug';
  if (status === 'BLOQUEADO') return 'blocked';
  return 'pending';
}

export function qaWorkStatus(status) {
  const category = qaCategory(status);
  if (['validated', 'closed'].includes(category)) return 'done';
  if (['bug', 'blocked'].includes(category)) return 'blocked';
  return status === 'PENDIENTE' || !status ? 'todo' : 'progress';
}

export function summarizeQA(pages) {
  const blocks = pages.flatMap((page) => page.blocks.filter((block) => block.type === 'qa'));
  if (!blocks.length) return null;
  const cases = blocks.filter((block) => block.kind === 'cases').flatMap((block) => block.rows);
  const bugs = new Map();
  for (const row of blocks
    .filter((block) => block.kind === 'bugs')
    .flatMap((block) => block.rows)) {
    if (row.workItemId && !bugs.has(row.workItemId)) bugs.set(row.workItemId, row);
  }
  const count = (category) => cases.filter((row) => qaCategory(row.status) === category).length;
  return {
    total: cases.length,
    passed: cases.filter((row) => row.status === 'PASS').length,
    corrected: cases.filter((row) => row.status === 'CORREGIDO').length,
    closed: count('closed'),
    pending: count('pending'),
    affected: count('bug'),
    blocked: count('blocked'),
    missingReference: cases.filter((row) => !row.reference.trim()).length,
    bugs: bugs.size,
    openBugs: [...bugs.values()].filter((row) => row.status === 'BUG').length,
    unconfirmedBugs: [...bugs.values()].filter((row) =>
      ['POR CONFIRMAR', 'POSIBLE BUG', 'PENDIENTE', 'ACTIVE', 'EN VALIDACIÓN'].includes(row.status),
    ).length,
  };
}

export function workUnits(pages) {
  return pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      block.type === 'table'
        ? block.rows
        : block.type === 'qa' && block.kind === 'cases'
          ? block.rows.map((row) => ({ ...row, status: qaWorkStatus(row.status) }))
          : [],
    ),
  );
}
