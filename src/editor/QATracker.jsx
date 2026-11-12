import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Table2, Trash2 } from 'lucide-react';
import { qaCategory, qaStatuses, referenceNamePatch } from '../../shared/qa';
import { External, IconButton, Modal } from '../ui';
import { validUrl } from '../api';
import CatalogSelect from './CatalogSelect';
import { catalogLabel, catalogValues } from '../../shared/catalogs';
import { applyWorkItemPatch, azureWorkItemId } from '../../shared/work-links';

export function QASummary({ summary, t }) {
  return (
    <div className="qa-summary" aria-label={t('qaSummary')}>
      {[
        'total',
        'passed',
        'corrected',
        'closed',
        'pending',
        'affected',
        'blocked',
        'openBugs',
        'unconfirmedBugs',
      ].map((key) => (
        <div key={key}>
          <strong>{summary[key]}</strong>
          <span>{t(`qaMetrics.${key}`)}</span>
        </div>
      ))}
      <p>{t('qaSummaryHelp')}</p>
      {summary.missingReference > 0 && (
        <p className="qa-warning">
          {t('qaMissingReferences', { count: summary.missingReference })}
        </p>
      )}
    </div>
  );
}

export default function QATracker({ block, onChange, t }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [remove, setRemove] = useState(null);
  const [checkedIds, setCheckedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkField, setBulkField] = useState('status');
  const isBug = block.kind !== 'cases';
  const pageSize = 10;
  const rows = block.rows.filter(
    (row) =>
      (status === 'all' || row.status === status) &&
      [
        row.reference,
        row.title,
        azureWorkItemId(row.url) || row.workItemId,
        row.note,
        row.history,
        row.module,
        row.classification,
        row.automation,
        row.bug,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const existingIds = new Set(block.rows.map((row) => row.id));
  const selectedIds = new Set(checkedIds.filter((id) => existingIds.has(id)));
  const selectedOnPage = visibleRows.filter((row) => selectedIds.has(row.id)).length;
  const allOnPageSelected = visibleRows.length > 0 && selectedOnPage === visibleRows.length;
  function toggleRow(id) {
    setCheckedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }
  function togglePage() {
    const pageIds = new Set(visibleRows.map((row) => row.id));
    setCheckedIds((ids) =>
      allOnPageSelected ? ids.filter((id) => !pageIds.has(id)) : [...new Set([...ids, ...pageIds])],
    );
  }
  function applyBulkStatus() {
    if (!selectedIds.size || !catalogValues(bulkField).includes(bulkStatus)) return;
    onChange({
      rows: block.rows.map((row) =>
        selectedIds.has(row.id) ? { ...row, [bulkField]: bulkStatus } : row,
      ),
    });
    setCheckedIds([]);
    setBulkStatus('');
  }
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const update = (id, patch) =>
    onChange({
      rows: block.rows.map((row) =>
        row.id === id
          ? applyWorkItemPatch(
              row,
              {
                ...(patch.reference !== undefined && !isBug
                  ? referenceNamePatch(row, patch.reference)
                  : {}),
                ...patch,
              },
              block.workItemBase,
            )
          : row,
      ),
    });
  const current = block.rows.find((row) => row.id === selected);
  function add() {
    const id = crypto.randomUUID();
    onChange({
      rows: [
        ...block.rows,
        {
          id,
          reference: '',
          title: '',
          status: 'PENDIENTE',
          classification: '',
          automation: '',
          bug: '',
          workItemId: '',
          url: '',
          linkLabel: '',
          note: '',
          history: '',
          module: '',
        },
      ],
    });
    setSelected(id);
    setPage(1);
  }
  const statusSelect = (row) => (
    <select
      aria-label={`${t('qaStatus')}: ${row.title || row.reference || row.workItemId}`}
      className={`qa-state qa-${qaCategory(row.status)}`}
      value={row.status}
      onChange={(e) => update(row.id, { status: e.target.value })}
    >
      <option value="">{t('qaUnspecified')}</option>
      {qaStatuses.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
  return (
    <div className="qa-block">
      <div className="block-heading">
        <Table2 size={17} />
        <input
          aria-label={t('tableTitle')}
          value={block.title}
          maxLength={120}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <span className="task-count">{block.rows.length}</span>
      </div>
      <div className="qa-toolbar">
        <label className="qa-search">
          <Search size={15} />
          <input
            aria-label={t('qaSearch')}
            placeholder={t('qaSearch')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              setCheckedIds([]);
            }}
          />
        </label>
        <select
          aria-label={t('qaFilter')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
            setCheckedIds([]);
          }}
        >
          <option value="all">{t('allStatuses')}</option>
          {qaStatuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      {!isBug && (
        <>
          <p className="qa-selection-help">{t('qaSelectionHelp')}</p>
          {selectedIds.size > 0 && (
            <div className="qa-bulk-bar" role="region" aria-label={t('qaBulkActions')}>
              <strong role="status">{t('qaSelectedCount', { count: selectedIds.size })}</strong>
              {rows.some((row) => !selectedIds.has(row.id)) && (
                <button
                  className="text-link"
                  onClick={() => setCheckedIds(rows.map((row) => row.id))}
                >
                  {t('qaSelectFiltered', { count: rows.length })}
                </button>
              )}
              <select
                aria-label={t('catalogBulkField')}
                value={bulkField}
                onChange={(event) => {
                  setBulkField(event.target.value);
                  setBulkStatus('');
                }}
              >
                {['status', 'classification', 'automation'].map((field) => (
                  <option key={field} value={field}>
                    {t(
                      field === 'status'
                        ? 'qaStatus'
                        : field === 'classification'
                          ? 'qaClassification'
                          : 'qaAutomation',
                    )}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('catalogBulkValue')}
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value)}
              >
                <option value="">{t('catalogChooseValue')}</option>
                {catalogValues(bulkField).map((value) => (
                  <option key={value} value={value}>
                    {catalogLabel(bulkField, value, 'cases', t)}
                  </option>
                ))}
              </select>
              <button className="button primary" disabled={!bulkStatus} onClick={applyBulkStatus}>
                {t('qaApplyStatus', { count: selectedIds.size })}
              </button>
              <button className="text-link" onClick={() => setCheckedIds([])}>
                {t('qaClearSelection')}
              </button>
            </div>
          )}
        </>
      )}
      <div className="task-table-scroll">
        <table className="qa-table">
          <thead>
            <tr>
              {!isBug && (
                <th className="qa-selection-cell">
                  <SelectionCheckbox
                    label={t('qaSelectPage')}
                    checked={allOnPageSelected}
                    indeterminate={selectedOnPage > 0 && !allOnPageSelected}
                    disabled={!visibleRows.length}
                    onChange={togglePage}
                  />
                </th>
              )}
              <th>{isBug ? t('qaWorkItem') : t('qaReference')}</th>
              <th>{t('qaCaseName')}</th>
              <th>{t('qaStatus')}</th>
              <th>{isBug ? t('qaModule') : t('qaClassification')}</th>
              <th>{isBug ? t('qaNote') : t('qaAutomation')}</th>
              <th>{t('qaWorkItem')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                className={!isBug && selectedIds.has(row.id) ? 'qa-row-selected' : undefined}
              >
                {!isBug && (
                  <td className="qa-selection-cell">
                    <SelectionCheckbox
                      label={t('qaSelectRow', {
                        name: row.reference || row.title || t('qaUntitled'),
                      })}
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                    />
                  </td>
                )}
                <td>
                  <button className="qa-open" onClick={() => setSelected(row.id)}>
                    {(isBug ? azureWorkItemId(row.url) || row.workItemId : row.reference) ||
                      t('qaMissingReference')}
                  </button>
                </td>
                <td>
                  <button className="qa-open qa-case-title" onClick={() => setSelected(row.id)}>
                    {row.title || t('qaUntitled')}
                  </button>
                </td>
                <td>{statusSelect(row)}</td>
                <td>
                  {isBug ? (
                    row.module
                  ) : (
                    <CatalogSelect
                      field="classification"
                      value={row.classification}
                      label={`${t('qaClassification')}: ${row.title || row.reference}`}
                      onChange={(classification) => update(row.id, { classification })}
                      t={t}
                    />
                  )}
                </td>
                <td>
                  {isBug ? (
                    row.note
                  ) : (
                    <CatalogSelect
                      field="automation"
                      value={row.automation}
                      label={`${t('qaAutomation')}: ${row.title || row.reference}`}
                      onChange={(automation) => update(row.id, { automation })}
                      t={t}
                    />
                  )}
                </td>
                <td>
                  {row.url && validUrl(row.url) ? (
                    <a
                      className="text-link"
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {azureWorkItemId(row.url) || row.workItemId || t('open')}
                    </a>
                  ) : (
                    row.workItemId || '—'
                  )}
                </td>
                <td>
                  <IconButton label={t('delete')} onClick={() => setRemove(row.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={isBug ? 7 : 8}>{t('qaNoRows')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="task-table-footer">
        <button onClick={add} disabled={block.rows.length >= 500}>
          <Plus size={15} />
          {t(isBug ? 'qaAddBug' : 'qaAddCase')}
        </button>
        <div className="table-pagination">
          <span>
            {rows.length} {t('qaRecords')}
          </span>
          <IconButton label={t('previous')} disabled={page === 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft size={14} />
          </IconButton>
          <span>
            {page} / {pages}
          </span>
          <IconButton label={t('next')} disabled={page === pages} onClick={() => setPage(page + 1)}>
            <ChevronRight size={14} />
          </IconButton>
        </div>
      </div>
      {current && (
        <Modal
          title={t(isBug ? 'qaBugDetail' : 'qaCaseDetail')}
          t={t}
          onClose={() => setSelected(null)}
        >
          <div className="qa-detail">
            {block.source && (
              <p className="qa-provenance">
                {block.source}
                {current.sourceRow ? ` · ${t('qaSourceRow', { row: current.sourceRow })}` : ''}
              </p>
            )}
            {['reference', 'title', ...(isBug ? ['module'] : []), 'workItemId'].map((field) => (
              <label key={field}>
                <span>{t(`qaFields.${field}`)}</span>
                <input
                  value={current[field]}
                  maxLength={
                    field === 'title'
                      ? 1000
                      : field === 'workItemId'
                        ? 20
                        : field === 'module'
                          ? 300
                          : 500
                  }
                  inputMode={field === 'workItemId' ? 'numeric' : undefined}
                  onChange={(e) => {
                    if (field !== 'workItemId' || /^\d*$/.test(e.target.value))
                      update(current.id, { [field]: e.target.value });
                  }}
                />
              </label>
            ))}
            <label>
              <span>{t('qaStatus')}</span>
              {statusSelect(current)}
            </label>
            {['classification', ...(!isBug ? ['automation'] : []), 'note'].map((field) => (
              <label key={field}>
                <span>{t(`qaFields.${field}`)}</span>
                {field !== 'note' ? (
                  <CatalogSelect
                    field={field}
                    value={current[field]}
                    label={t(`qaFields.${field}`)}
                    onChange={(value) => update(current.id, { [field]: value })}
                    t={t}
                  />
                ) : (
                  <input
                    list={`qa-options-${block.id}-${field}`}
                    value={current[field]}
                    maxLength={2000}
                    onChange={(e) => update(current.id, { [field]: e.target.value })}
                  />
                )}
                {field === 'note' && (
                  <datalist id={`qa-options-${block.id}-${field}`}>
                    {block.options[field].map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                )}
              </label>
            ))}
            <QALink
              key={`${current.id}-${current.url}`}
              url={current.url}
              onChange={(url) => update(current.id, { url })}
              t={t}
            />
            {current.linkLabel && <p className="qa-provenance">{current.linkLabel}</p>}
            {['bug', 'history'].map((field) => (
              <label key={field}>
                <span>{t(`qaFields.${field}`)}</span>
                <textarea
                  rows={5}
                  value={current[field]}
                  maxLength={field === 'bug' ? 10000 : 20000}
                  onChange={(e) => update(current.id, { [field]: e.target.value })}
                />
              </label>
            ))}
            <p className="qa-provenance">{t('qaManualState')}</p>
            <button className="button primary" onClick={() => setSelected(null)}>
              {t('close')}
            </button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal title={t('qaRemoveRow')} t={t} onClose={() => setRemove(null)}>
          <p>{t('qaRemoveWarning')}</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setRemove(null)}>
              {t('cancel')}
            </button>
            <button
              className="button danger"
              onClick={() => {
                onChange({ rows: block.rows.filter((row) => row.id !== remove) });
                setRemove(null);
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SelectionCheckbox({ label, checked, indeterminate = false, disabled = false, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function QALink({ url, onChange, t }) {
  const [value, setValue] = useState(url);
  return (
    <label>
      <span>{t('workLink')}</span>
      <input
        type="url"
        value={value}
        maxLength={2048}
        onChange={(e) => {
          setValue(e.target.value);
          e.target.setCustomValidity('');
        }}
        onBlur={(e) => {
          if (!value || validUrl(value)) onChange(value);
          else {
            e.target.setCustomValidity(t('invalidUrl'));
            e.target.reportValidity();
          }
        }}
      />
      {url && <External url={url} aria-label={t('open')} />}
    </label>
  );
}
