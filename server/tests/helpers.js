import { createApp } from '../app.js';
import { openDatabase } from '../db.js';
import { createSQLiteStorage } from '../storage.js';

export const headers = { 'X-Nodo-Client': 'web' };
export function createTestApp(options = {}) {
  const outbox = new Map();
  const raw = options.storage ? null : openDatabase(options.databasePath || ':memory:');
  const app = createApp({
    databasePath: ':memory:',
    storage: options.storage || { store: createSQLiteStorage(raw), debugDb: raw },
    verificationSecret: 'test-only-secret-not-for-production-0123456789',
    mailer: {
      isConfigured: true,
      async send(message) {
        outbox.set(message.email, message);
      },
    },
    ...options,
  });
  app.locals.outbox = outbox;
  return app;
}
export async function registerVerified(app, agent, input) {
  await agent
    .post('/api/auth/register')
    .set(headers)
    .send({ emailConfirmation: input.email, ...input })
    .expect(202);
  const code = app.locals.outbox.get(input.email.toLowerCase()).code;
  return agent
    .post('/api/auth/verify-email')
    .set(headers)
    .send({ email: input.email, password: input.password, code })
    .expect(200);
}
