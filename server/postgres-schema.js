export async function initializePostgres(db) {
  await db.transaction(async () => {
    // All instances use the same transaction-scoped lock while applying migrations.
    await db.prepare('SELECT pg_advisory_xact_lock(77501342)').get();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
      )
      .run();
    const current = await db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get();
    if (current.version > 1) throw new Error('UNSUPPORTED_DATABASE_VERSION');
    if (current.version < 1) {
      const statements = [
        `CREATE TABLE users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL,
          avatar TEXT NOT NULL DEFAULT 'user', language TEXT NOT NULL DEFAULT 'es', theme TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL, email_verified_at TEXT
        )`,
        `CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL
        )`,
        `CREATE TABLE projects (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL, color TEXT NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)), deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE pages (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL, icon TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'todo', blocks TEXT NOT NULL DEFAULT '[]',
          position INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE email_verifications (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT, expires_at BIGINT NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0, last_sent_at BIGINT NOT NULL DEFAULT 0, send_count INTEGER NOT NULL DEFAULT 0,
          window_started_at BIGINT NOT NULL DEFAULT 0
        )`,
        'CREATE INDEX projects_owner ON projects(user_id, deleted_at)',
        'CREATE INDEX pages_project ON pages(project_id, deleted_at)',
        'CREATE INDEX sessions_expiry ON sessions(expires_at)',
      ];
      for (const sql of statements) await db.prepare(sql).run();
      await db
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)')
        .run(new Date().toISOString());
    }
  });
}
