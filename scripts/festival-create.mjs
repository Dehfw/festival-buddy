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
 * Zugang (LINEUP_API_URL, LINEUP_API_SECRET): siehe scripts/operator-api.mjs.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, operatorCall } from './operator-api.mjs';

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
/** 409 heißt hier immer: Die ID ist schon vergeben. */
const HINTS = {
  409:
    'Nichts geändert. Neue Bands gehen per `npm run lineup:announce`, eine neue\n' +
    '  Running Order per `npm run import:db` (braucht DATABASE_URL) oder im Veranstalter-Editor.',
};
const call = (method, body) => operatorCall(method, '/festival', body, HINTS);

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
