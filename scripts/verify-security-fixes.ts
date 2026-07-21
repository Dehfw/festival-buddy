/**
 * Ad-hoc Verifikationsskript für #36 (Session-Widerruf) und #37
 * (leaveGroup-Race) gegen eine lokale Postgres-Instanz. Kein Teil der
 * regulären Suite – manuell mit `npx tsx scripts/verify-security-fixes.ts`
 * ausführen (DATABASE_URL muss gesetzt sein).
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { createSession, createUserWithCredential, leaveGroup, revokeSession, touchSession } from '../src/lib/db';
import { hashSessionId } from '../src/lib/auth';

// Eigener Pool nur für Test-Setup/-Assertions per Rohes SQL; die zu
// prüfende Logik läuft ausschließlich über die echten Exporte aus db.ts.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

async function makeUser(name: string) {
  const id = `u-${randomUUID()}`;
  const user = await createUserWithCredential(
    { id, name, color: '#fff' },
    { id: `c-${randomUUID()}`, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: [] }
  );
  if (!user) throw new Error('user creation failed (name collision?)');
  return user;
}

async function verifySessionRevocation() {
  console.log('\n--- #36: session revocation & idle timeout ---');
  const user = await makeUser(`sess-test-${randomUUID()}`);
  const sid = randomUUID();
  const hash = hashSessionId(sid);

  await createSession(hash, user.id, 180 * 24 * 60 * 60);
  const beforeLogout = await touchSession(hash, 30 * 24 * 60 * 60);
  assert(beforeLogout?.userId === user.id, 'valid session resolves to the user before logout');

  // simulate a pre-logout copy of the cookie still being replayed after logout
  await revokeSession(hash);
  const afterLogout = await touchSession(hash, 30 * 24 * 60 * 60);
  assert(afterLogout === null, 'a copied pre-logout token is rejected immediately after logout');

  // idle timeout: session untouched for longer than the idle window must be rejected
  const sid2 = randomUUID();
  const hash2 = hashSessionId(sid2);
  await createSession(hash2, user.id, 180 * 24 * 60 * 60);
  
  await pool.query("UPDATE sessions SET last_seen_at = now() - interval '31 days' WHERE id = $1", [
    hash2,
  ]);
  const idleExpired = await touchSession(hash2, 30 * 24 * 60 * 60);
  assert(idleExpired === null, 'a session idle for 31 days is rejected under a 30-day idle timeout');

  // but a session active within the idle window (e.g. 29 days since last activity) still works
  const sid3 = randomUUID();
  const hash3 = hashSessionId(sid3);
  await createSession(hash3, user.id, 180 * 24 * 60 * 60);
  await pool.query("UPDATE sessions SET last_seen_at = now() - interval '29 days' WHERE id = $1", [
    hash3,
  ]);
  const stillIdleOk = await touchSession(hash3, 30 * 24 * 60 * 60);
  assert(stillIdleOk?.userId === user.id, 'a session last seen 29 days ago is still accepted (30-day window)');
}

async function verifyLeaveGroupRace() {
  console.log('\n--- #37: concurrent leave of the last two members ---');
  
  const owner = await makeUser(`race-owner-${randomUUID()}`);
  const member = await makeUser(`race-member-${randomUUID()}`);

  const groupId = `g-${randomUUID()}`;
  await pool.query(
    `INSERT INTO groups (id, festival_id, name, invite_code, created_by)
     VALUES ($1, 'woa2026', 'race-test', $2, $3)`,
    [groupId, `INV-${randomUUID().slice(0, 8)}`, owner.id]
  );
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, owner.id]
  );
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`,
    [groupId, member.id]
  );

  // Fire both leaves concurrently: this is exactly the interleaving the
  // issue describes. Before the fix this reliably left the group with 0
  // members and no owner; with the SELECT ... FOR UPDATE lock it should
  // serialize and always end with the group deleted.
  await Promise.all([leaveGroup(groupId, owner.id), leaveGroup(groupId, member.id)]);

  const groupRow = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
  const memberRows = await pool.query('SELECT user_id, role FROM group_members WHERE group_id = $1', [
    groupId,
  ]);
  assert(groupRow.rowCount === 0, 'group is fully deleted once its last two members leave concurrently');
  assert(memberRows.rowCount === 0, 'no dangling group_members rows remain');

  // Second scenario: owner + admin + member, owner leaves -> admin must become owner,
  // and the group must never observably have zero owners.
  const owner2 = await makeUser(`race-owner2-${randomUUID()}`);
  const admin2 = await makeUser(`race-admin2-${randomUUID()}`);
  const member2 = await makeUser(`race-member2-${randomUUID()}`);
  const groupId2 = `g-${randomUUID()}`;
  await pool.query(
    `INSERT INTO groups (id, festival_id, name, invite_code, created_by)
     VALUES ($1, 'woa2026', 'race-test-2', $2, $3)`,
    [groupId2, `INV-${randomUUID().slice(0, 8)}`, owner2.id]
  );
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [groupId2, owner2.id]
  );
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')`,
    [groupId2, admin2.id]
  );
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`,
    [groupId2, member2.id]
  );
  await leaveGroup(groupId2, owner2.id);
  const roles = await pool.query<{ user_id: string; role: string }>(
    'SELECT user_id, role FROM group_members WHERE group_id = $1',
    [groupId2]
  );
  const newOwner = roles.rows.find((r) => r.role === 'owner');
  assert(newOwner?.user_id === admin2.id, 'the admin is promoted to owner when the owner leaves');

  // Repeat the concurrent-leave race N times with fresh groups to make sure
  // it isn't a one-off timing fluke.
  for (let i = 0; i < 20; i++) {
    const a = await makeUser(`race-loop-a-${i}-${randomUUID()}`);
    const b = await makeUser(`race-loop-b-${i}-${randomUUID()}`);
    const gid = `g-${randomUUID()}`;
    await pool.query(
      `INSERT INTO groups (id, festival_id, name, invite_code, created_by)
       VALUES ($1, 'woa2026', 'race-loop', $2, $3)`,
      [gid, `INV-${randomUUID().slice(0, 8)}`, a.id]
    );
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      gid,
      a.id,
    ]);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`, [
      gid,
      b.id,
    ]);
    await Promise.all([leaveGroup(gid, a.id), leaveGroup(gid, b.id)]);
    const g = await pool.query('SELECT id FROM groups WHERE id = $1', [gid]);
    assert(g.rowCount === 0, `iteration ${i}: group deleted cleanly under concurrent last-member leave`);
  }
}

async function main() {
  await verifySessionRevocation();
  await verifyLeaveGroupRace();
  console.log('\nAll checks passed.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
