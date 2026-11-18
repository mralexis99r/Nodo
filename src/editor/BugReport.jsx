import { useState } from 'react';
import { Bug, Plus } from 'lucide-react';
import { bugReport } from '../../shared/bugs';
import { azureWorkItemId } from '../../shared/work-links';
import { qaStatuses } from '../../shared/qa';
import { ErrorMessage, External, Modal } from '../ui';

export default function BugReport({
  block,
  pages,
  currentPage,
  t,
  onChange,
  onUpdateBug,
  onNavigate,
}) {
  const bugs = bugReport(pages, block.scope, currentPage.id);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [input, setInput] = useState(null);
  const filtered = bugs.filter((bug) =>
    [
      bug.title,
      bug.workItemId,
      bug.status,
      ...bug.cases.map((row) => `${row.title} ${row.reference}`),
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, totalPages);
  function open(bug) {
    setSelected(bug);
    setInput({ title: bug.title, status: bug.status, note: bug.note, history: bug.history });
    setError('');
  }
  return (
    <div className="bug-report">
      <div className="block-heading">
        <Bug size={18} />
        <input
          value={block.title}
          maxLength={120}
          aria-label={t('bugReport')}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </div>
      <div className="report-controls">
        <label>
          {t('reportScope')}
          <select
            aria-label={t('bugReportScope')}
            value={block.scope}
            onChange={(e) => onChange({ scope: e.target.value })}
          >
            <option value="page">{t('reportPage')}</option>
            <option value="project">{t('reportProject')}</option>
          </select>
        </label>
        <label>
          {t('search')}
          <input
            aria-label={t('searchBugs')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <p className="qa-provenance">
        {t('bugReportHelp')} {t('bugCount', { count: bugs.length })}
      </p>
      <div className="report-record-list">
        {filtered.slice((current - 1) * 10, current * 10).map((bug) => (
          <article key={bug.key}>
            <button className="text-link" onClick={() => open(bug)}>
              <strong>
                {bug.workItemId ? `#${bug.workItemId} ` : ''}
                {bug.title}
              </strong>
            </button>
            <span className="qa-bug-label">{bug.status}</span>
            {bug.url && <External url={bug.url}>{bug.workItemId || t('workLink')}</External>}
            <p>{t('linkedCases', { count: bug.cases.length })}</p>
            <details>
              <summary>{t('viewLinkedCases')}</summary>
              {bug.cases.map((row) => (
                <p key={`${row.pageId}/${row.rowId}`}>
                  <button className="text-link" onClick={() => onNavigate(row.pageId)}>
                    {row.reference || row.title}
                  </button>{' '}
                  / {row.status} / {row.pageTitle}
                </p>
              ))}
            </details>
          </article>
        ))}
      </div>
      {!filtered.length && <p>{t('noBugs')}</p>}
      <div className="task-table-footer">
        <button
          disabled={(block.rows?.length || 0) >= 500}
          onClick={() =>
            open({ key: null, title: '', status: 'BUG', note: '', history: '', cases: [] })
          }
        >
          <Plus size={15} />
          {t('qaAddBug')}
        </button>
        {totalPages > 1 && (
          <div className="table-pagination">
            <button disabled={current === 1} onClick={() => setPage(current - 1)}>
              {t('previous')}
            </button>
            <span>
              {current} / {totalPages}
            </span>
            <button disabled={current === totalPages} onClick={() => setPage(current + 1)}>
              {t('next')}
            </button>
          </div>
        )}
      </div>
      {input && (
        <Modal title={t('qaBugDetail')} t={t} onClose={() => !busy && setInput(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                if (selected.key) await onUpdateBug(selected, input);
                else
                  onChange({
                    rows: [
                      ...(block.rows || []),
                      {
                        id: crypto.randomUUID(),
                        reference: '',
                        ...input,
                        url: input.url || '',
                        workItemId: azureWorkItemId(input.url),
                        classification: '',
                        automation: '',
                        bug: '',
                      },
                    ],
                  });
                setInput(null);
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorMessage error={error} t={t} />
            <label>
              {t('qaFields.title')}
              <input
                required
                maxLength={1000}
                value={input.title}
                onChange={(e) => setInput({ ...input, title: e.target.value })}
              />
            </label>
            {!selected.key && (
              <label>
                {t('workLink')}
                <input
                  type="url"
                  pattern="https?://.*"
                  maxLength={2048}
                  value={input.url || ''}
                  onChange={(e) => setInput({ ...input, url: e.target.value })}
                />
              </label>
            )}
            <label>
              {t('qaStatus')}
              <select
                value={input.status}
                onChange={(e) => setInput({ ...input, status: e.target.value })}
              >
                {qaStatuses.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              {t('qaFields.note')}
              <textarea
                maxLength={2000}
                rows={4}
                value={input.note}
                onChange={(e) => setInput({ ...input, note: e.target.value })}
              />
            </label>
            <label>
              {t('qaFields.history')}
              <textarea
                maxLength={20000}
                rows={4}
                value={input.history}
                onChange={(e) => setInput({ ...input, history: e.target.value })}
              />
            </label>
            <p>{t('bugUpdateHelp')}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setInput(null)}
                disabled={busy}
              >
                {t('cancel')}
              </button>
              <button className="button primary" disabled={busy || !input.title.trim()}>
                {t(busy ? 'saving' : 'save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
