import { randomBytes, randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import blueprintSeedJson from '../../data/blueprints.seed.json';
import timetableJson from '../../data/timetable.json';
import type {
  Blueprint,
  FestivalSummary,
  GroupInfo,
  GroupRole,
  GroupSummary,
  Position,
  Selection,
  SelectionStatus,
  Timetable,
  User,
} from './types';

/**
 * Datenschicht: Festivals (inkl. Timetable), Gruppen, Nutzer, Band-
 * Auswahlen, Positionen und Blueprints liegen in PostgreSQL
 * (DATABASE_URL, z. B. Neon via Vercel). Das Schema wird beim ersten
 * Zugriff automatisch angelegt bzw. migriert und die Defaults werden
 * geseedet (Wacken-Timetable aus data/timetable.json, Blueprints,
 * DEFEKT-Gruppe für Bestandsnutzer).
 *
 * Mandanten-Modell: Eine Gruppe gehört zu genau einem Festival. Nutzer
 * können in mehreren Gruppen sein. Auswahlen/Positionen hängen am Nutzer
 * und am Festival (Slot-IDs sind nur pro Festival eindeutig) – sichtbar
 * sind sie für alle Gruppen dieses Festivals, in denen der Nutzer ist.
 */

const wackenTimetable = timetableJson as unknown as Timetable;
const blueprintSeed = blueprintSeedJson as unknown as Record<string, Blueprint>;

/** Festival-ID der Bestandsdaten (Nur-Wacken-Ära) */
const LEGACY_FESTIVAL_ID = 'woa2026';

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

/* ------------------------------------------------------------------ */
/* Schema & Migration                                                  */
/* ------------------------------------------------------------------ */

/** Existiert die Kern-Tabelle schon? (billiger Steady-State-Check) */
async function schemaAlreadyExists(client: PoolClient): Promise<boolean> {
  const res = await client.query<{ t: string | null }>(
    "SELECT to_regclass('public.festivals') AS t"
  );
  return res.rows[0]?.t != null;
}

async function createSchema(): Promise<void> {
  // Advisory-Lock: parallele Cold-Starts (Serverless!) sollen das Schema
  // nicht gleichzeitig anlegen. Lock ist session-gebunden -> ein Client.
  const client = await getPool().connect();
  let locked = false;
  try {
    // Steady-State: existiert das Schema bereits, ist der Lock überflüssig.
    // So blockiert kein warmer Cold-Start auf einem Lock, den eine
    // eingefrorene Serverless-Verbindung evtl. noch hält.
    if (await schemaAlreadyExists(client)) return;

    // Lock-Wait hart begrenzen: ein geleakter Advisory-Lock (suspendierte
    // Lambda-Verbindung) darf nicht jede Anfrage unendlich hängen lassen.
    // Ohne Timeout wartet pg_advisory_lock() für immer -> /api/festivals & Co
    // laden nie. lock_timeout gilt auch für Advisory-Locks.
    await client.query("SET lock_timeout = '5s'");
    try {
      await client.query('SELECT pg_advisory_lock(724226)');
      locked = true;
    } catch {
      // Lock nicht rechtzeitig bekommen: ein anderer Worker legt das Schema
      // gerade an (oder hält einen abgestandenen Lock). Ist es inzwischen da,
      // sind wir fertig; sonst unten idempotent weiterbauen (verträgt Races).
      if (await schemaAlreadyExists(client)) return;
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Festivals: Timetable (days/stages/slots) als JSONB-Block – die App
      -- behandelt ihn als Ganzes, Import ersetzt immer den kompletten Stand.
      CREATE TABLE IF NOT EXISTS festivals (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        edition      TEXT NOT NULL,
        data_version TEXT NOT NULL DEFAULT '',
        timetable    JSONB NOT NULL,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Gruppen: ein mehrfach nutzbarer Einladungscode pro Gruppe (Link
      -- /join/<code> oder manuell eingetippt), rotierbar durch Admins.
      CREATE TABLE IF NOT EXISTS groups (
        id            TEXT PRIMARY KEY,
        festival_id   TEXT NOT NULL REFERENCES festivals(id),
        name          TEXT NOT NULL,
        invite_code   TEXT NOT NULL UNIQUE,
        hot_threshold INTEGER NOT NULL DEFAULT 5,
        image         BYTEA,
        image_mime    TEXT,
        image_version INTEGER NOT NULL DEFAULT 0,
        created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS group_members (
        group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id   TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
        role      TEXT NOT NULL DEFAULT 'member',
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id);
      CREATE TABLE IF NOT EXISTS selections (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}',
        slot_id     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'going',
        PRIMARY KEY (user_id, festival_id, slot_id)
      );
      -- Migrationen für Bestandsdatenbanken (idempotent)
      ALTER TABLE selections ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'going';
      ALTER TABLE selections ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}';
      CREATE TABLE IF NOT EXISTS positions (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}',
        slot_id     TEXT NOT NULL,
        x           REAL NOT NULL,
        y           REAL NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, festival_id, slot_id)
      );
      ALTER TABLE positions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      ALTER TABLE positions ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}';
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
      -- Serverseitige Sitzungen: das Session-Cookie trägt nur noch einen
      -- opaken Identifier, dessen Hash hier steht. Das erlaubt echten
      -- Widerruf bei Logout und ein serverseitig erzwungenes
      -- Inaktivitäts-Timeout (#36) statt eines rein selbstenthaltenen,
      -- bis zum Ablauf nicht widerrufbaren Tokens.
      CREATE TABLE IF NOT EXISTS sessions (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at   TIMESTAMPTZ NOT NULL,
        revoked_at   TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
      CREATE TABLE IF NOT EXISTS blueprints (
        festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}',
        stage_id    TEXT NOT NULL,
        data        JSONB NOT NULL,
        PRIMARY KEY (festival_id, stage_id)
      );
      ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}';
      CREATE SEQUENCE IF NOT EXISTS db_rev START 1;

      -- Primärschlüssel der Bestandstabellen um festival_id erweitern
      -- (Slot-IDs "tag-buehne-band" sind nur pro Festival eindeutig).
      DO $mig$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'selections_pkey'
             AND pg_get_constraintdef(oid) NOT LIKE '%festival_id%'
        ) THEN
          ALTER TABLE selections DROP CONSTRAINT selections_pkey;
          ALTER TABLE selections ADD CONSTRAINT selections_pkey
            PRIMARY KEY (user_id, festival_id, slot_id);
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'positions_pkey'
             AND pg_get_constraintdef(oid) NOT LIKE '%festival_id%'
        ) THEN
          ALTER TABLE positions DROP CONSTRAINT positions_pkey;
          ALTER TABLE positions ADD CONSTRAINT positions_pkey
            PRIMARY KEY (user_id, festival_id, slot_id);
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'blueprints_pkey'
             AND pg_get_constraintdef(oid) NOT LIKE '%festival_id%'
        ) THEN
          ALTER TABLE blueprints DROP CONSTRAINT blueprints_pkey;
          ALTER TABLE blueprints ADD CONSTRAINT blueprints_pkey
            PRIMARY KEY (festival_id, stage_id);
        END IF;
      END
      $mig$;
    `);

    // Festivals seeden: Wacken aus dem gebundelten Timetable-JSON, Summer
    // Breeze als Gerüst (Lineup kommt später per scripts/import-festival.mjs).
    // Nur einfügen, wenn die Zeile fehlt – danach ist die DB die Wahrheit.
    await client.query(
      `INSERT INTO festivals (id, name, edition, data_version, timetable)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        LEGACY_FESTIVAL_ID,
        wackenTimetable.festival,
        wackenTimetable.edition,
        wackenTimetable.dataVersion,
        JSON.stringify({
          days: wackenTimetable.days,
          stages: wackenTimetable.stages,
          slots: wackenTimetable.slots,
        }),
      ]
    );
    await client.query(
      `INSERT INTO festivals (id, name, edition, data_version, timetable)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        'sb2026',
        'Summer Breeze Open Air 2026',
        '12.–15.08.2026 · Dinkelsbühl',
        '',
        JSON.stringify({
          days: [
            { id: 'wed', label: 'Mi', longLabel: 'Mittwoch', date: '2026-08-12' },
            { id: 'thu', label: 'Do', longLabel: 'Donnerstag', date: '2026-08-13' },
            { id: 'fri', label: 'Fr', longLabel: 'Freitag', date: '2026-08-14' },
            { id: 'sat', label: 'Sa', longLabel: 'Samstag', date: '2026-08-15' },
          ],
          stages: [],
          slots: [],
        }),
      ]
    );

    // Default-Blueprints für Wacken-Bühnen seeden, die noch keinen haben
    for (const [stageId, bp] of Object.entries(blueprintSeed)) {
      await client.query(
        `INSERT INTO blueprints (festival_id, stage_id, data) VALUES ($1, $2, $3)
         ON CONFLICT (festival_id, stage_id) DO NOTHING`,
        [LEGACY_FESTIVAL_ID, stageId, JSON.stringify(bp)]
      );
    }

    // Bestands-Crew in die Default-Gruppe "DEFEKT" übernehmen, damit beim
    // Umstieg auf Mandantenfähigkeit nichts verloren geht. Läuft nur, wenn
    // es noch gar keine Gruppe gibt; ältestes Mitglied wird Owner.
    await migrateLegacyUsersIntoDefaultGroup(client);
  } finally {
    // lock_timeout ist session-gebunden -> vor Rückgabe an den Pool
    // zurücksetzen, damit spätere Nutzer der Verbindung es nicht erben.
    await client.query('RESET lock_timeout').catch(() => {});
    if (locked) {
      await client.query('SELECT pg_advisory_unlock(724226)').catch(() => {});
    }
    client.release();
  }
}

async function migrateLegacyUsersIntoDefaultGroup(client: PoolClient): Promise<void> {
  const existing = await client.query('SELECT 1 FROM groups LIMIT 1');
  if ((existing.rowCount ?? 0) > 0) return;
  const users = await client.query<{ id: string }>(
    'SELECT id FROM users ORDER BY created_at'
  );
  if (users.rows.length === 0) return;

  const groupId = `g-${randomUUID()}`;
  await client.query(
    `INSERT INTO groups (id, festival_id, name, invite_code, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      groupId,
      LEGACY_FESTIVAL_ID,
      process.env.DEFAULT_GROUP_NAME || 'DEFEKT',
      generateInviteCode(),
      users.rows[0].id,
    ]
  );
  for (const [i, u] of users.rows.entries()) {
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [groupId, u.id, i === 0 ? 'owner' : 'member']
    );
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
/* Festivals                                                           */
/* ------------------------------------------------------------------ */

interface FestivalRow {
  id: string;
  name: string;
  edition: string;
  data_version: string;
  timetable: { days: Timetable['days']; stages: Timetable['stages']; slots: Timetable['slots'] };
  updated_at: Date;
}

// Timetables kurz im Prozess cachen: /api/data wird alle 7 s pro Client
// gepollt, das JSONB muss nicht jedes Mal von der DB kommen.
const timetableCache = new Map<string, { at: number; value: Timetable }>();
const TIMETABLE_CACHE_MS = 15_000;

export async function getTimetable(festivalId: string): Promise<Timetable | null> {
  const hit = timetableCache.get(festivalId);
  if (hit && Date.now() - hit.at < TIMETABLE_CACHE_MS) return hit.value;
  const res = await query<FestivalRow>(
    'SELECT id, name, edition, data_version, timetable, updated_at FROM festivals WHERE id = $1',
    [festivalId]
  );
  const row = res.rows[0];
  if (!row) return null;
  const timetable: Timetable = {
    festival: row.name,
    edition: row.edition,
    dataVersion: row.data_version,
    days: row.timetable.days ?? [],
    stages: row.timetable.stages ?? [],
    slots: row.timetable.slots ?? [],
  };
  timetableCache.set(festivalId, { at: Date.now(), value: timetable });
  return timetable;
}

export async function getFestivals(): Promise<FestivalSummary[]> {
  const res = await query<{ id: string; name: string; edition: string; has_lineup: boolean }>(
    `SELECT id, name, edition,
            jsonb_array_length(timetable->'slots') > 0 AS has_lineup
       FROM festivals ORDER BY id`
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    edition: r.edition,
    hasLineup: r.has_lineup,
  }));
}

export async function festivalExists(festivalId: string): Promise<boolean> {
  const res = await query('SELECT 1 FROM festivals WHERE id = $1', [festivalId]);
  return (res.rowCount ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/* Gruppen                                                             */
/* ------------------------------------------------------------------ */

/** DB-Rollenwert defensiv in den GroupRole-Typ übersetzen */
function parseRole(role: string | undefined): GroupRole {
  return role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'member';
}

/** Crockford-Base32 ohne Verwechsler (kein I, L, O, U) */
const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += INVITE_ALPHABET[bytes[i] % 32];
  return code;
}

interface GroupSummaryRow {
  id: string;
  name: string;
  festival_id: string;
  festival_name: string;
  role: string;
  member_count: string;
  image_version: number;
}

function toGroupSummary(r: GroupSummaryRow): GroupSummary {
  return {
    id: r.id,
    name: r.name,
    festivalId: r.festival_id,
    festivalName: r.festival_name,
    role: parseRole(r.role),
    memberCount: Number(r.member_count),
    imageVersion: r.image_version,
  };
}

const GROUP_SUMMARY_SELECT = `
  SELECT g.id, g.name, g.festival_id, f.name AS festival_name, g.image_version,
         m.role,
         (SELECT count(*) FROM group_members mm WHERE mm.group_id = g.id) AS member_count
    FROM group_members m
    JOIN groups g ON g.id = m.group_id
    JOIN festivals f ON f.id = g.festival_id`;

export async function getGroupsForUser(userId: string): Promise<GroupSummary[]> {
  const res = await query<GroupSummaryRow>(
    `${GROUP_SUMMARY_SELECT} WHERE m.user_id = $1 ORDER BY m.joined_at`,
    [userId]
  );
  return res.rows.map(toGroupSummary);
}

/** Fallback für Alt-Clients ohne ?group=: erste (älteste) Mitgliedschaft */
export async function getFirstGroupIdForUser(userId: string): Promise<string | null> {
  const res = await query<{ group_id: string }>(
    'SELECT group_id FROM group_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1',
    [userId]
  );
  return res.rows[0]?.group_id ?? null;
}

/**
 * Mitgliedschaft + Festival der Gruppe in einem Rutsch – der übliche
 * Kontext für Mutationen (selection/position). null = kein Mitglied.
 */
export async function getGroupContextForUser(
  groupId: string,
  userId: string
): Promise<{ festivalId: string; role: GroupRole } | null> {
  const res = await query<{ festival_id: string; role: string }>(
    `SELECT g.festival_id, m.role
       FROM groups g JOIN group_members m ON m.group_id = g.id
      WHERE g.id = $1 AND m.user_id = $2`,
    [groupId, userId]
  );
  const r = res.rows[0];
  if (!r) return null;
  return { festivalId: r.festival_id, role: parseRole(r.role) };
}

export async function getMemberRole(
  groupId: string,
  userId: string
): Promise<GroupRole | null> {
  const res = await query<{ role: string }>(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  const role = res.rows[0]?.role;
  return role === undefined ? null : parseRole(role);
}

export async function createGroup(
  userId: string,
  name: string,
  festivalId: string
): Promise<GroupSummary | null> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const groupId = `g-${randomUUID()}`;
    // Code-Kollision ist bei 32^8 praktisch ausgeschlossen, aber UNIQUE
    // kann theoretisch zuschlagen – dann einfach neu würfeln.
    let inserted = false;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      try {
        await client.query('SAVEPOINT ins_group');
        await client.query(
          `INSERT INTO groups (id, festival_id, name, invite_code, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [groupId, festivalId, name, generateInviteCode(), userId]
        );
        inserted = true;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT ins_group');
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    if (!inserted) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [groupId, userId]
    );
    const res = await client.query<GroupSummaryRow>(
      `${GROUP_SUMMARY_SELECT} WHERE m.group_id = $1 AND m.user_id = $2`,
      [groupId, userId]
    );
    await client.query('COMMIT');
    await bumpRev();
    return res.rows[0] ? toGroupSummary(res.rows[0]) : null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Beitritt per Einladungscode (normalisiert). null = Code ungültig. */
export async function joinGroupByCode(
  userId: string,
  code: string
): Promise<GroupSummary | null> {
  const group = await query<{ id: string }>(
    'SELECT id FROM groups WHERE invite_code = $1',
    [code]
  );
  const groupId = group.rows[0]?.id;
  if (!groupId) return null;
  await query(
    `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [groupId, userId]
  );
  await bumpRev();
  const res = await query<GroupSummaryRow>(
    `${GROUP_SUMMARY_SELECT} WHERE m.group_id = $1 AND m.user_id = $2`,
    [groupId, userId]
  );
  return res.rows[0] ? toGroupSummary(res.rows[0]) : null;
}

export interface GroupPreviewData {
  name: string;
  festivalName: string;
  memberCount: number;
  image: Buffer | null;
  imageMime: string | null;
}

/** Mini-Vorschau für die Beitritts-Seite – nur per Code, nie per ID. */
export async function getGroupPreviewByCode(
  code: string
): Promise<GroupPreviewData | null> {
  const res = await query<{
    name: string;
    festival_name: string;
    member_count: string;
    image: Buffer | null;
    image_mime: string | null;
  }>(
    `SELECT g.name, f.name AS festival_name, g.image, g.image_mime,
            (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
       FROM groups g JOIN festivals f ON f.id = g.festival_id
      WHERE g.invite_code = $1`,
    [code]
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    name: r.name,
    festivalName: r.festival_name,
    memberCount: Number(r.member_count),
    image: r.image,
    imageMime: r.image_mime,
  };
}

export interface GroupPatch {
  name?: string;
  hotThreshold?: number;
  rotateCode?: boolean;
}

/** Gruppe ändern (Admin-Check macht die Route). */
export async function updateGroup(groupId: string, patch: GroupPatch): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [groupId];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.hotThreshold !== undefined) {
    params.push(patch.hotThreshold);
    sets.push(`hot_threshold = $${params.length}`);
  }
  if (patch.rotateCode) {
    params.push(generateInviteCode());
    sets.push(`invite_code = $${params.length}`);
  }
  if (sets.length === 0) return true;
  const res = await query(
    `UPDATE groups SET ${sets.join(', ')} WHERE id = $1`,
    params
  );
  await bumpRev();
  return (res.rowCount ?? 0) > 0;
}

/**
 * Gruppe verlassen. Verlässt der letzte Owner die Gruppe, rückt der
 * dienstälteste Admin nach (sonst das dienstälteste Mitglied); das letzte
 * Mitglied nimmt die Gruppe mit (löschen).
 */
export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Gruppenzeile sperren, bevor die Mitgliedschaft gelöscht wird: das
    // serialisiert konkurrierende Leave-Aufrufe für dieselbe Gruppe, damit
    // die Owner-Nachfolge/-Löschung weiter unten nie auf einem Snapshot
    // entscheidet, der die noch nicht committete Löschung einer parallelen
    // Leave-Transaktion nicht sieht (#37).
    await client.query('SELECT id FROM groups WHERE id = $1 FOR UPDATE', [groupId]);
    await client.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    const remaining = await client.query<{ user_id: string; role: string }>(
      'SELECT user_id, role FROM group_members WHERE group_id = $1 ORDER BY joined_at',
      [groupId]
    );
    if (remaining.rows.length === 0) {
      await client.query('DELETE FROM groups WHERE id = $1', [groupId]);
    } else if (!remaining.rows.some((r) => r.role === 'owner')) {
      const successor =
        remaining.rows.find((r) => r.role === 'admin') ?? remaining.rows[0];
      const promoted = await client.query(
        `UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`,
        [groupId, successor.user_id]
      );
      // Sicherheitsnetz: mit dem Gruppenlock oben sollte das nie
      // passieren, aber ein still committeter Leave-Vorgang ohne Owner
      // ist schlimmer als ein Fehler, der die Transaktion zurückrollt.
      if ((promoted.rowCount ?? 0) === 0) {
        throw new Error(
          `leaveGroup: Owner-Nachfolge für Gruppe ${groupId} betraf 0 Zeilen`
        );
      }
    }
    await client.query('COMMIT');
    await bumpRev();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Mitglied entfernen (Admin-Check macht die Route; Owner ist tabu). */
export async function removeMember(groupId: string, targetUserId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM group_members
      WHERE group_id = $1 AND user_id = $2 AND role <> 'owner'`,
    [groupId, targetUserId]
  );
  await bumpRev();
  return (res.rowCount ?? 0) > 0;
}

/**
 * Mitglied befördern ('admin') oder degradieren ('member'). Der Owner ist
 * bewusst ausgenommen – seine Rolle ändert sich nur durch Nachrücken.
 * false = Zielnutzer ist kein (änderbares) Mitglied dieser Gruppe.
 */
export async function setMemberRole(
  groupId: string,
  targetUserId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  const res = await query(
    `UPDATE group_members SET role = $3
      WHERE group_id = $1 AND user_id = $2 AND role <> 'owner'`,
    [groupId, targetUserId, role]
  );
  await bumpRev();
  return (res.rowCount ?? 0) > 0;
}

export async function setGroupImage(
  groupId: string,
  image: Buffer,
  mime: string
): Promise<void> {
  await query(
    `UPDATE groups SET image = $2, image_mime = $3, image_version = image_version + 1
      WHERE id = $1`,
    [groupId, image, mime]
  );
  await bumpRev();
}

export async function getGroupImage(
  groupId: string
): Promise<{ image: Buffer; mime: string; version: number } | null> {
  const res = await query<{ image: Buffer | null; image_mime: string | null; image_version: number }>(
    'SELECT image, image_mime, image_version FROM groups WHERE id = $1',
    [groupId]
  );
  const r = res.rows[0];
  if (!r || !r.image) return null;
  return { image: r.image, mime: r.image_mime || 'image/jpeg', version: r.image_version };
}

/* ------------------------------------------------------------------ */
/* Gruppengescopeter Datenstand (GET /api/data)                        */
/* ------------------------------------------------------------------ */

export interface DbState {
  users: User[];
  selections: Selection[];
  positions: Position[];
  blueprints: Record<string, Blueprint>;
  group: GroupInfo;
  festivalId: string;
  rev: number;
}

/**
 * Kompletter Datenstand für EINE Gruppe: Mitglieder, deren Auswahlen und
 * Positionen (nur fürs Festival der Gruppe) plus die Blueprints des
 * Festivals. null = Nutzer ist kein Mitglied (Route antwortet 403).
 */
export async function getState(groupId: string, userId: string): Promise<DbState | null> {
  await ensureSchema();
  const pool = getPool();

  const groupRes = await pool.query<{
    id: string;
    name: string;
    festival_id: string;
    festival_name: string;
    invite_code: string;
    hot_threshold: number;
    image_version: number;
    role: string;
  }>(
    `SELECT g.id, g.name, g.festival_id, f.name AS festival_name, g.invite_code,
            g.hot_threshold, g.image_version, m.role
       FROM groups g
       JOIN festivals f ON f.id = g.festival_id
       JOIN group_members m ON m.group_id = g.id AND m.user_id = $2
      WHERE g.id = $1`,
    [groupId, userId]
  );
  const g = groupRes.rows[0];
  if (!g) return null;

  const [members, selections, positions, blueprints, rev] = await Promise.all([
    pool.query<{ id: string; name: string; color: string; created_at: Date; role: string }>(
      `SELECT u.id, u.name, u.color, u.created_at, m.role
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1 ORDER BY m.joined_at`,
      [groupId]
    ),
    pool.query<{ user_id: string; slot_id: string; status: string }>(
      `SELECT s.user_id, s.slot_id, s.status
         FROM selections s
         JOIN group_members m ON m.user_id = s.user_id AND m.group_id = $1
        WHERE s.festival_id = $2`,
      [groupId, g.festival_id]
    ),
    pool.query<{ user_id: string; slot_id: string; x: number; y: number; updated_at: Date }>(
      `SELECT p.user_id, p.slot_id, p.x, p.y, p.updated_at
         FROM positions p
         JOIN group_members m ON m.user_id = p.user_id AND m.group_id = $1
        WHERE p.festival_id = $2`,
      [groupId, g.festival_id]
    ),
    pool.query<{ stage_id: string; data: Blueprint }>(
      'SELECT stage_id, data FROM blueprints WHERE festival_id = $1',
      [g.festival_id]
    ),
    pool.query<{ last_value: string }>('SELECT last_value FROM db_rev'),
  ]);

  const roles: Record<string, GroupRole> = {};
  for (const m of members.rows) roles[m.id] = parseRole(m.role);

  return {
    users: members.rows.map((r) => ({
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
    blueprints: Object.fromEntries(blueprints.rows.map((r) => [r.stage_id, r.data])),
    group: {
      id: g.id,
      name: g.name,
      festivalId: g.festival_id,
      festivalName: g.festival_name,
      hotThreshold: g.hot_threshold,
      inviteCode: g.invite_code,
      imageVersion: g.image_version,
      role: parseRole(g.role),
      roles,
    },
    festivalId: g.festival_id,
    rev: Number(rev.rows[0].last_value),
  };
}

/* ------------------------------------------------------------------ */
/* Nutzer & Passkeys                                                   */
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
 * Icon-/Avatar-Farbe eines Nutzers ändern. Bumpt die Revision, damit die
 * neue Farbe bei den Mitgliedern (deren Avatare) beim nächsten Poll ankommt.
 * Gibt null zurück, wenn es den Nutzer nicht (mehr) gibt.
 */
export async function updateUserColor(id: string, color: string): Promise<User | null> {
  const res = await query<UserRow>(
    'UPDATE users SET color = $2 WHERE id = $1 RETURNING id, name, color, created_at',
    [id, color]
  );
  if (!res.rows[0]) return null;
  await bumpRev();
  return toUser(res.rows[0]);
}

/**
 * Bestandsnutzer ohne Passkey mit diesem Namen (case-insensitiv) – darf
 * bei der Registrierung übernommen werden, damit Alt-Accounts aus der
 * Nur-Name-Ära ihre Auswahlen behalten. Sobald ein Passkey dran hängt,
 * ist der Account nicht mehr übernehmbar.
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

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** Serverseitigen Sitzungsdatensatz anlegen; sessionIdHash ist bereits gehasht (nie der Rohwert). */
export async function createSession(
  sessionIdHash: string,
  userId: string,
  maxAgeSeconds: number
): Promise<void> {
  await query(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES ($1, $2, now() + $3 * interval '1 second')`,
    [sessionIdHash, userId, maxAgeSeconds]
  );
}

/**
 * Sitzung anhand des gehashten Identifiers prüfen: muss existieren, darf
 * nicht widerrufen oder abgelaufen sein und muss innerhalb des
 * Inaktivitäts-Timeouts zuletzt gesehen worden sein. Bei Erfolg wird
 * last_seen_at nachgeführt (throttled auf alle 5 Minuten, um nicht bei
 * jedem Request zu schreiben).
 */
export async function touchSession(
  sessionIdHash: string,
  idleTimeoutSeconds: number
): Promise<{ userId: string } | null> {
  const res = await query<{ user_id: string }>(
    `SELECT user_id FROM sessions
      WHERE id = $1
        AND revoked_at IS NULL
        AND expires_at > now()
        AND last_seen_at > now() - $2 * interval '1 second'`,
    [sessionIdHash, idleTimeoutSeconds]
  );
  const row = res.rows[0];
  if (!row) return null;
  query(
    `UPDATE sessions SET last_seen_at = now()
      WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
    [sessionIdHash]
  ).catch(() => {
    // Best effort: ein verpasstes Nachführen von last_seen_at verkürzt im
    // schlimmsten Fall nur das Idle-Fenster, gefährdet aber keine Prüfung.
  });
  return { userId: row.user_id };
}

/** Sitzung widerrufen (Logout); idempotent, no-op wenn unbekannt oder schon widerrufen. */
export async function revokeSession(sessionIdHash: string): Promise<void> {
  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [
    sessionIdHash,
  ]);
}

/* ------------------------------------------------------------------ */
/* Auswahlen & Positionen                                              */
/* ------------------------------------------------------------------ */

/**
 * Band-Teilnahme setzen ('going'/'interested') oder entfernen (null).
 * Rückgabe false, wenn der Nutzer nicht existiert (FK-Verletzung).
 */
export async function setSelection(
  userId: string,
  festivalId: string,
  slotId: string,
  status: SelectionStatus | null
): Promise<boolean> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (status) {
      await client.query(
        `INSERT INTO selections (user_id, festival_id, slot_id, status) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, festival_id, slot_id) DO UPDATE SET status = EXCLUDED.status`,
        [userId, festivalId, slotId, status]
      );
    } else {
      await client.query(
        'DELETE FROM selections WHERE user_id = $1 AND festival_id = $2 AND slot_id = $3',
        [userId, festivalId, slotId]
      );
      // Wer sich austrägt, verliert auch seine Positionsmarkierung
      await client.query(
        'DELETE FROM positions WHERE user_id = $1 AND festival_id = $2 AND slot_id = $3',
        [userId, festivalId, slotId]
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
  festivalId: string,
  slotId: string,
  x: number | null,
  y: number | null
): Promise<PositionResult> {
  if (x === null || y === null) {
    await query(
      'DELETE FROM positions WHERE user_id = $1 AND festival_id = $2 AND slot_id = $3',
      [userId, festivalId, slotId]
    );
    await bumpRev();
    return 'ok';
  }
  const res = await query(
    `INSERT INTO positions (user_id, festival_id, slot_id, x, y)
     SELECT $1, $2, $3, $4, $5
     WHERE EXISTS (
       SELECT 1 FROM selections
        WHERE user_id = $1 AND festival_id = $2 AND slot_id = $3
     )
     ON CONFLICT (user_id, festival_id, slot_id)
     DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, updated_at = now()`,
    [userId, festivalId, slotId, x, y]
  );
  if (res.rowCount === 0) return 'not-attending';
  await bumpRev();
  return 'ok';
}

/* ------------------------------------------------------------------ */
/* Blueprints (Admin)                                                  */
/* ------------------------------------------------------------------ */

/** Blueprint einer Bühne komplett ersetzen (Admin). */
export async function saveBlueprint(
  festivalId: string,
  stageId: string,
  blueprint: Blueprint
): Promise<number> {
  await query(
    `INSERT INTO blueprints (festival_id, stage_id, data) VALUES ($1, $2, $3)
     ON CONFLICT (festival_id, stage_id) DO UPDATE SET data = EXCLUDED.data`,
    [festivalId, stageId, JSON.stringify(blueprint)]
  );
  return bumpRev();
}

export async function getBlueprints(festivalId: string): Promise<Record<string, Blueprint>> {
  const res = await query<{ stage_id: string; data: Blueprint }>(
    'SELECT stage_id, data FROM blueprints WHERE festival_id = $1',
    [festivalId]
  );
  return Object.fromEntries(res.rows.map((r) => [r.stage_id, r.data]));
}

/**
 * Generischer Blueprint für Bühnen ohne gepflegten Grundriss (z. B. frisch
 * importiertes Festival): Bühne oben, FOH mittig – Admin passt später an.
 */
export function defaultBlueprint(stageLabel: string): Blueprint {
  return {
    stageLabel,
    elements: [
      { type: 'stage', x: 20, y: 4, w: 60, h: 14, label: stageLabel },
      { type: 'foh', x: 42, y: 52, w: 16, h: 9, label: 'FOH' },
    ],
    pois: [],
  };
}
