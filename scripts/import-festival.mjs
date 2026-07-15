/**
 * Importiert einen Timetable (App-Format: { festival, edition, dataVersion,
 * days, stages, slots }) in die festivals-Tabelle der Datenbank – UPSERT,
 * ersetzt also immer den kompletten Stand. Seit die Timetables in der DB
 * liegen, braucht ein Lineup-Update KEINEN Redeploy mehr.
 *
 *   DATABASE_URL=... node scripts/import-festival.mjs --festival woa2026
 *   DATABASE_URL=... node scripts/import-festival.mjs --festival sb2026 pfad/sb.json
 *
 * Ohne Pfad wird data/timetable.json gelesen (der Output von `npm run
 * import`, also dem Wacken-Parser). Für andere Festivals eine Datei im
 * selben Format übergeben – Slot-IDs müssen stabil bleiben
 * (tag-buehne-bandslug), damit bestehende Auswahlen erhalten bleiben.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

function parseArgs(argv) {
  const args = { festival: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
    else if (!argv[i].startsWith('--')) args.file = argv[i];
  }
  return args;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const { festival, file } = parseArgs(process.argv.slice(2));
if (!festival || !/^[a-z0-9-]{2,40}$/.test(festival)) {
  fail('Bitte --festival <id> angeben (z. B. --festival woa2026)');
}
const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) fail('DATABASE_URL ist nicht gesetzt');

const filePath = path.resolve(file ?? path.join('data', 'timetable.json'));
const timetable = JSON.parse(await readFile(filePath, 'utf8'));

for (const key of ['days', 'stages', 'slots']) {
  if (!Array.isArray(timetable[key])) fail(`${filePath}: Feld "${key}" fehlt/kein Array`);
}
if (typeof timetable.festival !== 'string' || typeof timetable.edition !== 'string') {
  fail(`${filePath}: Felder "festival"/"edition" fehlen`);
}

// sslmode aus der URL in eine pg-SSL-Config übersetzen (wie in src/lib/db.ts)
let connectionString = raw;
let ssl;
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
  // Socket-Pfad o. Ä. – unverändert lassen
}

const client = new pg.Client({ connectionString, ssl });
await client.connect();
try {
  // Frische DB (App noch nie gestartet): Tabelle sicherstellen
  await client.query(`
    CREATE TABLE IF NOT EXISTS festivals (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      edition      TEXT NOT NULL,
      data_version TEXT NOT NULL DEFAULT '',
      timetable    JSONB NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query(
    `INSERT INTO festivals (id, name, edition, data_version, timetable)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       edition = EXCLUDED.edition,
       data_version = EXCLUDED.data_version,
       timetable = EXCLUDED.timetable,
       updated_at = now()`,
    [
      festival,
      timetable.festival,
      timetable.edition,
      timetable.dataVersion ?? '',
      JSON.stringify({
        days: timetable.days,
        stages: timetable.stages,
        slots: timetable.slots,
      }),
    ]
  );
  // Clients sollen den neuen Stand beim nächsten Poll ziehen
  await client.query(`CREATE SEQUENCE IF NOT EXISTS db_rev START 1`);
  await client.query(`SELECT nextval('db_rev')`);
  console.log(
    `✓ ${festival}: ${timetable.slots.length} Slots auf ${timetable.stages.length} Bühnen ` +
      `und ${timetable.days.length} Tagen importiert (${timetable.dataVersion ?? 'ohne Version'})`
  );
} finally {
  await client.end();
}
