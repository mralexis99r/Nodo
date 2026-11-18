import { azureWorkItemId } from './work-links.js';

export function externalBugKey(row) {
  const id = azureWorkItemId(row.url);
  if (!id) return '';
  const url = new URL(row.url);
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* Keep malformed percent sequences as literal URL text. */
  }
  return `azure:${url.hostname.toLowerCase()}${path.replace(/\/_workitems.*$/i, '').toLowerCase()}:${id}`;
}

export function bugReport(pages, scope = 'project', pageId) {
  const entries = pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      (block.type === 'qa' && block.kind !== 'references') || block.type === 'bug-report'
        ? (block.rows || []).map((row) => ({ page, block, row }))
        : [],
    ),
  );
  const keysById = new Map();
  for (const { row } of entries) {
    const key = externalBugKey(row);
    if (!key) continue;
    const id = azureWorkItemId(row.url);
    if (!keysById.has(id)) keysById.set(id, new Set());
    keysById.get(id).add(key);
  }
  const keyFor = (row) => {
    if (row.defect?.id) return row.defect.id;
    const id = azureWorkItemId(row.url) || row.workItemId;
    return (
      externalBugKey(row) ||
      (id && keysById.get(id)?.size === 1
        ? [...keysById.get(id)][0]
        : id
          ? `wi:${id}`
          : `local:${row.id}`)
    );
  };
  const bugs = new Map();
  for (const entry of entries) {
    const { row, block } = entry;
    const source = block.type === 'bug-report' || block.kind === 'bugs';
    if (
      !source &&
      !row.defect &&
      !(
        ['BUG', 'FAIL', 'BUG RELACIONADO'].includes(row.status) &&
        (row.workItemId || azureWorkItemId(row.url))
      )
    )
      continue;
    const key = keyFor(row);
    if (!bugs.has(key)) bugs.set(key, { key, members: [], cases: [], source: null });
  }
  for (const entry of entries) {
    const { row, block, page } = entry;
    const bug = bugs.get(keyFor(row));
    if (!bug) continue;
    const isCase = block.type === 'qa' && block.kind === 'cases';
    bug.members.push({ pageId: page.id, blockId: block.id, rowId: row.id, version: page.version });
    if (isCase)
      bug.cases.push({
        pageId: page.id,
        pageTitle: page.title,
        rowId: row.id,
        title: row.title,
        reference: row.reference,
        status: row.status,
      });
    if (!bug.source || !isCase) {
      bug.source = entry;
      const data = isCase ? row.defect || {} : row;
      Object.assign(bug, {
        title: data.title || row.bug || row.title,
        status: data.status || (isCase ? 'BUG' : row.status) || 'BUG',
        classification: row.classification || '',
        automation: row.automation || '',
        note: data.note || '',
        history: data.history || '',
        url: isCase && row.defect ? row.defect.url || '' : row.url || '',
        workItemId:
          isCase && row.defect
            ? row.defect.workItemId || ''
            : azureWorkItemId(row.url) || row.workItemId || '',
      });
    }
  }
  return [...bugs.values()]
    .filter((bug) => scope !== 'page' || bug.members.some((m) => m.pageId === pageId))
    .map(({ source, ...bug }) => ({
      ...bug,
      revision: JSON.stringify(
        bug.members
          .map((m) => [m.pageId, m.version, m.blockId, m.rowId])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    }));
}

export function applyBugUpdate(pages, bug, patch) {
  const members = new Set(bug.members.map((m) => `${m.pageId}/${m.blockId}/${m.rowId}`));
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) =>
      !block.rows
        ? block
        : {
            ...block,
            rows: block.rows.map((row) => {
              if (!members.has(`${page.id}/${block.id}/${row.id}`)) return row;
              if (block.type === 'qa' && block.kind === 'cases')
                return {
                  ...row,
                  defect: {
                    ...row.defect,
                    url: row.defect?.url || bug.url || '',
                    workItemId: row.defect?.workItemId || bug.workItemId || '',
                    id: bug.key,
                    title: patch.title,
                    status: patch.status,
                    note: patch.note,
                    history: patch.history,
                  },
                };
              return { ...row, ...patch };
            }),
          },
    ),
  }));
}
