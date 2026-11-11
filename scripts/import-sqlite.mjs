import { existsSync } from 'node:fs';
import { createPostgresStorage } from '../server/storage.js';
import { importSQLite, readSQLite } from '../server/import-sqlite.js';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const filename = process.argv[2] || process.env.DATABASE_PATH || './data/nodo.sqlite';
if (!existsSync(filename)) throw new Error('SQLITE_SOURCE_NOT_FOUND');
const source = readSQLite(filename);
const target = createPostgresStorage({ connectionString: process.env.DATABASE_URL });
try {
  const counts = await importSQLite(source, target);
  console.log(
    `Imported ${counts.users} users, ${counts.projects} projects, ${counts.pages} pages.`,
  );
} finally {
  source.close();
  await target.close();
}
