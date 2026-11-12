import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, FilePlus2, Plus, Settings, Star, Trash2 } from 'lucide-react';
import { api } from './api';
import { statusKeys } from './i18n';
import { useResource } from './hooks';
import {
  ConfirmDelete,
  Empty,
  ErrorMessage,
  Icon,
  IconButton,
  IconPicker,
  IconTile,
  Loading,
  Menu,
  Modal,
  Progress,
  Status,
} from './ui';
import Editor from './editor/Editor';
import { summarizeQA, workUnits } from '../shared/qa';
import { QASummary } from './editor/QATracker';

export function summarizePages(pages) {
  const tasks = workUnits(pages);
  const units = tasks.length ? tasks : pages;
  const counts = Object.fromEntries(
    Object.keys(statusKeys).map((status) => [
      status,
      units.filter((item) => item.status === status).length,
    ]),
  );
  return {
    counts,
    total: units.length,
    progress: units.length ? Math.round((counts.done / units.length) * 100) : 0,
    status: counts.blocked
      ? 'blocked'
      : units.length && counts.done === units.length
        ? 'done'
        : counts.progress || counts.done
          ? 'progress'
          : 'todo',
    pages: pages.length,
    tasks: tasks.length,
    qa: summarizeQA(pages),
  };
}

export default function Project({
  projectId,
  pageId,
  t,
  locale,
  navigate,
  refresh,
  invalidate,
  run,
  saveGuard,
  actionProject,
}) {
  const [state, setData] = useResource(() => api(`/projects/${projectId}`), [projectId, refresh]);
  const [modal, setModal] = useState(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const project = state.data;
  const page =
    project?.pages.find((item) => item.id === pageId) || (!pageId ? project?.pages[0] : null);
  const summary = useMemo(() => (project ? summarizePages(project.pages) : null), [project]);
  async function newPage() {
    if (saveGuard.current) await saveGuard.current();
    setModal({ type: 'page' });
  }
  async function pageAction(action) {
    if (saveGuard.current) await saveGuard.current();
    if (action === 'delete') return setModal({ type: 'delete' });
    if (action === 'duplicate') {
      const result = await api(`/pages/${page.id}/duplicate`, { method: 'POST' });
      invalidate();
      await navigate(`project/${projectId}/${result.id}`);
    }
  }
  if (!project && state.loading) return <Loading t={t} />;
  if (state.error)
    return (
      <div className="page">
        <button className="text-link" onClick={() => navigate('projects')}>
          <ArrowLeft size={15} />
          {t('back')}
        </button>
        <ErrorMessage error={state.error} t={t} />
        <button className="button secondary" onClick={invalidate}>
          {t('tryAgain')}
        </button>
      </div>
    );
  return (
    <div className="page project-page">
      <button className="back-link" onClick={() => navigate('projects')}>
        <ArrowLeft size={14} />
        {t('projects')}
      </button>
      <div className={`project-cover cover-${project.color}`}>
        <div className="cover-line cover-line-one" />
        <div className="cover-line cover-line-two" />
        <span className="cover-node cover-node-one" />
        <span className="cover-node cover-node-two" />
        <span className="cover-node cover-node-three" />
        <span className="cover-label">NODO / {t('project').toUpperCase()}</span>
      </div>
      <div className="project-title-row">
        <IconTile name={project.icon} color={project.color} size="large" />
        <div className="project-header-actions">
          <IconButton
            label={t(project.favorite ? 'unfavorite' : 'favorite')}
            onClick={() => run(() => actionProject(project, 'favorite'))}
          >
            <Star size={18} className={project.favorite ? 'star-filled' : ''} />
          </IconButton>
          <IconButton
            label={t('editProject')}
            onClick={() => run(() => actionProject(project, 'edit'))}
          >
            <Settings size={18} />
          </IconButton>
          <Menu label={t('more')}>
            <button onClick={() => run(() => actionProject(project, 'duplicate'))}>
              <Copy size={15} />
              {t('duplicate')}
            </button>
            <button
              className="danger-text"
              onClick={() => run(() => actionProject(project, 'delete'))}
            >
              <Trash2 size={15} />
              {t('delete')}
            </button>
          </Menu>
        </div>
      </div>
      <div className="project-title">
        <h1>{project.title}</h1>
        <p>{project.description || t('pageSubtitle')}</p>
      </div>
      <div className="project-meta">
        <Status value={summary.status} t={t} />
        <span>{t('pageCount', { count: summary.pages })}</span>
        <span>
          {summary.qa && summary.qa.total === summary.tasks
            ? `${summary.qa.total} ${t('qaCases')}`
            : t('taskCount', { count: summary.tasks })}
        </span>
        <div className="project-meta-progress" title={t('statusHint')}>
          <Progress value={summary.progress} color={project.color} />
          <strong>{summary.progress}%</strong>
        </div>
      </div>
      {summary.qa && <QASummary summary={summary.qa} t={t} />}
      <div className="project-tabs">
        <div className="project-tab-list" role="tablist" aria-label={t('features')}>
          {project.pages.map((item) => (
            <button
              role="tab"
              aria-selected={item.id === page?.id}
              aria-controls="page-panel"
              id={`tab-${item.id}`}
              className={item.id === page?.id ? 'selected' : ''}
              key={item.id}
              onClick={() => navigate(`project/${projectId}/${item.id}`)}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
        <button className="add-page-tab" onClick={() => run(newPage)}>
          <Plus size={16} />
          <span>{t('newPage')}</span>
        </button>
      </div>
      {page ? (
        <section role="tabpanel" id="page-panel" aria-labelledby={`tab-${page.id}`}>
          <Editor
            projectPages={project.pages}
            key={`${page.id}-${editorEpoch}`}
            initial={page}
            t={t}
            locale={locale}
            summary={summary}
            color={project.color}
            saveGuard={saveGuard}
            onSaved={(saved) => {
              setData((current) => ({
                ...current,
                pages: current.pages.map((item) => (item.id === saved.id ? saved : item)),
              }));
            }}
            onReload={() =>
              run(async () => {
                if (window.confirm(t('conflictReload'))) {
                  const fresh = await api(`/projects/${projectId}`);
                  saveGuard.current = null;
                  setData(fresh);
                  setEditorEpoch((value) => value + 1);
                }
              })
            }
            onPageAction={(action) => run(() => pageAction(action))}
          />
        </section>
      ) : (
        <Empty icon="file" title={t('emptyProject')} body={t('emptyProjectBody')}>
          <button className="button primary" onClick={() => run(newPage)}>
            <FilePlus2 size={17} />
            {t('newPage')}
          </button>
        </Empty>
      )}
      {modal?.type === 'page' && (
        <PageForm
          t={t}
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            const result = await api(`/projects/${projectId}/pages`, {
              method: 'POST',
              body: input,
            });
            setData((current) => ({ ...current, pages: [...current.pages, result] }));
            setModal(null);
            invalidate();
            await navigate(`project/${projectId}/${result.id}`);
          }}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDelete
          t={t}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(`/pages/${page.id}`, { method: 'DELETE' });
            saveGuard.current = null;
            setModal(null);
            setData((current) => ({
              ...current,
              pages: current.pages.filter((item) => item.id !== page.id),
            }));
            invalidate();
            await navigate(`project/${projectId}`);
          }}
        />
      )}
    </div>
  );
}

function PageForm({ t, onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('file');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={t('newPage')} t={t} onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSubmit({ title, icon, status: 'todo', blocks: [] });
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="modal-description">{t('pageSubtitle')}</p>
        <ErrorMessage error={error} t={t} />
        <label>
          {t('pageName')}
          <input
            autoFocus
            required
            maxLength={120}
            placeholder={t('pagePlaceholder')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="field-label">{t('icon')}</div>
        <IconPicker value={icon} onChange={setIcon} t={t} />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="button primary" disabled={busy || !title.trim()}>
            <Check size={16} />
            {t('createPage')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
