import { useState } from 'react';
import { api } from './api';
import { ErrorMessage, Modal } from './ui';
import { importProjectSchema } from '../server/schema';
import { summarizeQA } from '../shared/qa';

export default function ImportProject({ t, onClose, onImported }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inTrash, setInTrash] = useState(false);
  async function selectFile(event) {
    setError('');
    setData(null);
    setInTrash(false);
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1000000) {
      setError('CONTENT_TOO_LARGE');
      return;
    }
    try {
      setData(importProjectSchema.parse(JSON.parse(await file.text())));
    } catch {
      setError('INVALID_IMPORT');
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const result = await api('/projects/import', { method: 'POST', body: data });
      if (result.inTrash) setInTrash(true);
      else await onImported(result.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const summary = data && summarizeQA(data.pages);
  return (
    <Modal title={t('importProject')} t={t} onClose={busy ? () => {} : onClose}>
      <div className="qa-import">
        <p>{t('importHelp')}</p>
        <label>
          <span>{t('importFile')}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={selectFile}
          />
        </label>
        <ErrorMessage error={error} t={t} />
        {inTrash && <p role="alert">{t('importInTrash')}</p>}
        {data && (
          <>
            <h3>{data.project.title}</h3>
            <p>
              {data.pages.length} {t('features')}
              {summary
                ? ` · ${summary.total} ${t('qaCases')} · ${summary.bugs} ${t('qaBugs')}`
                : ''}
            </p>
            <ul className="qa-import-pages">
              {data.pages.map((page, index) => (
                <li key={index}>
                  {page.title}
                  <span>
                    {page.blocks
                      .filter((b) => b.type === 'qa')
                      .map(
                        (b) =>
                          `${b.rows.length} ${t(b.kind === 'cases' ? 'qaCases' : b.kind === 'bugs' ? 'qaBugs' : 'qaReferences')}`,
                      )
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            {data.warnings.length > 0 && (
              <details open>
                <summary>{t('importWarnings')}</summary>
                <ul>
                  {data.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            <p>{t('importPrivacy')}</p>
          </>
        )}
        <div className="modal-actions">
          <button className="button secondary" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="button primary" disabled={!data || busy || inTrash} onClick={submit}>
            {t(busy ? 'saving' : 'importConfirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
