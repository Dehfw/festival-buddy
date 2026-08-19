/**
 * Baut aus einer kompakten Running-Order-Textdatei die Importdatei im
 * App-Timetable-Format. Der Text ist so knapp, dass man ihn direkt von
 * einem Plakat oder aus einer Website abtippen kann; alles Fehleranfällige
 * (Slot-IDs, Slugs, Tages-Labels, Sortierung) macht das Script.
 *
 *   node scripts/build-timetable.mjs lineups/pellmell2026.txt --festival pellmell2026
 *   node scripts/build-timetable.mjs lineups/sb2026.txt -o data/sb2026.json
 *
 * Ohne -o landet das Ergebnis in data/<festival>.json.
 *
 * Format der Eingabedatei (# = Kommentar, Leerzeilen egal):
 *
 *   festival: Pell-Mell Festival 2026
 *   edition: 04.–06.09.2026 · Hillesheim
 *   dataVersion: 2026-07-16 (Running Order laut Plakat)
 *
 *   stage: sparkasse | Sparkasse-Bitburger Stage | SBS | #f77f00
 *   day: fri | 2026-09-04
 *
 *   [fri/sparkasse]
 *   14:45-15:30 Palebloom
 *   23:15-00:30 Raised Fist | spotify=4mAkrfR2Y8L4tRPLYvKB6z
 *   19:00-20:00 Special Guest | unbestaetigt
 *   18:00-19:00 Neuer Bandname | id=fri-sparkasse-alter-bandname
 *
 *   [announced]
 *   Amon Amarth | spotify=6vg9BW5gHSjidGbypXQku2
 *   Sabaton
 *
 * Zeiten nach Mitternacht dürfen als 00:30 oder als 24:30 stehen – die App
 * rechnet Stunden vor 08:00 automatisch dem Vortag zu.
 *
 * Der Abschnitt [announced] ist für Bands, die zwar bestätigt sind, aber
 * noch keine Spielzeit haben – der Normalfall im Winter. Sie landen im
 * Feld `bands` der Importdatei und füllen in der App die Lineup-Ansicht,
 * lange bevor es einen Timetable gibt.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const WEEKDAYS = [
  { label: 'So', longLabel: 'Sonntag' },
  { label: 'Mo', longLabel: 'Montag' },
  { label: 'Di', longLabel: 'Dienstag' },
  { label: 'Mi', longLabel: 'Mittwoch' },
  { label: 'Do', longLabel: 'Donnerstag' },
  { label: 'Fr', longLabel: 'Freitag' },
  { label: 'Sa', longLabel: 'Samstag' },
];

function fail(msg, line) {
  console.error(`✗ ${line ? `Zeile ${line}: ` : ''}${msg}`);
  process.exit(1);
}

/** identisch zu slugify() in src/lib/db.ts – die IDs müssen zusammenpassen */
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

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h < 8 ? h + 24 : h) * 60 + m;
}

function parseArgs(argv) {
  const args = { file: null, festival: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
    else if (argv[i] === '-o' || argv[i] === '--out') args.out = argv[++i];
    else if (!argv[i].startsWith('-')) args.file ??= argv[i];
  }
  return args;
}

const { file, festival, out } = parseArgs(process.argv.slice(2));
if (!file) {
  console.error('Aufruf: node scripts/build-timetable.mjs <running-order.txt> [--festival <id>] [-o data/<id>.json]');
  process.exit(2);
}
if (!out && !festival) fail('Bitte --festival <id> oder -o <pfad> angeben');

const outPath = path.resolve(out ?? path.join('data', `${festival}.json`));
const source = await readFile(path.resolve(file), 'utf8');

const meta = {};
const stages = [];
const days = [];
const rawSlots = [];
/** Bands aus [announced] – announced, aber (noch) ohne Slot */
const announced = [];
let current = null;

const lines = source.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const lineNo = i + 1;
  // Kommentare nur am Zeilenanfang – mitten in der Zeile wäre "#" nicht von
  // einer Bühnenfarbe wie #f77f00 zu unterscheiden.
  const line = lines[i].trim();
  if (!line || line.startsWith('#')) continue;

  if (/^\[announced\]$/i.test(line)) {
    current = { announced: true };
    continue;
  }

  const section = /^\[([^\]/]+)\/([^\]]+)\]$/.exec(line);
  if (section) {
    current = { dayId: section[1].trim(), stageId: section[2].trim() };
    continue;
  }

  const kv = /^(festival|edition|dataVersion|stage|day)\s*:\s*(.+)$/i.exec(line);
  if (kv) {
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();
    if (key === 'stage') {
      const [id, name, short, color] = value.split('|').map((p) => p.trim());
      if (!id || !name || !short || !color) {
        fail('stage: <id> | <Name> | <Kürzel> | <#farbe>', lineNo);
      }
      stages.push({ id, name, short, color });
    } else if (key === 'day') {
      const [id, date, label, longLabel] = value.split('|').map((p) => p?.trim());
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
        fail('day: <id> | JJJJ-MM-TT [| Kurz | Lang]', lineNo);
      }
      const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
      days.push({
        id,
        label: label || weekday.label,
        longLabel: longLabel || weekday.longLabel,
        date,
      });
    } else {
      meta[key === 'dataversion' ? 'dataVersion' : key] = value;
    }
    continue;
  }

  if (current?.announced) {
    const parts = line.split('|').map((p) => p.trim());
    const band = parts.shift();
    if (!band) fail('Bandname fehlt', lineNo);
    const entry = { band, lineNo };
    for (const opt of parts) {
      const [key, value] = opt.split('=').map((p) => p.trim());
      if (key === 'spotify') entry.spotifyArtistId = value;
      else fail(`unbekannte Option "${opt}" – im [announced]-Block gibt es nur spotify=`, lineNo);
    }
    announced.push(entry);
    continue;
  }

  const slot = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s+(.+)$/.exec(line);
  if (!slot) fail(`unverständlich: "${line}"`, lineNo);
  if (!current) fail('Slot ohne vorangehenden Abschnitt [tag/buehne] oder [announced]', lineNo);

  const [, start, end, rest] = slot;
  const parts = rest.split('|').map((p) => p.trim());
  const band = parts.shift();
  if (!band) fail('Bandname fehlt', lineNo);

  const entry = { ...current, band, start, end, confirmed: true, lineNo };
  for (const opt of parts) {
    const [key, value] = opt.split('=').map((p) => p.trim());
    if (/^unbest(ae|ä)tigt$/i.test(key) || /^tba$/i.test(key)) entry.confirmed = false;
    else if (key === 'spotify') entry.spotifyArtistId = value;
    else if (key === 'id') entry.id = value;
    else fail(`unbekannte Option "${opt}"`, lineNo);
  }
  rawSlots.push(entry);
}

for (const key of ['festival', 'edition']) {
  if (!meta[key]) fail(`Kopfzeile "${key}:" fehlt`);
}
if (days.length === 0) fail('keine "day:"-Zeile gefunden');
if (rawSlots.length === 0 && stages.length === 0) {
  console.log(
    announced.length > 0
      ? `→ Keine Bühnen/Slots – ${announced.length} angekündigte Bands ohne Timetable (Lineup-Ansicht)`
      : '→ Keine Bühnen/Slots – es entsteht ein Gerüst ("Lineup folgt")'
  );
}

const dayIndex = new Map(days.map((d, i) => [d.id, i]));
const stageIndex = new Map(stages.map((s, i) => [s.id, i]));
for (const s of rawSlots) {
  if (!dayIndex.has(s.dayId)) fail(`unbekannter Tag "${s.dayId}" – fehlt eine "day:"-Zeile?`, s.lineNo);
  if (!stageIndex.has(s.stageId)) fail(`unbekannte Bühne "${s.stageId}" – fehlt eine "stage:"-Zeile?`, s.lineNo);
}

days.sort((a, b) => a.date.localeCompare(b.date));
dayIndex.clear();
days.forEach((d, i) => dayIndex.set(d.id, i));

// Erst sortieren, dann IDs vergeben: so hängt ein eventuelles "-2"-Suffix
// bei zwei gleichnamigen Sets an der Reihenfolge im Timetable und nicht an
// der Reihenfolge in der Textdatei – das bleibt über Re-Importe stabil.
rawSlots.sort(
  (a, b) =>
    dayIndex.get(a.dayId) - dayIndex.get(b.dayId) ||
    stageIndex.get(a.stageId) - stageIndex.get(b.stageId) ||
    toMinutes(a.start) - toMinutes(b.start) ||
    a.band.localeCompare(b.band)
);

// Explizit gesetzte IDs sind vorab belegt, damit ein automatisch erzeugter
// Slug ihnen nicht in die Quere kommt.
const taken = new Set(rawSlots.filter((s) => s.id).map((s) => s.id));
const slots = rawSlots.map((s) => {
  const id = s.id ?? uniqueId(`${s.dayId}-${s.stageId}-${slugify(s.band)}`, taken);
  taken.add(id);
  return {
    id,
    dayId: s.dayId,
    stageId: s.stageId,
    band: s.band,
    start: s.start,
    end: s.end,
    confirmed: s.confirmed,
    ...(s.spotifyArtistId ? { spotifyArtistId: s.spotifyArtistId } : {}),
  };
});

/**
 * Der Band-Pool der Lineup-Ansicht: erst die angekündigten Bands, dann jede
 * Band aus dem Timetable, die noch nicht dabei ist. Beide Quellen stehen
 * in der Datei, damit sie ohne die App lesbar bleibt; die App mischt beim
 * Lesen noch einmal (mergeBands in src/lib/db.ts), falls im
 * Veranstalter-Editor später Slots dazukommen.
 */
const bandsBySlug = new Map();
for (const entry of [...announced, ...slots.map((s) => ({ band: s.band, spotifyArtistId: s.spotifyArtistId }))]) {
  const slug = slugify(entry.band);
  const existing = bandsBySlug.get(slug);
  if (!existing) {
    bandsBySlug.set(slug, {
      slug,
      name: entry.band,
      ...(entry.spotifyArtistId ? { spotifyArtistId: entry.spotifyArtistId } : {}),
    });
  } else if (!existing.spotifyArtistId && entry.spotifyArtistId) {
    existing.spotifyArtistId = entry.spotifyArtistId;
  }
}
const bands = [...bandsBySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));

const timetable = {
  festival: meta.festival,
  edition: meta.edition,
  dataVersion: meta.dataVersion ?? '',
  days,
  stages,
  slots,
  bands,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(timetable, null, 2)}\n`, 'utf8');

const unconfirmed = slots.filter((s) => !s.confirmed).length;
console.log(`✓ ${path.relative(process.cwd(), outPath)}: ${slots.length} Slots auf ${stages.length} Bühnen und ${days.length} Tagen`);
if (unconfirmed > 0) console.log(`  ${unconfirmed} davon als unbestätigt markiert`);
const withoutSlot = bands.filter((b) => !slots.some((s) => slugify(s.band) === b.slug)).length;
console.log(
  `  ${bands.length} Bands im Lineup${withoutSlot > 0 ? `, davon ${withoutSlot} noch ohne Spielzeit` : ''}`
);
if (!process.env.LINEUP_PIPELINE)
  console.log(`→ Jetzt prüfen: node scripts/validate-timetable.mjs ${path.relative(process.cwd(), outPath)}${festival ? ` --festival ${festival}` : ''}`);
