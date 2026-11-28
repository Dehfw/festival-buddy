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
 * beim nächsten `build-timetable.mjs` erhalten. Das gilt für Slot-Zeilen
 * mit Spielzeit genauso wie für die reinen Bandnamen im
 * [announced]-Block; gerade die brauchen die IDs am dringendsten, weil
 * dort das Reinhören die einzige Funktion ist. Zeigt sie auf ein
 * Timetable-JSON, wird direkt dort ergänzt (Slots und `bands`).
 *
 * Zugangsdaten gibt es kostenlos unter developer.spotify.com (App
 * anlegen, Client ID + Secret kopieren).
 *
 * Bewusst konservativ: Ein falscher Treffer ist schlimmer als ein
 * fehlender Button – „Nirvana" auf ein unbekanntes Coverprojekt zu
 * verlinken fällt niemandem auf, führt aber alle in die Irre. Übernommen
 * wird deshalb nur, was nach Normalisierung exakt auf den Bandnamen passt
 * UND in der durchsuchten Tiefe der einzige gleichnamige Künstler mit
 * Veröffentlichungen ist. Gibt es mehrere, wird nichts übernommen: Der
 * Bericht nennt die Kandidaten mit ihren Alben, und die Wahl trifft
 * jemand von Hand ("| spotify=<ID>").
 *
 * Spotify liefert weder in der Suche noch unter /v1/artists/{id} noch
 * Follower, Genres oder Popularität (geprüft 28.11.2026: nur id, name,
 * images, uri). Es gibt also kein Merkmal mehr, an dem das Script den
 * „bekannteren" von zwei Namensvettern erkennen könnte – und die
 * Reihenfolge der Suche taugt dafür nicht. Das Einzige, woran sich eine
 * Zuordnung prüfen lässt, sind die Veröffentlichungen. Deshalb stehen sie
 * auch bei jedem übernommenen Treffer im Bericht.
 *
 * Wer eine Band bewusst ohne Button lassen will – nicht auf Spotify, kein
 * Kandidat passt, der einzige Treffer ist der falsche –, schreibt
 * "| spotify=-" an die Zeile. Dann wird sie nicht mehr gesucht; ohne die
 * Markierung trüge der nächste Lauf denselben falschen Treffer wieder ein
 * und fragte Spotify jedes Mal neu.
 *
 * Sparsam mit Abfragen: Apps im Development Mode haben ein Kontingent
 * pro Entwicklerkonto, dessen Größe Spotify nicht nennt. Am 28.11.2026
 * haben rund 500 Abfragen in einer Viertelstunde gereicht, um für knapp
 * 24 Stunden gesperrt zu werden (HTTP 429, reason QUOTA_EXCEEDED). Daher
 * die geringe Suchtiefe, das Budget je Lauf und der saubere Abbruch.
 */
import './env.mjs';
import './proxy.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { file: null, dryRun: false, force: false, optional: false, limit: Infinity, pages: 2, budget: 250 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--optional') args.optional = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--pages') args.pages = Number(argv[++i]);
    else if (argv[i] === '--budget') args.budget = Number(argv[++i]);
    else if (!argv[i].startsWith('-')) args.file ??= argv[i];
  }
  return args;
}

const { file, dryRun, force, optional, limit, pages, budget } = parseArgs(process.argv.slice(2));
if (!file || !Number.isInteger(pages) || pages < 1 || pages > 10 || !(budget > 0)) {
  console.error(
    'Aufruf: node scripts/spotify-ids.mjs <lineups/x.txt | data/x.json> [--dry-run] [--force]\n' +
      '        [--pages N]   Suchtiefe in Seiten zu 10 Ergebnissen (1–10, Standard 2)\n' +
      '        [--budget N]  nach N Spotify-Abfragen keine weitere Band beginnen (Standard 250)'
  );
  process.exit(2);
}

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  // --optional: aufgerufen als Teil der Pipeline. Fehlende Zugangsdaten
  // sind dann kein Fehler, sondern nur ein fehlendes Extra – der Import
  // soll deswegen nicht stehenbleiben.
  const hint =
    'SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET fehlen.\n' +
    '  App anlegen unter https://developer.spotify.com/dashboard, Werte in .env.local.';
  if (optional) {
    console.log(`⏭  Spotify-Suche übersprungen: ${hint}`);
    console.log('   Die betroffenen Bands bekommen im Band-Sheet keinen Spotify-Button.');
    process.exit(0);
  }
  fail(hint);
}

const filePath = path.resolve(file);
const isJson = filePath.endsWith('.json');
const source = await readFile(filePath, 'utf8');

/** Bandzeile im Textformat: "14:45-15:30 Palebloom | spotify=…" */
const SLOT_LINE = /^(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2})\s+(.+)$/;
/** Kopfzeilen – im [announced]-Block dürfen sie nicht als Band gelten */
const HEADER_LINE = /^(festival|edition|dataVersion|stage|day)\s*:/i;

/**
 * Eine Bandzeile aus der Textdatei. Im Timetable steht davor die
 * Spielzeit, im [announced]-Block nur der Name – announced Bands haben
 * ja noch keine. Beide brauchen dieselbe Spotify-Suche.
 */
function parseBandLine(trimmed, inAnnounced) {
  const slot = SLOT_LINE.exec(trimmed);
  if (slot) return { time: slot[1], rest: slot[2] };
  if (!inAnnounced || HEADER_LINE.test(trimmed)) return null;
  return { time: null, rest: trimmed };
}

/** Wechselt diese Zeile in den [announced]-Block? (null = kein Abschnitt) */
function sectionAnnounced(trimmed) {
  if (!trimmed.startsWith('[')) return null;
  return /^\[announced\]$/i.test(trimmed);
}

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

/**
 * In Cloud-Sessions stehen in den Variablen nur Platzhalter; die echten
 * Zugangsdaten setzt der Netzwerk-Proxy für accounts.spotify.com ein.
 * Fehlt dort das Secret, ist der Host gesperrt oder der Login scheitert –
 * das soll als ein lesbarer Satz enden, nicht als Stacktrace.
 */
const CLOUD_HINT =
  '  In einer Cloud-Session: Für accounts.spotify.com muss in der Umgebung ein\n' +
  '  Netzwerk-Secret hinterlegt sein (Basic: Client-ID als Benutzername, Client-Secret\n' +
  '  als Passwort) und api.spotify.com freigegeben sein.';

async function getToken() {
  let res;
  try {
    res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    fail(
      `Spotify nicht erreichbar (accounts.spotify.com): ${err?.cause?.message ?? err?.message ?? err}\n${CLOUD_HINT}`
    );
  }
  if (!res.ok) {
    fail(
      `Spotify-Login fehlgeschlagen (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}\n${CLOUD_HINT}`
    );
  }
  return (await res.json()).access_token;
}

const token = await getToken();

const API = 'https://api.spotify.com/v1';
/** Mehr als 10 Ergebnisse je Aufruf lehnt Spotify ab (HTTP 400 „Invalid limit"). */
const PAGE_SIZE = 10;
/** Mehr Namensvettern je Band werden nicht einzeln nachgeschlagen – das Kontingent ist knapp. */
const MAX_CANDIDATES = 8;
/** Kurze Rate-Limits wartet das Script ab, längere Sperren nicht. */
const MAX_RATE_LIMIT_WAIT_S = 60;
/** Kleine Pause zwischen zwei Abfragen, damit kein Dauerfeuer entsteht. */
const PAUSE_MS = 150;

let requests = 0;
/** Gesetzt, sobald Spotify sperrt: { seconds, quota } – danach geht keine Abfrage mehr raus. */
let locked = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ein GET gegen die Spotify-API. Liefert das JSON oder null, wenn die
 * Abfrage scheitert. Wer aufruft, muss null als „weiß ich nicht" lesen,
 * nie als „gibt es nicht": Eine fehlende Ergebnisseite würde sonst aus
 * einem mehrdeutigen Namen einen eindeutigen machen.
 */
async function spotifyGet(url, what) {
  for (let attempt = 0; ; attempt++) {
    if (locked) return null;
    if (requests > 0) await sleep(PAUSE_MS);
    requests++;
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      fail(
        `Spotify nicht erreichbar (api.spotify.com): ${err?.cause?.message ?? err?.message ?? err}\n${CLOUD_HINT}`
      );
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 2;
      const body = await res.text().catch(() => '');
      const quota = body.includes('QUOTA_EXCEEDED');
      // Ein erschöpftes Kontingent meldet Spotify mit Wartezeiten von
      // vielen Stunden. Das sitzt niemand aus – schon gar nicht ein
      // geplanter Lauf, der sonst einen Tag lang hängt.
      if (quota || wait > MAX_RATE_LIMIT_WAIT_S || attempt >= 4) {
        locked = { seconds: wait, quota };
        console.warn(
          `  ⚠ Spotify sperrt weitere Abfragen für ${describeWait(wait)}` +
            (quota ? ' (Kontingent erschöpft)' : ' (Rate-Limit)') +
            ' – der Rest bleibt ungeprüft'
        );
        return null;
      }
      console.log(`  … Rate-Limit, warte ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) {
      console.warn(`  ⚠ ${what} fehlgeschlagen (HTTP ${res.status})`);
      return null;
    }
    try {
      return await res.json();
    } catch {
      console.warn(`  ⚠ ${what}: Antwort nicht lesbar`);
      return null;
    }
  }
}

function describeWait(seconds) {
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  return `rund ${Math.round(seconds / 3600)} h`;
}

/**
 * Eine Ergebnisseite der Künstlersuche, reduziert auf die Künstler, deren
 * Name exakt (nach Normalisierung) auf die Anfrage passt. `last` heißt:
 * dahinter kommt nichts mehr. null = Abfrage gescheitert.
 */
async function searchPage(query, page) {
  const data = await spotifyGet(
    `${API}/search?type=artist&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&q=${encodeURIComponent(query)}`,
    `Suche nach "${query}"`
  );
  if (!data) return null;
  const items = data.artists?.items ?? [];
  const exact = items.filter(
    (artist) =>
      typeof artist?.name === 'string' &&
      // Dieselbe ID-Prüfung wie upsertSlot – was hier durchrutscht, macht
      // die Datei später unimportierbar.
      /^[A-Za-z0-9]{1,40}$/.test(artist.id ?? '') &&
      sameName(artist.name, query)
  );
  return { exact, last: items.length < PAGE_SIZE };
}

/**
 * Alben und Singles eines Künstlers: Gesamtzahl und die ersten Titel mit
 * Jahr (Spotify liefert Alben vor Singles, jeweils neueste zuerst). Das
 * ist der einzige Kontext, den die API zu einem Künstler noch hergibt –
 * und damit das, woran ein Mensch die richtige Band erkennt.
 */
async function releasesOf(id) {
  const data = await spotifyGet(
    `${API}/artists/${id}/albums?include_groups=album,single&limit=${PAGE_SIZE}`,
    `Alben von ${id}`
  );
  if (!Array.isArray(data?.items)) return null;
  const titles = [];
  const seen = new Set();
  for (const item of data.items) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || seen.has(name.toLowerCase())) continue; // Album und gleichnamige Vorab-Single
    seen.add(name.toLowerCase());
    const title = name.length > 45 ? `${name.slice(0, 44)}…` : name;
    const year = /^\d{4}/.exec(item.release_date ?? '')?.[0];
    titles.push(year ? `${title} (${year})` : title);
  }
  return { total: Number.isInteger(data.total) ? data.total : data.items.length, titles };
}

function describeReleases(releases) {
  const shown = releases.titles.slice(0, 4);
  const count = releases.total === 1 ? '1 Veröffentlichung' : `${releases.total} Veröffentlichungen`;
  if (shown.length === 0) return count;
  return `${shown.join(', ')}${releases.total > shown.length ? ', …' : ''} · ${count}`;
}

/**
 * Sucht den Künstler zu einem Bandnamen. Mögliche Ergebnisse:
 *
 * - `found`      genau ein gleichnamiger Künstler mit Veröffentlichungen
 *                → wird übernommen, samt Alben für den Bericht
 * - `ambiguous`  mehrere davon → nichts wird übernommen. Früher gewann
 *                der mit den meisten Followern; die liefert Spotify nicht
 *                mehr. Der erste Treffer der Suche ist kein Ersatz: In
 *                einer Stichprobe mit 57 Wacken-Bands (IDs vom Festival)
 *                war er bei Namensgleichheit in 4 von 21 Fällen der
 *                falsche („Mob Rules", „Gagor", „Invasion", „5th Avenue").
 * - `empty`      nur gleichnamige Profile ohne Alben und Singles
 * - `none`       kein exakter Namenstreffer
 * - `error`      eine Abfrage ist gescheitert – nichts bewiesen, nichts
 *                übernommen
 *
 * Profile ohne Veröffentlichungen zählen nicht als Kandidaten: Hinter dem
 * Button gäbe es dort nichts zu hören. Das räumt die häufigste Art von
 * Namensvettern weg (leere Dubletten neben „Sepultura", „Arch Enemy") –
 * in derselben Stichprobe 7 von 21 Fällen, alle richtig –, ohne zu raten.
 *
 * Eine Ergebnisseite reicht nicht: „Gagor" (richtig an Stelle 11) und
 * „Victim" (weitere an 15, 21, 31 …; der gesuchte an 34) haben auf der
 * ersten Seite genau einen Namensvetter, und zwar den falschen. Deshalb
 * wird weitergeblättert, bis `--pages` erreicht ist – oder bis zwei
 * Kandidaten feststehen, denn dann ist die Frage entschieden und jede
 * weitere Seite kostet nur Kontingent.
 */
async function resolve(band) {
  const queries = [band];
  const cleaned = cleanBandName(band);
  if (cleaned && !sameName(cleaned, band)) queries.push(cleaned);

  for (const query of queries) {
    const seen = new Set();
    const candidates = [];
    const empty = [];
    let unchecked = 0;
    let exhausted = false;

    for (let page = 0; page < pages && candidates.length < 2; page++) {
      const result = await searchPage(query, page);
      if (!result) return { status: 'error' };
      for (const artist of result.exact) {
        if (seen.has(artist.id)) continue;
        seen.add(artist.id);
        if (candidates.length + empty.length >= MAX_CANDIDATES) {
          unchecked++;
          continue;
        }
        const releases = await releasesOf(artist.id);
        if (!releases) return { status: 'error' };
        (releases.total > 0 ? candidates : empty).push({ id: artist.id, name: artist.name, releases });
      }
      if (result.last) {
        exhausted = true;
        break;
      }
    }
    if (seen.size === 0) continue;

    const base = { query, viaCleanedName: query !== band, ignoredEmpty: empty.length };
    if (candidates.length === 1 && unchecked === 0) return { status: 'found', ...base, ...candidates[0] };
    if (candidates.length > 0 || unchecked > 0) {
      // `open`: Es kann weitere geben – nicht alle Seiten gelesen oder
      // nicht alle Namensvettern nachgeschlagen.
      return { status: 'ambiguous', ...base, candidates, unchecked, open: !exhausted || unchecked > 0 };
    }
    return { status: 'empty', ...base, candidates: empty };
  }
  return { status: 'none' };
}

/* ------------------------------------------------------------------ */
/* Bestand einsammeln                                                  */
/* ------------------------------------------------------------------ */

/** Bandname -> schon bekannte ID. Gesucht wird pro Name nur einmal. */
const known = new Map();
/** Alle vorkommenden Bandnamen (auch die ohne ID) */
const bands = new Set();
/** Bands mit "spotify=-": bewusst ohne Button, werden nie gesucht – auch nicht mit --force */
const declined = new Set();
/** So steht die Absage in der Textdatei */
const DECLINED = 'spotify=-';

if (isJson) {
  const timetable = JSON.parse(source);
  if (!Array.isArray(timetable.slots)) fail(`${file}: kein Timetable-JSON (Feld "slots" fehlt)`);
  for (const slot of timetable.slots) {
    bands.add(slot.band);
    if (slot.spotifyArtistId && !known.has(slot.band)) known.set(slot.band, slot.spotifyArtistId);
  }
  for (const band of timetable.bands ?? []) {
    if (typeof band?.name !== 'string') continue;
    bands.add(band.name);
    if (band.spotifyArtistId && !known.has(band.name)) known.set(band.name, band.spotifyArtistId);
  }
} else {
  let inAnnounced = false;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const section = sectionAnnounced(trimmed);
    if (section !== null) {
      inAnnounced = section;
      continue;
    }
    const parsed = parseBandLine(trimmed, inAnnounced);
    if (!parsed) continue;
    const parts = parsed.rest.split('|').map((p) => p.trim());
    const band = parts.shift();
    if (!band) continue;
    bands.add(band);
    const existing = parts.find((p) => p.startsWith('spotify='));
    if (existing === DECLINED) declined.add(band);
    else if (existing && !known.has(band)) known.set(band, existing.slice('spotify='.length));
  }
}

const todo = [...bands]
  .filter((band) => !declined.has(band) && (force || !known.has(band)))
  .slice(0, limit);
const declinedNote = declined.size > 0 ? `, ${declined.size} bewusst ohne (${DECLINED})` : '';

if (todo.length === 0) {
  console.log(`✓ ${file}: nichts zu suchen – ${known.size} von ${bands.size} Bands mit Spotify-ID${declinedNote}`);
  process.exit(0);
}

console.log(`→ ${todo.length} von ${bands.size} Bands ohne ID, suche bei Spotify …\n`);

/* ------------------------------------------------------------------ */
/* Auflösen                                                            */
/* ------------------------------------------------------------------ */

const found = new Map();
const adopted = [];
const ambiguous = [];
const unresolved = [];
const failed = [];
/** Bands, die wegen Budget oder Sperre gar nicht erst gesucht wurden */
const skipped = [];

for (const band of todo) {
  if (locked || requests >= budget) {
    skipped.push(band);
    continue;
  }
  const hit = await resolve(band);
  if (hit.status === 'found') {
    found.set(band, hit.id);
    adopted.push({ band, hit });
    console.log(`  ✓ ${band} → ${hit.name} (${hit.id})`);
  } else if (hit.status === 'ambiguous') {
    ambiguous.push({ band, hit });
    console.log(`  ≠ ${band}: mehrere gleichnamige Künstler – nichts übernommen`);
  } else if (hit.status === 'error') {
    failed.push(band);
    console.log(`  ! ${band}: Abfrage gescheitert – nicht geprüft`);
  } else {
    unresolved.push({ band, hit });
    console.log(`  ? ${band}`);
  }
}
if (skipped.length > 0) console.log(`  … ${skipped.length} weitere nicht mehr gesucht`);

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
  if (Array.isArray(timetable.bands)) {
    timetable.bands = timetable.bands.map((band) => {
      const id = typeof band?.name === 'string' ? idFor(band.name) : null;
      if (!id || band.spotifyArtistId === id) return band;
      patched++;
      const { spotifyArtistId, ...rest } = band;
      return { ...rest, spotifyArtistId: id };
    });
  }
  output = `${JSON.stringify(timetable, null, 2)}\n`;
} else {
  let inAnnounced = false;
  output = source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const section = sectionAnnounced(trimmed);
      if (section !== null) {
        inAnnounced = section;
        return line;
      }
      const parsed = parseBandLine(trimmed, inAnnounced);
      if (!parsed) return line;
      const parts = parsed.rest.split('|').map((p) => p.trim());
      const band = parts.shift();
      if (!band) return line;
      const id = idFor(band);
      if (!id || parts.includes(DECLINED)) return line;
      const options = parts.filter((p) => !p.startsWith('spotify='));
      if (parts.length !== options.length && known.get(band) === id && !force) return line;
      patched++;
      const indent = line.slice(0, line.length - line.trimStart().length);
      const prefix = parsed.time ? `${parsed.time} ` : '';
      return `${indent}${prefix}${[band, ...options, `spotify=${id}`].join(' | ')}`;
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
console.log(
  `\nAbdeckung: ${coverage}/${bands.size} Bands mit Spotify-ID${declinedNote} (${requests} Spotify-Abfragen)`
);

const depth = pages * PAGE_SIZE;
const emptyNote = (n) =>
  n === 1 ? '1 gleichnamiges Profil ohne Veröffentlichungen' : `${n} gleichnamige Profile ohne Veröffentlichungen`;
const cleanedNote = (band, hit) =>
  hit.viaCleanedName ? `      ⚠ gesucht als "${hit.query}" (Zusatz aus "${band}" entfernt)` : null;
const MANUAL_HINT =
  '  Von Hand eintragen: ID aus der Künstler-URL (open.spotify.com/artist/<ID>) –\n' +
  '  im Veranstalter-Editor oder als "| spotify=<ID>" in der Running-Order-Textdatei.';
/** Die Absage gibt es nur im Textformat – ein Timetable-JSON kennt sie nicht. */
const DECLINE_HINT = isJson
  ? ''
  : `\n  Soll eine Band ohne Button bleiben: "| ${DECLINED}" anhängen, dann wird sie nicht mehr gesucht.`;

if (adopted.length > 0) {
  console.log(
    `\n${adopted.length} ${dryRun ? 'würden zugeordnet' : 'zugeordnet'} – jeweils der einzige gleichnamige Künstler mit Veröffentlichungen\n` +
      `unter den ersten ${depth} Suchergebnissen. Das beweist nicht, dass es die gemeinte Band ist\n` +
      '(Follower oder Genres liefert Spotify nicht mehr): Passen die Titel zur Band?' +
      (isJson
        ? ' Sonst ID wieder entfernen.'
        : `\nSonst die ID durch "${DECLINED}" ersetzen (oder durch die richtige) – nur löschen hilft nicht,\nder nächste Lauf trüge sie wieder ein.`)
  );
  for (const { band, hit } of adopted) {
    console.log(`  - ${band} → ${hit.name} (${hit.id})`);
    console.log(`      ${describeReleases(hit.releases)}`);
    const note = cleanedNote(band, hit);
    if (note) console.log(note);
    if (hit.ignoredEmpty > 0) console.log(`      daneben ${emptyNote(hit.ignoredEmpty)}, nicht gewertet`);
    const before = known.get(band);
    if (before && before !== hit.id) console.log(`      ⚠ ersetzt die bisher eingetragene ID ${before}`);
  }
}

if (ambiguous.length > 0) {
  console.log(
    `\n⚠ ${ambiguous.length} mit mehreren gleichnamigen Künstlern – nichts übernommen, bitte von Hand entscheiden.\n` +
      '  Die Reihenfolge ist die der Spotify-Suche und sagt nichts darüber, wer gemeint ist:'
  );
  for (const { band, hit } of ambiguous) {
    const before = known.get(band);
    console.log(`  - ${band}   https://open.spotify.com/search/${encodeURIComponent(hit.query)}`);
    const note = cleanedNote(band, hit);
    if (note) console.log(note);
    for (const c of hit.candidates) {
      console.log(
        `      ${c.id}  ${c.name} · ${describeReleases(c.releases)}${c.id === before ? '   ← eingetragen' : ''}`
      );
    }
    if (hit.ignoredEmpty > 0) console.log(`      (dazu ${emptyNote(hit.ignoredEmpty)})`);
    if (hit.unchecked > 0) {
      console.log(`      ${hit.unchecked} weitere gleichnamige Profile wurden nicht mehr nachgeschlagen (zu viele).`);
    }
    if (hit.open) console.log('      Weitere Namensvettern sind möglich – die Suche wurde hier nicht weiter verfolgt.');
    if (before && !hit.candidates.some((c) => c.id === before)) {
      console.log(`      eingetragen ist ${before} – nicht unter diesen Kandidaten, bleibt stehen`);
    }
  }
  console.log(`\n${MANUAL_HINT}\n  Passt kein Kandidat sicher zur Band: ohne Button lassen.${DECLINE_HINT}`);
}

if (unresolved.length > 0) {
  console.log(`\n${unresolved.length} ohne Treffer (bleiben ohne Button):`);
  for (const { band, hit } of unresolved) {
    const why =
      hit.status === 'empty'
        ? `   – nur ${emptyNote(hit.candidates.length)} (${hit.candidates.map((c) => c.id).join(', ')})`
        : '';
    console.log(`  - ${band}   https://open.spotify.com/search/${encodeURIComponent(band)}${why}`);
  }
  console.log(
    `\n  Geprüft wurden je Name die ersten ${depth} Suchergebnisse. Bei Allerweltsnamen steht die Band\n` +
      '  manchmal weiter hinten oder wird nur mit Zusatz gefunden („Seth black metal").\n' +
      MANUAL_HINT +
      DECLINE_HINT
  );
}

const unchecked = [...failed, ...skipped];
if (unchecked.length > 0) {
  console.log(`\n✗ ${unchecked.length} nicht geprüft (bleiben vorerst ohne Button):`);
  for (const band of unchecked) console.log(`  - ${band}`);
  if (locked) {
    const until = new Date(Date.now() + locked.seconds * 1000).toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    });
    console.log(
      `  Spotify sperrt die App bis etwa ${until} Uhr (Europe/Berlin)${locked.quota ? ' – Kontingent erschöpft' : ''}.\n` +
        '  Das Kontingent gilt für das ganze Entwicklerkonto; bis dahin scheitert jeder Lauf.'
    );
  } else if (skipped.length > 0) {
    console.log(
      `  Das Budget von ${budget} Abfragen für diesen Lauf ist aufgebraucht (--budget). Es schützt das\n` +
        '  Spotify-Kontingent: Ist das erschöpft, ist die App für rund einen Tag gesperrt.'
    );
  }
  console.log('  Später erneut laufen lassen – eingetragene IDs bleiben stehen, gesucht wird nur, was fehlt.');
}
