import { Pool } from 'pg';
import blueprintSeedJson from '../../data/blueprints.seed.json';
import timetableJson from '../../data/timetable.json';
import type {
  Blueprint,
  Position,
  Selection,
  SelectionStatus,
  Timetable,
  User,
} from './types';

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

/**
 * `sslmode` aus der URL nehmen und explizit in eine pg-SSL-Config übersetzen.
 * pg v8 warnt sonst bei sslmode=require (Neon-Standard), weil sich die
 * Semantik in pg v9 ändern wird – wir legen das Verhalten hier selbst fest:
 * require/verify-* => TLS mit Zertifikatsprüfung, no-verify => TLS ohne
 * Prüfung, disable => kein TLS.
 */
function normalizeConnection(raw: string): {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean } | undefined;
} {
  let ssl: false | { rejectUnauthorized: boolean } | undefined;
  let connectionString = raw;
  try {
    const url = new URL(raw);
    const mode = url.searchParams.get('sslmode');
    if (mode) {
      url.searchParams.delete('sslmode');
      connectionString = url.toString();
      if (mode === 'disable') ssl = false;
      else if (mode === 'no-verify') ssl = { rejectUnauthorized: false };
      else ssl = { rejectUnauthorized: true };
    }
  } catch {
    // URL nicht parsebar (z. B. Socket-Pfad) – unverändert durchreichen
  }
  // Für gehostete DBs ohne verifizierbares Zertifikat: DATABASE_SSL=no-verify
  if (process.env.DATABASE_SSL === 'no-verify') {
    ssl = { rejectUnauthorized: false };
  }
  return { connectionString, ssl };
}

function getPool(): Pool {
  if (!globalForDb.__fbPool) {
    // Vercel-Integrationen nennen die Variable je nach Version anders
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!raw) {
      throw new Error(
        'DATABASE_URL ist nicht gesetzt. Beispiel: postgres://festival:festival@localhost:5432/festival (bei Neon/Vercel: ?sslmode=require anhängen)'
      );
    }
    const { connectionString, ssl } = normalizeConnection(raw);
    globalForDb.__fbPool = new Pool({ connectionString, max: 5, ssl });
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
        status  TEXT NOT NULL DEFAULT 'going',
        PRIMARY KEY (user_id, slot_id)
      );
      -- Migration für Bestandsdatenbanken: "interessiert" als weicherer Status
      ALTER TABLE selections ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'going';
      CREATE TABLE IF NOT EXISTS positions (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_id    TEXT NOT NULL,
        x          REAL NOT NULL,
        y          REAL NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, slot_id)
      );
      -- Migration für Bestandsdatenbanken (idempotent)
      ALTER TABLE positions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      -- Passkeys: ein Nutzer wird über seine WebAuthn-Credentials
      -- identifiziert, der Name ist nur noch Anzeigename.
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        public_key BYTEA NOT NULL,
        counter    BIGINT NOT NULL DEFAULT 0,
        transports TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials (user_id);
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
    pool.query('SELECT user_id, slot_id, status FROM selections'),
    pool.query('SELECT user_id, slot_id, x, y, updated_at FROM positions'),
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
      status: r.status === 'interested' ? 'interested' : 'going',
    })),
    positions: positions.rows.map((r) => ({
      userId: r.user_id,
      slotId: r.slot_id,
      x: Number(r.x),
      y: Number(r.y),
      updatedAt: new Date(r.updated_at).toISOString(),
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

interface UserRow {
  id: string;
  name: string;
  color: string;
  created_at: Date;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export interface StoredCredential {
  id: string; // Credential-ID, base64url
  userId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
}

export async function getUserById(id: string): Promise<User | null> {
  const res = await query<UserRow>(
    'SELECT id, name, color, created_at FROM users WHERE id = $1',
    [id]
  );
  return res.rows[0] ? toUser(res.rows[0]) : null;
}

/**
 * Bestandsnutzer ohne Passkey mit diesem Namen (case-insensitiv) – darf
 * bei der Registrierung übernommen werden, damit Alt-Accounts aus der
 * Nur-Name-Ära ihre Auswahlen behalten. Sobald ein Passkey dran hängt,
 * ist der Name belegt.
 */
export async function findAdoptableUser(name: string): Promise<User | null> {
  const res = await query<UserRow>(
    `SELECT u.id, u.name, u.color, u.created_at FROM users u
      WHERE lower(u.name) = lower($1)
        AND NOT EXISTS (SELECT 1 FROM webauthn_credentials c WHERE c.user_id = u.id)
      ORDER BY u.created_at LIMIT 1`,
    [name]
  );
  return res.rows[0] ? toUser(res.rows[0]) : null;
}

/** Ist der Name schon von einem Nutzer mit Passkey belegt? */
export async function isNameTaken(name: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM users u
      WHERE lower(u.name) = lower($1)
        AND EXISTS (SELECT 1 FROM webauthn_credentials c WHERE c.user_id = u.id)
      LIMIT 1`,
    [name]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Registrierung abschließen: Nutzer anlegen (oder namensgleichen
 * Alt-Account ohne Passkey übernehmen) und das Credential daran binden.
 * Gibt null zurück, wenn die ID inzwischen anderweitig belegt ist –
 * das schützt vor manipulierten Challenge-Cookies.
 */
export async function createUserWithCredential(
  user: { id: string; name: string; color: string },
  credential: { id: string; publicKey: Uint8Array; counter: number; transports: string[] }
): Promise<User | null> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      'INSERT INTO users (id, name, color) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [user.id, user.name, user.color]
    );
    if (inserted.rowCount === 0) {
      // ID existiert schon: nur als Legacy-Übernahme okay (gleicher Name,
      // noch kein Passkey) – sonst abbrechen.
      const adoptable = await client.query(
        `SELECT 1 FROM users u
          WHERE u.id = $1 AND lower(u.name) = lower($2)
            AND NOT EXISTS (SELECT 1 FROM webauthn_credentials c WHERE c.user_id = u.id)`,
        [user.id, user.name]
      );
      if ((adoptable.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return null;
      }
    }
    await client.query(
      `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        credential.id,
        user.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        JSON.stringify(credential.transports),
      ]
    );
    const res = await client.query<UserRow>(
      'SELECT id, name, color, created_at FROM users WHERE id = $1',
      [user.id]
    );
    await client.query('COMMIT');
    await bumpRev();
    return toUser(res.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Credential samt zugehörigem Nutzer für den Login nachschlagen */
export async function getCredentialWithUser(
  credentialId: string
): Promise<{ credential: StoredCredential; user: User } | null> {
  const res = await query<
    UserRow & { cred_id: string; public_key: Buffer; counter: string; transports: string }
  >(
    `SELECT c.id AS cred_id, c.public_key, c.counter, c.transports,
            u.id, u.name, u.color, u.created_at
       FROM webauthn_credentials c JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [credentialId]
  );
  const r = res.rows[0];
  if (!r) return null;
  let transports: string[] = [];
  try {
    const parsed = JSON.parse(r.transports);
    if (Array.isArray(parsed)) transports = parsed;
  } catch {
    // kaputte/alte Zeile – ohne Transports weitermachen
  }
  return {
    credential: {
      id: r.cred_id,
      userId: r.id,
      publicKey: new Uint8Array(r.public_key),
      counter: Number(r.counter),
      transports,
    },
    user: toUser(r),
  };
}

/** Signatur-Zähler nach erfolgreichem Login fortschreiben (Replay-Schutz) */
export async function updateCredentialCounter(
  credentialId: string,
  counter: number
): Promise<void> {
  await query('UPDATE webauthn_credentials SET counter = $2 WHERE id = $1', [
    credentialId,
    counter,
  ]);
}

/**
 * Band-Teilnahme setzen ('going'/'interested') oder entfernen (null).
 * Rückgabe false, wenn der Nutzer nicht existiert (FK-Verletzung).
 */
export async function setSelection(
  userId: string,
  slotId: string,
  status: SelectionStatus | null
): Promise<boolean> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (status) {
      await client.query(
        `INSERT INTO selections (user_id, slot_id, status) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, slot_id) DO UPDATE SET status = EXCLUDED.status`,
        [userId, slotId, status]
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
     ON CONFLICT (user_id, slot_id)
     DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, updated_at = now()`,
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
