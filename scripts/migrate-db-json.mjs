/**
 * Einmalige Migration: überträgt eine alte Datei-Datenbank (data/db.json)
 * nach PostgreSQL. Vorher DATABASE_URL setzen.
 *
 *   DATABASE_URL=postgres://... node scripts/migrate-db-json.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const DB_JSON = path.join(process.cwd(), 'data', 'db.json');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('DATABASE_URL ist nicht gesetzt.');
  process.exit(1);
}

const old = JSON.parse(await readFile(DB_JSON, 'utf8'));
const pool = new pg.Pool({
  connectionString,
  ssl:
    process.env.DATABASE_SSL === 'no-verify'
      ? { rejectUnauthorized: false }
      : undefined,
});

// Schema anlegen, falls die App noch nie lief
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS selections (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id TEXT NOT NULL, PRIMARY KEY (user_id, slot_id)
  );
  CREATE TABLE IF NOT EXISTS positions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL,
    PRIMARY KEY (user_id, slot_id)
  );
  CREATE TABLE IF NOT EXISTS blueprints (
    stage_id TEXT PRIMARY KEY, data JSONB NOT NULL
  );
  CREATE SEQUENCE IF NOT EXISTS db_rev START 1;
`);

let n = 0;
for (const u of old.users ?? []) {
  await pool.query(
    `INSERT INTO users (id, name, color, created_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO NOTHING`,
    [u.id, u.name, u.color, u.createdAt ?? new Date().toISOString()]
  );
  n++;
}
console.log(`✓ ${n} Nutzer`);

n = 0;
for (const s of old.selections ?? []) {
  const res = await pool.query(
    `INSERT INTO selections (user_id, slot_id)
     SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)
     ON CONFLICT DO NOTHING`,
    [s.userId, s.slotId]
  );
  n += res.rowCount;
}
console.log(`✓ ${n} Band-Auswahlen`);

n = 0;
for (const p of old.positions ?? []) {
  const res = await pool.query(
    `INSERT INTO positions (user_id, slot_id, x, y)
     SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)
     ON CONFLICT (user_id, slot_id) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y`,
    [p.userId, p.slotId, p.x, p.y]
  );
  n += res.rowCount;
}
console.log(`✓ ${n} Positionen`);

n = 0;
for (const [stageId, bp] of Object.entries(old.blueprints ?? {})) {
  await pool.query(
    `INSERT INTO blueprints (stage_id, data) VALUES ($1, $2)
     ON CONFLICT (stage_id) DO UPDATE SET data = EXCLUDED.data`,
    [stageId, JSON.stringify(bp)]
  );
  n++;
}
console.log(`✓ ${n} Blueprints`);

await pool.query("SELECT nextval('db_rev')");
await pool.end();
console.log('Migration fertig.');
