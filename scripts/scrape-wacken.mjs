/**
 * Scraper für die W:O:A-2026-Running-Order.
 *
 * Nutzung:
 *   npm run scrape                                # wacken.com, Fallback: Clashfinder
 *   npm run scrape -- --source clashfinder        # direkt den Clashfinder-Export holen
 *   npm run scrape -- --from-file seite.html      # lokal gespeicherte Seite parsen
 *   npm run scrape -- --url https://…             # andere Seite parsen
 *   npm run scrape -- --debug                     # HTML speichern + Diagnose ausgeben
 *   npm run scrape -- --dry-run                   # nur anzeigen, nichts schreiben
 *
 * Strategie (in dieser Reihenfolge):
 *   1. wacken.com-Seite laden und Events extrahieren:
 *      JSON-LD, eingebettete JSON-Blobs in <script>-Tags (balancierte Klammern),
 *      generische Event-Heuristik über alle gefundenen JSON-Strukturen.
 *   2. Die Running Order wird client-seitig nachgeladen? Dann alle in
 *      HTML/JS referenzierten JSON/API-URLs entdecken und durchsuchen.
 *   3. Fallback: Clashfinder-Export (clashfinder.com/m/woa2026) – ein
 *      community-gepflegter Spiegel der offiziellen Running Order.
 *
 * Slot-IDs bleiben stabil (tag-buehne-bandslug), damit bestehende
 * Band-Auswahlen der Crew erhalten bleiben.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMETABLE_FILE = path.join(process.cwd(), 'data', 'timetable.json');
const DEBUG_HTML_FILE = path.join(process.cwd(), 'data', 'scrape-debug.html');

const WACKEN_SOURCES = [
  'https://www.wacken.com/de/programm/running-order-musik/',
  'https://www.wacken.com/en/line-up/running-order-music/',
];
const CLASHFINDER_SOURCES = [
  'https://clashfinder.com/data/event/woa2026.json',
  'https://clashfinder.com/data/event/wacken2026.json',
  'https://clashfinder.com/data/event/woa26.json',
];

/** Mindestanzahl Events, damit eine Quelle als "gefunden" gilt */
const MIN_EVENTS = 20;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Bühnennamen (beliebige Schreibweise) -> unsere Stage-IDs */
const STAGE_MAP = [
  [/faster/i, 'faster'],
  [/harder/i, 'harder'],
  [/louder/i, 'louder'],
  [/w\.?\s?e\.?\s?t\.?/i, 'wet'],
  [/headbanger/i, 'headbanger'],
  [/wackinger/i, 'wackinger'],
  [/wasteland/i, 'wasteland'],
  [/beergarden|biergarten|beer\s?garden/i, 'beergarden'],
];

export function stageIdFor(name) {
  for (const [re, id] of STAGE_MAP) if (re.test(String(name))) return id;
  return null;
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/* ------------------------------------------------------------------ */
/* Generische Event-Heuristik über beliebige JSON-Strukturen           */
/* ------------------------------------------------------------------ */

const NAME_KEYS = ['name', 'title', 'artist', 'act', 'band', 'label'];
const START_KEYS = ['start', 'startDate', 'start_date', 'startTime', 'start_time', 'begin', 'from', 'datetime', 'date_from'];
const END_KEYS = ['end', 'endDate', 'end_date', 'endTime', 'end_time', 'until', 'to', 'date_to'];
const STAGE_KEYS = ['stage', 'location', 'area', 'venue', 'room', 'locationName', 'stage_name'];

function firstString(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim()) {
      return v.name.trim();
    }
  }
  return null;
}

function parseDateish(s) {
  if (typeof s !== 'string') return null;
  // "2026-07-29 16:00" | ISO | "29.07.2026 16:00"
  let d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})/);
  if (m) {
    d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Läuft rekursiv über eine JSON-Struktur und sammelt alles, was wie ein
 * Running-Order-Event aussieht: Objekt mit Band-Name + parsbarer Startzeit.
 * Der Bühnenname kommt aus dem Event selbst oder – wie z. B. beim
 * Clashfinder-Format { locations: [{ name, events: [...] }] } – aus dem
 * umgebenden Objekt (ctxStage).
 */
export function collectEvents(node, ctxStage, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 24) return;
  if (Array.isArray(node)) {
    for (const item of node) collectEvents(item, ctxStage, out, depth + 1);
    return;
  }

  const name = firstString(node, NAME_KEYS);
  const startRaw = firstString(node, START_KEYS);
  const start = startRaw ? parseDateish(startRaw) : null;

  if (name && start && name.length >= 2 && name.length <= 80) {
    const endRaw = firstString(node, END_KEYS);
    out.push({
      name,
      stage: firstString(node, STAGE_KEYS) ?? ctxStage ?? null,
      start,
      end: endRaw ? parseDateish(endRaw) : null,
    });
  }

  // Der Name dieses Objekts dient als Bühnen-Kontext für darunterliegende
  // Event-Arrays (Clashfinder-Format: locations[{name, events}]). Auch
  // unbekannte Namen weiterreichen – dann taucht z. B. eine neue neunte
  // Bühne namentlich im Übersprungen-Report auf.
  const ownLabel = firstString(node, ['name', 'title', 'stage']);
  const nextCtx = ownLabel ?? ctxStage;

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      collectEvents(value, nextCtx, out, depth + 1);
    }
  }
}

/* ------------------------------------------------------------------ */
/* JSON aus HTML herausziehen                                          */
/* ------------------------------------------------------------------ */

/** Balancierten JSON-Block ab startIdx extrahieren (string-aware) */
export function extractBalanced(str, startIdx) {
  const open = str[startIdx];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < str.length && i < startIdx + 3_000_000; i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  return null;
}

/** Alle <script>-Inhalte (ohne src, ohne JSON-LD – das läuft separat) */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

/** JSON-Kandidaten in einem Script-Body finden und parsen */
export function jsonBlobsFromScript(body, limit = 20) {
  const blobs = [];
  // Ansatzpunkte: {"key": …  oder  [{"key": …
  const re = /[[{]\s*\{?\s*"[^"]+"\s*:/g;
  let m;
  let count = 0;
  const seenIdx = new Set();
  while ((m = re.exec(body)) && count < limit) {
    const idx = m.index;
    if (seenIdx.has(idx)) continue;
    const raw = extractBalanced(body, idx);
    if (!raw) continue;
    try {
      blobs.push(JSON.parse(raw));
      count++;
      // Innerhalb des geparsten Blocks nicht weiter suchen
      re.lastIndex = idx + raw.length;
      seenIdx.add(idx);
    } catch {
      /* kein valides JSON – weiter */
    }
  }
  return blobs;
}

export function eventsFromHtml(html) {
  const events = [];

  // 1. JSON-LD
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(html))) {
    try {
      collectEvents(JSON.parse(m[1]), null, events);
    } catch {
      /* ignorieren */
    }
  }

  // 2. Eingebettete JSON-Blobs in allen Inline-Scripts
  for (const script of inlineScripts(html)) {
    for (const blob of jsonBlobsFromScript(script)) {
      collectEvents(blob, null, events);
    }
  }

  return events;
}

/* ------------------------------------------------------------------ */
/* URL-Discovery: JSON/API-Endpunkte aus HTML & JS herausfischen        */
/* ------------------------------------------------------------------ */

const INTERESTING_URL =
  /json|api|event|program|programm|running|timetable|schedule|line-?up|acts|artists|bands/i;
const BORING_URL = /\.(css|png|jpe?g|gif|svg|webp|woff2?|ttf|ico|mp4)(\?|$)/i;

export function discoverUrls(text, baseUrl) {
  const urls = new Set();
  const re = /["'](https?:\/\/[^"'\s<>]+|\/[a-zA-Z0-9_\-./?=&%]{3,})["']/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1];
    if (BORING_URL.test(raw) || !INTERESTING_URL.test(raw)) continue;
    try {
      urls.add(new URL(raw, baseUrl).href);
    } catch {
      /* ignorieren */
    }
  }
  return [...urls];
}

function scriptSrcs(html, baseUrl) {
  const out = [];
  const re = /<script[^>]*\bsrc=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(new URL(m[1], baseUrl).href);
    } catch {
      /* ignorieren */
    }
  }
  return out;
}

async function fetchText(url, accept) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: accept },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function tryJsonUrl(url, events, debug) {
  try {
    const text = await fetchText(url, 'application/json,text/plain,*/*');
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
    const before = events.length;
    collectEvents(JSON.parse(trimmed), null, events);
    if (debug || events.length > before) {
      console.log(`  · ${url} → +${events.length - before} Events`);
    }
  } catch (err) {
    if (debug) console.log(`  · ${url} → ✗ (${err.message})`);
  }
}

async function eventsViaDiscovery(html, pageUrl, debug) {
  const events = [];
  const candidates = discoverUrls(html, pageUrl);

  // Zusätzlich die verlinkten JS-Bundles nach URLs durchsuchen (eine Ebene)
  const bundles = scriptSrcs(html, pageUrl).slice(0, 6);
  for (const src of bundles) {
    try {
      const js = await fetchText(src, '*/*');
      if (js.length < 3_000_000) {
        for (const u of discoverUrls(js, pageUrl)) candidates.push(u);
      }
    } catch {
      /* Bundle nicht ladbar – egal */
    }
  }

  const unique = [...new Set(candidates)].slice(0, 15);
  if (debug) {
    console.log(`→ ${unique.length} URL-Kandidaten aus HTML/JS:`);
    unique.forEach((u) => console.log(`  - ${u}`));
  } else if (unique.length > 0) {
    console.log(`→ Durchsuche ${unique.length} in der Seite referenzierte JSON/API-URLs …`);
  }

  for (const url of unique) {
    await tryJsonUrl(url, events, debug);
    if (events.length >= MIN_EVENTS * 4) break;
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* Mapping auf unser timetable.json                                    */
/* ------------------------------------------------------------------ */

function two(n) {
  return String(n).padStart(2, '0');
}

function localIso(date) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/**
 * Zeit -> "HH:MM" relativ zum Festivaltag. Sets nach Mitternacht (vor 08:00)
 * gehören zum Vortag und bekommen Stunden >= 24 (z. B. 01:00 -> "25:00").
 */
export function relTime(date, dayDate) {
  const h = date.getHours();
  const belongsToPrevDay = h < 8;
  const eventDay = new Date(date);
  if (belongsToPrevDay) eventDay.setDate(eventDay.getDate() - 1);
  if (localIso(eventDay) !== dayDate) return null;
  return `${two(belongsToPrevDay ? h + 24 : h)}:${two(date.getMinutes())}`;
}

export function mapToTimetable(timetable, rawEvents) {
  const slots = [];
  const unknownStages = new Map();
  let outsideDays = 0;

  for (const ev of rawEvents) {
    const stageId = ev.stage ? stageIdFor(ev.stage) : null;
    if (!stageId) {
      const key = ev.stage ?? '(ohne Bühne)';
      unknownStages.set(key, (unknownStages.get(key) ?? 0) + 1);
      continue;
    }
    const end = ev.end ?? new Date(ev.start.getTime() + 45 * 60000);

    let matched = false;
    for (const day of timetable.days) {
      const s = relTime(ev.start, day.date);
      if (s === null) continue;
      slots.push({
        id: `${day.id}-${stageId}-${slugify(ev.name)}`,
        dayId: day.id,
        stageId,
        band: ev.name,
        start: s,
        end: relTime(end, day.date) ?? s,
        confirmed: true,
      });
      matched = true;
      break;
    }
    if (!matched) outsideDays++;
  }

  // Duplikate raus (gleiche ID)
  const seen = new Set();
  const unique = slots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  return { slots: unique, unknownStages, outsideDays };
}

/* ------------------------------------------------------------------ */
/* Hauptprogramm                                                       */
/* ------------------------------------------------------------------ */

function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.name}|${e.stage}|${e.start.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(name);
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };

  const debug = flag('--debug');
  const dryRun = flag('--dry-run');
  const fromFile = opt('--from-file');
  const customUrl = opt('--url');
  const source = opt('--source') ?? 'auto'; // auto | wacken | clashfinder

  let events = [];
  let sourceLabel = '';

  // --- Quelle 1: lokale Datei -------------------------------------------
  if (fromFile) {
    const html = await readFile(fromFile, 'utf8');
    console.log(`→ Parse lokale Datei: ${fromFile}`);
    events = eventsFromHtml(html);
    sourceLabel = `Datei ${path.basename(fromFile)}`;
  }

  // --- Quelle 2: wacken.com ----------------------------------------------
  if (!fromFile && source !== 'clashfinder') {
    const urls = customUrl ? [customUrl] : WACKEN_SOURCES;
    for (const url of urls) {
      console.log(`→ Hole ${url} …`);
      let html;
      try {
        html = await fetchText(url, 'text/html');
      } catch (err) {
        console.warn(`  ✗ ${err.message}`);
        continue;
      }
      if (debug) {
        await writeFile(DEBUG_HTML_FILE, html, 'utf8');
        console.log(`  (Debug: HTML gespeichert unter ${DEBUG_HTML_FILE})`);
      }

      events = eventsFromHtml(html);
      console.log(`→ ${events.length} Events direkt im HTML gefunden`);

      // Running Order wird oft client-seitig nachgeladen -> URLs entdecken
      if (events.length < MIN_EVENTS) {
        events = events.concat(await eventsViaDiscovery(html, url, debug));
        console.log(`→ ${events.length} Events nach URL-Discovery`);
      }
      if (events.length >= MIN_EVENTS) {
        sourceLabel = 'offiziell von wacken.com';
        break;
      }
    }
  }

  // --- Quelle 3: Clashfinder-Fallback -------------------------------------
  if (events.length < MIN_EVENTS && !fromFile && source !== 'wacken') {
    console.log('→ Fallback: Clashfinder-Export (Community-Spiegel der Running Order) …');
    for (const url of CLASHFINDER_SOURCES) {
      const before = events.length;
      await tryJsonUrl(url, events, debug);
      if (events.length > before && events.length >= MIN_EVENTS) {
        sourceLabel = 'Clashfinder-Export (clashfinder.com/m/woa2026)';
        break;
      }
    }
  }

  events = dedupe(events);
  console.log(`→ ${events.length} Events insgesamt (nach Dedupe)`);

  if (events.length < MIN_EVENTS) {
    console.error(
      `\nZu wenig Events gefunden (${events.length} < ${MIN_EVENTS}) – Abbruch, ` +
        'timetable.json bleibt unverändert.\n\n' +
        'Nächste Schritte:\n' +
        '  1. npm run scrape -- --debug           # zeigt, welche URLs probiert wurden,\n' +
        '     und speichert das HTML nach data/scrape-debug.html\n' +
        '  2. Running-Order-Seite im Browser öffnen, warten bis sie geladen ist,\n' +
        '     dann im DevTools-Network-Tab die JSON-Antwort suchen und speichern –\n' +
        '     oder die fertig gerenderte Seite speichern (Strg+S) und:\n' +
        '     npm run scrape -- --from-file seite.html\n' +
        '  3. data/timetable.json von Hand pflegen (Format siehe Datei;\n' +
        '     Zeiten nach Mitternacht als 24:30 = 00:30).'
    );
    process.exit(1);
  }

  const timetable = JSON.parse(await readFile(TIMETABLE_FILE, 'utf8'));
  const { slots, unknownStages, outsideDays } = mapToTimetable(timetable, events);

  if (slots.length < MIN_EVENTS) {
    console.error(
      `Events gefunden, aber nur ${slots.length} passten auf Bühnen/Tage – Abbruch.`
    );
    if (unknownStages.size > 0) {
      console.error('Unbekannte Bühnen:');
      for (const [name, count] of unknownStages) console.error(`  - ${name} (${count}×)`);
    }
    process.exit(1);
  }

  console.log(`✓ ${slots.length} Slots gemappt (Quelle: ${sourceLabel})`);
  if (unknownStages.size > 0) {
    console.log('  Übersprungen – Bühnen, die die App nicht kennt:');
    for (const [name, count] of unknownStages) console.log(`  - ${name} (${count}×)`);
  }
  if (outsideDays > 0) {
    console.log(`  (${outsideDays} Events außerhalb der Festivaltage übersprungen)`);
  }

  if (dryRun) {
    for (const s of slots.slice(0, 15)) {
      console.log(`  ${s.dayId} ${s.start}–${s.end} [${s.stageId}] ${s.band}`);
    }
    console.log(`  … (--dry-run: nichts geschrieben)`);
    return;
  }

  timetable.slots = slots;
  timetable.dataVersion = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} (${sourceLabel})`;
  await writeFile(TIMETABLE_FILE, JSON.stringify(timetable, null, 2), 'utf8');
  console.log(`✓ data/timetable.json aktualisiert`);
  console.log('→ Server neu starten, damit die neuen Daten ausgeliefert werden.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
