import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../app.js';
import { createTestApp, headers } from './helpers.js';
import { verificationMessage, createVerificationMailer } from '../mailer.js';

const account = {
  name: 'Verificación',
  email: 'verify@example.test',
  emailConfirmation: 'verify@example.test',
  password: 'Test-only-password-2026',
};
function setup(options = {}) {
  let time = Date.now();
  const app = createTestApp({ authLimit: 500, clock: () => time, ...options });
  const agent = request.agent(app);
  return {
    app,
    agent,
    advance(ms) {
      time += ms;
    },
    code: () => app.locals.outbox.get(account.email)?.code,
  };
}
const post = (agent, route, input = account) =>
  agent.post(`/api/auth/${route}`).set(headers).send(input);
const wrongCode = (code) => (code === '000000' ? '111111' : '000000');

test('registration requires matching email fields on the server', async () => {
  const { app, agent } = setup();
  try {
    await post(agent, 'register', { ...account, emailConfirmation: 'other@example.test' }).expect(
      400,
      { error: 'EMAIL_MISMATCH', fields: ['emailConfirmation'] },
    );
    const { emailConfirmation, ...missingConfirmation } = account;
    await post(agent, 'register', missingConfirmation).expect(400);
    assert.equal(app.locals.db.prepare('SELECT count(*) AS total FROM users').get().total, 0);
    assert.equal(app.locals.outbox.size, 0);
    await post(agent, 'register', {
      ...account,
      emailConfirmation: account.email.toUpperCase(),
    }).expect(202);
  } finally {
    app.locals.db.close();
  }
});

test('pending registration sends six digits without issuing a session or exposing the code', async () => {
  const { app, agent, code } = setup();
  try {
    const response = await post(agent, 'register').expect(202);
    assert.match(code(), /^\d{6}$/);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.body.verificationRequired, true);
    assert.equal(response.body.code, undefined);
    assert.equal(response.body.verification.code, undefined);
    assert.equal(response.body.verification.code_hash, undefined);
    assert.equal(app.locals.db.prepare('SELECT count(*) AS total FROM sessions').get().total, 0);
    const user = app.locals.db.prepare('SELECT * FROM users WHERE email = ?').get(account.email);
    assert.equal(user.email_verified_at, null);
    assert.notEqual(
      app.locals.db.prepare('SELECT code_hash FROM email_verifications').get().code_hash,
      code(),
    );
    await agent.get('/api/projects').expect(401);
    const login = await post(agent, 'login').expect(403);
    assert.equal(login.body.error, 'EMAIL_NOT_VERIFIED');
    assert.equal(login.headers['set-cookie'], undefined);
  } finally {
    app.locals.db.close();
  }
});

test('valid verification activates the account, consumes the code, and allows future login', async () => {
  const { app, agent, code } = setup();
  try {
    await post(agent, 'register').expect(202);
    const original = code();
    await post(agent, 'verify-email', { ...account, code: original }).expect(200);
    await agent.get('/api/me').expect(200);
    const record = app.locals.db.prepare('SELECT * FROM email_verifications').get();
    assert.equal(record.code_hash, null);
    assert.equal(record.expires_at, 0);
    assert.ok(app.locals.db.prepare('SELECT email_verified_at FROM users').get().email_verified_at);
    await post(agent, 'verify-email', { ...account, code: original }).expect(400);
    await post(agent, 'resend-verification').expect(400);
    await post(agent, 'logout').expect(204);
    await post(agent, 'login').expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('expired codes cannot activate an account, even at the exact expiry boundary', async () => {
  const { app, agent, code, advance } = setup();
  try {
    await post(agent, 'register').expect(202);
    const original = code();
    advance(10 * 60 * 1000);
    const response = await post(agent, 'verify-email', { ...account, code: original }).expect(400);
    assert.equal(response.body.error, 'VERIFICATION_EXPIRED');
    assert.equal(
      app.locals.db.prepare('SELECT expires_at FROM email_verifications').get().expires_at,
      0,
    );
    await post(agent, 'login').expect(403);
    await post(agent, 'resend-verification').expect(200);
    assert.notEqual(code(), original);
    await post(agent, 'verify-email', { ...account, code: code() }).expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('resending invalidates the previous code and enforces the delivery cooldown', async () => {
  const { app, agent, code, advance } = setup();
  try {
    await post(agent, 'register').expect(202);
    const original = code();
    await post(agent, 'resend-verification').expect(429);
    advance(60000);
    await post(agent, 'resend-verification').expect(200);
    assert.notEqual(code(), original);
    const rejected = await post(agent, 'verify-email', { ...account, code: original }).expect(400);
    assert.equal(rejected.body.error, 'VERIFICATION_INVALID');
    await post(agent, 'verify-email', { ...account, code: code() }).expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('five wrong attempts lock the code until a fresh code is requested', async () => {
  const { app, agent, code, advance } = setup();
  try {
    await post(agent, 'register').expect(202);
    const invalid = wrongCode(code());
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await post(agent, 'verify-email', { ...account, code: invalid }).expect(400);
      assert.equal(
        response.body.error,
        attempt === 4 ? 'VERIFICATION_ATTEMPTS_EXCEEDED' : 'VERIFICATION_INVALID',
      );
    }
    const locked = await post(agent, 'verify-email', { ...account, code: code() }).expect(400);
    assert.equal(locked.body.error, 'VERIFICATION_ATTEMPTS_EXCEEDED');
    await post(agent, 'login').expect(403);
    advance(60000);
    await post(agent, 'resend-verification').expect(200);
    await post(agent, 'verify-email', { ...account, code: code() }).expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('account delivery limits persist independently of the IP rate limiter', async () => {
  const { app, agent, advance } = setup();
  try {
    await post(agent, 'register').expect(202);
    for (let sent = 1; sent < 5; sent++) {
      advance(60000);
      await post(agent, 'resend-verification').expect(200);
    }
    advance(60000);
    const blocked = await post(agent, 'resend-verification').expect(429);
    assert.equal(blocked.body.error, 'VERIFICATION_SEND_LIMIT');
    advance(3600000);
    await post(agent, 'resend-verification').expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('verification and resend require the pending account password and CSRF header', async () => {
  const { app, agent, code } = setup();
  try {
    await post(agent, 'register').expect(202);
    for (const route of ['verify-email', 'resend-verification']) {
      await post(agent, route, {
        ...account,
        password: 'Wrong-password-2026',
        code: code(),
      }).expect(401);
      await request(app)
        .post(`/api/auth/${route}`)
        .send({ ...account, code: code() })
        .expect(403);
    }
    for (const invalid of ['12345', '1234567', '12a456', 123456])
      await post(agent, 'verify-email', { ...account, code: invalid }).expect(400);
    await post(agent, 'verify-email', { ...account, code: code() }).expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('concurrent verification requests can consume a code only once', async () => {
  const { app, agent, code } = setup();
  try {
    await post(agent, 'register').expect(202);
    const responses = await Promise.all([
      post(request(app), 'verify-email', { ...account, code: code() }),
      post(request(app), 'verify-email', { ...account, code: code() }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    assert.equal(app.locals.db.prepare('SELECT count(*) AS total FROM sessions').get().total, 1);
  } finally {
    app.locals.db.close();
  }
});

test('an injected legacy session cannot bypass verification checks', async () => {
  const { app, agent } = setup();
  try {
    await post(agent, 'register').expect(202);
    const user = app.locals.db.prepare('SELECT id FROM users').get();
    const token = 'test-only-legacy-token';
    app.locals.db
      .prepare('INSERT INTO sessions VALUES (?, ?, ?)')
      .run(createHash('sha256').update(token).digest('hex'), user.id, Date.now() + 60000);
    await request(app).get('/api/me').set('Cookie', `nodo_session=${token}`).expect(401);
  } finally {
    app.locals.db.close();
  }
});

test('missing SMTP or a strong verification secret cannot create an active account', async () => {
  for (const options of [{ mailer: { isConfigured: false } }, { verificationSecret: '' }]) {
    const { app, agent } = setup(options);
    try {
      const response = await post(agent, 'register').expect(503);
      assert.equal(response.body.error, 'MAIL_NOT_CONFIGURED');
      assert.equal(app.locals.db.prepare('SELECT count(*) AS total FROM users').get().total, 0);
    } finally {
      app.locals.db.close();
    }
  }
});

test('failed mail delivery invalidates the undelivered code and keeps the account pending', async () => {
  const mailer = {
    isConfigured: true,
    async send() {
      throw new Error('Simulated SMTP failure');
    },
  };
  const { app, agent, advance } = setup({ mailer });
  try {
    const failed = await post(agent, 'register').expect(503);
    assert.equal(failed.body.error, 'MAIL_DELIVERY_FAILED');
    assert.equal(failed.body.verification.expiresAt, null);
    assert.equal(
      app.locals.db.prepare('SELECT code_hash FROM email_verifications').get().code_hash,
      null,
    );
    await post(agent, 'login').expect(403);
    advance(60000);
    let delivered;
    mailer.send = async (message) => {
      delivered = message.code;
    };
    await post(agent, 'resend-verification').expect(200);
    await post(agent, 'verify-email', { ...account, code: delivered }).expect(200);
  } finally {
    app.locals.db.close();
  }
});

test('version 1 migration preserves projects but invalidates old sessions and requires verification', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nodo-migration-'));
  const filename = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(filename);
  const salt = 'test-legacy-salt';
  const passwordHash = `${salt}:${scryptSync(account.password, salt, 64).toString('hex')}`;
  legacy.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'user', language TEXT NOT NULL DEFAULT 'es', theme TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL, color TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO projects (id, user_id, title, icon, color, created_at, updated_at) VALUES ('legacy-project', 'legacy-user', 'Preserved', 'folder', 'blue', '2026-11-11', '2026-11-11');
    INSERT INTO sessions VALUES ('test-only-legacy-session', 'legacy-user', 9999999999999);
    PRAGMA user_version = 1;`);
  legacy
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, created_at) VALUES ('legacy-user', 'legacy@example.test', ?, 'Legacy', '2026-11-11')",
    )
    .run(passwordHash);
  legacy.close();
  let app;
  try {
    app = createTestApp({ databasePath: filename });
    const db = app.locals.db;
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal(db.prepare('SELECT email_verified_at FROM users').get().email_verified_at, null);
    assert.equal(db.prepare('SELECT count(*) AS total FROM sessions').get().total, 0);
    assert.equal(db.prepare('SELECT title FROM projects').get().title, 'Preserved');
    const agent = request.agent(app);
    const credentials = { email: 'legacy@example.test', password: account.password };
    const login = await post(agent, 'login', credentials).expect(403);
    assert.equal(login.body.error, 'EMAIL_NOT_VERIFIED');
    await post(agent, 'resend-verification', credentials).expect(200);
    await post(agent, 'verify-email', {
      ...credentials,
      code: app.locals.outbox.get(credentials.email).code,
    }).expect(200);
    assert.equal((await agent.get('/api/projects').expect(200)).body.items[0].title, 'Preserved');
    app.locals.db.close();
    app = null;
    app = createTestApp({ databasePath: filename });
    assert.equal(app.locals.db.prepare('SELECT title FROM projects').get().title, 'Preserved');
  } finally {
    app?.locals.db.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${filename}${suffix}`, { force: true });
    rmdirSync(directory);
  }
});

test('verification emails contain localized expiry and one-time-use instructions', () => {
  assert.match(verificationMessage({ code: '012345', language: 'es' }).text, /012345/);
  assert.match(verificationMessage({ code: '012345', language: 'es' }).text, /10 minutos/);
  assert.match(verificationMessage({ code: '012345', language: 'en' }).text, /only be used once/);
  assert.equal(createVerificationMailer({}).isConfigured, false);
});
