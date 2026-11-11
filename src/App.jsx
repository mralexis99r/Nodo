import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Copy,
  FolderOpen,
  LayoutDashboard,
  LayoutGrid,
  List,
  LockKeyhole,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { api } from './api';
import { translate, statusKeys } from './i18n';
import {
  ColorPicker,
  ConfirmDelete,
  Empty,
  ErrorMessage,
  Icon,
  IconButton,
  IconPicker,
  IconTile,
  Loading,
  Logo,
  Menu,
  Modal,
  NodeArt,
  Progress,
  Status,
} from './ui';
import { useResource } from './hooks';
const Project = lazy(() => import('./Project'));

function readRoute() {
  const [view = 'dashboard', projectId, pageId] = location.hash.slice(1).split('/');
  return ['dashboard', 'projects', 'favorites', 'trash', 'profile', 'project'].includes(view)
    ? { view, projectId, pageId }
    : { view: 'dashboard' };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [boot, setBoot] = useState(true);
  const [bootError, setBootError] = useState('');
  const [language, setLanguage] = useState(() =>
    localStorage.getItem('nodo-language') === 'en' ? 'en' : 'es',
  );
  const [route, setRoute] = useState(readRoute);
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarProjects, setSidebarProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const saveGuard = useRef(null);
  const routeRef = useRef(route);
  const t = useCallback(
    (key, values) => translate(user?.language || language, key, values),
    [user?.language, language],
  );
  const locale = user?.language || language;
  const resolvedTheme =
    !user || user.theme === 'system' ? (systemDark ? 'dark' : 'light') : user.theme;
  const notify = useCallback(
    (message, error = false) => setToast({ message, error, id: Date.now() }),
    [],
  );
  const errorText = (error) =>
    translate(locale, `errors.${error.message}`) === `errors.${error.message}`
      ? t('errorGeneric')
      : t(`errors.${error.message}`);
  async function run(action) {
    try {
      await action();
    } catch (error) {
      notify(errorText(error), true);
    }
  }
  const invalidate = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    api('/me')
      .then(setUser)
      .catch((error) => {
        if (error.message !== 'UNAUTHENTICATED') setBootError(error.message);
      })
      .finally(() => setBoot(false));
    const expired = () => {
      if (!saveGuard.current) {
        setUser(null);
        setSidebarProjects([]);
        setBootError('UNAUTHENTICATED');
      }
    };
    window.addEventListener('nodo-session-expired', expired);
    return () => window.removeEventListener('nodo-session-expired', expired);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem('nodo-language', locale);
    setLanguage(locale);
  }, [locale]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    async function change() {
      const next = readRoute();
      try {
        if (saveGuard.current) await saveGuard.current();
        setRoute(next);
        routeRef.current = next;
        setSidebarOpen(false);
      } catch (error) {
        const old = routeRef.current;
        history.replaceState(
          null,
          '',
          `#${old.view}${old.projectId ? `/${old.projectId}` : ''}${old.pageId ? `/${old.pageId}` : ''}`,
        );
        notify(translate(locale, `errors.${error.message}`), true);
      }
    }
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [locale, notify]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.view, route.projectId]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api('/projects?limit=50')
      .then((result) => {
        if (active) setSidebarProjects(result.items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), toast.error ? 9000 : 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function navigate(path) {
    try {
      if (saveGuard.current) await saveGuard.current();
      location.hash = path;
    } catch (error) {
      notify(errorText(error), true);
    }
  }
  async function updateProfile(patch) {
    const updated = await api('/me', {
      method: 'PATCH',
      body: {
        name: user.name,
        avatar: user.avatar,
        language: user.language,
        theme: user.theme,
        ...patch,
      },
    });
    setUser(updated);
    return updated;
  }
  async function actionProject(project, action) {
    if (saveGuard.current) await saveGuard.current();
    if (action === 'edit') return setModal({ type: 'project', project });
    if (action === 'delete') return setModal({ type: 'delete', project });
    if (action === 'favorite')
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: { favorite: !project.favorite },
      });
    if (action === 'duplicate') {
      const copy = await api(`/projects/${project.id}/duplicate`, { method: 'POST' });
      await navigate(`project/${copy.id}`);
    }
    invalidate();
  }
  async function createSample() {
    setBusy(true);
    try {
      const result = await api('/projects/sample', { method: 'POST' });
      invalidate();
      await navigate(`project/${result.id}`);
    } catch (error) {
      notify(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }
  const shared = { t, locale, navigate, refresh, invalidate, run, notify };
  if (boot)
    return (
      <div className="boot">
        <Logo />
        <span className="loader" />
        <p>{t('loading')}</p>
      </div>
    );
  if (!user)
    return (
      <Auth
        t={t}
        locale={locale}
        setLanguage={setLanguage}
        onAuth={(value) => {
          setSidebarProjects([]);
          setUser(value);
          setBootError('');
          invalidate();
        }}
        initialError={bootError}
      />
    );
  const titles = {
    dashboard: 'dashboard',
    projects: 'projects',
    favorites: 'favorites',
    trash: 'trash',
    profile: 'profile',
    project: 'projects',
  };
  const currentProject = sidebarProjects.find((project) => project.id === route.projectId);
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label={t('close')}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <button className="brand-link" onClick={() => navigate('dashboard')}>
          <Logo />
        </button>
        <button className="workspace-switch" onClick={() => navigate('profile')}>
          <span className="workspace-avatar">
            <Icon name={user.avatar} size={18} />
          </span>
          <span>
            <strong>{t('workspace')}</strong>
            <small>{t('privateWorkspace')}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="sidebar-search"
          onClick={() => {
            navigate('projects');
            setTimeout(() => document.getElementById('project-search')?.focus(), 100);
          }}
        >
          <Search size={16} />
          {t('search')}
          <kbd>/</kbd>
        </button>
        <nav className="main-nav" aria-label="Nodo">
          {[
            [LayoutDashboard, 'dashboard'],
            [FolderOpen, 'projects'],
            [Star, 'favorites'],
          ].map(([Component, view]) => (
            <button
              key={view}
              className={`nav-item ${route.view === view ? 'selected' : ''}`}
              onClick={() => navigate(view)}
            >
              <Component size={18} />
              {t(view)}
              {view === 'projects' && (
                <span className="nav-count">
                  {sidebarProjects.length < 50 ? sidebarProjects.length : '50+'}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-title">
          <span>{t('projects')}</span>
          <IconButton label={t('newProject')} onClick={() => setModal({ type: 'project' })}>
            <Plus size={15} />
          </IconButton>
        </div>
        <div className="sidebar-projects">
          {sidebarProjects.slice(0, 10).map((project) => (
            <button
              className={`nav-item project-nav ${route.projectId === project.id ? 'selected' : ''}`}
              key={project.id}
              onClick={() => navigate(`project/${project.id}`)}
            >
              <span className={`inline-icon tint-${project.color}`}>
                <Icon name={project.icon} size={17} />
              </span>
              <span className="truncate">{project.title}</span>
              {Boolean(project.favorite) && <Star size={12} className="star-filled" />}
            </button>
          ))}
          {!sidebarProjects.length && <p className="sidebar-empty">{t('noTasks')}</p>}
          <button
            className="nav-item new-sidebar-project"
            onClick={() => setModal({ type: 'project' })}
          >
            <Plus size={16} />
            {t('newProject')}
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <LockKeyhole size={13} />
            {t('private')}
          </div>
          <button
            className={`nav-item ${route.view === 'trash' ? 'selected' : ''}`}
            onClick={() => navigate('trash')}
          >
            <Trash2 size={17} />
            {t('trash')}
          </button>
          <button
            className={`nav-item ${route.view === 'profile' ? 'selected' : ''}`}
            onClick={() => navigate('profile')}
          >
            <Settings size={17} />
            {t('settings')}
          </button>
          <div className="user-strip">
            <button className="user-profile" onClick={() => navigate('profile')}>
              <span className="user-avatar">
                <Icon name={user.avatar} />
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{t('privateWorkspace')}</small>
              </span>
            </button>
            <IconButton
              label={t('logout')}
              onClick={() =>
                run(async () => {
                  if (saveGuard.current) await saveGuard.current();
                  await api('/auth/logout', { method: 'POST' });
                  setUser(null);
                  setSidebarProjects([]);
                  history.replaceState(null, '', '#dashboard');
                  setRoute({ view: 'dashboard' });
                })
              }
            >
              <LogOut size={16} />
            </IconButton>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              className="mobile-menu"
              label={t('open')}
              onClick={() => setSidebarOpen(true)}
            >
              <MenuIcon size={19} />
            </IconButton>
            <span>{t('workspace')}</span>
            <ChevronRight size={13} />
            <strong>
              {route.view === 'project'
                ? currentProject?.title || t('project')
                : t(titles[route.view])}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="private-badge">
              <LockKeyhole size={12} />
              {t('privateWorkspace')}
            </span>
            <span className="topbar-divider" />
            <select
              aria-label={t('language')}
              className="language-select"
              value={locale}
              onChange={(event) => run(() => updateProfile({ language: event.target.value }))}
            >
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
            <IconButton
              label={t(resolvedTheme === 'dark' ? 'light' : 'dark')}
              onClick={() =>
                run(() =>
                  updateProfile({
                    theme: resolvedTheme === 'dark' ? 'light' : 'dark',
                  }),
                )
              }
            >
              {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
          </div>
        </header>
        <main
          id="main-content"
          className={`main-content ${route.view === 'project' ? 'project-content' : ''}`}
        >
          {route.view === 'dashboard' && (
            <Dashboard
              {...shared}
              user={user}
              newProject={() => setModal({ type: 'project' })}
              sample={createSample}
              busy={busy}
              actionProject={actionProject}
            />
          )}
          {['projects', 'favorites'].includes(route.view) && (
            <Projects
              key={route.view}
              {...shared}
              favorites={route.view === 'favorites'}
              newProject={() => setModal({ type: 'project' })}
              actionProject={actionProject}
            />
          )}
          {route.view === 'trash' && <Trash {...shared} />}
          {route.view === 'profile' && (
            <Profile {...shared} user={user} updateProfile={updateProfile} />
          )}
          {route.view === 'project' && (
            <Suspense fallback={<Loading t={t} />}>
              <Project
                key={route.projectId}
                {...shared}
                projectId={route.projectId}
                pageId={route.pageId}
                saveGuard={saveGuard}
                actionProject={actionProject}
              />
            </Suspense>
          )}
        </main>
        <footer className="app-footer">
          <span>Nodo</span>
          <span>{t('community')}</span>
        </footer>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {!toast.error && <Check size={16} />}
          <span>{toast.message}</span>
          <IconButton label={t('close')} onClick={() => setToast(null)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      {modal?.type === 'project' && (
        <ProjectForm
          t={t}
          project={modal.project}
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            if (modal.project) {
              await api(`/projects/${modal.project.id}`, { method: 'PATCH', body: input });
            } else {
              const project = await api('/projects', { method: 'POST', body: input });
              await navigate(`project/${project.id}`);
            }
            invalidate();
            setModal(null);
          }}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDelete
          t={t}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(`/projects/${modal.project.id}`, { method: 'DELETE' });
            setModal(null);
            invalidate();
            if (route.projectId === modal.project.id) await navigate('projects');
          }}
        />
      )}
    </div>
  );
}

function Auth({ t, locale, setLanguage, onAuth, initialError }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState(null);
  const [code, setCode] = useState('');
  const [time, setTime] = useState(Date.now());
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!verification) return;
    const interval = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [Boolean(verification)]);
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (
        register &&
        data.email.trim().toLowerCase() !== data.emailConfirmation.trim().toLowerCase()
      ) {
        setError('EMAIL_MISMATCH');
        return;
      }
      const result = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: { ...data, language: locale },
      });
      if (result.verificationRequired) {
        setVerification({ ...result.verification, password: data.password });
        setTime(Date.now());
        setCode('');
        setNotice('verificationSent');
      } else onAuth(result);
    } catch (err) {
      if (err.details?.verification) {
        setVerification({ ...err.details.verification, password: data.password });
        setCode('');
        setTime(Date.now());
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      onAuth(
        await api('/auth/verify-email', {
          method: 'POST',
          body: { email: verification.email, password: verification.password, code },
        }),
      );
      setVerification(null);
      setCode('');
    } catch (err) {
      setError(err.message);
      if (err.details?.verification)
        setVerification((current) => ({ ...current, ...err.details.verification }));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api('/auth/resend-verification', {
        method: 'POST',
        body: { email: verification.email, password: verification.password },
      });
      setVerification((current) => ({ ...current, ...result.verification }));
      setCode('');
      setTime(Date.now());
      setNotice('verificationSent');
    } catch (err) {
      setError(err.message);
      if (err.details?.verification)
        setVerification((current) => ({ ...current, ...err.details.verification }));
    } finally {
      setBusy(false);
    }
  }
  const resendSeconds = verification
    ? Math.max(0, Math.ceil((verification.resendAt - time) / 1000))
    : 0;
  const expirySeconds = verification?.expiresAt
    ? Math.max(0, Math.ceil((verification.expiresAt - time) / 1000))
    : 0;
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-copy">
          <span className="eyebrow">{t('community')}</span>
          <h1>
            {t('authTitle')}
            <br />
            <span>{t('authTitleSecond')}</span>
          </h1>
          <p>{t('authBody')}</p>
          <NodeArt />
        </div>
        <span className="auth-footer">
          <LockKeyhole size={14} />
          {t('secureNote')}
        </span>
      </section>
      <section className="auth-panel">
        <select
          className="auth-language"
          value={locale}
          aria-label={t('language')}
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
        {verification ? (
          <form className="auth-form verification-form" onSubmit={verify}>
            <div className="auth-mobile-logo">
              <Logo />
            </div>
            <span className="eyebrow">{t('verifyEmailLabel')}</span>
            <h2>{t('verifyEmailTitle')}</h2>
            <p>{t('verifyEmailBody', { email: verification.email })}</p>
            <ErrorMessage error={error} t={t} />
            {notice && (
              <div className="verification-notice" role="status">
                {t(notice)}
              </div>
            )}
            <label>
              {t('verificationCode')}
              <input
                name="code"
                className="verification-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={code}
                placeholder="000000"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <p className="verification-expiry">
              {expirySeconds
                ? t('verificationExpires', {
                    minutes: Math.floor(expirySeconds / 60),
                    seconds: String(expirySeconds % 60).padStart(2, '0'),
                  })
                : t('verificationRequestNew')}
            </p>
            <button
              className="button primary auth-submit"
              disabled={busy || code.length !== 6 || !expirySeconds}
            >
              {busy ? <span className="loader small" /> : t('verifyEmailAction')}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="button secondary verification-resend"
              disabled={busy || resendSeconds > 0}
              onClick={resend}
            >
              {resendSeconds
                ? t('verificationResendWait', { seconds: resendSeconds })
                : t('verificationResend')}
            </button>
            <p className="verification-help">{t('verificationHelp')}</p>
            <div className="auth-toggle">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setVerification(null);
                  setRegister(false);
                  setCode('');
                  setNotice('');
                  setError('');
                }}
              >
                {t('backToLogin')}
              </button>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-mobile-logo">
              <Logo />
            </div>
            <span className="eyebrow">{t('welcomeBack')}</span>
            <h2>{t(register ? 'registerTitle' : 'loginTitle')}</h2>
            <p>{t(register ? 'registerBody' : 'loginBody')}</p>
            <ErrorMessage error={error} t={t} />
            {register && (
              <label>
                {t('name')}
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder={t('namePlaceholder')}
                />
              </label>
            )}
            <label>
              {t('email')}
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="name@example.com"
              />
            </label>
            {register && (
              <label>
                {t('emailConfirmation')}
                <input
                  name="emailConfirmation"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="name@example.com"
                />
              </label>
            )}
            <label>
              {t('password')}
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={t('passwordHint')}
              />
            </label>
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? <span className="loader small" /> : t(register ? 'registerAction' : 'login')}
              <ArrowRight size={16} />
            </button>
            <div className="auth-toggle">
              {t(register ? 'haveAccount' : 'noAccount')}{' '}
              <button
                type="button"
                onClick={() => {
                  setRegister(!register);
                  setError('');
                }}
              >
                {t(register ? 'login' : 'register')}
              </button>
            </div>
          </form>
        )}
        <span className="auth-panel-footer">Nodo &copy; {new Date().getFullYear()}</span>
      </section>
    </div>
  );
}

function Dashboard({
  t,
  locale,
  user,
  refresh,
  navigate,
  newProject,
  sample,
  busy,
  actionProject,
  run,
}) {
  const [state] = useResource(() => api('/dashboard'), [refresh]);
  if (state.loading && !state.data) return <Loading t={t} />;
  if (state.error) return <ErrorMessage error={state.error} t={t} />;
  const data = state.data;
  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t('workspaceLabel')}</div>
          <h1>
            {t('hello', { name: user.name.split(' ')[0] })}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t('greeting')}</p>
        </div>
        <button className="button primary" onClick={newProject}>
          <Plus size={17} />
          {t('newProject')}
        </button>
      </div>
      <div className="date-line">
        <span className="date-dot" />
        {new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date())}
      </div>
      <section className="dashboard-banner">
        <div>
          <span className="banner-tag">
            <span />
            Nodo / {t('workspace')}
          </span>
          <h2>{t(data.projects ? 'yourSpace' : 'welcomeTitle')}</h2>
          <p>{t(data.projects ? 'yourSpaceBody' : 'welcomeBody')}</p>
          {!data.projects && (
            <button className="text-link" disabled={busy} onClick={sample}>
              {busy ? t('loading') : t('sample')}
              <ArrowRight size={15} />
            </button>
          )}
          {data.projects > 0 && (
            <span className="banner-private">
              <LockKeyhole size={13} />
              {t('private')}
            </span>
          )}
        </div>
        <NodeArt small />
      </section>
      <div className="stats-grid">
        {[
          [FolderOpen, 'activeProjects', data.active, 'blue'],
          [CircleDashed, 'pendingTasks', data.pending, 'orange'],
          [CheckCircle2, 'completedTasks', data.completed, 'green'],
        ].map(([Component, title, value, color]) => (
          <div className="stat" key={title}>
            <span className={`stat-icon tint-${color}`}>
              <Component size={18} />
            </span>
            <span className="stat-label">{t(title)}</span>
            <strong>{String(value).padStart(2, '0')}</strong>
          </div>
        ))}
      </div>
      <section className="dashboard-section">
        <div className="section-heading">
          <h2>
            {t('recentProjects')}
            <span className="section-count">{data.projects}</span>
          </h2>
          <button className="text-link muted" onClick={() => navigate('projects')}>
            {t('viewAll')}
            <ArrowRight size={14} />
          </button>
        </div>
        {data.projects ? (
          <div className="project-grid dashboard-grid">
            {data.recent.slice(0, 3).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                t={t}
                navigate={navigate}
                action={(action) => run(() => actionProject(project, action))}
              />
            ))}
            {data.recent.length < 3 && (
              <button className="new-project-card" onClick={newProject}>
                <span>
                  <Plus size={23} />
                </span>
                {t('newProject')}
              </button>
            )}
          </div>
        ) : (
          <button className="project-start" onClick={newProject}>
            <span className="start-icon">
              <Plus size={20} />
            </span>
            <div>
              <strong>{t('startProject')}</strong>
              <span>{t('noProjectsBody')}</span>
            </div>
            <ArrowRight size={18} />
          </button>
        )}
      </section>
      <section className="dashboard-section recent-section">
        <div className="section-heading">
          <h2>{t('recentActivity')}</h2>
        </div>
        {data.pages.length ? (
          <div className="recent-table">
            <div className="recent-table-heading">
              <span>{t('page')}</span>
              <span>{t('project')}</span>
              <span>{t('updated')}</span>
              <span />
            </div>
            {data.pages.map((page) => (
              <button
                className="recent-row"
                key={page.id}
                onClick={() => navigate(`project/${page.project_id}/${page.id}`)}
              >
                <span>
                  <Icon name={page.icon} size={17} />
                  <strong>{page.title}</strong>
                </span>
                <span className="recent-project-name">
                  <span className={`tiny-dot tint-${page.projectColor}`} />
                  {page.projectTitle}
                </span>
                <span>
                  {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
                    new Date(page.updated_at),
                  )}
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <Icon name="file" size={19} />
            {t('noActivity')}
          </div>
        )}
      </section>
    </div>
  );
}

export function ProjectCard({ project, t, navigate, action, list = false }) {
  return (
    <article className={`project-card ${list ? 'project-list-card' : ''}`}>
      <div className="project-card-top">
        <button
          className="project-icon-button"
          aria-label={`${t('open')} ${project.title}`}
          onClick={() => navigate(`project/${project.id}`)}
        >
          <IconTile name={project.icon} color={project.color} />
        </button>
        <div className="card-actions">
          <IconButton
            label={t(project.favorite ? 'unfavorite' : 'favorite')}
            onClick={() => action('favorite')}
          >
            <Star size={15} className={project.favorite ? 'star-filled' : ''} />
          </IconButton>
          <Menu label={t('more')}>
            <button onClick={() => action('edit')}>
              <Settings size={15} />
              {t('edit')}
            </button>
            <button onClick={() => action('duplicate')}>
              <Copy size={15} />
              {t('duplicate')}
            </button>
            <button className="danger-text" onClick={() => action('delete')}>
              <Trash2 size={15} />
              {t('delete')}
            </button>
          </Menu>
        </div>
      </div>
      <button className="project-card-main" onClick={() => navigate(`project/${project.id}`)}>
        <h3>{project.title}</h3>
        <p>{project.description || t('noTasks')}</p>
      </button>
      <div className="project-card-status">
        <Status value={project.summary.status} t={t} />
        <span>{t('pageCount', { count: project.summary.pages })}</span>
      </div>
      <div className="project-card-progress">
        <div>
          <span>{t('progress')}</span>
          <strong>{project.summary.progress}%</strong>
        </div>
        <Progress value={project.summary.progress} color={project.color} />
      </div>
    </article>
  );
}

function Projects({ t, refresh, favorites, navigate, newProject, actionProject, run }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const [state] = useResource(
    () =>
      api(
        `/projects?${new URLSearchParams({ q: debounced, status, page, favorite: favorites, limit: 9 })}`,
      ),
    [debounced, status, page, favorites, refresh],
  );
  useEffect(() => {
    if (state.data && page > state.data.pages) setPage(state.data.pages);
  }, [state.data, page]);
  useEffect(() => {
    const shortcut = (event) => {
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        event.preventDefault();
        document.getElementById('project-search')?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t('workspaceLabel')}</div>
          <h1>
            {t(favorites ? 'favorites' : 'allProjects')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t(favorites ? 'favoritesSubtitle' : 'projectsSubtitle')}</p>
        </div>
        <button className="button primary" onClick={newProject}>
          <Plus size={17} />
          {t('newProject')}
        </button>
      </div>
      <div className="project-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            id="project-search"
            placeholder={t('search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <IconButton label={t('close')} onClick={() => setQuery('')}>
              <X size={14} />
            </IconButton>
          )}
        </div>
        <select
          value={status}
          aria-label={t('status')}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">{t('allStatuses')}</option>
          {Object.keys(statusKeys).map((key) => (
            <option key={key} value={key}>
              {t(statusKeys[key])}
            </option>
          ))}
        </select>
        <div className="view-toggle">
          <IconButton
            className={!list ? 'active' : ''}
            label={t('grid')}
            onClick={() => setList(false)}
          >
            <LayoutGrid size={17} />
          </IconButton>
          <IconButton
            className={list ? 'active' : ''}
            label={t('list')}
            onClick={() => setList(true)}
          >
            <List size={17} />
          </IconButton>
        </div>
      </div>
      <ErrorMessage error={state.error} t={t} />
      {state.loading && !state.data ? (
        <Loading t={t} />
      ) : state.data?.items.length ? (
        <>
          <div className={list ? 'project-list' : 'project-grid'}>
            {state.data.items.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                t={t}
                navigate={navigate}
                list={list}
                action={(action) => run(() => actionProject(project, action))}
              />
            ))}
          </div>
          <div className="pagination">
            <span>{t('resultCount', { count: state.data.total })}</span>
            <div>
              <button
                className="button secondary compact"
                disabled={page <= 1 || state.loading}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={15} />
                {t('previous')}
              </button>
              <span>{t('pagination', { page, total: state.data.pages })}</span>
              <button
                className="button secondary compact"
                disabled={page >= state.data.pages || state.loading}
                onClick={() => setPage(page + 1)}
              >
                {t('next')}
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      ) : (
        !state.error && (
          <Empty
            icon={favorites ? 'heart' : 'folder'}
            title={t(
              debounced || status !== 'all'
                ? 'noResults'
                : favorites
                  ? 'noFavorites'
                  : 'noProjects',
            )}
            body={t(
              debounced || status !== 'all'
                ? 'noResultsBody'
                : favorites
                  ? 'noFavoritesBody'
                  : 'noProjectsBody',
            )}
          >
            {!favorites && !debounced && (
              <button className="button primary" onClick={newProject}>
                <Plus size={16} />
                {t('newProject')}
              </button>
            )}
          </Empty>
        )
      )}
    </div>
  );
}

export function ProjectForm({ t, project, onClose, onSubmit }) {
  const [input, setInput] = useState({
    title: project?.title || '',
    description: project?.description || '',
    icon: project?.icon || 'folder',
    color: project?.color || 'blue',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const update = (key, value) => setInput((s) => ({ ...s, [key]: value }));
  return (
    <Modal
      title={t(project ? 'editProject' : 'newProject')}
      t={t}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSubmit(input);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="project-form-preview">
          <IconTile name={input.icon} color={input.color} size="large" />
          <span>{input.title || t('newProject')}</span>
        </div>
        <ErrorMessage error={error} t={t} />
        <label>
          {t('title')}
          <input
            required
            autoFocus
            maxLength={120}
            value={input.title}
            placeholder={t('projectName')}
            onChange={(event) => update('title', event.target.value)}
          />
        </label>
        <label>
          {t('description')}
          <textarea
            rows={3}
            maxLength={500}
            value={input.description}
            placeholder={t('projectDescription')}
            onChange={(event) => update('description', event.target.value)}
          />
        </label>
        <div className="field-label">{t('icon')}</div>
        <IconPicker value={input.icon} onChange={(value) => update('icon', value)} t={t} />
        <div className="field-label">{t('color')}</div>
        <ColorPicker value={input.color} onChange={(value) => update('color', value)} t={t} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="button primary" disabled={busy || !input.title.trim()}>
            {busy ? <span className="loader small" /> : t(project ? 'save' : 'create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Trash({ t, locale, refresh, invalidate, run }) {
  const [state] = useResource(() => api('/trash'), [refresh]);
  const items = useMemo(
    () =>
      state.data
        ? [
            ...state.data.projects.map((item) => ({ ...item, kind: 'projects' })),
            ...state.data.pages.map((item) => ({ ...item, kind: 'pages' })),
          ].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
        : [],
    [state.data],
  );
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t('workspaceLabel')}</div>
          <h1>
            {t('trash')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t('trashSubtitle')}</p>
        </div>
      </div>
      <ErrorMessage error={state.error} t={t} />
      {state.loading ? (
        <Loading t={t} />
      ) : items.length ? (
        <div className="trash-list">
          {items.map((item) => (
            <div className="trash-row" key={item.id}>
              <IconTile name={item.icon} color={item.color || 'gray'} />
              <div>
                <strong>{item.title}</strong>
                <span>
                  {t(item.kind === 'projects' ? 'projectType' : 'pageType')}
                  {item.projectTitle && ` / ${item.projectTitle}`}
                  <span className="trash-date">
                    {t('deleted')}:{' '}
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                      new Date(item.deleted_at),
                    )}
                  </span>
                </span>
              </div>
              <button
                className="button secondary compact"
                onClick={() =>
                  run(async () => {
                    await api(`/${item.kind}/${item.id}/restore`, { method: 'POST' });
                    invalidate();
                  })
                }
              >
                <ArrowDownToLine size={15} />
                {t('restore')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        !state.error && <Empty icon="folder" title={t('trashEmpty')} body={t('trashEmptyBody')} />
      )}
    </div>
  );
}

function Profile({ t, user, updateProfile, notify }) {
  const [input, setInput] = useState({
    name: user.name,
    avatar: user.avatar,
    language: user.language,
    theme: user.theme,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setInput((s) => ({ ...s, language: user.language, theme: user.theme }));
  }, [user.language, user.theme]);
  return (
    <div className="page profile-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t('workspaceLabel')}</div>
          <h1>
            {t('profile')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t('profileSubtitle')}</p>
        </div>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await updateProfile(input);
            notify(translate(input.language, 'profileSaved'));
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="profile-section">
          <div className="profile-avatar-preview">
            <IconTile name={input.avatar} color="gray" size="large" />
            <div>
              <h2>{t('avatar')}</h2>
              <p>{t('avatarHint')}</p>
            </div>
          </div>
          <IconPicker
            t={t}
            value={input.avatar}
            onChange={(avatar) => setInput({ ...input, avatar })}
          />
          <label>
            {t('displayName')}
            <input
              required
              maxLength={80}
              value={input.name}
              onChange={(event) => setInput({ ...input, name: event.target.value })}
            />
          </label>
          <label>
            {t('email')}
            <input type="email" disabled value={user.email} />
          </label>
        </section>
        <section className="profile-section">
          <h2>{t('preferences')}</h2>
          <div className="preference-row">
            <label htmlFor="profile-language">{t('language')}</label>
            <select
              id="profile-language"
              value={input.language}
              onChange={(event) => setInput({ ...input, language: event.target.value })}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="preference-row">
            <label htmlFor="profile-theme">{t('theme')}</label>
            <select
              id="profile-theme"
              value={input.theme}
              onChange={(event) => setInput({ ...input, theme: event.target.value })}
            >
              {['system', 'light', 'dark'].map((value) => (
                <option value={value} key={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </div>
        </section>
        <ErrorMessage error={error} t={t} />
        <button className="button primary" disabled={busy || !input.name.trim()}>
          {busy ? <span className="loader small" /> : <Check size={16} />}
          {t('save')}
        </button>
      </form>
    </div>
  );
}
