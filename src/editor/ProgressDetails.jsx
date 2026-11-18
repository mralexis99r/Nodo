import { azureWorkItemId } from '../../shared/work-links';
import { useState } from 'react';
import { External, Modal } from '../ui';
import { statusKeys } from '../i18n';
import { progressDetails } from '../../shared/report-records';

export default function ProgressDetails({ block, pages, currentPage, scope, t, onNavigate }) {
  const [filter, setFilter] = useState(null);
  const [page, setPage] = useState(1);
  const { records, counts } = progressDetails(block, pages, currentPage, scope);
  const label = (key) => t(key === 'failed' ? 'failedBugs' : statusKeys[key]);
  const selected = records.filter((row) => row.bucket === filter);
  const totalPages = Math.max(1, Math.ceil(selected.length / 20));
  const current = Math.min(page, totalPages);
  return (
    <>
      <div className="report-counts report-clickable">
        {Object.entries(counts).map(([key, count]) => (
          <button
            key={key}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            aria-label={`${label(key)}: ${count}`}
          >
            <span className={`report-dot status-${key === 'failed' ? 'blocked' : key}`} />
            <strong>{count}</strong>
            <span>{label(key)}</span>
          </button>
        ))}
      </div>
      {filter && (
        <Modal
          title={`${label(filter)} (${selected.length})`}
          t={t}
          onClose={() => setFilter(null)}
        >
          <p className="modal-description">
            {t(scope === 'page' ? 'reportPage' : 'reportProject')}
          </p>
          {!selected.length && <p>{t('reportEmpty')}</p>}
          <div className="report-record-list">
            {selected.slice((current - 1) * 20, current * 20).map((row) => (
              <article key={`${row.pageId}/${row.id}`}>
                <strong>{row.title || row.reference}</strong>
                {row.reference && <p>{row.reference}</p>}
                <p>{row.status || label(row.bucket)}</p>
                {row.url && (
                  <External url={row.url}>
                    {azureWorkItemId(row.url) || row.workItemId || t('workLink')}
                  </External>
                )}
                <button
                  className="text-link"
                  onClick={() => {
                    setFilter(null);
                    onNavigate(row.pageId);
                  }}
                >
                  {row.pageTitle} / {t('openPage')}
                </button>
              </article>
            ))}
          </div>
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
        </Modal>
      )}
    </>
  );
}
