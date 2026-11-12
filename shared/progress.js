import { summarizeQA, workUnits } from './qa.js';

export function summarize(pages) {
  const tasks = workUnits(pages);
  const units = tasks.length ? tasks : pages;
  const counts = Object.fromEntries(
    ['todo', 'progress', 'blocked', 'done'].map((status) => [
      status,
      units.filter((unit) => unit.status === status).length,
    ]),
  );
  const progress = units.length ? Math.round((counts.done / units.length) * 100) : 0;
  const status = counts.blocked
    ? 'blocked'
    : units.length && counts.done === units.length
      ? 'done'
      : counts.progress || counts.done
        ? 'progress'
        : 'todo';
  return {
    counts,
    todo: counts.todo,
    inProgress: counts.progress,
    blocked: counts.blocked,
    done: counts.done,
    total: units.length,
    progress,
    status,
    pages: pages.length,
    tasks: tasks.length,
    qa: summarizeQA(pages),
  };
}

export function progressScope(block, page) {
  if (block.scope) return block.scope;
  return page.blocks.some(
    (item) => item.type === 'table' || (item.type === 'qa' && item.kind === 'cases'),
  )
    ? 'page'
    : 'project';
}

export function progressReport(block, pages, currentPage) {
  const scope = progressScope(block, currentPage);
  const livePages = pages.map((page) => (page.id === currentPage.id ? currentPage : page));
  return { scope, ...summarize(scope === 'page' ? [currentPage] : livePages) };
}
