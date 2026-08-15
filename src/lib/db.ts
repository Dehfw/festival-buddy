import { randomBytes, randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import blueprintSeedJson from '../../data/blueprints.seed.json';
import partysanJson from '../../data/partysan2026.json';
import timetableJson from '../../data/timetable.json';
import type {
  Announcement,
  AnnouncementWithAuthor,
  Blueprint,
  FestivalDay,
  FestivalGroupStats,
  FestivalSummary,
  GroupInfo,
  GroupRole,
  GroupSummary,
  OrganizerInfo,
  Position,
  Selection,
  SelectionStatus,
  Slot,
  SlotSelectionCounts,
  Stage,
  Timetable,
  User,
} from './types';
import { FESTIVAL_TZ, isValidTime, toMinutes } from './types';

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
const partysanTimetable = partysanJson as unknown as Timetable;
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

/**
 * Existiert das Schema schon in der NEUESTEN Ausbaustufe? (billiger
 * Steady-State-Check.) Geprüft wird bewusst die zuletzt hinzugekommene
 * Tabelle, nicht die Kern-Tabelle: Auf einer Bestands-DB existiert
 * `festivals` längst – fehlt aber z. B. `organizer_invites`, muss der
 * idempotente Schema-Block unten einmal laufen und sie nachziehen.
 * Beim Anlegen neuer Tabellen hier IMMER auf die neueste umstellen!
 * Aktuell sind das ZWEI Tabellen, weil Push- und Passwort-Feature
 * parallel entstanden sind – eine Bestands-DB kann die eine ohne die
 * andere haben, erst beide zusammen heißen "alles da".
 */
async function schemaAlreadyExists(client: PoolClient): Promise<boolean> {
  const res = await client.query<{ a: string | null; b: string | null }>(
    "SELECT to_regclass('public.push_reminders_sent') AS a, to_regclass('public.password_credentials') AS b"
  );
  const row = res.rows[0];
  return row?.a != null && row?.b != null;
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
      -- E-Mail+Passwort-Login (optional, zusätzlich zum Passkey): genau
      -- ein Credential pro Nutzer, die E-Mail ist nur Login-Name (immer
      -- lowercase gespeichert). Hash-Format: src/lib/password.ts.
      CREATE TABLE IF NOT EXISTS password_credentials (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS blueprints (
        festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}',
        stage_id    TEXT NOT NULL,
        data        JSONB NOT NULL,
        PRIMARY KEY (festival_id, stage_id)
      );
      ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT '${LEGACY_FESTIVAL_ID}';
      -- Veranstalter: Nutzer, die Timetable/Bühnen/Blueprints "ihres"
      -- Festivals pflegen dürfen. Zuweisung entsteht durch Einlösen eines
      -- Einladungscodes; Entzug per CLI (scripts/organizer-code.mjs).
      CREATE TABLE IF NOT EXISTS festival_organizers (
        festival_id TEXT NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (festival_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS festival_organizers_user_idx ON festival_organizers (user_id);
      -- Einmal-Codes für die Veranstalter-Zuweisung: der Betreiber erzeugt
      -- sie per CLI, ein eingeloggter Nutzer löst sie in der App ein.
      -- Einlösen verbraucht den Code (used_by/used_at), revoked_at sperrt
      -- einen noch offenen Code.
      CREATE TABLE IF NOT EXISTS organizer_invites (
        code        TEXT PRIMARY KEY,
        festival_id TEXT NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at  TIMESTAMPTZ,
        used_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
        used_at     TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS organizer_invites_festival_idx ON organizer_invites (festival_id);
      -- Web-Push-Abos: ein Browser/Gerät = eine Zeile, der Push-Endpoint ist
      -- der natürliche Schlüssel. Bei Nutzerwechsel auf demselben Gerät wird
      -- die Zeile per Upsert auf den neuen Nutzer umgebunden.
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint   TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
      -- Mitteilungen von Veranstaltern (festival_id gesetzt) bzw. vom
      -- Betreiber (festival_id NULL = app-weit). Zusätzlich zum Push landen
      -- sie im /api/data-Payload, damit auch Nutzer ohne Push sie sehen.
      CREATE TABLE IF NOT EXISTS announcements (
        id          TEXT PRIMARY KEY,
        festival_id TEXT REFERENCES festivals(id) ON DELETE CASCADE,
        author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
        title       TEXT NOT NULL,
        body        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS announcements_festival_idx ON announcements (festival_id, created_at DESC);
      -- Versand-Log der Band-Erinnerungen: pro (Nutzer, Festival, Slot) genau
      -- eine Erinnerung. Der Cron claimt Zeilen per INSERT … ON CONFLICT DO
      -- NOTHING, bevor er pusht – parallele Läufe senden so nie doppelt.
      CREATE TABLE IF NOT EXISTS push_reminders_sent (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        festival_id TEXT NOT NULL,
        slot_id     TEXT NOT NULL,
        sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, festival_id, slot_id)
      );
      -- Installations-Telemetrie: eine Zeile pro App-Installation, also pro
      -- Browser-Profil bzw. Home-Screen-App. Die install_id ist eine
      -- zufällige ID aus dem localStorage des Geräts (kein Fingerprint) –
      -- auf iOS hat die installierte PWA einen eigenen Storage, bekommt also
      -- automatisch eine eigene ID. Ob jemand die App DEINSTALLIERT, meldet
      -- kein Browser; gemessen wird deshalb "zuletzt vom Home-Screen
      -- gestartet" (last_standalone_at) – wer lange fehlt, gilt als weg.
      CREATE TABLE IF NOT EXISTS app_installs (
        install_id         TEXT PRIMARY KEY,
        user_id            TEXT REFERENCES users(id) ON DELETE CASCADE,
        platform           TEXT NOT NULL DEFAULT 'other',
        -- letzter Start: aus der installierten App (true) oder im Browser-Tab
        standalone         BOOLEAN NOT NULL DEFAULT FALSE,
        first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- erster bzw. letzter Start im Home-Screen-Modus (NULL = nie installiert)
        installed_at       TIMESTAMPTZ,
        last_standalone_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS app_installs_standalone_idx
        ON app_installs (last_standalone_at DESC);
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

    // Festivals seeden: Wacken und Party.San aus den gebundelten
    // Timetable-JSONs, Summer Breeze als Gerüst (Lineup kommt später per
    // scripts/import-festival.mjs). Nur einfügen, wenn die Zeile fehlt –
    // danach ist die DB die Wahrheit.
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
    await client.query(
      `INSERT INTO festivals (id, name, edition, data_version, timetable)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        'psoa2026',
        partysanTimetable.festival,
        partysanTimetable.edition,
        partysanTimetable.dataVersion,
        JSON.stringify({
          days: partysanTimetable.days,
          stages: partysanTimetable.stages,
          slots: partysanTimetable.slots,
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

/**
 * Timetable garantiert frisch aus der DB (am Cache vorbei) – für den
 * Veranstalter-Editor, der nie einen bis zu 15 s alten Stand einer
 * anderen Instanz sehen soll. Aktualisiert den Cache gleich mit.
 */
export async function getTimetableFresh(festivalId: string): Promise<Timetable | null> {
  timetableCache.delete(festivalId);
  return getTimetable(festivalId);
}

/** en-CA formatiert als JJJJ-MM-TT */
const todayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: FESTIVAL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Heutiges Datum (JJJJ-MM-TT) in der Festival-Zeitzone – Stichtag dafür,
 * ob ein Festival schon vorbei ist.
 */
function festivalTodayISO(): string {
  return todayFormat.format(new Date());
}

/**
 * Letzter Festivaltag als max(days.date) – Tage sind per upsertDay/Import
 * garantiert JJJJ-MM-TT, der Textvergleich ist also chronologisch.
 */
const LAST_DAY_SQL = `(SELECT max(day->>'date')
                         FROM jsonb_array_elements(timetable->'days') day)`;

/** Alle Festivals, auch vergangene (Reminder-Cron braucht den Vollbestand). */
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

/**
 * Festivals für die Auswahl bei der Gruppengründung: beendete Festivals
 * (letzter Tag vor heute) fliegen raus, Festivals ohne importierte Tage
 * ("Lineup folgt") bleiben wählbar.
 */
export async function getSelectableFestivals(): Promise<FestivalSummary[]> {
  const res = await query<{ id: string; name: string; edition: string; has_lineup: boolean }>(
    `SELECT id, name, edition,
            jsonb_array_length(timetable->'slots') > 0 AS has_lineup
       FROM festivals
      WHERE COALESCE(${LAST_DAY_SQL}, '9999-12-31') >= $1
      ORDER BY id`,
    [festivalTodayISO()]
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    edition: r.edition,
    hasLineup: r.has_lineup,
  }));
}

export type FestivalStatus = 'ok' | 'past' | 'missing';

/** Für die Gruppengründung: existiert das Festival, und ist es noch nicht vorbei? */
export async function getFestivalStatus(festivalId: string): Promise<FestivalStatus> {
  const res = await query<{ last_day: string | null }>(
    `SELECT ${LAST_DAY_SQL} AS last_day FROM festivals WHERE id = $1`,
    [festivalId]
  );
  const row = res.rows[0];
  if (!row) return 'missing';
  return row.last_day !== null && row.last_day < festivalTodayISO() ? 'past' : 'ok';
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

/**
 * Push-Zielgruppe fürs Standort-Teilen: Gruppenmitglieder, die beim Slot
 * selbst eingetragen sind – eine Zeile in selections heißt 'going' oder
 * 'interested' – ohne den Teilenden selbst.
 */
export async function getSlotAttendeeUserIdsInGroup(
  groupId: string,
  festivalId: string,
  slotId: string,
  exceptUserId: string
): Promise<string[]> {
  const res = await query<{ user_id: string }>(
    `SELECT DISTINCT m.user_id
       FROM group_members m
       JOIN selections s ON s.user_id = m.user_id
      WHERE m.group_id = $1 AND s.festival_id = $2 AND s.slot_id = $3
        AND m.user_id <> $4`,
    [groupId, festivalId, slotId, exceptUserId]
  );
  return res.rows.map((r) => r.user_id);
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
      await client.query(
        `UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`,
        [groupId, successor.user_id]
      );
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
 * Anzeigename und/oder Icon-Farbe eines Nutzers ändern. Bumpt die Revision,
 * damit die Änderung bei den Mitgliedern (Avatare, Mitgliederliste) beim
 * nächsten Poll ankommt. Gibt null zurück, wenn es den Nutzer nicht (mehr)
 * gibt.
 */
export async function updateUserProfile(
  id: string,
  fields: { name?: string; color?: string }
): Promise<User | null> {
  const res = await query<UserRow>(
    `UPDATE users SET name = COALESCE($2, name), color = COALESCE($3, color)
      WHERE id = $1 RETURNING id, name, color, created_at`,
    [id, fields.name ?? null, fields.color ?? null]
  );
  if (!res.rows[0]) return null;
  await bumpRev();
  return toUser(res.rows[0]);
}

/**
 * Registrierung abschließen: Nutzer anlegen und das Credential daran
 * binden. Gibt null zurück, wenn die ID inzwischen anderweitig belegt
 * ist – das schützt vor manipulierten Challenge-Cookies.
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
      await client.query('ROLLBACK');
      return null;
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

export interface CredentialSummary {
  id: string;
  createdAt: string;
}

/** Eigene Passkeys für den Bereich "Login & Sicherheit" auflisten */
export async function getWebauthnCredentialsForUser(
  userId: string
): Promise<CredentialSummary[]> {
  const res = await query<{ id: string; created_at: Date }>(
    'SELECT id, created_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * Weiteren Passkey an ein bestehendes (eingeloggtes) Konto hängen.
 * false = Credential-ID ist schon vergeben (z. B. an ein anderes Konto).
 */
export async function addCredentialToUser(
  userId: string,
  credential: { id: string; publicKey: Uint8Array; counter: number; transports: string[] }
): Promise<boolean> {
  const res = await query(
    `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [
      credential.id,
      userId,
      Buffer.from(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports),
    ]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Eigenen Passkey löschen – aber nie den letzten Login-Weg: Der Passkey
 * fällt nur, wenn ein Passwort hinterlegt ist ODER ein weiterer Passkey
 * bleibt. Der Check steckt im selben Statement (kein Race, das ein Konto
 * aussperren könnte). false = unbekanntes Credential oder wäre der
 * letzte Login-Weg.
 */
export async function deleteWebauthnCredentialGuarded(
  userId: string,
  credentialId: string
): Promise<boolean> {
  const res = await query(
    `DELETE FROM webauthn_credentials
      WHERE id = $2 AND user_id = $1
        AND (
          EXISTS (SELECT 1 FROM password_credentials pc WHERE pc.user_id = $1)
          OR (SELECT count(*) FROM webauthn_credentials c WHERE c.user_id = $1) > 1
        )`,
    [userId, credentialId]
  );
  return (res.rowCount ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/* Passwort-Login (E-Mail + Passwort, optional zusätzlich zum Passkey) */
/* ------------------------------------------------------------------ */

/** E-Mail des Passwort-Credentials eines Nutzers (null = keins hinterlegt) */
export async function getPasswordEmailForUser(userId: string): Promise<string | null> {
  const res = await query<{ email: string }>(
    'SELECT email FROM password_credentials WHERE user_id = $1',
    [userId]
  );
  return res.rows[0]?.email ?? null;
}

/** Credential fürs Reset-Token: aktueller Hash bindet den Fingerprint */
export async function getPasswordCredentialForUser(
  userId: string
): Promise<{ email: string; passwordHash: string } | null> {
  const res = await query<{ email: string; password_hash: string }>(
    'SELECT email, password_hash FROM password_credentials WHERE user_id = $1',
    [userId]
  );
  const r = res.rows[0];
  return r ? { email: r.email, passwordHash: r.password_hash } : null;
}

/** Nutzer + Passwort-Hash für den Login per E-Mail nachschlagen */
export async function getUserByEmail(
  email: string
): Promise<{ user: User; passwordHash: string } | null> {
  const res = await query<UserRow & { password_hash: string }>(
    `SELECT u.id, u.name, u.color, u.created_at, pc.password_hash
       FROM password_credentials pc JOIN users u ON u.id = pc.user_id
      WHERE pc.email = $1`,
    [email]
  );
  const r = res.rows[0];
  return r ? { user: toUser(r), passwordHash: r.password_hash } : null;
}

/**
 * Registrierung per E-Mail+Passwort: Nutzer anlegen und das
 * Passwort-Credential daran binden.
 * 'email-taken' = Adresse hat schon ein Konto; null = ID-Kollision.
 */
export async function createUserWithPassword(
  user: { id: string; name: string; color: string },
  email: string,
  passwordHash: string
): Promise<User | 'email-taken' | null> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      'INSERT INTO users (id, name, color) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [user.id, user.name, user.color]
    );
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    try {
      await client.query(
        `INSERT INTO password_credentials (user_id, email, password_hash)
         VALUES ($1, $2, $3)`,
        [user.id, email, passwordHash]
      );
    } catch (err) {
      await client.query('ROLLBACK');
      // UNIQUE auf email: Adresse gehört schon einem Konto
      if ((err as { code?: string }).code === '23505') return 'email-taken';
      throw err;
    }
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

/**
 * E-Mail+Passwort an einen bestehenden (eingeloggten) Nutzer hängen oder
 * ändern. 'email-taken' = Adresse gehört schon einem anderen Konto.
 */
export async function upsertPasswordCredential(
  userId: string,
  email: string,
  passwordHash: string
): Promise<'ok' | 'email-taken'> {
  try {
    await query(
      `INSERT INTO password_credentials (user_id, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
             updated_at = now()`,
      [userId, email, passwordHash]
    );
    return 'ok';
  } catch (err) {
    // Konflikt-Ziel ist user_id – ein 23505 kommt hier nur noch vom
    // UNIQUE auf email (Adresse hängt an einem anderen Konto)
    if ((err as { code?: string }).code === '23505') return 'email-taken';
    throw err;
  }
}

/**
 * Passwort-Login entfernen – aber nie den letzten Login-Weg: fällt nur,
 * wenn mindestens ein Passkey am Konto hängt (Check im selben Statement,
 * kein Aussperr-Race). false = kein Credential oder kein Passkey da.
 */
export async function deletePasswordCredentialGuarded(userId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM password_credentials
      WHERE user_id = $1
        AND EXISTS (SELECT 1 FROM webauthn_credentials c WHERE c.user_id = $1)`,
    [userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Neues Passwort nach Reset setzen; false = kein Credential (mehr) da */
export async function updatePasswordHash(
  userId: string,
  passwordHash: string
): Promise<boolean> {
  const res = await query(
    `UPDATE password_credentials SET password_hash = $2, updated_at = now()
      WHERE user_id = $1`,
    [userId, passwordHash]
  );
  return (res.rowCount ?? 0) > 0;
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

/** Zeitstempel der aktuellen Positionsmarkierung (null = kein Marker). */
export async function getPositionUpdatedAt(
  userId: string,
  festivalId: string,
  slotId: string
): Promise<Date | null> {
  const res = await query<{ updated_at: Date }>(
    'SELECT updated_at FROM positions WHERE user_id = $1 AND festival_id = $2 AND slot_id = $3',
    [userId, festivalId, slotId]
  );
  return res.rows[0]?.updated_at ?? null;
}

/* ------------------------------------------------------------------ */
/* Veranstalter (Festival-Organizer)                                   */
/* ------------------------------------------------------------------ */

export async function isFestivalOrganizer(
  userId: string,
  festivalId: string
): Promise<boolean> {
  const res = await query(
    'SELECT 1 FROM festival_organizers WHERE festival_id = $1 AND user_id = $2',
    [festivalId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Festivals, die dieser Nutzer als Veranstalter pflegen darf */
export async function getOrganizerFestivals(userId: string): Promise<FestivalSummary[]> {
  const res = await query<{ id: string; name: string; edition: string; has_lineup: boolean }>(
    `SELECT f.id, f.name, f.edition,
            jsonb_array_length(f.timetable->'slots') > 0 AS has_lineup
       FROM festival_organizers o JOIN festivals f ON f.id = o.festival_id
      WHERE o.user_id = $1 ORDER BY f.id`,
    [userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    edition: r.edition,
    hasLineup: r.has_lineup,
  }));
}

/** Billiger Zähler für /api/me – steuert den Veranstalter-Link in der Nav */
export async function countOrganizerFestivals(userId: string): Promise<number> {
  const res = await query<{ n: string }>(
    'SELECT count(*) AS n FROM festival_organizers WHERE user_id = $1',
    [userId]
  );
  return Number(res.rows[0].n);
}

/**
 * Veranstalter-Code einlösen: macht den Nutzer zum Veranstalter des
 * zugehörigen Festivals und verbraucht den Code. null = Code unbekannt,
 * bereits eingelöst oder widerrufen (bewusst dieselbe Antwort – kein
 * Orakel für Code-Rater).
 */
export async function redeemOrganizerInvite(
  userId: string,
  code: string
): Promise<FestivalSummary | null> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const invite = await client.query<{ festival_id: string }>(
      `SELECT festival_id FROM organizer_invites
        WHERE code = $1 AND revoked_at IS NULL AND used_by IS NULL
        FOR UPDATE`,
      [code]
    );
    const festivalId = invite.rows[0]?.festival_id;
    if (!festivalId) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      'UPDATE organizer_invites SET used_by = $2, used_at = now() WHERE code = $1',
      [code, userId]
    );
    await client.query(
      `INSERT INTO festival_organizers (festival_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [festivalId, userId]
    );
    const fest = await client.query<{ id: string; name: string; edition: string; has_lineup: boolean }>(
      `SELECT id, name, edition,
              jsonb_array_length(timetable->'slots') > 0 AS has_lineup
         FROM festivals WHERE id = $1`,
      [festivalId]
    );
    await client.query('COMMIT');
    const f = fest.rows[0];
    return f
      ? { id: f.id, name: f.name, edition: f.edition, hasLineup: f.has_lineup }
      : null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Feste Zusagen und Interessen pro Slot, getrennt nach Status (über ALLE
 * Gruppen des Festivals) – der Veranstalter-Editor zeigt beides am Slot an
 * und warnt mit der Summe, bevor er Slots löscht, an denen schon Leute
 * dranhängen.
 */
export async function getSelectionCountsForFestival(
  festivalId: string
): Promise<Record<string, SlotSelectionCounts>> {
  const res = await query<{ slot_id: string; status: string; n: string }>(
    `SELECT slot_id, status, count(*) AS n FROM selections
      WHERE festival_id = $1 GROUP BY slot_id, status`,
    [festivalId]
  );
  const counts: Record<string, SlotSelectionCounts> = {};
  for (const r of res.rows) {
    const entry = (counts[r.slot_id] ??= { going: 0, interested: 0 });
    if (r.status === 'interested') entry.interested += Number(r.n);
    else entry.going += Number(r.n);
  }
  return counts;
}

/**
 * Anonyme Gruppen-Zähler fürs Veranstalter-Dashboard: Wie viele Gruppen gibt
 * es zum Festival und wie viele verschiedene Personen stecken darin? Bewusst
 * nur Summen – Gruppennamen oder Mitglieder bekommt der Veranstalter nicht.
 */
export async function getGroupStatsForFestival(
  festivalId: string
): Promise<FestivalGroupStats> {
  const res = await query<{ groups: string; people: string }>(
    `SELECT count(DISTINCT g.id) AS groups, count(DISTINCT m.user_id) AS people
       FROM groups g LEFT JOIN group_members m ON m.group_id = g.id
      WHERE g.festival_id = $1`,
    [festivalId]
  );
  const row = res.rows[0];
  return { groups: Number(row?.groups ?? 0), people: Number(row?.people ?? 0) };
}

/** Alle Veranstalter eines Festivals – Team-Liste im Veranstalter-Bereich */
export async function getFestivalOrganizers(festivalId: string): Promise<OrganizerInfo[]> {
  const res = await query<{ id: string; name: string; color: string; created_at: Date }>(
    `SELECT u.id, u.name, u.color, o.created_at
       FROM festival_organizers o JOIN users u ON u.id = o.user_id
      WHERE o.festival_id = $1 ORDER BY o.created_at, u.name`,
    [festivalId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    since: new Date(r.created_at).toISOString(),
  }));
}

/* ------------------------------------------------------------------ */
/* Web Push & Mitteilungen                                             */
/* ------------------------------------------------------------------ */

/** Mehr Abos pro Nutzer wären Karteileichen – die ältesten fliegen raus. */
const MAX_PUSH_SUBS_PER_USER = 20;

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId: string;
}

/**
 * Push-Abo speichern bzw. auf den aktuell eingeloggten Nutzer umbinden
 * (geteiltes Gerät: der Endpoint bleibt, der Nutzer dahinter wechselt).
 */
export async function upsertPushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent: string
): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [endpoint, userId, p256dh, auth, userAgent]
  );
  await query(
    `DELETE FROM push_subscriptions
      WHERE user_id = $1 AND endpoint IN (
        SELECT endpoint FROM push_subscriptions WHERE user_id = $1
         ORDER BY created_at DESC OFFSET $2
      )`,
    [userId, MAX_PUSH_SUBS_PER_USER]
  );
}

/** Abmelden aus der App: löscht nur das eigene Abo (endpoint + user_id). */
export async function deletePushSubscription(
  endpoint: string,
  userId: string
): Promise<void> {
  await query(
    'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
    [endpoint, userId]
  );
}

/** Cleanup toter Abos (Push-Dienst antwortet 404/410). */
export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function getPushSubscriptionsForUsers(
  userIds: string[]
): Promise<PushSubscriptionRecord[]> {
  if (userIds.length === 0) return [];
  const res = await query<{ endpoint: string; p256dh: string; auth: string; user_id: string }>(
    'SELECT endpoint, p256dh, auth, user_id FROM push_subscriptions WHERE user_id = ANY($1)',
    [userIds]
  );
  return res.rows.map((r) => ({
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    userId: r.user_id,
  }));
}

/** Hat der Nutzer mindestens ein Push-Abo? (für die Konto-Anzeige) */
export async function hasPushSubscription(userId: string): Promise<boolean> {
  const res = await query('SELECT 1 FROM push_subscriptions WHERE user_id = $1 LIMIT 1', [
    userId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Zielgruppe einer Programm-Änderung: alle Nutzer, die beim Slot eingetragen
 * sind ('going' oder 'interested'), über alle Gruppen des Festivals hinweg.
 */
export async function getSlotSelectionUserIds(
  festivalId: string,
  slotId: string
): Promise<string[]> {
  const res = await query<{ user_id: string }>(
    'SELECT DISTINCT user_id FROM selections WHERE festival_id = $1 AND slot_id = $2',
    [festivalId, slotId]
  );
  return res.rows.map((r) => r.user_id);
}

/**
 * Zielgruppe einer Veranstalter-Mitteilung: alle Mitglieder aller Gruppen
 * dieses Festivals (dieselbe Kette wie beim Daten-Payload, nur festivalweit).
 */
export async function getFestivalAudienceUserIds(festivalId: string): Promise<string[]> {
  const res = await query<{ user_id: string }>(
    `SELECT DISTINCT gm.user_id
       FROM groups g JOIN group_members gm ON gm.group_id = g.id
      WHERE g.festival_id = $1`,
    [festivalId]
  );
  return res.rows.map((r) => r.user_id);
}

interface AnnouncementRow {
  id: string;
  festival_id: string | null;
  title: string;
  body: string;
  created_at: Date;
}

function toAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: r.id,
    festivalId: r.festival_id,
    title: r.title,
    body: r.body,
    createdAt: r.created_at.toISOString(),
  };
}

/** Mitteilung persistieren; bumpRev() -> Polling-Clients sehen sie in ≤7 s. */
export async function createAnnouncement(
  festivalId: string | null,
  authorId: string | null,
  title: string,
  body: string
): Promise<Announcement> {
  const id = `a-${randomUUID()}`;
  const res = await query<AnnouncementRow>(
    `INSERT INTO announcements (id, festival_id, author_id, title, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, festival_id, title, body, created_at`,
    [id, festivalId, authorId, title, body]
  );
  await bumpRev();
  return toAnnouncement(res.rows[0]);
}

/** Neueste Mitteilungen für ein Festival – app-weite (festival_id NULL) inklusive. */
export async function getAnnouncements(
  festivalId: string,
  limit: number
): Promise<Announcement[]> {
  const res = await query<AnnouncementRow>(
    `SELECT id, festival_id, title, body, created_at FROM announcements
      WHERE festival_id = $1 OR festival_id IS NULL
      ORDER BY created_at DESC LIMIT $2`,
    [festivalId, limit]
  );
  return res.rows.map(toAnnouncement);
}

/**
 * Wie getAnnouncements, aber mit Absender-Namen – NUR für den Verlauf im
 * Veranstalter-Bereich. Im /api/data-Payload bleibt der Name bewusst außen
 * vor: Besuchern gegenüber tritt das Festival als Absender auf.
 */
export async function getAnnouncementsWithAuthor(
  festivalId: string,
  limit: number
): Promise<AnnouncementWithAuthor[]> {
  const res = await query<AnnouncementRow & { author_name: string | null }>(
    `SELECT a.id, a.festival_id, a.title, a.body, a.created_at,
            u.name AS author_name
       FROM announcements a LEFT JOIN users u ON u.id = a.author_id
      WHERE a.festival_id = $1 OR a.festival_id IS NULL
      ORDER BY a.created_at DESC LIMIT $2`,
    [festivalId, limit]
  );
  return res.rows.map((r) => ({ ...toAnnouncement(r), authorName: r.author_name }));
}

/**
 * Mitteilung löschen – nur Mitteilungen DIESES Festivals. App-weite
 * Betreiber-Nachrichten (festival_id NULL) und fremde Festivals bleiben
 * damit tabu, egal was der Client schickt. false = nichts gelöscht.
 */
export async function deleteAnnouncement(
  festivalId: string,
  announcementId: string
): Promise<boolean> {
  const res = await query(
    'DELETE FROM announcements WHERE id = $1 AND festival_id = $2',
    [announcementId, festivalId]
  );
  if ((res.rowCount ?? 0) === 0) return false;
  await bumpRev();
  return true;
}

export interface ReminderTarget {
  userId: string;
  festivalId: string;
  slotId: string;
}

/**
 * Empfänger für Band-Erinnerungen: Nutzer mit Auswahl ('going' UND
 * 'interested' – beides sind explizite Favoriten in "Unsere Bands") auf
 * einem der Kandidaten-Slots, die mindestens ein Push-Abo haben.
 */
export async function getReminderCandidates(
  festivalId: string,
  slotIds: string[]
): Promise<ReminderTarget[]> {
  if (slotIds.length === 0) return [];
  const res = await query<{ user_id: string; slot_id: string }>(
    `SELECT DISTINCT s.user_id, s.slot_id
       FROM selections s
      WHERE s.festival_id = $1 AND s.slot_id = ANY($2)
        AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = s.user_id)`,
    [festivalId, slotIds]
  );
  return res.rows.map((r) => ({ userId: r.user_id, festivalId, slotId: r.slot_id }));
}

/**
 * Erinnerungen claimen: INSERT … ON CONFLICT DO NOTHING RETURNING gibt nur
 * die Paare zurück, die dieser Lauf als Erster eingetragen hat – parallele
 * Cron-Läufe senden dadurch nie doppelt.
 */
export async function claimReminders(targets: ReminderTarget[]): Promise<ReminderTarget[]> {
  if (targets.length === 0) return [];
  const res = await query<{ user_id: string; festival_id: string; slot_id: string }>(
    `INSERT INTO push_reminders_sent (user_id, festival_id, slot_id)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     ON CONFLICT DO NOTHING
     RETURNING user_id, festival_id, slot_id`,
    [
      targets.map((t) => t.userId),
      targets.map((t) => t.festivalId),
      targets.map((t) => t.slotId),
    ]
  );
  return res.rows.map((r) => ({
    userId: r.user_id,
    festivalId: r.festival_id,
    slotId: r.slot_id,
  }));
}

/* ------------------------------------------------------------------ */
/* Timetable-Bearbeitung (Veranstalter)                                */
/* ------------------------------------------------------------------ */

const MAX_DAYS = 30;
const MAX_STAGES = 40;
const MAX_SLOTS = 2000;

/** "HH:MM" mit Stunden 0–31 (>= 24 = nach Mitternacht, wie toMinutes) */
/**
 * IDs im dokumentierten Schema tag-buehne-bandslug: Umlaute ausschreiben,
 * alles andere zu '-' – einmal vergeben, nie wieder geändert (Auswahlen
 * und Positionen hängen an der Slot-ID).
 */
function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Jede Editor-Mutation stempelt die Datenversion neu (reine Anzeige) */
function editorDataVersion(): string {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `Stand ${now} UTC · Veranstalter-Editor`;
}

interface TimetableBody {
  days: FestivalDay[];
  stages: Stage[];
  slots: Slot[];
}

type TimetableEditError = { error: string; status?: number };

export type TimetableEditResult =
  | { ok: true; rev: number; timetable: Timetable; id?: string }
  | { ok: false; error: string; status: number };

/**
 * Kern der Timetable-Bearbeitung: liest den JSONB-Block der Festival-Zeile
 * unter FOR UPDATE (serialisiert parallele Edits), wendet `fn` an und
 * räumt in derselben Transaktion auf, was an entfernten Slots/Bühnen
 * hängt (Auswahlen, Positionen, Blueprints). Slot-IDs bleiben bei Edits
 * stabil – nur echtes Entfernen löscht Nutzerdaten.
 */
async function mutateTimetable(
  festivalId: string,
  fn: (t: TimetableBody) => TimetableBody | TimetableEditError,
  extra?: (client: PoolClient, next: TimetableBody) => Promise<void>
): Promise<TimetableEditResult> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<{
      name: string;
      edition: string;
      timetable: TimetableBody;
    }>(
      'SELECT name, edition, timetable FROM festivals WHERE id = $1 FOR UPDATE',
      [festivalId]
    );
    const row = res.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Unbekanntes Festival', status: 404 };
    }
    const current: TimetableBody = {
      days: row.timetable.days ?? [],
      stages: row.timetable.stages ?? [],
      slots: row.timetable.slots ?? [],
    };
    const applied = fn(current);
    if ('error' in applied) {
      await client.query('ROLLBACK');
      return { ok: false, error: applied.error, status: applied.status ?? 400 };
    }

    // Entfernte Slots: zugehörige Auswahlen + Positionsmarker mitlöschen
    const keptSlotIds = new Set(applied.slots.map((s) => s.id));
    const removedSlotIds = current.slots
      .filter((s) => !keptSlotIds.has(s.id))
      .map((s) => s.id);
    if (removedSlotIds.length > 0) {
      await client.query(
        'DELETE FROM selections WHERE festival_id = $1 AND slot_id = ANY($2)',
        [festivalId, removedSlotIds]
      );
      await client.query(
        'DELETE FROM positions WHERE festival_id = $1 AND slot_id = ANY($2)',
        [festivalId, removedSlotIds]
      );
    }
    // Entfernte Bühnen: ihren Blueprint mitlöschen
    const keptStageIds = new Set(applied.stages.map((s) => s.id));
    const removedStageIds = current.stages
      .filter((s) => !keptStageIds.has(s.id))
      .map((s) => s.id);
    if (removedStageIds.length > 0) {
      await client.query(
        'DELETE FROM blueprints WHERE festival_id = $1 AND stage_id = ANY($2)',
        [festivalId, removedStageIds]
      );
    }
    if (extra) await extra(client, applied);

    const dataVersion = editorDataVersion();
    await client.query(
      'UPDATE festivals SET timetable = $2, data_version = $3, updated_at = now() WHERE id = $1',
      [festivalId, JSON.stringify(applied), dataVersion]
    );
    await client.query('COMMIT');

    const timetable: Timetable = {
      festival: row.name,
      edition: row.edition,
      dataVersion,
      days: applied.days,
      stages: applied.stages,
      slots: applied.slots,
    };
    // Write-through: dieselbe Instanz sieht den neuen Stand sofort; andere
    // Instanzen konvergieren über die Cache-TTL + den Rev-Poll.
    timetableCache.set(festivalId, { at: Date.now(), value: timetable });
    const rev = await bumpRev();
    return { ok: true, rev, timetable };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Festival-Metadaten (Name, Edition) ändern */
export async function updateFestivalMeta(
  festivalId: string,
  patch: { name?: string; edition?: string }
): Promise<TimetableEditResult> {
  if (patch.name !== undefined && (patch.name.length < 1 || patch.name.length > 80)) {
    return { ok: false, error: 'Name muss 1–80 Zeichen lang sein', status: 400 };
  }
  if (patch.edition !== undefined && patch.edition.length > 120) {
    return { ok: false, error: 'Edition darf höchstens 120 Zeichen lang sein', status: 400 };
  }
  const sets: string[] = [];
  const params: unknown[] = [festivalId];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.edition !== undefined) {
    params.push(patch.edition);
    sets.push(`edition = $${params.length}`);
  }
  if (sets.length > 0) {
    const res = await query(
      `UPDATE festivals SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
      params
    );
    if ((res.rowCount ?? 0) === 0) {
      return { ok: false, error: 'Unbekanntes Festival', status: 404 };
    }
  }
  const timetable = await getTimetableFresh(festivalId);
  if (!timetable) {
    return { ok: false, error: 'Unbekanntes Festival', status: 404 };
  }
  const rev = await bumpRev();
  return { ok: true, rev, timetable };
}

export interface DayInput {
  id?: string;
  label: string;
  longLabel: string;
  date: string;
}

/** Festivaltag anlegen (ohne id) oder ändern; Tage bleiben nach Datum sortiert */
export async function upsertDay(
  festivalId: string,
  input: DayInput
): Promise<TimetableEditResult> {
  let resultId = input.id;
  const result = await mutateTimetable(festivalId, (t) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) {
      return { error: 'Datum muss im Format JJJJ-MM-TT vorliegen' };
    }
    if (input.label.length < 1 || input.label.length > 8) {
      return { error: 'Kurz-Label muss 1–8 Zeichen lang sein' };
    }
    if (input.longLabel.length < 1 || input.longLabel.length > 20) {
      return { error: 'Langes Label muss 1–20 Zeichen lang sein' };
    }
    let days: FestivalDay[];
    if (input.id) {
      if (!t.days.some((d) => d.id === input.id)) {
        return { error: 'Unbekannter Tag', status: 404 };
      }
      days = t.days.map((d) =>
        d.id === input.id
          ? { ...d, label: input.label, longLabel: input.longLabel, date: input.date }
          : d
      );
    } else {
      if (t.days.length >= MAX_DAYS) {
        return { error: `Höchstens ${MAX_DAYS} Tage möglich` };
      }
      const id = uniqueId(`d-${input.date}`, new Set(t.days.map((d) => d.id)));
      resultId = id;
      days = [...t.days, { id, label: input.label, longLabel: input.longLabel, date: input.date }];
    }
    days = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return { ...t, days };
  });
  return result.ok ? { ...result, id: resultId } : result;
}

/** Tag löschen – nimmt alle Slots des Tages (samt Nutzerdaten) mit */
export async function deleteDay(
  festivalId: string,
  dayId: string
): Promise<TimetableEditResult> {
  return mutateTimetable(festivalId, (t) => {
    if (!t.days.some((d) => d.id === dayId)) {
      return { error: 'Unbekannter Tag', status: 404 };
    }
    return {
      ...t,
      days: t.days.filter((d) => d.id !== dayId),
      slots: t.slots.filter((s) => s.dayId !== dayId),
    };
  });
}

export interface StageInput {
  id?: string;
  name: string;
  short: string;
  color: string;
}

/**
 * Bühne anlegen (ohne id) oder ändern. Beim Umbenennen wird die
 * Beschriftung eines vorhandenen Blueprints mitgezogen.
 */
export async function upsertStage(
  festivalId: string,
  input: StageInput
): Promise<TimetableEditResult> {
  let resultId = input.id;
  let renamedTo: string | null = null;
  const result = await mutateTimetable(
    festivalId,
    (t) => {
      if (input.name.length < 1 || input.name.length > 40) {
        return { error: 'Name muss 1–40 Zeichen lang sein' };
      }
      if (input.short.length < 1 || input.short.length > 5) {
        return { error: 'Kürzel muss 1–5 Zeichen lang sein' };
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
        return { error: 'Farbe muss ein Hex-Wert wie #ff5a17 sein' };
      }
      if (input.id) {
        const existing = t.stages.find((s) => s.id === input.id);
        if (!existing) return { error: 'Unbekannte Bühne', status: 404 };
        if (existing.name !== input.name) renamedTo = input.name;
        return {
          ...t,
          stages: t.stages.map((s) =>
            s.id === input.id
              ? { ...s, name: input.name, short: input.short, color: input.color }
              : s
          ),
        };
      }
      if (t.stages.length >= MAX_STAGES) {
        return { error: `Höchstens ${MAX_STAGES} Bühnen möglich` };
      }
      const id = uniqueId(slugify(input.name), new Set(t.stages.map((s) => s.id)));
      resultId = id;
      return {
        ...t,
        stages: [...t.stages, { id, name: input.name, short: input.short, color: input.color }],
      };
    },
    async (client) => {
      if (input.id && renamedTo) {
        await client.query(
          `UPDATE blueprints SET data = jsonb_set(data, '{stageLabel}', to_jsonb($3::text))
            WHERE festival_id = $1 AND stage_id = $2`,
          [festivalId, input.id, renamedTo]
        );
      }
    }
  );
  return result.ok ? { ...result, id: resultId } : result;
}

/** Bühne löschen – nimmt ihre Slots (samt Nutzerdaten) und ihren Blueprint mit */
export async function deleteStage(
  festivalId: string,
  stageId: string
): Promise<TimetableEditResult> {
  return mutateTimetable(festivalId, (t) => {
    if (!t.stages.some((s) => s.id === stageId)) {
      return { error: 'Unbekannte Bühne', status: 404 };
    }
    return {
      ...t,
      stages: t.stages.filter((s) => s.id !== stageId),
      slots: t.slots.filter((s) => s.stageId !== stageId),
    };
  });
}

export interface SlotInput {
  id?: string;
  dayId: string;
  stageId: string;
  band: string;
  start: string;
  end: string;
  confirmed: boolean;
  spotifyArtistId?: string;
}

/**
 * Slot anlegen (ohne id) oder ändern – die Slot-ID bleibt bei Edits stabil.
 * Bei Edits kommt der vorherige Stand als `previous` zurück, damit die
 * Slot-Route erkennen kann, ob sich Zeit/Tag/Bühne geändert haben (und die
 * eingetragenen Besucher darüber pushen kann).
 */
export async function upsertSlot(
  festivalId: string,
  input: SlotInput
): Promise<TimetableEditResult & { previous?: Slot }> {
  let resultId = input.id;
  let previous: Slot | undefined;
  const result = await mutateTimetable(festivalId, (t) => {
    const band = input.band.trim();
    if (band.length < 1 || band.length > 80) {
      return { error: 'Bandname muss 1–80 Zeichen lang sein' };
    }
    if (!t.days.some((d) => d.id === input.dayId)) {
      return { error: 'Unbekannter Tag' };
    }
    if (!t.stages.some((s) => s.id === input.stageId)) {
      return { error: 'Unbekannte Bühne' };
    }
    if (!isValidTime(input.start) || !isValidTime(input.end)) {
      return { error: 'Zeiten bitte als HH:MM angeben (nach Mitternacht z. B. 25:30)' };
    }
    if (toMinutes(input.end) <= toMinutes(input.start)) {
      return { error: 'Ende muss nach dem Beginn liegen' };
    }
    if (
      input.spotifyArtistId !== undefined &&
      !/^[A-Za-z0-9]{1,40}$/.test(input.spotifyArtistId)
    ) {
      return { error: 'Ungültige Spotify-Artist-ID' };
    }
    const patch: Omit<Slot, 'id'> = {
      dayId: input.dayId,
      stageId: input.stageId,
      band,
      start: input.start,
      end: input.end,
      confirmed: input.confirmed,
      ...(input.spotifyArtistId ? { spotifyArtistId: input.spotifyArtistId } : {}),
    };
    if (input.id) {
      const existing = t.slots.find((s) => s.id === input.id);
      if (!existing) {
        return { error: 'Unbekannter Slot', status: 404 };
      }
      previous = existing;
      return {
        ...t,
        slots: t.slots.map((s) => (s.id === input.id ? { id: s.id, ...patch } : s)),
      };
    }
    if (t.slots.length >= MAX_SLOTS) {
      return { error: `Höchstens ${MAX_SLOTS} Slots möglich` };
    }
    const id = uniqueId(
      `${input.dayId}-${input.stageId}-${slugify(band)}`,
      new Set(t.slots.map((s) => s.id))
    );
    resultId = id;
    return { ...t, slots: [...t.slots, { id, ...patch }] };
  });
  return result.ok ? { ...result, id: resultId, previous } : result;
}

/** Slot löschen – Auswahlen/Positionen dazu werden mitgelöscht */
export async function deleteSlot(
  festivalId: string,
  slotId: string
): Promise<TimetableEditResult> {
  return mutateTimetable(festivalId, (t) => {
    if (!t.slots.some((s) => s.id === slotId)) {
      return { error: 'Unbekannter Slot', status: 404 };
    }
    return { ...t, slots: t.slots.filter((s) => s.id !== slotId) };
  });
}

/* ------------------------------------------------------------------ */
/* Blueprints (Veranstalter)                                           */
/* ------------------------------------------------------------------ */

/** Blueprint einer Bühne komplett ersetzen (Veranstalter). */
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

/* ------------------------------------------------------------------ */
/* Installationen (PWA auf dem Home-Screen)                            */
/* ------------------------------------------------------------------ */

/** Grobe Plattform-Klasse aus dem User-Agent – mehr braucht die Statistik nicht. */
export const INSTALL_PLATFORMS = ['ios', 'android', 'desktop', 'other'] as const;
export type InstallPlatform = (typeof INSTALL_PLATFORMS)[number];

/**
 * Lebenszeichen einer Installation (max. alle paar Stunden pro Gerät).
 * Idempotenter Upsert auf die install_id:
 *  - `standalone` = wie die App DIESES Mal gestartet wurde,
 *  - `installed_at` merkt sich den ERSTEN Home-Screen-Start,
 *  - `last_standalone_at` den letzten – das ist die Zahl, aus der die
 *    Statistik "noch installiert" ableitet.
 * Ein Browser-Start überschreibt `last_standalone_at` bewusst NICHT:
 * unter Android teilen sich Tab und installierte App denselben Storage,
 * dieselbe Installation meldet sich also mal so, mal so.
 */
export async function recordInstallPing(
  installId: string,
  standalone: boolean,
  platform: InstallPlatform,
  userId: string | null
): Promise<void> {
  await query(
    `INSERT INTO app_installs
       (install_id, user_id, platform, standalone, installed_at, last_standalone_at)
     VALUES ($1, $2, $3, $4::boolean,
             CASE WHEN $4::boolean THEN now() END,
             CASE WHEN $4::boolean THEN now() END)
     ON CONFLICT (install_id) DO UPDATE SET
       user_id    = COALESCE(EXCLUDED.user_id, app_installs.user_id),
       platform   = EXCLUDED.platform,
       standalone = EXCLUDED.standalone,
       last_seen_at = now(),
       installed_at = CASE WHEN EXCLUDED.standalone
                           THEN COALESCE(app_installs.installed_at, now())
                           ELSE app_installs.installed_at END,
       last_standalone_at = CASE WHEN EXCLUDED.standalone
                                 THEN now()
                                 ELSE app_installs.last_standalone_at END`,
    [installId, userId, platform, standalone]
  );
}
