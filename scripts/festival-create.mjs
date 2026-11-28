/**
 * Legt ein neues Festival in der laufenden App an – ohne Datenbank-Zugang,
 * per HTTPS über die Betreiber-API:
 *
 *   node scripts/festival-create.mjs --festival psoa2027            # data/psoa2027.json
 *   node scripts/festival-create.mjs --festival psoa2027 --dry-run  # nur prüfen
 *   node scripts/festival-create.mjs --list                         # was gibt es schon?
 *
 * Geschickt wird die Importdatei im App-Timetable-Format, also genau das,
 * was `npm run lineup` gebaut und geprüft hat – mit oder ohne Running
 * Order. Für `scripts/import-festival.mjs` braucht es die DATABASE_URL;
 * dieser Weg kommt mit dem LINEUP_API_SECRET aus und ist deshalb der für
 * Cloud-Sessions.
 *
 * Angelegt wird nur, was es noch nicht gibt. Existiert die ID schon,
 * antwortet die App 409 und ändert nichts – ein bestehendes Festival
 * ersetzt weiterhin nur der Voll-Import, mit einem Menschen, der auf
 * entfallene Slot-IDs schaut. Ein neues Festival hat noch keine Gruppen;
 * es geht deshalb auch keine Mitteilung raus.
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
  const args = { festival: null, file: null, dryRun: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--list') args.list = true;
    else if (argv[i].startsWith('--')) fail(`unbekannte Option ${argv[i]}`);
    else args.file ??= argv[i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const base = (process.env.LINEUP_API_URL || 'https://festivalbuddy.app').replace(/\/+$/, '');
const endpoint = `${base}/api/operator/festival`;
// Ohne eigenes Secret trotzdem einen Authorization-Header schicken: In
// Cloud-Sessions ersetzt der Proxy ihn durch das hinterlegte Secret.
const authorization = `Bearer ${process.env.LINEUP_API_SECRET || 'proxy-injected'}`;

async function call(method, body) {
  let res;
  try {
    res = await fetch(endpoint, {
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
      404: 'Den Endpunkt gibt es dort (noch) nicht – ist der Stand schon deployt?',
      409:
        'Nichts geändert. Neue Bands gehen per `npm run lineup:announce`, eine neue\n' +
        '  Running Order per `npm run import:db` (braucht DATABASE_URL) oder im Veranstalter-Editor.',
      503: 'In der App ist LINEUP_API_SECRET nicht gesetzt.',
    };
    fail(
      `${method} ${endpoint} → ${res.status}: ${json?.error ?? text.slice(0, 200)}` +
        (hints[res.status] ? `\n  ${hints[res.status]}` : '')
    );
  }
  return json;
}

if (args.list) {
  const { festivals } = await call('GET');
  for (const f of festivals) {
    console.log(
      `${f.id.padEnd(16)} ${f.name} – ${f.hasLineup ? 'Running Order' : f.bandCount > 0 ? `${f.bandCount} Bands angekündigt` : 'Lineup folgt'}`
    );
  }
  process.exit(0);
}

if (!args.festival || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(args.festival)) {
  fail('Bitte --festival <id> angeben (z. B. --festival psoa2027) oder --list');
}

const filePath = path.resolve(args.file ?? path.join('data', `${args.festival}.json`));
const raw = await readFile(filePath, 'utf8').catch(() =>
  fail(`${filePath} nicht lesbar – erst npm run lineup laufen lassen`)
);
let timetable;
try {
  timetable = JSON.parse(raw);
} catch (err) {
  fail(`${filePath} ist kein gültiges JSON: ${err.message}`);
}

const result = await call('POST', {
  festivalId: args.festival,
  festival: timetable.festival,
  edition: timetable.edition,
  dataVersion: timetable.dataVersion,
  days: timetable.days,
  stages: timetable.stages,
  slots: timetable.slots,
  bands: timetable.bands,
  dryRun: args.dryRun,
});

const what =
  result.slots > 0
    ? `${result.slots} Slots auf ${result.stages} Bühnen`
    : result.bands > 0
      ? `${result.bands} angekündigte Bands, noch ohne Running Order`
      : 'noch ohne Bands („Lineup folgt")';
console.log(
  `${args.dryRun ? '(dry-run) ' : '✓ '}${result.festival} (${result.festivalId}) ` +
    `${args.dryRun ? 'würde angelegt' : 'angelegt'}: ${result.edition} – ${result.days} Tage, ${what}`
);
if (!args.dryRun) {
  console.log('  Ab jetzt lässt sich dafür eine Gruppe gründen. Eine Mitteilung ging nicht raus.');
}
console.log(`RESULT ${JSON.stringify(result)}`);
