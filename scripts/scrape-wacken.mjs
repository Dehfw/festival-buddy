/**
 * Scraper für die offizielle W:O:A-Running-Order von wacken.com.
 *
 * Nutzung:
 *   npm run scrape                      # holt die Running-Order-Seite live
 *   npm run scrape -- --from-file ro.html   # parst eine lokal gespeicherte Seite
 *
 * Die Seite bettet die Termine als JSON-LD (schema.org "Event") bzw. als
 * Inline-JSON ein; das Skript versucht mehrere Strategien und schreibt das
 * Ergebnis nach data/timetable.json. Bestehende Slot-IDs bleiben stabil
 * (day-stage-bandslug), damit eingetragene Band-Auswahlen weiter passen.
 *
 * Hinweis: wacken.com sitzt hinter einem Bot-Schutz. Wenn der Live-Abruf
 * mit 403 scheitert, die Seite im Browser öffnen, komplett speichern
 * (Strg+S) und mit --from-file parsen.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TIMETABLE_FILE = path.join(process.cwd(), 'data', 'timetable.json');

const SOURCES = [
  'https://www.wacken.com/de/programm/running-order-musik/',
  'https://www.wacken.com/en/line-up/running-order-music/',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Bühnennamen der Website -> unsere Stage-IDs */
const STAGE_MAP = [
  [/faster/i, 'faster'],
  [/harder/i, 'harder'],
  [/louder/i, 'louder'],
  [/w\.?e\.?t\.?/i, 'wet'],
  [/headbanger/i, 'headbanger'],
  [/wackinger/i, 'wackinger'],
  [/wasteland/i, 'wasteland'],
  [/beergarden|biergarten/i, 'beergarden'],
];

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function stageIdFor(name) {
  for (const [re, id] of STAGE_MAP) if (re.test(name)) return id;
  return null;
}

/**
 * Zeit -> "HH:MM" relativ zum Festivaltag. Sets nach Mitternacht (vor 08:00)
 * gehören zum Vortag und bekommen Stunden >= 24.
 */
function relTime(date, dayDate) {
  const h = date.getHours();
  const m = date.getMinutes();
  const belongsToPrevDay = h < 8;
  const eventDay = new Date(date);
  if (belongsToPrevDay) eventDay.setDate(eventDay.getDate() - 1);
  const iso = eventDay.toISOString
    ? `${eventDay.getFullYear()}-${String(eventDay.getMonth() + 1).padStart(2, '0')}-${String(eventDay.getDate()).padStart(2, '0')}`
    : '';
  if (iso !== dayDate) return null;
  const hours = belongsToPrevDay ? h + 24 : h;
  return `${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Alle <script type="application/ld+json">-Blöcke einsammeln */
function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]);
      out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      /* kaputtes JSON überspringen */
    }
  }
  return out;
}

/** Fallback: eingebettete JSON-Objekte mit typischen Running-Order-Feldern */
function extractInlineEvents(html) {
  const events = [];
  // Muster wie {"artist":"...","stage":"...","start":"...","end":"..."}
  const re = /\{[^{}]*?"(?:artist|band|title|name)"\s*:\s*"([^"]+)"[^{}]*?"(?:stage|location)"\s*:\s*"([^"]+)"[^{}]*?"(?:start|begin|startDate)"\s*:\s*"([^"]+)"[^{}]*?(?:"(?:end|endDate)"\s*:\s*"([^"]+)")?[^{}]*\}/g;
  let m;
  while ((m = re.exec(html))) {
    events.push({ name: m[1], stage: m[2], start: m[3], end: m[4] });
  }
  return events;
}

function normalizeJsonLd(blocks) {
  const events = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const type = node['@type'];
    if (type === 'Event' || type === 'MusicEvent' || (Array.isArray(type) && type.includes('MusicEvent'))) {
      events.push({
        name: node.name ?? node.performer?.name,
        stage: node.location?.name ?? node.location,
        start: node.startDate,
        end: node.endDate,
      });
    }
    Object.values(node).forEach(walk);
  };
  blocks.forEach(walk);
  return events;
}

async function main() {
  const fromFileIdx = process.argv.indexOf('--from-file');
  let html = null;

  if (fromFileIdx !== -1) {
    const file = process.argv[fromFileIdx + 1];
    if (!file) throw new Error('--from-file braucht einen Dateipfad');
    html = await readFile(file, 'utf8');
    console.log(`→ Parse lokale Datei: ${file}`);
  } else {
    for (const url of SOURCES) {
      console.log(`→ Hole ${url} …`);
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'text/html' },
        });
        if (res.ok) {
          html = await res.text();
          break;
        }
        console.warn(`  ✗ HTTP ${res.status}`);
      } catch (err) {
        console.warn(`  ✗ ${err.message}`);
      }
    }
    if (!html) {
      console.error(
        '\nKonnte wacken.com nicht abrufen (Bot-Schutz/Netz?).\n' +
          'Workaround: Running-Order-Seite im Browser öffnen, speichern und\n' +
          '  npm run scrape -- --from-file gespeicherte-seite.html\n'
      );
      process.exit(1);
    }
  }

  let raw = normalizeJsonLd(extractJsonLd(html));
  if (raw.length === 0) raw = extractInlineEvents(html);
  raw = raw.filter((e) => e.name && e.stage && e.start);
  console.log(`→ ${raw.length} Events gefunden`);
  if (raw.length === 0) {
    console.error(
      'Keine Event-Daten in der Seite gefunden – Struktur hat sich evtl. geändert.\n' +
        'data/timetable.json kann auch von Hand gepflegt werden (Format siehe Datei).'
    );
    process.exit(1);
  }

  const timetable = JSON.parse(await readFile(TIMETABLE_FILE, 'utf8'));
  const slots = [];
  const skipped = [];

  for (const ev of raw) {
    const stageId = stageIdFor(String(ev.stage));
    const start = new Date(ev.start);
    if (!stageId || Number.isNaN(start.getTime())) {
      skipped.push(ev);
      continue;
    }
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 45 * 60000);

    let matched = false;
    for (const day of timetable.days) {
      const s = relTime(start, day.date);
      if (s === null) continue;
      const e = relTime(end, day.date) ?? s;
      slots.push({
        id: `${day.id}-${stageId}-${slugify(ev.name)}`,
        dayId: day.id,
        stageId,
        band: ev.name,
        start: s,
        end: e,
        confirmed: true,
      });
      matched = true;
      break;
    }
    if (!matched) skipped.push(ev);
  }

  if (slots.length === 0) {
    console.error('Events gefunden, aber keiner passte auf die Festivaltage – Abbruch.');
    process.exit(1);
  }

  // Duplikate (gleiche ID) entfernen
  const seen = new Set();
  timetable.slots = slots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  timetable.dataVersion = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} (offiziell von wacken.com)`;

  await writeFile(TIMETABLE_FILE, JSON.stringify(timetable, null, 2), 'utf8');
  console.log(`✓ ${timetable.slots.length} Slots nach data/timetable.json geschrieben`);
  if (skipped.length > 0) {
    console.log(`  (${skipped.length} Events übersprungen – unbekannte Bühne/Zeit)`);
  }
  console.log('→ Server neu starten, damit die neuen Daten ausgeliefert werden.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
