import { useEffect, useRef, useState } from 'react';
import {
  Layers,
  Folder,
  Code2,
  FileText,
  Rocket,
  BookOpen,
  Coffee,
  Globe,
  Sparkles,
  Terminal,
  Heart,
  User,
  X,
  MoreHorizontal,
  ExternalLink,
  Figma,
  Triangle,
  Boxes,
} from 'lucide-react';
import { statusKeys } from './i18n';

export const iconNames = [
  'layers',
  'folder',
  'code',
  'file',
  'rocket',
  'book',
  'coffee',
  'globe',
  'sparkles',
  'terminal',
  'heart',
  'user',
];
export const colorNames = ['blue', 'green', 'orange', 'purple', 'rose', 'gray'];
const iconMap = {
  layers: Layers,
  folder: Folder,
  code: Code2,
  file: FileText,
  rocket: Rocket,
  book: BookOpen,
  coffee: Coffee,
  globe: Globe,
  sparkles: Sparkles,
  terminal: Terminal,
  heart: Heart,
  user: User,
  figma: Figma,
  jira: Triangle,
  azure: Boxes,
};
export function Icon({ name, size = 18, ...props }) {
  const Component = iconMap[name] || Folder;
  return <Component size={size} strokeWidth={1.7} {...props} />;
}
export function IconTile({ name, color = 'gray', size = '', ...props }) {
  return (
    <span className={`icon-tile tint-${color} ${size}`} {...props}>
      <Icon name={name} size={size === 'large' ? 28 : 21} />
    </span>
  );
}
export function Logo({ compact = false }) {
  return (
    <span className="logo">
      <img src="/nodo.svg" alt="" />
      {!compact && (
        <span>
          Nodo<span className="logo-dot">.</span>
        </span>
      )}
    </span>
  );
}
export function Status({ value, t }) {
  return (
    <span className={`status status-${value}`}>
      <span />
      {t(statusKeys[value] || 'todo')}
    </span>
  );
}
export function Progress({ value, color = 'blue' }) {
  return (
    <div
      className={`progress-track tint-${color}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${value}%` }} />
    </div>
  );
}
export function IconButton({ children, label, className = '', ...props }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`icon-button ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Modal({ title, children, onClose, t, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label={t('close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Menu({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className={`icon-button ${open ? 'active' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          className="dropdown"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
export function IconPicker({ value, onChange, t }) {
  return (
    <div className="icon-picker" role="group" aria-label={t('icon')}>
      {iconNames.map((name) => (
        <button
          type="button"
          className={value === name ? 'selected' : ''}
          key={name}
          aria-label={t(`icons.${name}`)}
          title={t(`icons.${name}`)}
          aria-pressed={value === name}
          onClick={() => onChange(name)}
        >
          <Icon name={name} size={20} />
        </button>
      ))}
    </div>
  );
}
export function ColorPicker({ value, onChange, t }) {
  return (
    <div className="color-picker" role="group" aria-label={t('color')}>
      {colorNames.map((name) => (
        <button
          type="button"
          key={name}
          aria-label={t(`colors.${name}`)}
          title={t(`colors.${name}`)}
          aria-pressed={value === name}
          className={`color-choice tint-${name} ${value === name ? 'selected' : ''}`}
          onClick={() => onChange(name)}
        >
          <span />
        </button>
      ))}
    </div>
  );
}
export function Empty({ icon = 'layers', title, body, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
export function ErrorMessage({ error, t }) {
  return error ? (
    <div className="error-message" role="alert">
      {t(`errors.${error}`) !== `errors.${error}` ? t(`errors.${error}`) : t('errorGeneric')}
    </div>
  ) : null;
}
export function NodeArt({ small = false }) {
  return (
    <svg
      className={`node-art ${small ? 'small' : ''}`}
      viewBox="0 0 360 220"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M70 160L166 60L276 142M166 60L194 186M70 160L276 142"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle
        cx="166"
        cy="60"
        r="25"
        fill="var(--canvas)"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle
        cx="70"
        cy="160"
        r="18"
        fill="var(--canvas)"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle
        cx="276"
        cy="142"
        r="31"
        fill="var(--canvas)"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="194" cy="186" r="10" fill="var(--accent)" />
      <rect x="157" y="51" width="18" height="18" rx="4" fill="var(--accent)" opacity=".8" />
      <path d="M265 142h22m-11-11v22" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="70" cy="160" r="4" fill="currentColor" />
    </svg>
  );
}
export function External({ url, children, ...props }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
      <ExternalLink size={13} />
    </a>
  );
}
export function Loading({ t }) {
  return (
    <div className="loading-state">
      <span className="loader" />
      <span>{t('loading')}</span>
    </div>
  );
}
export function ConfirmDelete({ t, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={t('deleteTitle')} t={t} onClose={() => !busy && onClose()}>
      <p className="modal-description">{t('deleteBody')}</p>
      <ErrorMessage error={error} t={t} />
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('deleteConfirm')}
        </button>
      </div>
    </Modal>
  );
}
