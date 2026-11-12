export function azureWorkItemId(value = '') {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (url.hostname !== 'dev.azure.com' && !/^[a-z0-9-]+\.visualstudio\.com$/i.test(url.hostname))
      return '';
    const pathId = url.pathname.match(/\/_workitems\/edit\/(\d{1,20})\/?$/i)?.[1];
    if (pathId) return pathId;
    if (/\/_workitems(?:\/edit)?\/?$/i.test(url.pathname)) {
      const id = url.searchParams.get('id') || '';
      return /^\d{1,20}$/.test(id) ? id : '';
    }
  } catch {
    /* Non-URL values have no work item ID. */
  }
  return '';
}

export function normalizeWorkItem(row) {
  const id = azureWorkItemId(row.url);
  return id && row.workItemId !== id ? { ...row, workItemId: id } : row;
}

export function normalizeWorkItemBlocks(blocks) {
  return blocks.map((block) =>
    block.type === 'qa' ? { ...block, rows: block.rows.map(normalizeWorkItem) } : block,
  );
}

export function applyWorkItemPatch(row, patch, base = '') {
  const updated = { ...row, ...patch };
  if (patch.url !== undefined) {
    const id = azureWorkItemId(patch.url);
    if (id) updated.workItemId = id;
    else if (!patch.url || azureWorkItemId(row.url)) updated.workItemId = '';
  } else if (patch.workItemId !== undefined) {
    if (azureWorkItemId(row.url)) {
      if (!patch.workItemId) updated.url = '';
      else {
        const url = new URL(row.url);
        if (/\/_workitems\/edit\/\d+\/?$/i.test(url.pathname))
          url.pathname = url.pathname.replace(/\d+\/?$/, patch.workItemId);
        else url.searchParams.set('id', patch.workItemId);
        updated.url = url.href;
      }
    } else if (base) updated.url = patch.workItemId ? `${base}${patch.workItemId}` : '';
  }
  return normalizeWorkItem(updated);
}
