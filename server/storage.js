import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { openDatabase } from './db.js';
import { initializePostgres } from './postgres-schema.js';

// Existing application SQL uses positional question marks. Quoted literals are preserved.
export function postgresSql(sql) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === '?' ? `$${++index}` : token,
  );
}

export function postgresOptions(connectionString, { production = false } = {}) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const mode = url.searchParams.get('sslmode');
  if (['sslcert', 'sslkey', 'sslrootcert'].some((name) => url.searchParams.has(name)))
    throw new Error('UNSUPPORTED_DATABASE_TLS_OPTIONS');
  if (production && local) throw new Error('PRODUCTION_DATABASE_MUST_BE_REMOTE');
  if (!local && mode === 'disable') throw new Error('DATABASE_TLS_REQUIRED');
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: local && (!mode || mode === 'disable') ? false : { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 15000,
    application_name: 'nodo',
  };
}

export function createPostgresStorage({ connectionString, production, pool: suppliedPool } = {}) {
  const types = new pg.TypeOverrides();
  types.setTypeParser(20, (value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('UNSAFE_DATABASE_INTEGER');
    return number;
  });
  const pool =
    suppliedPool || new pg.Pool({ ...postgresOptions(connectionString, { production }), types });
  pool.on?.('error', () => console.error('PostgreSQL connection failed'));
  const context = new AsyncLocalStorage();
  const query = (sql, params = []) => (context.getStore() || pool).query(postgresSql(sql), params);
  const store = {
    dialect: 'postgres',
    prepare(sql) {
      return {
        async get(...params) {
          return (await query(sql, params)).rows[0];
        },
        async all(...params) {
          return (await query(sql, params)).rows;
        },
        async run(...params) {
          return { changes: (await query(sql, params)).rowCount };
        },
      };
    },
    async transaction(callback) {
      if (context.getStore()) return callback();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        return await context.run(client, async () => {
          try {
            const result = await callback();
            await client.query('COMMIT');
            return result;
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        });
      } finally {
        client.release();
      }
    },
    async lockUser(id) {
      await query('SELECT id FROM users WHERE id = ? FOR UPDATE', [id]);
    },
    async ping() {
      await query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
  store.ready = initializePostgres(store);
  return store;
}

export function createSQLiteStorage(raw) {
  const context = new AsyncLocalStorage();
  const marker = {};
  let tail = Promise.resolve();
  function exclusive(callback) {
    const task = tail.then(callback);
    tail = task.catch(() => {});
    return task;
  }
  const execute = (callback) =>
    context.getStore() === marker ? Promise.resolve().then(callback) : exclusive(callback);
  return {
    dialect: 'sqlite',
    ready: Promise.resolve(),
    prepare(sql) {
      return Object.fromEntries(
        ['get', 'all', 'run'].map((method) => [
          method,
          (...params) => execute(() => raw.prepare(sql)[method](...params)),
        ]),
      );
    },
    transaction(callback) {
      if (context.getStore() === marker) return callback();
      return exclusive(() =>
        context.run(marker, async () => {
          raw.exec('BEGIN IMMEDIATE');
          try {
            const result = await callback();
            raw.exec('COMMIT');
            return result;
          } catch (error) {
            raw.exec('ROLLBACK');
            throw error;
          }
        }),
      );
    },
    async lockUser() {},
    async ping() {
      await execute(() => raw.prepare('SELECT 1').get());
    },
    async close() {
      await exclusive(() => raw.close());
    },
  };
}

export function createStorage({ databaseUrl, databasePath, production = false }) {
  if (databaseUrl) {
    const store = createPostgresStorage({ connectionString: databaseUrl, production });
    return { store, debugDb: store };
  }
  if (production) throw new Error('DATABASE_URL_REQUIRED_IN_PRODUCTION');
  const raw = openDatabase(databasePath);
  return { store: createSQLiteStorage(raw), debugDb: raw };
}
