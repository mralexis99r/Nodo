import { DatabaseSync } from 'node:sqlite';

// Import application content only. Sessions and pending codes never leave the source database.
export async function importSQLite(source, destination) {
  const version = source.prepare('PRAGMA user_version').get().user_version;
  if (version > 2) throw new Error('UNSUPPORTED_SQLITE_VERSION');
  let users, projects, pages;
  source.exec('BEGIN');
  try {
    users = source.prepare('SELECT * FROM users ORDER BY created_at').all();
    projects = source.prepare('SELECT * FROM projects ORDER BY created_at').all();
    pages = source.prepare('SELECT * FROM pages ORDER BY position, created_at').all();
  } finally {
    source.exec('ROLLBACK');
  }
  await destination.ready;
  return destination.transaction(async () => {
    await destination.prepare('SELECT pg_advisory_xact_lock(77501342)').get();
    const existing = await destination.prepare('SELECT COUNT(*) AS count FROM users').get();
    if (Number(existing.count)) throw new Error('IMPORT_REQUIRES_EMPTY_DATABASE');
    for (const user of users)
      await destination
        .prepare(
          `INSERT INTO users
      (id, email, password_hash, name, avatar, language, theme, created_at, email_verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          user.email,
          user.password_hash,
          user.name,
          user.avatar,
          user.language,
          user.theme,
          user.created_at,
          user.email_verified_at || null,
        );
    for (const project of projects)
      await destination
        .prepare(
          `INSERT INTO projects
      (id, user_id, title, description, icon, color, favorite, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          project.id,
          project.user_id,
          project.title,
          project.description,
          project.icon,
          project.color,
          project.favorite,
          project.deleted_at,
          project.created_at,
          project.updated_at,
        );
    for (const page of pages)
      await destination
        .prepare(
          `INSERT INTO pages
      (id, project_id, title, icon, status, blocks, position, version, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          page.id,
          page.project_id,
          page.title,
          page.icon,
          page.status,
          page.blocks,
          page.position,
          page.version,
          page.deleted_at,
          page.created_at,
          page.updated_at,
        );
    return { users: users.length, projects: projects.length, pages: pages.length };
  });
}

export function readSQLite(filename) {
  return new DatabaseSync(filename, { readOnly: true });
}
