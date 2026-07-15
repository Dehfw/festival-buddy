/**
 * Konvertiert eine einfache Running-Order-Datei ins App-Timetable-Format,
 * das `scripts/import-festival.mjs` (npm run import:db) in die Datenbank
 * schreibt. Gedacht für Festivals ohne offiziellen Datenexport (z. B.
 * Summer Breeze): Running Order abtippen/exportieren, konvertieren,
 * importieren – kein Redeploy nötig.
 *
 *   node scripts/convert-runningorder.mjs eingabe.json [ausgabe.json]
 *   node scripts/convert-runningorder.mjs sb.json --name "Summer Breeze Open Air 2026" --edition "12.–15.08.2026 · Dinkelsbühl"
 *
 * Ohne Ausgabepfad wird neben die Eingabe geschrieben (*.timetable.json).
 * Danach:  DATABASE_URL=... npm run import:db -- --festival sb2026 ausgabe.json
 *
 * Eingabeformat:
 *
 *   {
 *     "festival": "Summer Breeze Open Air 2026",   // oder --name
 *     "edition": "12.–15.08.2026 · Dinkelsbühl",   // oder --edition
 *     "stages": [ { "id", "name", "short", "color" }, ... ],  // optional
 *     "days": [
 *       {
 *         "date": "2026-08-13",
 *         "slots": {
 *           "main": [ ["12:00", "12:40", "Our Promise"], ... ],
 *           "tstage": [ ... ]
 *         }
 *       }
 *     ]
 *   }
 *
 * Die Keys unter "slots" sind die Bühnen-IDs. Für die Summer-Breeze-Keys
 * (main, tstage, toolrebel, circus) gibt es eingebaute Bühnen-Definitionen;
 * andere Keys bekommen automatisch Name/Farbe (per "stages" übersteuerbar).
 *
 * Zeiten: Slots nach Mitternacht gehören zum Festivaltag, unter dem sie
 * stehen, und werden wie beim Wacken-Import auf Stunden >= 24 normalisiert
 * (01:00 -> "25:00"; alles vor 08:00 zählt als "nach Mitternacht").
 *
 * Slot-IDs (tag-buehne-bandslug) sind stabil über Re-Importe, bestehende
 * Band-Auswahlen der Crew bleiben also erhalten.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Bekannte Bühnen-Keys -> Definition (Summer Breeze Open Air) */
const KNOWN_STAGES = {
  main: { id: 'main', name: 'Main Stage', short: 'MAIN', color: '#e63946' },
  tstage: { id: 'tstage', name: 'T Stage', short: 'TST', color: '#f77f00' },
  toolrebel: { id: 'toolrebel', name: 'Wera Tool Rebel Stage', short: 'WTR', color: '#2a9d8f' },
  circus: { id: 'circus', name: 'Camel Circus', short: 'CIR', color: '#9d4edd' },
};

/** Farben für Bühnen ohne Definition, in Vergabe-Reihenfolge */
const FALLBACK_COLORS = ['#fcbf49', '#06b6d4', '#ec4899', '#84cc16', '#60a5fa', '#a97142'];

const DAY_NAMES = [
  { id: 'sun', label: 'So', longLabel: 'Sonntag' },
  { id: 'mon', label: 'Mo', longLabel: 'Montag' },
  { id: 'tue', label: 'Di', longLabel: 'Dienstag' },
  { id: 'wed', label: 'Mi', longLabel: 'Mittwoch' },
  { id: 'thu', label: 'Do', longLabel: 'Donnerstag' },
  { id: 'fri', label: 'Fr', longLabel: 'Freitag' },
  { id: 'sat', label: 'Sa', longLabel: 'Samstag' },
];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { files: [], name: null, edition: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') args.name = argv[++i];
    else if (argv[i] === '--edition') args.edition = argv[++i];
    else if (argv[i].startsWith('--')) fail(`Unbekannte Option: ${argv[i]}`);
    else args.files.push(argv[i]);
  }
  return args;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function two(n) {
  return String(n).padStart(2, '0');
}

/** "HH:MM" prüfen und nach Mitternacht (vor 08:00) auf Stunden >= 24 heben */
function normalizeTime(hhmm, context) {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) {
    fail(`${context}: ungültige Zeit "${hhmm}" (erwartet "HH:MM")`);
  }
  const [h, m] = hhmm.split(':').map(Number);
  if (m > 59 || h > 31) fail(`${context}: ungültige Zeit "${hhmm}"`);
  const hours = h < 8 ? h + 24 : h;
  return `${two(hours)}:${two(m)}`;
}

async function main() {
  const { files, name, edition } = parseArgs(process.argv.slice(2));
  if (files.length < 1 || files.length > 2) {
    fail('Aufruf: node scripts/convert-runningorder.mjs eingabe.json [ausgabe.json] [--name ...] [--edition ...]');
  }
  const inputFile = path.resolve(files[0]);
  const outputFile = path.resolve(
    files[1] ?? inputFile.replace(/(\.json)?$/i, '.timetable.json')
  );
  if (outputFile === inputFile) fail('Ausgabedatei wäre gleich der Eingabedatei');

  const input = JSON.parse(await readFile(inputFile, 'utf8'));

  const festival = name ?? input.festival;
  const editionText = edition ?? input.edition;
  if (typeof festival !== 'string' || !festival.trim()) {
    fail('Festival-Name fehlt: "festival" in der Datei setzen oder --name übergeben');
  }
  if (typeof editionText !== 'string' || !editionText.trim()) {
    fail('Edition fehlt: "edition" in der Datei setzen oder --edition übergeben (z. B. "12.–15.08.2026 · Dinkelsbühl")');
  }
  if (!Array.isArray(input.days) || input.days.length === 0) {
    fail('Feld "days" fehlt oder ist leer');
  }

  // Bühnen-Definitionen: Datei > eingebaute Summer-Breeze-Keys > generiert
  const stageDefs = new Map(Object.entries(KNOWN_STAGES));
  if (input.stages !== undefined) {
    if (!Array.isArray(input.stages)) fail('Feld "stages" muss ein Array sein');
    for (const s of input.stages) {
      if (!s?.id || !s?.name) fail(`Bühne ohne id/name in "stages": ${JSON.stringify(s)}`);
      stageDefs.set(s.id, {
        id: s.id,
        name: s.name,
        short: s.short ?? s.name.slice(0, 3).toUpperCase(),
        color: s.color ?? FALLBACK_COLORS[stageDefs.size % FALLBACK_COLORS.length],
      });
    }
  }

  // Tage: IDs aus dem Wochentag (wed, thu, ...) wie beim Wacken-Import
  const days = [];
  const usedDayIds = new Set();
  for (const day of input.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.date ?? '')) {
      fail(`Tag ohne gültiges "date" (YYYY-MM-DD): ${JSON.stringify(day?.date)}`);
    }
    const names = DAY_NAMES[new Date(`${day.date}T12:00:00Z`).getUTCDay()];
    if (usedDayIds.has(names.id)) {
      fail(`Wochentag ${names.longLabel} kommt doppelt vor (${day.date}) – mehr als 7 Tage werden nicht unterstützt`);
    }
    usedDayIds.add(names.id);
    days.push({ id: names.id, label: names.label, longLabel: names.longLabel, date: day.date });
  }

  // Slots einsammeln; Bühnen-Reihenfolge = erstes Auftreten in der Datei
  const stages = [];
  const seenStageIds = new Set();
  const seenSlotIds = new Set();
  const slots = [];
  const generatedStages = [];

  for (const [i, day] of input.days.entries()) {
    const dayId = days[i].id;
    if (typeof day.slots !== 'object' || day.slots === null || Array.isArray(day.slots)) {
      fail(`${day.date}: Feld "slots" fehlt oder ist kein Objekt`);
    }
    for (const [stageKey, entries] of Object.entries(day.slots)) {
      if (!seenStageIds.has(stageKey)) {
        seenStageIds.add(stageKey);
        let def = stageDefs.get(stageKey);
        if (!def) {
          def = {
            id: stageKey,
            name: stageKey.charAt(0).toUpperCase() + stageKey.slice(1),
            short: stageKey.slice(0, 3).toUpperCase(),
            color: FALLBACK_COLORS[generatedStages.length % FALLBACK_COLORS.length],
          };
          generatedStages.push(stageKey);
        }
        stages.push(def);
      }
      if (!Array.isArray(entries)) fail(`${day.date}/${stageKey}: Slots müssen ein Array sein`);
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 3) {
          fail(`${day.date}/${stageKey}: Slot muss ["Start", "Ende", "Band"] sein, war ${JSON.stringify(entry)}`);
        }
        const [rawStart, rawEnd, band] = entry;
        if (typeof band !== 'string' || !band.trim()) {
          fail(`${day.date}/${stageKey}: Bandname fehlt in ${JSON.stringify(entry)}`);
        }
        const context = `${day.date}/${stageKey}/${band}`;
        const start = normalizeTime(rawStart, context);
        const end = normalizeTime(rawEnd, context);
        if (end <= start) fail(`${context}: Ende ${rawEnd} liegt nicht nach Start ${rawStart}`);

        let id = `${dayId}-${stageKey}-${slugify(band)}`;
        while (seenSlotIds.has(id)) id += '-2';
        seenSlotIds.add(id);
        slots.push({ id, dayId, stageId: stageKey, band: band.trim(), start, end, confirmed: true });
      }
    }
  }

  slots.sort(
    (a, b) =>
      a.dayId.localeCompare(b.dayId) ||
      a.stageId.localeCompare(b.stageId) ||
      a.start.localeCompare(b.start)
  );

  const timetable = {
    festival: festival.trim(),
    edition: editionText.trim(),
    dataVersion: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} (Running-Order, ${path.basename(inputFile)})`,
    days,
    stages,
    slots,
  };

  await writeFile(outputFile, JSON.stringify(timetable, null, 2), 'utf8');

  console.log(`✓ ${slots.length} Slots auf ${stages.length} Bühnen und ${days.length} Tagen -> ${path.relative(process.cwd(), outputFile)}`);
  console.log(`  Tage: ${days.map((d) => `${d.label} ${d.date.slice(8)}.`).join(', ')}`);
  for (const s of stages) {
    console.log(`  ${s.name}: ${slots.filter((x) => x.stageId === s.id).length} Slots`);
  }
  if (generatedStages.length > 0) {
    console.log(`  Hinweis: Bühnen ohne Definition, Name/Farbe generiert: ${generatedStages.join(', ')}`);
    console.log('  (per "stages"-Array in der Eingabedatei übersteuerbar)');
  }
  console.log('→ In die Datenbank importieren mit z. B.:');
  console.log(`  DATABASE_URL=... npm run import:db -- --festival sb2026 ${path.relative(process.cwd(), outputFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
