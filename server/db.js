import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { summarizeQA, workUnits } from '../shared/qa.js';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'user',
      language TEXT NOT NULL DEFAULT 'es', theme TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL, color TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL, icon TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'todo',
      blocks TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_owner ON projects(user_id, deleted_at);
    CREATE INDEX IF NOT EXISTS pages_project ON pages(project_id, deleted_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 2) {
    transaction(db, () => {
      db.exec(`
        ALTER TABLE users ADD COLUMN email_verified_at TEXT;
        CREATE TABLE email_verifications (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT, expires_at INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0, last_sent_at INTEGER NOT NULL DEFAULT 0,
          send_count INTEGER NOT NULL DEFAULT 0, window_started_at INTEGER NOT NULL DEFAULT 0
        );
        DELETE FROM sessions;
        PRAGMA user_version = 2;
      `);
    });
  }
  return db;
}

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

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
