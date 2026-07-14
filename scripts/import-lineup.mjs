/**
 * Importiert den offiziellen W:O:A-Datenexport (wackenlineup.json)
 * nach data/timetable.json – inklusive Spotify-Artist-IDs.
 *
 *   npm run import                     # liest ./wackenlineup.json
 *   npm run import -- pfad/datei.json  # anderer Pfad
 *
 * Die Datei enthält auch Alt-Events früherer Jahre und Epoch-0-Müll,
 * daher wird strikt aufs 2026-Zeitfenster gefiltert. Meet-&-Greet-Termine
 * werden übersprungen (die App plant Konzerte). Zeiten werden nach
 * Europe/Berlin konvertiert; Sets nach Mitternacht (vor 08:00) gehören
 * zum Vortag und bekommen Stunden >= 24 (01:00 -> "25:00").
 *
 * Slot-IDs: tag-buehne-bandslug -> stabil über Re-Importe, bestehende
 * Band-Auswahlen der Crew bleiben erhalten.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LINEUP_FILE = process.argv[2] ?? 'wackenlineup.json';
const TIMETABLE_FILE = path.join(process.cwd(), 'data', 'timetable.json');

/** Zeitfenster: Warm-up-Sonntag bis Sonntagmorgen nach dem Finale */
const WINDOW_START = Date.UTC(2026, 6, 25);
const WINDOW_END = Date.UTC(2026, 7, 3);

/** Bühnen in Anzeige-Reihenfolge; title-Muster -> Stage-Definition */
const STAGE_DEFS = [
  { match: /^faster/i, id: 'faster', name: 'Faster', short: 'FAS', color: '#e63946' },
  { match: /^harder/i, id: 'harder', name: 'Harder', short: 'HAR', color: '#f77f00' },
  { match: /^louder/i, id: 'louder', name: 'Louder', short: 'LOU', color: '#fcbf49' },
  { match: /w[:.]?\s?e[:.]?\s?t/i, id: 'wet', name: 'W:E:T Stage', short: 'WET', color: '#06b6d4' },
  { match: /headbanger/i, id: 'headbanger', name: 'Headbangers Stage', short: 'HDB', color: '#9d4edd' },
  { match: /wackinger/i, id: 'wackinger', name: 'Wackinger Stage', short: 'WCK', color: '#2a9d8f' },
  { match: /wasteland/i, id: 'wasteland', name: 'Wasteland Stage', short: 'WLD', color: '#a97142' },
  { match: /jungle/i, id: 'jungle', name: 'Welcome To The Jungle', short: 'WTJ', color: '#84cc16' },
  { match: /clubstage/i, id: 'clubstage', name: 'LGH Clubstage', short: 'LGH', color: '#ec4899' },
  { match: /beergarden|biergarten/i, id: 'beergarden', name: 'Beergarden Stage', short: 'BGA', color: '#fbbf24' },
  { match: /metal church/i, id: 'metalchurch', name: 'Metal Church', short: 'MCH', color: '#60a5fa' },
];

const DAY_NAMES = [
  { id: 'sun', label: 'So', longLabel: 'Sonntag' },
  { id: 'mon', label: 'Mo', longLabel: 'Montag' },
  { id: 'tue', label: 'Di', longLabel: 'Dienstag' },
  { id: 'wed', label: 'Mi', longLabel: 'Mittwoch' },
  { id: 'thu', label: 'Do', longLabel: 'Donnerstag' },
  { id: 'fri', label: 'Fr', longLabel: 'Freitag' },
  { id: 'sat', label: 'Sa', longLabel: 'Samstag' },
];

const dtf = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Epoch-Sekunden -> { date: "YYYY-MM-DD", h, m } in Europe/Berlin */
function berlin(ts) {
  const s = dtf.format(new Date(Number(ts) * 1000)); // "2026-07-27 16:00"
  return { date: s.slice(0, 10), h: Number(s.slice(11, 13)), m: Number(s.slice(14, 16)) };
}

/** ISO-Datum um n Tage verschieben (rein kalendarisch) */
function shiftDate(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function two(n) {
  return String(n).padStart(2, '0');
}

/** Event-Zeit -> { day: "YYYY-MM-DD", hhmm } mit Nach-Mitternacht-Regel */
function festivalTime(ts) {
  const { date, h, m } = berlin(ts);
  if (h < 8) return { day: shiftDate(date, -1), hhmm: `${two(h + 24)}:${two(m)}` };
  return { day: date, hhmm: `${two(h)}:${two(m)}` };
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function main() {
  const lineup = JSON.parse(await readFile(LINEUP_FILE, 'utf8'));
  console.log(`→ ${lineup.length} Artists aus ${LINEUP_FILE}`);

  const rawSlots = [];
  const skippedStages = new Map();
  let outOfWindow = 0;
  let meetAndGreet = 0;
  let withSpotify = 0;

  for (const entry of lineup) {
    const artist = entry.artist;
    if (!artist?.title) continue;
    const spotify =
      typeof entry.spotifyartist === 'string' && entry.spotifyartist.trim()
        ? entry.spotifyartist.trim()
        : null;

    for (const ev of artist.events ?? []) {
      const t = Number(ev.start) * 1000;
      if (!ev.start || Number.isNaN(t) || t < WINDOW_START || t > WINDOW_END) {
        outOfWindow++;
        continue;
      }
      const stageTitle = ev.stage?.title ?? '';
      if (/meet & greet/i.test(stageTitle) || /meet & greet/i.test(ev.performance?.title ?? '')) {
        meetAndGreet++;
        continue;
      }
      const stage = STAGE_DEFS.find((s) => s.match.test(stageTitle));
      if (!stage) {
        skippedStages.set(stageTitle, (skippedStages.get(stageTitle) ?? 0) + 1);
        continue;
      }

      const start = festivalTime(ev.start);
      let end = ev.end && !Number.isNaN(Number(ev.end)) ? festivalTime(ev.end) : null;
      if (!end || end.day !== start.day) {
        end = { day: start.day, hhmm: festivalTime(Number(ev.start) + 45 * 60).hhmm };
      }

      if (spotify) withSpotify++;
      rawSlots.push({
        date: start.day,
        stage,
        band: artist.title,
        start: start.hhmm,
        end: end.hhmm,
        spotify,
      });
    }
  }

  if (rawSlots.length < 100) {
    console.error(`Nur ${rawSlots.length} Slots gefunden – das sieht falsch aus, Abbruch.`);
    process.exit(1);
  }

  // Tage aus den tatsächlich vorkommenden Daten bauen
  const dates = [...new Set(rawSlots.map((s) => s.date))].sort();
  const days = dates.map((date) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const names = DAY_NAMES[weekday];
    return { id: names.id, label: names.label, longLabel: names.longLabel, date };
  });

  // Bühnen: nur die, die Slots haben, in definierter Reihenfolge
  const usedStageIds = new Set(rawSlots.map((s) => s.stage.id));
  const stages = STAGE_DEFS.filter((s) => usedStageIds.has(s.id)).map(
    ({ id, name, short, color }) => ({ id, name, short, color })
  );

  const dayIdByDate = new Map(days.map((d) => [d.date, d.id]));
  const seen = new Set();
  const slots = rawSlots
    .map((s) => {
      const dayId = dayIdByDate.get(s.date);
      let id = `${dayId}-${s.stage.id}-${slugify(s.band)}`;
      while (seen.has(id)) id += '-2';
      seen.add(id);
      return {
        id,
        dayId,
        stageId: s.stage.id,
        band: s.band,
        start: s.start,
        end: s.end,
        confirmed: true,
        ...(s.spotify ? { spotifyArtistId: s.spotify } : {}),
      };
    })
    .sort(
      (a, b) =>
        a.dayId.localeCompare(b.dayId) ||
        a.stageId.localeCompare(b.stageId) ||
        a.start.localeCompare(b.start)
    );

  const timetable = {
    festival: 'Wacken Open Air 2026',
    edition: '35. W:O:A – 29.07.–01.08.2026 (Warm-up ab 26.07.)',
    dataVersion: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} (offizieller W:O:A-Export, wackenlineup.json)`,
    days,
    stages,
    slots,
  };

  await writeFile(TIMETABLE_FILE, JSON.stringify(timetable, null, 2), 'utf8');

  console.log(`✓ ${slots.length} Slots auf ${stages.length} Bühnen und ${days.length} Tage geschrieben`);
  console.log(`  davon ${withSpotify} mit Spotify-Artist-ID`);
  console.log(`  Tage: ${days.map((d) => `${d.label} ${d.date.slice(8)}.`).join(', ')}`);
  console.log(`  übersprungen: ${outOfWindow} außerhalb 2026, ${meetAndGreet} Meet & Greet`);
  if (skippedStages.size > 0) {
    console.log('  unbekannte Bühnen:');
    for (const [name, count] of skippedStages) console.log(`    - ${name || '(leer)'} (${count}×)`);
  }
  console.log('→ Server neu starten, damit die neuen Daten ausgeliefert werden.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
