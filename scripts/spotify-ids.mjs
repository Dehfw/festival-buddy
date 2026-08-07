/**
 * Ergänzt fehlende Spotify-Artist-IDs, damit im Band-Sheet der
 * „Auf Spotify anhören"-Button erscheint. Die IDs kommen aus der
 * Spotify-Suche (Client-Credentials-Flow, kein Nutzer-Login nötig).
 *
 *   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... \
 *     node scripts/spotify-ids.mjs lineups/psoa2026.txt
 *   ... node scripts/spotify-ids.mjs data/partysan2026.json --dry-run
 *
 * Zeigt die Datei auf eine Running-Order-Textdatei, werden die gefundenen
 * IDs als "| spotify=..." an die Bandzeilen gehängt – dann bleiben sie
 * beim nächsten `build-timetable.mjs` erhalten. Zeigt sie auf ein
 * Timetable-JSON, wird direkt dort ergänzt.
 *
 * Zugangsdaten gibt es kostenlos unter developer.spotify.com (App
 * anlegen, Client ID + Secret kopieren).
 *
 * Bewusst konservativ: Übernommen wird nur, was nach Normalisierung
 * exakt auf den Bandnamen passt. Ein falscher Treffer ist schlimmer als
 * ein fehlender Button – „Nirvana" auf ein unbekanntes Coverprojekt zu
 * verlinken fällt niemandem auf, führt aber alle in die Irre. Alles
 * Unklare landet im Bericht am Ende und will von Hand entschieden werden.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { file: null, dryRun: false, force: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (!argv[i].startsWith('-')) args.file ??= argv[i];
  }
  return args;
}

const { file, dryRun, force, limit } = parseArgs(process.argv.slice(2));
if (!file) {
  console.error('Aufruf: node scripts/spotify-ids.mjs <lineups/x.txt | data/x.json> [--dry-run] [--force]');
  process.exit(2);
}

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  fail(
    'SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET fehlen.\n' +
      '  App anlegen unter https://developer.spotify.com/dashboard, dann:\n' +
      `  SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run lineup:spotify -- ${file}`
  );
}

const filePath = path.resolve(file);
const isJson = filePath.endsWith('.json');
const source = await readFile(filePath, 'utf8');

/** Bandzeile im Textformat: "14:45-15:30 Palebloom | spotify=…" */
const SLOT_LINE = /^(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2})\s+(.+)$/;

/* ------------------------------------------------------------------ */
/* Namen normalisieren                                                 */
/* ------------------------------------------------------------------ */

function tidy(name) {
  return name
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/**
 * Vergleichsformen eines Künstlernamens. Groß-/Kleinschreibung,
 * Satzzeichen und ein führendes "The" sind für die Frage, ob zwei Namen
 * dieselbe Band meinen, ohne Belang. Bei Umlauten gibt es zwei übliche
 * Schreibweisen, und Plakat und Spotify sind sich da selten einig:
 * "Mötley Crüe" steht auf Plakaten gern als "Motley Crue", "Hämatom"
 * dagegen als "Haematom". Deshalb entstehen beide Varianten, und ein
 * Treffer zählt, wenn sich irgendeine davon deckt.
 */
function normalizeVariants(name) {
  const lower = String(name).toLowerCase();
  const german = tidy(
    lower.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  );
  const ascii = tidy(lower.replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
  return new Set([german, ascii]);
}

/** Meinen die beiden Namen dieselbe Band? */
function sameName(a, b) {
  const variants = normalizeVariants(a);
  for (const v of normalizeVariants(b)) if (variants.has(v)) return true;
  return false;
}

/**
 * Festival-Zusätze, die nicht zum Künstlernamen gehören: "(Aftershow)",
 * "(Bolt Thrower Tribute)", "feat. …". Ohne sie findet die Suche den Act
 * deutlich häufiger – deshalb wird zusätzlich mit dem bereinigten Namen
 * gesucht, aber nie mit einem geratenen Teilstück.
 */
function cleanBandName(band) {
  return band
    .replace(/\s*\((?:aftershow|acoustic|unplugged|tribute|dj[- ]set|secret show)[^)]*\)/gi, '')
    .replace(/\s*\([^)]*(?:tribute|cover|special|jubil)[^)]*\)/gi, '')
    .replace(/\s+(?:feat\.?|featuring|ft\.?)\s+.*$/i, '')
    .replace(/\s*\+\s*(?:special\s+)?guests?.*$/i, '')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Spotify-API                                                         */
/* ------------------------------------------------------------------ */

async function getToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    fail(`Spotify-Login fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

const token = await getToken();

async function searchArtists(query) {
  const url = `https://api.spotify.com/v1/search?type=artist&limit=10&q=${encodeURIComponent(query)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 && attempt < 5) {
      const wait = (Number(res.headers.get('retry-after')) || 2) * 1000;
      console.log(`  … Rate-Limit, warte ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      console.warn(`  ⚠ Suche fehlgeschlagen (HTTP ${res.status}) für "${query}"`);
      return [];
    }
    return (await res.json()).artists?.items ?? [];
  }
}

/**
 * Ein Treffer zählt nur bei exakter Namensgleichheit (nach Normalisierung).
 * Gibt es mehrere gleichnamige Künstler, gewinnt der mit den meisten
 * Followern – aber der Fall wird gemeldet, weil "Nirvana" oder "Sacrifice"
 * eben mehrfach existieren und die Wahl dann jemand ansehen sollte.
 */
async function resolve(band) {
  const candidates = [band];
  const cleaned = cleanBandName(band);
  if (cleaned && !sameName(cleaned, band)) candidates.push(cleaned);

  for (const query of candidates) {
    if (!query) continue;
    const items = await searchArtists(query);
    // Dieselbe Prüfung wie upsertSlot – was hier durchrutscht, macht die
    // Datei später unimportierbar.
    const exact = items.filter((a) => sameName(a.name, query) && /^[A-Za-z0-9]{1,40}$/.test(a.id ?? ''));
    if (exact.length === 0) continue;
    exact.sort((a, b) => (b.followers?.total ?? 0) - (a.followers?.total ?? 0));
    return {
      id: exact[0].id,
      name: exact[0].name,
      followers: exact[0].followers?.total ?? 0,
      viaCleanedName: query !== band,
      ambiguous: exact.length > 1,
      alternatives: exact
        .slice(1, 4)
        .map((a) => `${a.name} (${a.followers?.total ?? 0} Follower, ${a.id})`),
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Bestand einsammeln                                                  */
/* ------------------------------------------------------------------ */

/** Bandname -> schon bekannte ID. Gesucht wird pro Name nur einmal. */
const known = new Map();
/** Alle vorkommenden Bandnamen (auch die ohne ID) */
const bands = new Set();

if (isJson) {
  const timetable = JSON.parse(source);
  if (!Array.isArray(timetable.slots)) fail(`${file}: kein Timetable-JSON (Feld "slots" fehlt)`);
  for (const slot of timetable.slots) {
    bands.add(slot.band);
    if (slot.spotifyArtistId && !known.has(slot.band)) known.set(slot.band, slot.spotifyArtistId);
  }
} else {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const match = SLOT_LINE.exec(trimmed);
    if (!match) continue;
    const parts = match[2].split('|').map((p) => p.trim());
    const band = parts.shift();
    bands.add(band);
    const existing = parts.find((p) => p.startsWith('spotify='));
    if (existing && !known.has(band)) known.set(band, existing.slice('spotify='.length));
  }
}

const todo = [...bands].filter((band) => force || !known.has(band)).slice(0, limit);

if (todo.length === 0) {
  console.log(`✓ ${file}: alle ${bands.size} Bands haben schon eine Spotify-ID`);
  process.exit(0);
}

console.log(`→ ${todo.length} von ${bands.size} Bands ohne ID, suche bei Spotify …\n`);

/* ------------------------------------------------------------------ */
/* Auflösen                                                            */
/* ------------------------------------------------------------------ */

const found = new Map();
const unresolved = [];
const review = [];

for (const band of todo) {
  const hit = await resolve(band);
  if (!hit) {
    unresolved.push(band);
    console.log(`  ? ${band}`);
    continue;
  }
  found.set(band, hit.id);
  console.log(`  ✓ ${band} → ${hit.name} (${hit.id})`);
  if (hit.ambiguous || hit.viaCleanedName) review.push({ band, hit });
}

/**
 * Was am Ende an einem Slot stehen soll. Ohne --force gewinnt eine
 * bereits eingetragene ID; sonst der frische Treffer. Wichtig ist der
 * Fallback auf `known`: Spielt eine Band zweimal und hatte nur einer
 * ihrer Slots eine ID, bekommt der andere sie hier mit – sonst hinge der
 * Button an der Uhrzeit statt an der Band.
 */
function idFor(band) {
  return force ? (found.get(band) ?? known.get(band)) : (known.get(band) ?? found.get(band));
}

/* ------------------------------------------------------------------ */
/* Zurückschreiben                                                     */
/* ------------------------------------------------------------------ */

let output = source;
let patched = 0;

if (isJson) {
  const timetable = JSON.parse(source);
  timetable.slots = timetable.slots.map((slot) => {
    const id = idFor(slot.band);
    if (!id || slot.spotifyArtistId === id) return slot;
    patched++;
    // spotifyArtistId ans Ende des Slots – so sehen die Dateien aus, die
    // der Wacken-Import erzeugt.
    const { spotifyArtistId, ...rest } = slot;
    return { ...rest, spotifyArtistId: id };
  });
  output = `${JSON.stringify(timetable, null, 2)}\n`;
} else {
  output = source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) return line;
      const match = SLOT_LINE.exec(trimmed);
      if (!match) return line;
      const parts = match[2].split('|').map((p) => p.trim());
      const band = parts.shift();
      const id = idFor(band);
      if (!id) return line;
      const options = parts.filter((p) => !p.startsWith('spotify='));
      if (parts.length !== options.length && known.get(band) === id && !force) return line;
      patched++;
      const indent = line.slice(0, line.length - line.trimStart().length);
      return `${indent}${match[1]} ${[band, ...options, `spotify=${id}`].join(' | ')}`;
    })
    .join('\n');
}

if (dryRun) {
  console.log(`\n→ --dry-run: ${patched} Einträge würden ergänzt, nichts geschrieben`);
} else if (patched > 0) {
  await writeFile(filePath, output, 'utf8');
  console.log(`\n✓ ${file}: ${patched} Einträge ergänzt`);
} else {
  console.log('\n→ nichts zu ergänzen');
}

/* ------------------------------------------------------------------ */
/* Bericht                                                             */
/* ------------------------------------------------------------------ */

const coverage = [...bands].filter((band) => idFor(band)).length;
console.log(`\nAbdeckung: ${coverage}/${bands.size} Bands mit Spotify-ID`);

if (review.length > 0) {
  console.log(`\n⚠ ${review.length} Treffer bitte kurz ansehen:`);
  for (const { band, hit } of review) {
    if (hit.viaCleanedName) {
      console.log(`  - "${band}" wurde als "${cleanBandName(band)}" gefunden → ${hit.name} (${hit.id})`);
    }
    if (hit.ambiguous) {
      console.log(`  - "${band}": mehrere gleichnamige Künstler, gewählt wurde ${hit.name} (${hit.followers} Follower)`);
      for (const alt of hit.alternatives) console.log(`      auch möglich: ${alt}`);
    }
  }
}

if (unresolved.length > 0) {
  console.log(`\n${unresolved.length} ohne eindeutigen Treffer (bleiben ohne Button):`);
  for (const band of unresolved) {
    console.log(`  - ${band}   https://open.spotify.com/search/${encodeURIComponent(band)}`);
  }
  console.log(
    '\n  Wer davon doch auf Spotify ist: ID aus der Künstler-URL kopieren\n' +
      '  (open.spotify.com/artist/<ID>) und von Hand eintragen – im Veranstalter-\n' +
      '  Editor oder als "| spotify=<ID>" in der Running-Order-Textdatei.'
  );
}
