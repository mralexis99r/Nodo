import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationMailer } from '../mailer.js';

const env = {
  MAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'test-only-key',
  MAIL_FROM_EMAIL: 'nodo@example.test',
  MAIL_FROM_NAME: 'Nodo',
};
test('Brevo sends localized verification using HTTPS and keeps the key out of the payload', async () => {
  let request;
  const mailer = createVerificationMailer(env, {
    fetch: async (url, options) => {
      request = { url, ...options };
      return {
        ok: true,
        async json() {
          return { messageId: 'test-message' };
        },
      };
    },
  });
  assert.equal(mailer.isConfigured, true);
  await mailer.send({ email: 'recipient@example.test', code: '012345', language: 'es' });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.headers['api-key'], env.BREVO_API_KEY);
  assert.equal(request.redirect, 'error');
  const body = JSON.parse(request.body);
  assert.match(body.textContent, /012345/);
  assert.match(body.textContent, /10 minutos/);
  assert.equal(body.to[0].email, 'recipient@example.test');
  assert.ok(!request.body.includes(env.BREVO_API_KEY));
});
test('Brevo fails closed for missing configuration, provider errors, and invalid responses', async () => {
  assert.equal(createVerificationMailer({ MAIL_PROVIDER: 'brevo' }).isConfigured, false);
  assert.equal(
    createVerificationMailer({ ...env, MAIL_FROM_EMAIL: 'invalid' }).isConfigured,
    false,
  );
  for (const fetch of [
    async () => {
      throw new Error('Network');
    },
    async () => ({ ok: false }),
    async () => ({
      ok: true,
      async json() {
        return {};
      },
    }),
  ]) {
    await assert.rejects(
      createVerificationMailer(env, { fetch }).send({
        email: 'recipient@example.test',
        code: '123456',
        language: 'en',
      }),
      /MAIL_DELIVERY_FAILED/,
    );
  }
});
