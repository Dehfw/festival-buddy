import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { leaveGroup } from '../src/lib/db';

/**
 * Regression test for #37: two members leaving the same two-person group
 * at the same time must never leave it ownerless/memberless. Uses real
 * concurrent connections (leaveGroup opens its own pool client) so the
 * PostgreSQL row lock is actually exercised, not just the application code.
 */
export async function run(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS festivals (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, edition TEXT NOT NULL,
      data_version TEXT NOT NULL DEFAULT '', timetable JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY, festival_id TEXT NOT NULL REFERENCES festivals(id),
      name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE,
      hot_threshold INTEGER NOT NULL DEFAULT 5, image BYTEA, image_mime TEXT,
      image_version INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member', joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_id)
    );
    INSERT INTO festivals (id, name, edition, timetable)
      VALUES ('race-test-fest', 'F', 'E', '{}') ON CONFLICT DO NOTHING;
  `);

  const ROUNDS = 25;
  for (let i = 0; i < ROUNDS; i++) {
    const gid = `race-g-${Date.now()}-${i}`;
    const u1 = `race-u1-${Date.now()}-${i}`;
    const u2 = `race-u2-${Date.now()}-${i}`;
    await pool.query(
      `INSERT INTO users (id, name, color) VALUES ($1,'A','red'),($2,'B','blue')`,
      [u1, u2]
    );
    await pool.query(
      `INSERT INTO groups (id, festival_id, name, invite_code, created_by)
       VALUES ($1,'race-test-fest','G',$1,$2)`,
      [gid, u1]
    );
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'owner'),($1,$3,'member')`,
      [gid, u1, u2]
    );

    // Both members leave at the same instant via independent connections.
    await Promise.all([leaveGroup(gid, u1), leaveGroup(gid, u2)]);

    const groupRes = await pool.query('SELECT 1 FROM groups WHERE id = $1', [gid]);
    const memberRes = await pool.query<{ role: string }>(
      'SELECT role FROM group_members WHERE group_id = $1',
      [gid]
    );
    const groupExists = (groupRes.rowCount ?? 0) > 0;
    const memberCount = memberRes.rowCount ?? 0;
    const hasOwner = memberRes.rows.some((r) => r.role === 'owner');

    assert.ok(
      !groupExists || (memberCount > 0 && hasOwner),
      `round ${i}: group must not exist without a member+owner (exists=${groupExists} members=${memberCount} hasOwner=${hasOwner})`
    );
    assert.ok(
      groupExists || memberCount === 0,
      `round ${i}: deleted group must cascade-delete its member rows`
    );
  }

  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then(() => {
      console.log('leave-group-race.test.ts: OK');
      process.exit(0);
    })
    .catch((err) => {
      console.error('leave-group-race.test.ts: FAILED', err);
      process.exit(1);
    });
}
