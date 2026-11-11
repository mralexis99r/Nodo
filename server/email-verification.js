import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { transaction } from './db.js';

export const verificationPolicy = {
  lifetimeMs: 10 * 60 * 1000,
  resendDelayMs: 60 * 1000,
  maxAttempts: 5,
  maxSendsPerHour: 5,
};

export function createEmailVerification({ db, mailer, secret, clock = Date.now }) {
  const digest = (userId, code) =>
    createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
  function fail(code, status = 400, details = {}) {
    throw Object.assign(new Error(code), { status, details });
  }
  function metadata(user) {
    const record = db.prepare('SELECT * FROM email_verifications WHERE user_id = ?').get(user.id);
    return {
      email: user.email,
      expiresAt:
        record?.code_hash && record.attempts < verificationPolicy.maxAttempts
          ? record.expires_at
          : null,
      resendAt: record
        ? Math.max(
            record.last_sent_at + verificationPolicy.resendDelayMs,
            record.send_count >= verificationPolicy.maxSendsPerHour &&
              record.window_started_at + 3600000 > clock()
              ? record.window_started_at + 3600000
              : 0,
          )
        : clock(),
    };
  }
  function assertConfigured() {
    if (!mailer.isConfigured || !secret || Buffer.byteLength(secret) < 32)
      fail('MAIL_NOT_CONFIGURED', 503);
  }
  async function send(user) {
    assertConfigured();
    const date = clock();
    const code = transaction(db, () => {
      const current = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(user.id);
      if (!current || current.email_verified_at) fail('EMAIL_ALREADY_VERIFIED', 400);
      const previous = db
        .prepare('SELECT * FROM email_verifications WHERE user_id = ?')
        .get(user.id);
      if (previous && date < previous.last_sent_at + verificationPolicy.resendDelayMs)
        fail('VERIFICATION_COOLDOWN', 429, { verification: metadata(user) });
      const sameWindow = previous && date < previous.window_started_at + 3600000;
      if (sameWindow && previous.send_count >= verificationPolicy.maxSendsPerHour)
        fail('VERIFICATION_SEND_LIMIT', 429, { verification: metadata(user) });
      let freshCode;
      do {
        freshCode = String(randomInt(0, 1000000)).padStart(6, '0');
      } while (previous?.code_hash === digest(user.id, freshCode));
      db.prepare(
        `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, last_sent_at, send_count, window_started_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
          attempts = 0, last_sent_at = excluded.last_sent_at, send_count = excluded.send_count,
          window_started_at = excluded.window_started_at`,
      ).run(
        user.id,
        digest(user.id, freshCode),
        date + verificationPolicy.lifetimeMs,
        date,
        sameWindow ? previous.send_count + 1 : 1,
        sameWindow ? previous.window_started_at : date,
      );
      return freshCode;
    });
    try {
      await mailer.send({ email: user.email, code, language: user.language });
    } catch {
      db.prepare(
        'UPDATE email_verifications SET code_hash = NULL, expires_at = 0 WHERE user_id = ? AND code_hash = ?',
      ).run(user.id, digest(user.id, code));
      fail('MAIL_DELIVERY_FAILED', 503, { verification: metadata(user) });
    }
    // Do not return a code or its hash to the browser.
    return metadata(user);
  }
  function verify(user, code) {
    assertConfigured();
    const result = transaction(db, () => {
      const current = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(user.id);
      if (current?.email_verified_at) return 'EMAIL_ALREADY_VERIFIED';
      const record = db.prepare('SELECT * FROM email_verifications WHERE user_id = ?').get(user.id);
      if (!record?.code_hash) return 'VERIFICATION_INVALID';
      if (record.attempts >= verificationPolicy.maxAttempts)
        return 'VERIFICATION_ATTEMPTS_EXCEEDED';
      if (clock() >= record.expires_at) {
        db.prepare('UPDATE email_verifications SET expires_at = 0 WHERE user_id = ?').run(user.id);
        return 'VERIFICATION_EXPIRED';
      }
      const valid = timingSafeEqual(
        Buffer.from(digest(user.id, code)),
        Buffer.from(record.code_hash),
      );
      if (!valid) {
        db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?').run(
          user.id,
        );
        return record.attempts + 1 >= verificationPolicy.maxAttempts
          ? 'VERIFICATION_ATTEMPTS_EXCEEDED'
          : 'VERIFICATION_INVALID';
      }
      db.prepare(
        'UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL',
      ).run(new Date(clock()).toISOString(), user.id);
      db.prepare(
        'UPDATE email_verifications SET code_hash = NULL, expires_at = 0 WHERE user_id = ?',
      ).run(user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      return null;
    });
    if (result) fail(result, 400, { verification: metadata(user) });
  }
  return { assertConfigured, send, verify, metadata };
}
