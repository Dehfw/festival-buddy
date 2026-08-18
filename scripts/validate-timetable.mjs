/**
 * Prüft eine Timetable-Importdatei gegen dieselben Regeln, die auch
 * `upsertDay`/`upsertStage`/`upsertSlot` in src/lib/db.ts durchsetzen –
 * bevor sie in die Datenbank geht.
 *
 *   node scripts/validate-timetable.mjs data/pellmell2026.json
 *   node scripts/validate-timetable.mjs data/sb2026.json --against data/sb2026.alt.json
 *   DATABASE_URL=... node scripts/validate-timetable.mjs data/sb2026.json --festival sb2026
 *
 * Der Vergleich (--against / --festival) ist der wichtigste Teil bei einem
 * Re-Import: An den Slot-IDs hängen alle Teilnahmen und Positionsmarker der
 * Crews. Verschwindet eine ID, verlieren die Leute ihre Eintragung – das
 * Script zeigt genau, welche.
 *
 * Exit-Code 1 bei Fehlern, 0 bei nur Warnungen (Warnungen sind Hinweise,
 * keine Blocker – z. B. Überschneidungen auf derselben Bühne).
 */
import './env.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_DAYS = 30;
const MAX_STAGES = 40;
const MAX_SLOTS = 2000;

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/* ---------- aus src/lib/types.ts bzw. db.ts gespiegelt ---------- */

function isValidTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return false;
  return Number(m[1]) <= 31 && Number(m[2]) <= 59;
}

/** Stunden vor 08:00 gelten als Sets nach Mitternacht (01:00 -> 25:00) */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h < 8 ? h + 24 : h) * 60 + m;
}

function slugify(input) {
  const slug = String(input)
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

/* ---------- Argumente ---------- */

function parseArgs(argv) {
  const args = { file: null, against: null, festival: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--against') args.against = argv[++i];
    else if (argv[i] === '--festival') args.festival = argv[++i];
    else if (!argv[i].startsWith('--')) args.file ??= argv[i];
  }
  return args;
}

const { file, against, festival } = parseArgs(process.argv.slice(2));
if (!file) {
  console.error('Aufruf: node scripts/validate-timetable.mjs <datei.json> [--against alt.json] [--festival <id>]');
  process.exit(2);
}

const filePath = path.resolve(file);
let timetable;
try {
  timetable = JSON.parse(await readFile(filePath, 'utf8'));
} catch (e) {
  console.error(`✗ ${filePath} nicht lesbar/kein gültiges JSON: ${e.message}`);
  process.exit(1);
}

/* ---------- Kopf ---------- */

for (const key of ['festival', 'edition']) {
  if (typeof timetable[key] !== 'string' || !timetable[key].trim()) {
    err(`Feld "${key}" fehlt oder ist leer (Anzeigename bzw. Untertitel des Festivals)`);
  }
}
if (typeof timetable.dataVersion !== 'string' || !timetable.dataVersion.trim()) {
  warn('Feld "dataVersion" fehlt – die App zeigt damit den Stand der Daten an (z. B. "2026-07-16 (Running Order laut Plakat)")');
}
for (const key of ['days', 'stages', 'slots']) {
  if (!Array.isArray(timetable[key])) {
    err(`Feld "${key}" fehlt oder ist kein Array`);
  }
}
if (errors.length > 0) report();

const { days, stages, slots } = timetable;

/* ---------- Tage ---------- */

if (days.length === 0) err('Keine Tage – ohne Tage kann die App nichts anzeigen');
if (days.length > MAX_DAYS) err(`${days.length} Tage, erlaubt sind höchstens ${MAX_DAYS}`);

const dayIds = new Set();
const dayDates = new Map();
for (const [i, d] of days.entries()) {
  const at = `days[${i}]${d?.id ? ` (${d.id})` : ''}`;
  if (typeof d?.id !== 'string' || !d.id) err(`${at}: "id" fehlt`);
  else if (dayIds.has(d.id)) err(`${at}: Tag-ID doppelt`);
  else dayIds.add(d.id);
  if (typeof d?.label !== 'string' || d.label.length < 1 || d.label.length > 8) {
    err(`${at}: "label" muss 1–8 Zeichen haben (Kurzform wie "Fr")`);
  }
  if (typeof d?.longLabel !== 'string' || d.longLabel.length < 1 || d.longLabel.length > 20) {
    err(`${at}: "longLabel" muss 1–20 Zeichen haben (z. B. "Freitag")`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.date ?? '') || Number.isNaN(Date.parse(d.date))) {
    err(`${at}: "date" muss ein gültiges Datum im Format JJJJ-MM-TT sein`);
  } else if (dayDates.has(d.date)) {
    err(`${at}: Datum ${d.date} kommt schon in ${dayDates.get(d.date)} vor`);
  } else {
    dayDates.set(d.date, at);
  }
}

const sortedDates = days.map((d) => d.date).filter(Boolean);
if (sortedDates.join() !== [...sortedDates].sort().join()) {
  warn('Tage sind nicht chronologisch sortiert – die App sortiert selbst, gelesen wird die Datei aber leichter mit Sortierung');
}

/* ---------- Bühnen ---------- */

if (stages.length === 0) warn('Keine Bühnen – das Festival ist damit gründbar, zeigt aber "Lineup folgt"');
if (stages.length > MAX_STAGES) err(`${stages.length} Bühnen, erlaubt sind höchstens ${MAX_STAGES}`);

const stageIds = new Set();
for (const [i, s] of stages.entries()) {
  const at = `stages[${i}]${s?.id ? ` (${s.id})` : ''}`;
  if (typeof s?.id !== 'string' || !s.id) err(`${at}: "id" fehlt`);
  else if (stageIds.has(s.id)) err(`${at}: Bühnen-ID doppelt`);
  else stageIds.add(s.id);
  if (typeof s?.name !== 'string' || s.name.length < 1 || s.name.length > 40) {
    err(`${at}: "name" muss 1–40 Zeichen haben`);
  }
  if (typeof s?.short !== 'string' || s.short.length < 1 || s.short.length > 5) {
    err(`${at}: "short" muss 1–5 Zeichen haben (Kürzel im Timetable-Grid)`);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s?.color ?? '')) {
    err(`${at}: "color" muss ein Hex-Wert wie #ff5a17 sein`);
  }
}

/* ---------- Slots ---------- */

if (slots.length > MAX_SLOTS) err(`${slots.length} Slots, erlaubt sind höchstens ${MAX_SLOTS}`);

const slotIds = new Set();
const perStageDay = new Map();
for (const [i, s] of slots.entries()) {
  const at = `slots[${i}]${s?.id ? ` (${s.id})` : ''}`;
  if (typeof s?.id !== 'string' || !s.id) err(`${at}: "id" fehlt`);
  else if (slotIds.has(s.id)) err(`${at}: Slot-ID doppelt – IDs müssen pro Festival eindeutig sein`);
  else slotIds.add(s.id);

  if (typeof s?.band !== 'string' || s.band.trim().length < 1 || s.band.length > 80) {
    err(`${at}: "band" muss 1–80 Zeichen haben`);
  } else if (s.band !== s.band.trim()) {
    warn(`${at}: "band" hat führende/anhängende Leerzeichen`);
  }
  if (!dayIds.has(s?.dayId)) err(`${at}: unbekannter "dayId" ${JSON.stringify(s?.dayId)}`);
  if (!stageIds.has(s?.stageId)) err(`${at}: unbekannter "stageId" ${JSON.stringify(s?.stageId)}`);
  if (typeof s?.confirmed !== 'boolean') {
    err(`${at}: "confirmed" fehlt (true = bestätigt, false = Zeit noch vorläufig)`);
  }
  if (s?.spotifyArtistId !== undefined && !/^[A-Za-z0-9]{1,40}$/.test(s.spotifyArtistId)) {
    err(`${at}: "spotifyArtistId" muss die reine Spotify-ID sein (keine URL)`);
  }

  const timesOk = isValidTime(s?.start) && isValidTime(s?.end);
  if (!timesOk) {
    err(`${at}: "start"/"end" bitte als HH:MM (nach Mitternacht z. B. 25:30)`);
  } else {
    const from = toMinutes(s.start);
    const to = toMinutes(s.end);
    if (to <= from) err(`${at}: Ende (${s.end}) muss nach dem Beginn (${s.start}) liegen`);
    else {
      const mins = to - from;
      if (mins < 10) warn(`${at}: nur ${mins} Minuten Spielzeit – Tippfehler?`);
      if (mins > 240) warn(`${at}: ${Math.round(mins / 60)} Stunden Spielzeit – Tippfehler?`);
    }
    if (dayIds.has(s?.dayId) && stageIds.has(s?.stageId)) {
      const key = `${s.dayId}|${s.stageId}`;
      if (!perStageDay.has(key)) perStageDay.set(key, []);
      perStageDay.get(key).push({ ...s, from, to });
    }
  }

  // Namenskonvention der IDs: tag-buehne-bandslug (+ -2, -3 bei Kollision,
  // gekürzte Slugs sind ok – der Wacken-Import schneidet bei 48 Zeichen ab).
  // Neue IDs sollten dem Muster folgen, damit ein späterer Re-Import mit
  // demselben Generator dieselben IDs trifft.
  if (typeof s?.id === 'string' && typeof s?.band === 'string' && s.dayId && s.stageId) {
    const prefix = `${s.dayId}-${s.stageId}-`;
    const expected = slugify(s.band);
    const actual = s.id.startsWith(prefix) ? s.id.slice(prefix.length).replace(/-\d+$/, '') : null;
    if (actual === null || !expected.startsWith(actual)) {
      warn(`${at}: ID folgt nicht dem Muster tag-buehne-bandslug (erwartet "${prefix}${expected}")`);
    }
  }
}

for (const [key, list] of perStageDay) {
  const sorted = [...list].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from < sorted[i - 1].to) {
      const [dayId, stageId] = key.split('|');
      warn(
        `${dayId}/${stageId}: "${sorted[i - 1].band}" (${sorted[i - 1].start}–${sorted[i - 1].end}) und ` +
          `"${sorted[i].band}" (${sorted[i].start}–${sorted[i].end}) überschneiden sich`
      );
    }
  }
}

/* ---------- Vergleich mit dem bisherigen Stand ---------- */

let previous = null;
if (against) {
  try {
    previous = JSON.parse(await readFile(path.resolve(against), 'utf8'));
  } catch (e) {
    err(`--against ${against} nicht lesbar: ${e.message}`);
  }
} else if (festival) {
  previous = await loadFromDb(festival);
}

if (previous?.slots) {
  const before = new Map(previous.slots.map((s) => [s.id, s]));
  const after = new Map(slots.filter((s) => s.id).map((s) => [s.id, s]));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const moved = [...after.values()].filter((s) => {
    const old = before.get(s.id);
    return old && (old.start !== s.start || old.end !== s.end || old.dayId !== s.dayId || old.stageId !== s.stageId);
  });

  console.log(`\n→ Vergleich mit dem bisherigen Stand (${before.size} Slots):`);
  console.log(`  ${after.size - added.length} unverändert erkannt, ${added.length} neu, ${removed.length} entfallen, ${moved.length} verschoben`);
  if (removed.length > 0) {
    warn(
      `${removed.length} Slot-IDs verschwinden – daran hängende Teilnahmen und Positionsmarker gehen verloren. ` +
        'Wenn die Bands weiter spielen, liegt es meist an einer geänderten Schreibweise, Tag- oder Bühnen-ID.'
    );
    for (const id of removed.slice(0, 20)) console.log(`    − ${id} (${before.get(id).band})`);
    if (removed.length > 20) console.log(`    … und ${removed.length - 20} weitere`);
  }
  for (const s of moved.slice(0, 20)) {
    const old = before.get(s.id);
    console.log(`    ~ ${s.id}: ${old.dayId}/${old.stageId} ${old.start}–${old.end} → ${s.dayId}/${s.stageId} ${s.start}–${s.end}`);
  }
}

report();

/* ---------- Ausgabe ---------- */

function report() {
  console.log(`\n${path.relative(process.cwd(), filePath)}: ${slots?.length ?? 0} Slots auf ${stages?.length ?? 0} Bühnen und ${days?.length ?? 0} Tagen`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  if (errors.length === 0 && warnings.length === 0) console.log('  ✓ alles in Ordnung');
  else if (errors.length === 0) console.log(`  ✓ importierbar (${warnings.length} Warnung(en) – bitte kurz prüfen)`);
  else console.log(`  ✗ ${errors.length} Fehler – so nicht importierbar`);
  process.exit(errors.length > 0 ? 1 : 0);
}

/** Bisherigen Stand aus der DB holen (gleiche sslmode-Logik wie import-festival.mjs) */
async function loadFromDb(festivalId) {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) {
    warn('--festival gesetzt, aber DATABASE_URL fehlt – Vergleich mit dem Live-Stand übersprungen');
    return null;
  }
  const pg = (await import('pg')).default;
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
    const res = await client.query('SELECT timetable FROM festivals WHERE id = $1', [festivalId]);
    if ((res.rowCount ?? 0) === 0) {
      console.log(`\n→ Festival "${festivalId}" existiert noch nicht – der Import legt es an.`);
      return null;
    }
    return res.rows[0].timetable;
  } finally {
    await client.end();
  }
}
