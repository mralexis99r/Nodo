import { BarChart3 } from 'lucide-react';
import { catalogLabel, groupRecords } from '../../shared/catalogs';

export default function RecordReport({ block, pages, currentPage, onChange, t }) {
  const fields =
    block.dataset === 'tasks'
      ? ['status', 'classification', 'itemType', 'priority']
      : ['status', 'classification', 'automation'];
  const report = groupRecords(
    block.scope === 'page' ? [currentPage] : pages,
    block.dataset,
    block.field,
  );
  return (
    <div className="record-report">
      <div className="block-heading">
        <BarChart3 size={18} />
        <input
          value={block.title}
          maxLength={120}
          aria-label={t('recordReportTitle')}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>
      <div className="report-controls">
        <label>
          {t('reportDataset')}
          <select
            aria-label={t('reportDataset')}
            value={block.dataset}
            onChange={(event) => onChange({ dataset: event.target.value, field: 'status' })}
          >
            {['tasks', 'cases', 'bugs'].map((value) => (
              <option key={value} value={value}>
                {t(`reportDatasets.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('reportGroupBy')}
          <select
            aria-label={t('reportGroupBy')}
            value={block.field}
            onChange={(event) => onChange({ field: event.target.value })}
          >
            {fields.map((value) => (
              <option key={value} value={value}>
                {t(`reportFields.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('reportScope')}
          <select
            aria-label={t('reportScope')}
            value={block.scope}
            onChange={(event) => onChange({ scope: event.target.value })}
          >
            <option value="project">{t('reportProject')}</option>
            <option value="page">{t('reportPage')}</option>
          </select>
        </label>
        <label>
          {t('reportView')}
          <select
            aria-label={t('reportView')}
            value={block.view}
            onChange={(event) => onChange({ view: event.target.value })}
          >
            <option value="bars">{t('reportBars')}</option>
            <option value="table">{t('reportTable')}</option>
          </select>
        </label>
      </div>
      <p className="qa-provenance">
        {t('reportTotal', { count: report.total })} {t('reportCatalogHelp')}
      </p>
      {!report.total ? (
        <p>{t('reportEmpty')}</p>
      ) : block.view === 'table' ? (
        <table className="record-report-table">
          <thead>
            <tr>
              <th>{t('reportCategory')}</th>
              <th>{t('reportCount')}</th>
              <th>{t('reportShare')}</th>
            </tr>
          </thead>
          <tbody>
            {report.groups.map((group) => (
              <tr key={group.key}>
                <td>{catalogLabel(block.field, group.value, block.dataset, t)}</td>
                <td>{group.count}</td>
                <td>{Math.round((group.count / report.total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="record-bars" aria-label={t('reportBars')}>
          {report.groups.map((group) => (
            <div key={group.key}>
              <div className="record-bar-label">
                <span>{catalogLabel(block.field, group.value, block.dataset, t)}</span>
                <strong>
                  {group.count} ({Math.round((group.count / report.total) * 100)}%)
                </strong>
              </div>
              <div className="record-bar-track">
                <div style={{ width: `${(group.count / report.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
