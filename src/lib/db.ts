import { Pool } from 'pg';
import blueprintSeedJson from '../../data/blueprints.seed.json';
import timetableJson from '../../data/timetable.json';
import type { Blueprint, Position, Selection, Timetable, User } from './types';

/**
 * Datenschicht: Nutzer, Band-Auswahlen, Positionen und Blueprints liegen
 * in PostgreSQL (DATABASE_URL, z. B. Neon via Vercel). Das Schema wird
 * beim ersten Zugriff automatisch angelegt und die Default-Blueprints
 * werden geseedet.
 *
 * Der Timetable selbst ist statisch (data/timetable.json, generiert aus
 * dem offiziellen W:O:A-Export) und wird ins Bundle kompiliert – kein
 * Dateisystem-Zugriff zur Laufzeit (wichtig für Vercel Serverless).
 */

const timetable = timetableJson as unknown as Timetable;
const blueprintSeed = blueprintSeedJson as unknown as Record<string, Blueprint>;

export function getTimetable(): Timetable {
  return timetable;
}

/* ------------------------------------------------------------------ */
/* Verbindung                                                          */
/* ------------------------------------------------------------------ */

// Pool global cachen, damit Hot-Reload/Lambda-Wiederverwendung keine
// Verbindungen leakt
const globalForDb = globalThis as unknown as {
  __fbPool?: Pool;
  __fbSchemaReady?: Promise<void>;
};

function getPool(): Pool {
  if (!globalForDb.__fbPool) {
    // Vercel-Integrationen nennen die Variable je nach Version anders
    const connectionString =
      process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL ist nicht gesetzt. Beispiel: postgres://festival:festival@localhost:5432/festival (bei Neon/Vercel: ?sslmode=require anhängen)'
      );
    }
    globalForDb.__fbPool = new Pool({
      connectionString,
      max: 5,
      // Für gehostete DBs ohne verifizierbares Zertifikat: DATABASE_SSL=no-verify
      ssl:
        process.env.DATABASE_SSL === 'no-verify'
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  return globalForDb.__fbPool;
}

async function createSchema(): Promise<void> {
  // Advisory-Lock: parallele Cold-Starts (Serverless!) sollen das Schema
  // nicht gleichzeitig anlegen. Lock ist session-gebunden -> ein Client.
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(724226)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS selections (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_id TEXT NOT NULL,
        PRIMARY KEY (user_id, slot_id)
      );
      CREATE TABLE IF NOT EXISTS positions (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_id TEXT NOT NULL,
        x       REAL NOT NULL,
        y       REAL NOT NULL,
        PRIMARY KEY (user_id, slot_id)
      );
      CREATE TABLE IF NOT EXISTS blueprints (
        stage_id TEXT PRIMARY KEY,
        data     JSONB NOT NULL
      );
      CREATE SEQUENCE IF NOT EXISTS db_rev START 1;
    `);

    // Default-Blueprints für Bühnen seeden, die noch keinen haben
    for (const [stageId, bp] of Object.entries(blueprintSeed)) {
      await client.query(
        'INSERT INTO blueprints (stage_id, data) VALUES ($1, $2) ON CONFLICT (stage_id) DO NOTHING',
        [stageId, JSON.stringify(bp)]
      );
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(724226)').catch(() => {});
    client.release();
  }
}

/** Schema einmal pro Prozess sicherstellen (parallel-safe) */
function ensureSchema(): Promise<void> {
  if (!globalForDb.__fbSchemaReady) {
    globalForDb.__fbSchemaReady = createSchema().catch((err) => {
      globalForDb.__fbSchemaReady = undefined;
      throw err;
    });
  }
  return globalForDb.__fbSchemaReady;
}

async function query<R extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  await ensureSchema();
  return getPool().query<R>(text, params as never[]);
}

/** Revisions-Zähler: erhöht sich bei jeder Mutation (billiges Client-Polling) */
async function bumpRev(): Promise<number> {
  const res = await query<{ rev: string }>("SELECT nextval('db_rev') AS rev");
  return Number(res.rows[0].rev);
}

/* ------------------------------------------------------------------ */
/* Lesen                                                               */
/* ------------------------------------------------------------------ */

export interface DbState {
  users: User[];
  selections: Selection[];
  positions: Position[];
  blueprints: Record<string, Blueprint>;
  rev: number;
}

export async function getState(): Promise<DbState> {
  await ensureSchema();
  const pool = getPool();
  const [users, selections, positions, blueprints, rev] = await Promise.all([
    pool.query('SELECT id, name, color, created_at FROM users ORDER BY created_at'),
    pool.query('SELECT user_id, slot_id FROM selections'),
    pool.query('SELECT user_id, slot_id, x, y FROM positions'),
    pool.query('SELECT stage_id, data FROM blueprints'),
    pool.query("SELECT last_value FROM db_rev"),
  ]);

  return {
    users: users.rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    selections: selections.rows.map((r) => ({
      userId: r.user_id,
      slotId: r.slot_id,
    })),
    positions: positions.rows.map((r) => ({
      userId: r.user_id,
      slotId: r.slot_id,
      x: Number(r.x),
      y: Number(r.y),
    })),
    blueprints: Object.fromEntries(
      blueprints.rows.map((r) => [r.stage_id, r.data as Blueprint])
    ),
    rev: Number(rev.rows[0].last_value),
  };
}

/* ------------------------------------------------------------------ */
/* Schreiben                                                           */
/* ------------------------------------------------------------------ */

/** Nutzer anlegen; existiert die ID schon, kommt der bestehende zurück. */
export async function upsertUser(user: {
  id: string;
  name: string;
  color: string;
}): Promise<User> {
  await query(
    'INSERT INTO users (id, name, color) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [user.id, user.name, user.color]
  );
  const res = await query<{
    id: string;
    name: string;
    color: string;
    created_at: Date;
  }>('SELECT id, name, color, created_at FROM users WHERE id = $1', [user.id]);
  const r = res.rows[0];
  await bumpRev();
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/**
 * Band-Teilnahme setzen/entfernen.
 * Rückgabe false, wenn der Nutzer nicht existiert (FK-Verletzung).
 */
export async function setSelection(
  userId: string,
  slotId: string,
  attending: boolean
): Promise<boolean> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (attending) {
      await client.query(
        'INSERT INTO selections (user_id, slot_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, slotId]
      );
    } else {
      await client.query(
        'DELETE FROM selections WHERE user_id = $1 AND slot_id = $2',
        [userId, slotId]
      );
      // Wer sich austrägt, verliert auch seine Positionsmarkierung
      await client.query(
        'DELETE FROM positions WHERE user_id = $1 AND slot_id = $2',
        [userId, slotId]
      );
    }
    await client.query('COMMIT');
    await bumpRev();
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23503') return false; // unbekannter Nutzer
    throw err;
  } finally {
    client.release();
  }
}

export type PositionResult = 'ok' | 'not-attending';

/** Position setzen (nur wenn bei der Band eingetragen) oder entfernen. */
export async function setPosition(
  userId: string,
  slotId: string,
  x: number | null,
  y: number | null
): Promise<PositionResult> {
  if (x === null || y === null) {
    await query('DELETE FROM positions WHERE user_id = $1 AND slot_id = $2', [
      userId,
      slotId,
    ]);
    await bumpRev();
    return 'ok';
  }
  const res = await query(
    `INSERT INTO positions (user_id, slot_id, x, y)
     SELECT $1, $2, $3, $4
     WHERE EXISTS (SELECT 1 FROM selections WHERE user_id = $1 AND slot_id = $2)
     ON CONFLICT (user_id, slot_id) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y`,
    [userId, slotId, x, y]
  );
  if (res.rowCount === 0) return 'not-attending';
  await bumpRev();
  return 'ok';
}

/** Blueprint einer Bühne komplett ersetzen (Admin). */
export async function saveBlueprint(
  stageId: string,
  blueprint: Blueprint
): Promise<number> {
  await query(
    `INSERT INTO blueprints (stage_id, data) VALUES ($1, $2)
     ON CONFLICT (stage_id) DO UPDATE SET data = EXCLUDED.data`,
    [stageId, JSON.stringify(blueprint)]
  );
  return bumpRev();
}
