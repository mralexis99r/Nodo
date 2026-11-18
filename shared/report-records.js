import { qaCategory, qaWorkStatus } from './qa.js';

export function progressRecords(pages) {
  const records = pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      block.type === 'table' || (block.type === 'qa' && block.kind === 'cases')
        ? block.rows.map((row) => ({
            ...row,
            pageId: page.id,
            pageTitle: page.title,
            blockId: block.id,
            bucket:
              block.type === 'qa'
                ? qaCategory(row.status) === 'bug'
                  ? 'failed'
                  : qaWorkStatus(row.status)
                : row.status,
          }))
        : [],
    ),
  );
  return records.length
    ? records
    : pages.map((page) => ({
        id: page.id,
        title: page.title,
        pageId: page.id,
        pageTitle: page.title,
        bucket: page.status,
      }));
}

export function progressDetails(block, pages, currentPage, scope) {
  const livePages = pages.map((page) => (page.id === currentPage.id ? currentPage : page));
  const records = progressRecords(scope === 'page' ? [currentPage] : livePages);
  return {
    records,
    counts: Object.fromEntries(
      ['todo', 'progress', 'blocked', 'done', 'failed'].map((key) => [
        key,
        records.filter((row) => row.bucket === key).length,
      ]),
    ),
  };
}
