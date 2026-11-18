export function clonePageBlocks(pages, uuid) {
  const ids = new Map();
  for (const page of pages)
    for (const block of page.blocks) {
      if (['qa', 'table', 'bug-report'].includes(block.type))
        for (const row of block.rows) ids.set(row.id, uuid());
    }
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      id: uuid(),
      ...(['qa', 'table', 'bug-report'].includes(block.type)
        ? {
            rows: block.rows.map((row) => ({
              ...row,
              id: ids.get(row.id),
              ...(row.defect
                ? {
                    defect: {
                      ...row.defect,
                      id:
                        row.defect.id.startsWith('local:') && ids.has(row.defect.id.slice(6))
                          ? `local:${ids.get(row.defect.id.slice(6))}`
                          : row.defect.id,
                    },
                  }
                : {}),
            })),
          }
        : {}),
    })),
  }));
}
