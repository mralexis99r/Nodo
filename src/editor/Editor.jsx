import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Link2,
  Plus,
  RotateCcw,
  Table2,
  Trash2,
  Type,
} from 'lucide-react';
import { api, provider, validUrl } from '../api';
import { statusKeys } from '../i18n';
import {
  Empty,
  ErrorMessage,
  External,
  Icon,
  IconButton,
  IconPicker,
  Menu,
  Modal,
  Progress,
  Status,
} from '../ui';
import RichText from './RichText';
import QATracker from './QATracker';
import { workUnits } from '../../shared/qa';
import CatalogSelect from './CatalogSelect';
import RecordReport from './RecordReport';

const uuid = () => crypto.randomUUID();
const blankDocument = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });

export default function Editor({
  projectPages,
  initial,
  t,
  summary,
  color,
  saveGuard,
  onSaved,
  onReload,
  onPageAction,
}) {
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(initial),
    savedRef = useRef(initial),
    versionRef = useRef(initial.version);
  const savingRef = useRef(null),
    callbackRef = useRef(onSaved),
    mounted = useRef(true);
  const [saveState, setSaveState] = useState('saved');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  callbackRef.current = onSaved;
  const change = useCallback((update) => {
    const value = typeof update === 'function' ? update(draftRef.current) : update;
    draftRef.current = value;
    setDraft(value);
    setSaveState('unsaved');
    setError('');
  }, []);
  const flush = useCallback(() => {
    if (savingRef.current) return savingRef.current;
    const work = async () => {
      while (draftRef.current !== savedRef.current) {
        const snapshot = draftRef.current;
        if (!snapshot.title.trim()) throw new Error('INVALID_INPUT');
        if (mounted.current) setSaveState('saving');
        const saved = await api(`/pages/${initial.id}`, {
          method: 'PUT',
          body: {
            title: snapshot.title,
            icon: snapshot.icon,
            status: snapshot.status,
            blocks: snapshot.blocks,
            version: versionRef.current,
          },
        });
        versionRef.current = saved.version;
        savedRef.current = snapshot;
        if (mounted.current) callbackRef.current(saved);
      }
      if (mounted.current) {
        setSaveState('saved');
        setError('');
      }
    };
    savingRef.current = work()
      .catch((err) => {
        if (mounted.current) {
          setSaveState('error');
          setError(err.message);
        }
        throw err;
      })
      .finally(() => {
        savingRef.current = null;
      });
    return savingRef.current;
  }, [initial.id]);
  useEffect(() => {
    mounted.current = true;
    saveGuard.current = flush;
    const beforeUnload = (event) => {
      if (draftRef.current !== savedRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      if (saveGuard.current === flush) saveGuard.current = null;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [flush, saveGuard]);
  useEffect(() => {
    if (draft === savedRef.current) return;
    const timer = setTimeout(() => flush().catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [draft, flush]);
  const updateBlock = (id, patch) =>
    change((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    }));
  function addBlock(type) {
    const development = type === 'development';
    if (development) type = 'table';
    const qaKind = type === 'qa-bugs' ? 'bugs' : 'cases';
    if (type === 'qa-bugs') type = 'qa';
    if (type === 'link') {
      setModal('link');
      return;
    }
    const block = {
      id: uuid(),
      type,
      ...(type === 'text'
        ? { content: blankDocument() }
        : type === 'qa'
          ? {
              title: t(qaKind === 'cases' ? 'qaCases' : 'qaBugRegister'),
              kind: qaKind,
              source: '',
              options: { classification: [], automation: [], note: [] },
              rows: [],
            }
          : type === 'table'
            ? {
                title: t(development ? 'developmentTable' : 'tableTitle'),
                kind: development ? 'development' : 'tasks',
                rows: [],
              }
            : type === 'record-report'
              ? {
                  title: t('recordReportTitle'),
                  dataset: summary.qa && summary.qa.total === summary.tasks ? 'cases' : 'tasks',
                  field: 'status',
                  scope: 'project',
                  view: 'bars',
                }
              : { title: t('reportTitle') }),
    };
    change((current) => ({ ...current, blocks: [...current.blocks, block] }));
  }
  function blockAction(block, action) {
    change((current) => {
      const blocks = [...current.blocks],
        index = blocks.findIndex((item) => item.id === block.id);
      if (action === 'delete') blocks.splice(index, 1);
      if (action === 'up' && index > 0)
        [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
      if (action === 'down' && index < blocks.length - 1)
        [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
      if (action === 'duplicate')
        blocks.splice(index + 1, 0, {
          ...structuredClone(block),
          id: uuid(),
          ...(['table', 'qa'].includes(block.type)
            ? { rows: block.rows.map((row) => ({ ...row, id: uuid() })) }
            : {}),
        });
      return { ...current, blocks };
    });
  }
  const localSummary = (() => {
    const rows = workUnits([draft]);
    return rows.length
      ? {
          total: rows.length,
          progress: Math.round(
            (rows.filter((row) => row.status === 'done').length / rows.length) * 100,
          ),
          status: rows.some((row) => row.status === 'blocked')
            ? 'blocked'
            : rows.every((row) => row.status === 'done')
              ? 'done'
              : rows.some((row) => row.status === 'done' || row.status === 'progress')
                ? 'progress'
                : 'todo',
        }
      : null;
  })();
  return (
    <div className="page-editor">
      <div className="editor-meta">
        <div className={`save-state ${saveState === 'error' ? 'danger-text' : ''}`} role="status">
          {saveState === 'saving' ? (
            <span className="loader tiny" />
          ) : saveState === 'saved' ? (
            <Check size={13} />
          ) : (
            <span className="unsaved-dot" />
          )}
          {t(saveState === 'error' ? 'saveError' : saveState)}
          {saveState === 'error' && (
            <button onClick={() => flush().catch(() => {})}>{t('retry')}</button>
          )}
          {error === 'VERSION_CONFLICT' && <button onClick={onReload}>{t('reload')}</button>}
        </div>
        <Menu label={t('more')}>
          <button onClick={() => setModal('icon')}>
            <Icon name={draft.icon} size={15} />
            {t('icon')}
          </button>
          <button onClick={() => onPageAction('duplicate')}>
            <Copy size={15} />
            {t('duplicate')}
          </button>
          <button className="danger-text" onClick={() => onPageAction('delete')}>
            <Trash2 size={15} />
            {t('delete')}
          </button>
        </Menu>
      </div>
      <ErrorMessage error={error} t={t} />
      <div className="editor-title-row">
        <button
          className="page-icon-button"
          aria-label={t('icon')}
          onClick={() => setModal('icon')}
        >
          <Icon name={draft.icon} size={25} />
        </button>
        <input
          className="page-title-input"
          aria-label={t('pageName')}
          placeholder={t('pageName')}
          maxLength={120}
          value={draft.title}
          onChange={(event) => change((current) => ({ ...current, title: event.target.value }))}
        />
      </div>
      <div className="page-status-row">
        <span>{t('status')}</span>
        {localSummary ? (
          <Status value={localSummary.status} t={t} />
        ) : (
          <select
            aria-label={t('status')}
            value={draft.status}
            onChange={(event) => change((current) => ({ ...current, status: event.target.value }))}
          >
            {Object.keys(statusKeys).map((value) => (
              <option value={value} key={value}>
                {t(statusKeys[value])}
              </option>
            ))}
          </select>
        )}
        <span className="page-status-hint" title={t('statusHint')}>
          {localSummary ? `${localSummary.progress}%` : ''}
        </span>
      </div>
      {!draft.blocks.length && (
        <Empty icon="file" title={t('blockEmpty')} body={t('blockEmptyBody')} />
      )}
      <div className="blocks">
        {draft.blocks.map((block, index) => (
          <section className={`editor-block block-${block.type}`} key={block.id}>
            <div className="block-controls">
              <span className="block-grip">
                <GripVertical size={16} />
              </span>
              <Menu label={t('more')}>
                <button disabled={index === 0} onClick={() => blockAction(block, 'up')}>
                  <ArrowUp size={15} />
                  {t('moveUp')}
                </button>
                <button
                  disabled={index === draft.blocks.length - 1}
                  onClick={() => blockAction(block, 'down')}
                >
                  <ArrowDown size={15} />
                  {t('moveDown')}
                </button>
                <button onClick={() => blockAction(block, 'duplicate')}>
                  <Copy size={15} />
                  {t('duplicateBlock')}
                </button>
                <button className="danger-text" onClick={() => blockAction(block, 'delete')}>
                  <Trash2 size={15} />
                  {t('removeBlock')}
                </button>
              </Menu>
            </div>
            <div className="block-body">
              {block.type === 'text' && (
                <RichText
                  value={block.content}
                  onChange={(content) => updateBlock(block.id, { content })}
                  t={t}
                />
              )}
              {block.type === 'table' && (
                <TaskTable block={block} onChange={(patch) => updateBlock(block.id, patch)} t={t} />
              )}
              {block.type === 'qa' && (
                <QATracker block={block} onChange={(patch) => updateBlock(block.id, patch)} t={t} />
              )}
              {block.type === 'report' && (
                <Report
                  block={block}
                  summary={summary}
                  color={color}
                  t={t}
                  onChange={(patch) => updateBlock(block.id, patch)}
                />
              )}
              {block.type === 'record-report' && (
                <RecordReport
                  block={block}
                  pages={projectPages.map((page) => (page.id === draft.id ? draft : page))}
                  currentPage={draft}
                  onChange={(patch) => updateBlock(block.id, patch)}
                  t={t}
                />
              )}
              {block.type === 'link' && (
                <LinkBlock block={block} onChange={(patch) => updateBlock(block.id, patch)} t={t} />
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="add-block-bar">
        <span>{t('addBlock')}</span>
        {[
          [Type, 'text', 'textBlock'],
          [Table2, 'table', 'tableBlock'],
          [Table2, 'development', 'developmentTable'],
          [Table2, 'qa', 'qaCases'],
          [Table2, 'qa-bugs', 'qaBugRegister'],
          [BarChart3, 'report', 'reportBlock'],
          [BarChart3, 'record-report', 'recordReportTitle'],
          [Link2, 'link', 'linkBlock'],
        ].map(([Component, type, label]) => (
          <button key={type} onClick={() => addBlock(type)}>
            <Component size={16} />
            {t(label)}
          </button>
        ))}
      </div>
      {modal === 'icon' && (
        <Modal title={t('icon')} t={t} onClose={() => setModal(null)}>
          <IconPicker
            t={t}
            value={draft.icon}
            onChange={(icon) => {
              change((current) => ({ ...current, icon }));
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === 'link' && (
        <LinkForm
          t={t}
          onClose={() => setModal(null)}
          onSubmit={(input) => {
            change((current) => ({
              ...current,
              blocks: [...current.blocks, { id: uuid(), type: 'link', ...input }],
            }));
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function TaskTable({ block, onChange, t }) {
  const development = block.kind === 'development';
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(block.rows.length / pageSize));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const updateRow = (id, patch) =>
    onChange({ rows: block.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  function addTask() {
    const id = uuid();
    onChange({
      rows: [
        ...block.rows,
        {
          id,
          title: '',
          status: 'todo',
          priority: 'medium',
          url: '',
          itemType: 'task',
          classification: '',
          reminderDate: '',
        },
      ],
    });
    setPage(Math.ceil((block.rows.length + 1) / pageSize));
    setTimeout(() => document.getElementById(`task-${id}`)?.focus(), 50);
  }
  return (
    <div className="task-block">
      <div className="block-heading">
        <Table2 size={17} />
        <input
          aria-label={t('tableTitle')}
          value={block.title}
          maxLength={120}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <span className="task-count">{block.rows.length}</span>
      </div>
      <div className="task-table-scroll">
        <table className="task-table">
          <thead>
            <tr>
              <th>{t('task')}</th>
              {development && <th>{t('workItemType')}</th>}
              <th>{t('status')}</th>
              <th>{t('priority')}</th>
              {development && (
                <>
                  <th>{t('workArea')}</th>
                  <th>{t('workReminder')}</th>
                </>
              )}
              <th>{t('workLink')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {block.rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="task-name">
                    <button
                      className={`task-check ${row.status === 'done' ? 'checked' : ''}`}
                      aria-label={t(row.status === 'done' ? 'todo' : 'done')}
                      onClick={() =>
                        updateRow(row.id, { status: row.status === 'done' ? 'todo' : 'done' })
                      }
                    >
                      {row.status === 'done' && <Check size={11} />}
                    </button>
                    <input
                      id={`task-${row.id}`}
                      className={row.status === 'done' ? 'task-done' : ''}
                      aria-label={t('task')}
                      placeholder={t('taskPlaceholder')}
                      maxLength={300}
                      value={row.title}
                      onChange={(event) => updateRow(row.id, { title: event.target.value })}
                    />
                  </div>
                </td>
                {development && (
                  <td>
                    <CatalogSelect
                      dataset="tasks"
                      field="itemType"
                      value={row.itemType || 'task'}
                      label={`${t('workItemType')}: ${row.title}`}
                      onChange={(itemType) => updateRow(row.id, { itemType })}
                      t={t}
                    />
                  </td>
                )}
                <td>
                  <select
                    className={`task-status-select status-${row.status}`}
                    aria-label={t('status')}
                    value={row.status}
                    onChange={(event) => updateRow(row.id, { status: event.target.value })}
                  >
                    {Object.keys(statusKeys).map((value) => (
                      <option key={value} value={value}>
                        {t(statusKeys[value])}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={`priority-select priority-${row.priority}`}
                    aria-label={t('priority')}
                    value={row.priority}
                    onChange={(event) => updateRow(row.id, { priority: event.target.value })}
                  >
                    {['low', 'medium', 'high'].map((value) => (
                      <option key={value} value={value}>
                        {t(value)}
                      </option>
                    ))}
                  </select>
                </td>
                {development && (
                  <>
                    <td>
                      <CatalogSelect
                        dataset="tasks"
                        field="classification"
                        value={row.classification || ''}
                        label={`${t('workArea')}: ${row.title}`}
                        onChange={(classification) => updateRow(row.id, { classification })}
                        t={t}
                      />
                    </td>
                    <td>
                      <input
                        className="reminder-date"
                        type="date"
                        value={row.reminderDate || ''}
                        aria-label={`${t('workReminder')}: ${row.title}`}
                        onChange={(event) =>
                          updateRow(row.id, { reminderDate: event.target.value })
                        }
                      />
                    </td>
                  </>
                )}
                <td>
                  <TaskUrl
                    key={row.url}
                    url={row.url}
                    onChange={(url) => updateRow(row.id, { url })}
                    t={t}
                  />
                </td>
                <td>
                  <IconButton
                    label={t('removeTask')}
                    onClick={() =>
                      onChange({ rows: block.rows.filter((item) => item.id !== row.id) })
                    }
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="task-table-footer">
        <button onClick={addTask}>
          <Plus size={15} />
          {t('addTask')}
        </button>
        {pages > 1 && (
          <div className="table-pagination">
            <IconButton
              label={t('previous')}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={14} />
            </IconButton>
            <span>
              {page} / {pages}
            </span>
            <IconButton
              label={t('next')}
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={14} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskUrl({ url, onChange, t }) {
  const [value, setValue] = useState(url);
  return (
    <div className="task-url">
      <input
        type="url"
        aria-label={t('workLink')}
        title={value}
        value={value}
        placeholder="https://..."
        maxLength={2048}
        onChange={(event) => {
          setValue(event.target.value);
          event.target.setCustomValidity('');
        }}
        onBlur={(event) => {
          if (!value || validUrl(value)) onChange(value);
          else {
            event.target.setCustomValidity(t('invalidUrl'));
            event.target.reportValidity();
          }
        }}
      />
      {url && validUrl(url) && <External url={url} aria-label={t('open')} />}
    </div>
  );
}
function Report({ block, summary, color, t, onChange }) {
  return (
    <div className={`report-block tint-${color}`}>
      <div className="block-heading">
        <BarChart3 size={18} />
        <input
          value={block.title}
          maxLength={120}
          aria-label={t('reportTitle')}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>
      <div className="report-main">
        <div>
          <strong>
            {summary.progress}
            <span>%</span>
          </strong>
          <Status value={summary.status} t={t} />
        </div>
        <Progress value={summary.progress} color={color} />
      </div>
      <div className="report-counts">
        {Object.keys(statusKeys).map((value) => (
          <div key={value}>
            <span className={`report-dot status-${value}`} />
            <strong>{summary.counts[value]}</strong>
            <span>{t(statusKeys[value])}</span>
          </div>
        ))}
      </div>
      <p>{t('autoReport')}</p>
    </div>
  );
}
function LinkBlock({ block, onChange, t }) {
  const info = provider(block.url);
  const [edit, setEdit] = useState(false);
  return (
    <>
      <div className={`link-block ${block.preview ? 'with-preview' : ''}`}>
        <span className={`link-provider-icon tint-${info.color}`}>
          <Icon name={info.icon} size={block.preview ? 25 : 18} />
        </span>
        <div className="link-block-copy">
          <External url={block.url}>
            <strong>{block.title || info.name}</strong>
          </External>
          {block.preview && (
            <>
              <span className="link-domain">
                {info.name} / {t('connectedLink')}
              </span>
              <p>{t('externalNote')}</p>
              <span className="link-url-text">{block.url}</span>
            </>
          )}
        </div>
        <Menu label={t('more')}>
          <button onClick={() => setEdit(true)}>
            <Icon name="file" size={15} />
            {t('edit')}
          </button>
          <button onClick={() => onChange({ preview: !block.preview })}>
            <Icon name="globe" size={15} />
            {t(block.preview ? 'hidePreview' : 'showPreview')}
          </button>
        </Menu>
      </div>
      {edit && (
        <LinkForm
          t={t}
          initial={block}
          onClose={() => setEdit(false)}
          onSubmit={(input) => {
            onChange(input);
            setEdit(false);
          }}
        />
      )}
    </>
  );
}
function LinkForm({ t, initial, onClose, onSubmit }) {
  const [input, setInput] = useState({
    title: initial?.title || '',
    url: initial?.url || '',
    preview: initial?.preview ?? true,
  });
  return (
    <Modal title={t('linkBlock')} t={t} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (validUrl(input.url)) onSubmit(input);
        }}
      >
        <p className="modal-description">{t('linkRequired')}</p>
        <label>
          {t('linkTitle')}
          <input
            autoFocus
            required
            maxLength={200}
            value={input.title}
            onChange={(event) => setInput({ ...input, title: event.target.value })}
          />
        </label>
        <label>
          {t('linkUrl')}
          <input
            type="url"
            required
            pattern="https?://.*"
            maxLength={2048}
            placeholder="https://..."
            value={input.url}
            onChange={(event) => setInput({ ...input, url: event.target.value })}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={input.preview}
            onChange={(event) => setInput({ ...input, preview: event.target.checked })}
          />
          {t('preview')}
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="button primary" disabled={!input.title.trim() || !validUrl(input.url)}>
            {t(initial ? 'save' : 'addLink')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
