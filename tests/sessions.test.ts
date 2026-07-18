import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createSession, listActiveSessions, revokeSession, touchSession } from '../src/lib/db';

/**
 * Regression tests for #36 (session token revocation): a token copied
 * before logout must stop working immediately, and an idle session must
 * expire even while still within its absolute lifetime.
 */
export async function run(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
  const userId = `sess-test-${Date.now()}`;
  await pool.query(
    `INSERT INTO users (id, name, color) VALUES ($1, 'Test', 'red') ON CONFLICT DO NOTHING`,
    [userId]
  );

  const sid = await createSession(userId, 3600);
  assert.equal(await touchSession(sid, userId, 3600), true, 'fresh session should be active');
  assert.equal((await listActiveSessions(userId)).length, 1, 'exactly one active session expected');

  assert.equal(await revokeSession(sid, userId), true, 'revoke should succeed once');
  assert.equal(
    await touchSession(sid, userId, 3600),
    false,
    'a token copied before logout must be rejected after logout (replay)'
  );

  const idleSid = await createSession(userId, 3600);
  await pool.query(
    `UPDATE sessions SET last_seen_at = now() - interval '10 minutes' WHERE id = $1`,
    [idleSid]
  );
  assert.equal(
    await touchSession(idleSid, userId, 60),
    false,
    'a session idle past the inactivity timeout must be rejected even before absolute expiry'
  );

  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then(() => {
      console.log('sessions.test.ts: OK');
      process.exit(0);
    })
    .catch((err) => {
      console.error('sessions.test.ts: FAILED', err);
      process.exit(1);
    });
}
