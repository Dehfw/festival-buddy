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
 * Rein additiv: Es wird nie eine Band entfernt, Slots und Tage bleiben,
 * wie sie sind. Für eine Running Order (Datei mit Slots) ist das der
 * falsche Weg – die geht per `npm run import:db` rein.
 *
 *   LINEUP_API_URL     Basis-URL der App (Default https://festivalbuddy.app)
 *   LINEUP_API_SECRET  Bearer-Secret; in Cloud-Sessions setzt es der Proxy ein
 */
import './env.mjs';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Node-fetch beachtet HTTPS_PROXY nur mit NODE_USE_ENV_PROXY (ab 22.21 / 24).
// In Umgebungen mit Pflicht-Proxy (Cloud-Session) einmal mit der Variable
// neu starten, statt mit einem unverständlichen Verbindungsfehler zu enden.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const res = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(res.status ?? 1);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { festival: null, file: null, dryRun: false, status: false, push: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
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

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
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
  bands: timetable.bands.map((b) => ({
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
    const p = result.push ?? { sent: 0, gone: 0, failed: 0, users: 0 };
    console.log(`  Mitteilung: „${result.announcement.title}" – ${result.announcement.body}`);
    console.log(
      `  Push: ${p.users} von ${result.audience} Gruppenmitgliedern erreicht ` +
        `(${p.sent} Geräte, ${p.gone} tote Abos entfernt, ${p.failed} Fehler). ` +
        'Alle anderen sehen die Mitteilung in der App (Glocke).'
    );
  } else if (!args.dryRun) {
    console.log('  Still eingepflegt (--no-push): keine Mitteilung, kein Push.');
  }
}
console.log(
  `RESULT ${JSON.stringify({ dryRun: args.dryRun, added: added.map((b) => b.name), total: result.total, announcementId: result.announcement?.id ?? null, push: result.push ?? null, audience: result.audience ?? null })}`
);
