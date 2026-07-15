/**
 * Importiert die Summer-Breeze-Running-Order (summerbreeze-runningorder.json,
 * abgetippt aus dem offiziellen Runningorder-PDF) nach data/timetable.json.
 *
 *   npm run import:sb                     # liest ./summerbreeze-runningorder.json
 *   npm run import:sb -- pfad/datei.json  # anderer Pfad
 *
 * Achtung: überschreibt data/timetable.json und stellt die App damit auf
 * Summer Breeze um (nach Deploy). Zurück zu Wacken: npm run import.
 *
 * Zeiten stehen in der Quelldatei wie im PDF (Sets nach Mitternacht als
 * 00:xx/01:xx/02:xx); Stunden vor 08:00 gehören zum Vortag und werden wie
 * beim Wacken-Import als Stunden >= 24 gespeichert (01:00 -> "25:00").
 *
 * Slot-IDs: tag-buehne-bandslug -> stabil über Re-Importe, bestehende
 * Band-Auswahlen der Crew bleiben erhalten. Die Wacken-IDs kollidieren
 * nicht (andere Bühnen-IDs), alte Auswahlen bleiben in der DB einfach
 * liegen und stören nicht.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_FILE = process.argv[2] ?? 'summerbreeze-runningorder.json';
const TIMETABLE_FILE = path.join(process.cwd(), 'data', 'timetable.json');

/** Bühnen in Anzeige-Reihenfolge; Schlüssel wie in der Quelldatei */
const STAGE_DEFS = {
  main: { id: 'main', name: 'Main Stage', short: 'MAIN', color: '#e63946' },
  tstage: { id: 'tstage', name: 'T-Stage', short: 'T-ST', color: '#f77f00' },
  toolrebel: { id: 'toolrebel', name: 'Tool Rebel Stage', short: 'TRS', color: '#9d4edd' },
  circus: { id: 'circus', name: 'Campsite Circus Stage', short: 'CCS', color: '#2a9d8f' },
};
const STAGE_ORDER = Object.keys(STAGE_DEFS);

const DAY_NAMES = [
  { id: 'sun', label: 'So', longLabel: 'Sonntag' },
  { id: 'mon', label: 'Mo', longLabel: 'Montag' },
  { id: 'tue', label: 'Di', longLabel: 'Dienstag' },
  { id: 'wed', label: 'Mi', longLabel: 'Mittwoch' },
  { id: 'thu', label: 'Do', longLabel: 'Donnerstag' },
  { id: 'fri', label: 'Fr', longLabel: 'Freitag' },
  { id: 'sat', label: 'Sa', longLabel: 'Samstag' },
];

function two(n) {
  return String(n).padStart(2, '0');
}

/**
 * "HH:MM" aus dem PDF -> App-Format: Stunden vor 08:00 sind Sets nach
 * Mitternacht und zählen zum Festivaltag davor ("01:30" -> "25:30").
 */
function festivalTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Ungültige Zeit: "${hhmm}"`);
  const h = Number(m[1]);
  return h < 8 ? `${two(h + 24)}:${m[2]}` : `${two(h)}:${m[2]}`;
}

/** Minuten seit 00:00 des Festivaltags (für Plausibilitätschecks) */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // â, é, … -> a, e
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function main() {
  const source = JSON.parse(await readFile(SOURCE_FILE, 'utf8'));
  console.log(`→ ${source.festival} aus ${SOURCE_FILE}`);

  // Tage aus der Quelldatei, chronologisch
  const days = [...source.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const weekday = new Date(`${d.date}T12:00:00Z`).getUTCDay();
      const names = DAY_NAMES[weekday];
      return { id: names.id, label: names.label, longLabel: names.longLabel, date: d.date };
    });

  const dayIdByDate = new Map(days.map((d) => [d.date, d.id]));

  // Bühnen: nur die, die Slots haben, in definierter Reihenfolge
  const usedStages = new Set(source.days.flatMap((d) => Object.keys(d.slots)));
  for (const key of usedStages) {
    if (!STAGE_DEFS[key]) {
      console.error(`Unbekannte Bühne "${key}" in ${SOURCE_FILE} – erlaubt: ${STAGE_ORDER.join(', ')}`);
      process.exit(1);
    }
  }
  const stages = STAGE_ORDER.filter((k) => usedStages.has(k)).map((k) => STAGE_DEFS[k]);

  const seen = new Set();
  const slots = [];
  let warnings = 0;

  for (const day of source.days) {
    const dayId = dayIdByDate.get(day.date);
    for (const stageKey of STAGE_ORDER) {
      const entries = day.slots[stageKey] ?? [];
      let prevEnd = null;
      for (const [rawStart, rawEnd, band] of entries) {
        const start = festivalTime(rawStart);
        const end = festivalTime(rawEnd);
        if (toMinutes(end) <= toMinutes(start)) {
          console.warn(`⚠ ${day.date} ${stageKey}: "${band}" endet nicht nach dem Start (${start}–${end})`);
          warnings++;
        }
        if (prevEnd !== null && toMinutes(start) < prevEnd) {
          console.warn(`⚠ ${day.date} ${stageKey}: "${band}" überlappt den vorherigen Slot`);
          warnings++;
        }
        prevEnd = toMinutes(end);

        let id = `${dayId}-${stageKey}-${slugify(band)}`;
        while (seen.has(id)) id += '-2';
        seen.add(id);
        slots.push({ id, dayId, stageId: stageKey, band, start, end, confirmed: true });
      }
    }
  }

  if (slots.length < 100) {
    console.error(`Nur ${slots.length} Slots gefunden – das sieht falsch aus, Abbruch.`);
    process.exit(1);
  }

  slots.sort(
    (a, b) =>
      a.dayId.localeCompare(b.dayId) ||
      a.stageId.localeCompare(b.stageId) ||
      a.start.localeCompare(b.start)
  );

  const timetable = {
    festival: source.festival,
    edition: source.edition,
    dataVersion: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} (${source.source ?? SOURCE_FILE})`,
    days,
    stages,
    slots,
  };

  await writeFile(TIMETABLE_FILE, JSON.stringify(timetable, null, 2), 'utf8');

  console.log(`✓ ${slots.length} Slots auf ${stages.length} Bühnen und ${days.length} Tage geschrieben`);
  console.log(`  Tage: ${days.map((d) => `${d.label} ${d.date.slice(8)}.`).join(', ')}`);
  if (warnings > 0) console.log(`  ${warnings} Warnung(en) – bitte Quelldatei prüfen`);
  console.log('→ Neu bauen/deployen, damit die neuen Daten ausgeliefert werden.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
