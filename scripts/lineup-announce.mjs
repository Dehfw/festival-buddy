/**
 * Schickt den Band-Pool einer Importdatei an die laufende App: Was dort
 * noch fehlt, wird eingepflegt, und alle Mitglieder aller Gruppen des
 * Festivals bekommen eine Mitteilung samt Push („3 neue Bands im Lineup").
 *
 *   node scripts/lineup-announce.mjs --festival sb2027            # data/sb2027.json
 *   node scripts/lineup-announce.mjs --festival sb2027 --dry-run  # nur zeigen, was neu wäre
 *   node scripts/lineup-announce.mjs --festival sb2027 --status   # Live-Stand vs. Datei
 *   node scripts/lineup-announce.mjs --festival sb2027 --no-push  # still einpflegen
 *
 * Der Weg für die Lineup-Watch und für alles ohne Datenbank-Zugang: Es
 * braucht nur HTTPS zur App und das LINEUP_API_SECRET, keine DATABASE_URL
 * und keine VAPID-Keys – die liegen beim Server. Geschickt wird immer der
 * ganze Pool der Datei; der Server entscheidet am Live-Stand, was neu ist.
 * Ein zweiter Lauf mit derselben Datei meldet deshalb „nichts Neues" und
 * verschickt nichts.
 *
 * Die Bands gehen in der Reihenfolge der Textdatei raus (lineups/<id>.txt,
 * anders mit --lineup <pfad>), nicht in der alphabetischen der Importdatei:
 * Die Mitteilung nennt die neuen Bands in der Reihenfolge der Anfrage und
 * kürzt hinten – in der Textdatei stehen die Headliner einer Welle vorn.
 *
 * Rein additiv: Es wird nie eine Band entfernt, Slots und Tage bleiben,
 * wie sie sind. Für eine Running Order (Datei mit Slots) ist das der
 * falsche Weg – die geht per `npm run import:db` rein.
 *
 *   LINEUP_API_URL     Basis-URL der App (Default https://festivalbuddy.app)
 *   LINEUP_API_SECRET  Bearer-Secret; in Cloud-Sessions setzt es der Proxy ein
 */
import './env.mjs';
import './proxy.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { festival: null, file: null, lineup: null, dryRun: false, status: false, push: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
    else if (argv[i] === '--lineup') args.lineup = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--status') args.status = true;
    else if (argv[i] === '--no-push') args.push = false;
    else if (argv[i].startsWith('--')) fail(`unbekannte Option ${argv[i]}`);
    else args.file ??= argv[i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.festival || !/^[a-z0-9-]{2,40}$/.test(args.festival)) {
  fail('Bitte --festival <id> angeben (z. B. --festival sb2027)');
}

const base = (process.env.LINEUP_API_URL || 'https://festivalbuddy.app').replace(/\/+$/, '');
const endpoint = `${base}/api/operator/lineup`;
// Ohne eigenes Secret trotzdem einen Authorization-Header schicken: In
// Cloud-Sessions ersetzt der Proxy ihn durch das hinterlegte Secret.
const authorization = `Bearer ${process.env.LINEUP_API_SECRET || 'proxy-injected'}`;

const filePath = path.resolve(args.file ?? path.join('data', `${args.festival}.json`));
const timetable = JSON.parse(
  await readFile(filePath, 'utf8').catch(() => fail(`${filePath} nicht lesbar`))
);
if (!Array.isArray(timetable.bands) || timetable.bands.length === 0) {
  fail(`${filePath}: keine Bands im Feld "bands" – erst npm run lineup laufen lassen`);
}
if (Array.isArray(timetable.slots) && timetable.slots.length > 0) {
  fail(
    `${filePath} enthält eine Running Order (${timetable.slots.length} Slots). ` +
      'Die geht per `npm run import:db` rein, nicht über die Lineup-Ergänzung.'
  );
}

/** identisch zu bandSlug() in src/lib/types.ts */
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

/**
 * Bands in die Reihenfolge der Textdatei bringen (erstes Vorkommen zählt).
 * Fehlt die Datei, bleibt es bei der alphabetischen Reihenfolge der
 * Importdatei – das ändert nur, welche Namen eine gekürzte Mitteilung nennt.
 */
async function inAnnouncementOrder(bands) {
  const lineupPath = path.resolve(args.lineup ?? path.join('lineups', `${args.festival}.txt`));
  const text = await readFile(lineupPath, 'utf8').catch(() => null);
  if (text === null) {
    if (args.lineup) fail(`${lineupPath} nicht lesbar`);
    console.log(
      `  (${path.relative(process.cwd(), lineupPath)} fehlt – Bands gehen alphabetisch raus)`
    );
    return bands;
  }
  const position = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) continue;
    if (/^(festival|edition|dataVersion|stage|day)\s*:/i.test(line)) continue;
    const slot = /^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s+(.+)$/.exec(line);
    const name = (slot ? slot[1] : line).split('|')[0].trim();
    const slug = slugify(name);
    if (name && !position.has(slug)) position.set(slug, position.size);
  }
  const at = (b) => position.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
  // Array.sort ist stabil: Bands, die die Textdatei nicht kennt, behalten
  // untereinander ihre Reihenfolge und landen hinten.
  return [...bands].sort((a, b) => at(a) - at(b));
}

/**
 * Abfragen und Probeläufe antworten sofort – dort ein eigener Timeout.
 * Der echte Versand wartet serverseitig auf den Push-Fan-out an alle Abos
 * des Festivals und bekommt bewusst keinen eigenen: Nodes fetch (undici)
 * gibt ohnehin nach 5 Minuten ohne Antwort-Header auf, länger ginge nur
 * mit einem eigenen Dispatcher. Entscheidend ist, was das Ausbleiben der
 * Antwort dann bedeutet – siehe statusUnclear().
 */
const QUICK_TIMEOUT_MS = 120_000;

/**
 * Die Anfrage ist raus, nur die Antwort fehlt. Die App speichert Bands und
 * Mitteilung, BEVOR sie pusht – sehr wahrscheinlich ist also alles
 * eingepflegt und der Versand läuft noch oder ist durch. Ein zweiter
 * Aufruf fände "nichts Neues" und würde den Lauf in die Irre führen.
 */
function statusUnclear(what) {
  fail(
    `Keine Antwort von ${base} (${what}) – der Status ist unklar, nicht gescheitert.\n` +
      '  Vermutlich sind die Bands eingepflegt und die Mitteilung ist angelegt. NICHT einfach\n' +
      `  wiederholen, sondern prüfen: npm run lineup:announce -- --festival ${args.festival} --status`
  );
}

/** undici-Fehler, bei denen die Anfrage ankam, die Antwort aber ausblieb */
const NO_ANSWER_CODES = ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'];

async function call(method, url, body) {
  const sending = method === 'POST' && body?.dryRun === false;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      ...(sending ? {} : { signal: AbortSignal.timeout(QUICK_TIMEOUT_MS) }),
    });
  } catch (err) {
    const noAnswer =
      err?.name === 'TimeoutError' ||
      err?.name === 'AbortError' ||
      NO_ANSWER_CODES.includes(err?.cause?.code);
    if (sending && noAnswer) statusUnclear(err?.cause?.message ?? err?.message ?? err);
    fail(
      `${base} nicht erreichbar: ${err?.cause?.message ?? err?.message ?? err}\n` +
        '  In einer Cloud-Session muss der Host in der Umgebung freigegeben sein.'
    );
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keine JSON-Antwort (Proxy-Fehlerseite, 404-HTML vor dem Deploy)
  }
  // 502/503/504 ohne JSON kommt nicht von der App, sondern von einem Proxy
  // davor (Traefik, Cloud-Proxy), der die lange Verbindung aufgegeben hat –
  // für den echten Versand dieselbe Lage wie eine ausgebliebene Antwort.
  if (sending && json === null && [502, 503, 504].includes(res.status)) {
    statusUnclear(`HTTP ${res.status} von einem Proxy vor der App`);
  }
  if (!res.ok) {
    const hints = {
      401: 'Secret stimmt nicht – LINEUP_API_SECRET hier und in der App vergleichen.',
      404: json ? '' : 'Den Endpunkt gibt es dort (noch) nicht – ist der Stand schon deployt?',
      409: 'Für dieses Festival ist der Voll-Import bzw. der Veranstalter-Editor zuständig.',
      503: 'In der App ist LINEUP_API_SECRET nicht gesetzt.',
    };
    fail(
      `${method} ${url} → ${res.status}: ${json?.error ?? text.slice(0, 200)}` +
        (hints[res.status] ? `\n  ${hints[res.status]}` : '')
    );
  }
  return json;
}

if (args.status) {
  const live = await call('GET', `${endpoint}?festival=${encodeURIComponent(args.festival)}`);
  const liveSlugs = new Set(live.bands.map((b) => b.slug));
  const fileSlugs = new Set(timetable.bands.map((b) => b.slug));
  const onlyFile = timetable.bands.filter((b) => !liveSlugs.has(b.slug));
  const onlyLive = live.bands.filter((b) => !fileSlugs.has(b.slug));
  console.log(`${live.festival} (${args.festival}) – live: ${live.bands.length} Bands, Stand "${live.dataVersion}"`);
  if (live.hasTimetable) console.log('  Hat bereits eine Running Order – die Lineup-Ergänzung nimmt hier nichts mehr an.');
  console.log(`  Nur in der Datei (würde ergänzt): ${onlyFile.length}`);
  for (const b of onlyFile) console.log(`    + ${b.name}`);
  console.log(`  Nur live (fehlt in der Datei – beim nächsten Voll-Import verschwände sie): ${onlyLive.length}`);
  for (const b of onlyLive) console.log(`    − ${b.name}`);
  console.log(`RESULT ${JSON.stringify({ live: live.bands.length, onlyFile: onlyFile.map((b) => b.name), onlyLive: onlyLive.map((b) => b.name), hasTimetable: live.hasTimetable })}`);
  process.exit(0);
}

const result = await call('POST', endpoint, {
  festivalId: args.festival,
  bands: (await inAnnouncementOrder(timetable.bands)).map((b) => ({
    name: b.name,
    ...(b.spotifyArtistId ? { spotifyArtistId: b.spotifyArtistId } : {}),
  })),
  ...(timetable.dataVersion ? { dataVersion: timetable.dataVersion } : {}),
  dryRun: args.dryRun,
  notify: args.push,
});

const added = result.added ?? [];
if (added.length === 0) {
  console.log(
    `✓ ${result.festival}: nichts Neues – alle ${timetable.bands.length} Bands der Datei sind schon live` +
      (result.enriched ? ` (${result.enriched} Spotify-IDs nachgetragen)` : '')
  );
} else {
  console.log(
    `${args.dryRun ? '(dry-run) ' : '✓ '}${result.festival}: ${added.length} neue Bands` +
      `${args.dryRun ? ' würden eingepflegt' : ' eingepflegt'} (${result.total} im Lineup)`
  );
  for (const b of added) console.log(`  + ${b.name}`);
  if (result.announcement) {
    console.log(`  Mitteilung: „${result.announcement.title}" – ${result.announcement.body}`);
    if (result.pushFailed || !result.push) {
      console.log(
        '  ⚠ Der Push-Versand ist serverseitig gescheitert. Bands und Mitteilung sind\n' +
          '    gespeichert (in der App über die Glocke sichtbar), ein Push ging nicht raus.\n' +
          '    Ein erneuter Lauf holt ihn nicht nach – bei Bedarf npm run push:broadcast.'
      );
    } else {
      const p = result.push;
      console.log(
        `  Push: ${p.users} von ${result.audience} Gruppenmitgliedern erreicht ` +
          `(${p.sent} Geräte, ${p.gone} tote Abos entfernt, ${p.failed} Fehler). ` +
          'Alle anderen sehen die Mitteilung in der App (Glocke).'
      );
    }
  } else if (!args.dryRun) {
    console.log('  Still eingepflegt (--no-push): keine Mitteilung, kein Push.');
  }
}
console.log(
  `RESULT ${JSON.stringify({ dryRun: args.dryRun, added: added.map((b) => b.name), total: result.total, announcementId: result.announcement?.id ?? null, push: result.push ?? null, pushFailed: result.pushFailed ?? false, audience: result.audience ?? null })}`
);
