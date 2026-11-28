/**
 * Benennt eine angekündigte Band um – in der laufenden App und in der
 * Running-Order-Textdatei:
 *
 *   node scripts/lineup-rename.mjs lineups/woa2027.txt --festival woa2027 \
 *     "John 5" "John 5 And The Creatures" --dry-run
 *   node scripts/lineup-rename.mjs lineups/woa2027.txt --festival woa2027 \
 *     "John 5" "John 5 And The Creatures"
 *
 * Wofür: Die Quelle führt eine Band unter neuem Namen. `lineup:add` hält
 * so etwas als "verdächtig ähnlich" zurück, weil es keine neue Band ist –
 * und einfach den Namen in der Textdatei zu ändern wäre falsch: Aus dem
 * Namen entsteht der Slug, an dem die gemerkten Bands der Nutzer hängen.
 * Die App zieht die Merkungen deshalb beim Umbenennen auf den neuen Slug
 * mit (PATCH /api/operator/lineup). Eine Mitteilung geht dabei nicht raus.
 *
 * Reihenfolge: erst die App, dann die Datei. Lehnt die App ab, bleibt die
 * Datei unangetastet und beide Stände passen weiter zusammen.
 *
 *   --dry-run     zeigt, was passieren würde (inkl. Zahl der Merkungen)
 *   --file-only   nur die Textdatei ändern – wenn die App schon umbenannt
 *                 ist und nur die Datei nachgezogen werden muss
 *
 * Geht nur für Bands im [announced]-Block und nur ohne Running Order. Mit
 * Spielzeiten steckt der Name auch in den Slot-IDs; das ist Sache des
 * Veranstalter-Editors bzw. des Imports mit `id=` (Skill lineup-import).
 *
 * Danach: `npm run lineup -- <datei> --festival <id>` und committen.
 * Zugang (LINEUP_API_URL, LINEUP_API_SECRET): siehe scripts/operator-api.mjs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, operatorCall } from './operator-api.mjs';

/** identisch zu bandSlug() in src/lib/types.ts */
function slugify(input) {
  const slug = String(input)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}

function parseArgs(argv) {
  const args = { file: null, festival: null, names: [], dryRun: false, fileOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--file-only') args.fileOnly = true;
    else if (argv[i].startsWith('--')) fail(`unbekannte Option ${argv[i]}`);
    else if (!args.file) args.file = argv[i];
    else args.names.push(argv[i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.file || args.names.length !== 2 || (!args.festival && !args.fileOnly)) {
  console.error(
    'Aufruf: node scripts/lineup-rename.mjs <lineups/x.txt> --festival <id> "Alter Name" "Neuer Name"\n' +
      '        [--dry-run]    nur zeigen, was passieren würde\n' +
      '        [--file-only]  nur die Textdatei ändern (App ist schon umbenannt)'
  );
  process.exit(2);
}
if (args.festival && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(args.festival)) {
  fail('--festival <id> ist kein gültiger Festival-Slug');
}
const from = args.names[0].replace(/\s+/g, ' ').trim();
const to = args.names[1].replace(/\s+/g, ' ').trim();
if (!from || to.length < 1 || to.length > 80) fail('Der neue Bandname muss 1–80 Zeichen lang sein');
if (/[|[\]]/.test(to) || to.startsWith('#')) fail(`Neuer Name mit | [ ] oder # am Anfang: "${to}"`);
const fromSlug = slugify(from);
const toSlug = slugify(to);

/* ---------- Textdatei prüfen, bevor irgendetwas live geht ---------- */

const filePath = path.resolve(args.file);
const source = await readFile(filePath, 'utf8').catch(() => fail(`${args.file} nicht lesbar`));
const eol = source.includes('\r\n') ? '\r\n' : '\n';
const lines = source.split(/\r?\n/);

const SLOT_LINE = /^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s+(.+)$/;
const HEADER_LINE = /^(festival|edition|dataVersion|stage|day)\s*:/i;

let target = -1;
let inAnnounced = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.startsWith('#')) continue;
  if (line.startsWith('[')) {
    inAnnounced = /^\[announced\]$/i.test(line);
    continue;
  }
  if (HEADER_LINE.test(line)) continue;
  const slot = SLOT_LINE.exec(line);
  const name = (slot ? slot[1] : line).split('|')[0].trim();
  if (!name) continue;
  const slug = slugify(name);
  if (slot && (slug === fromSlug || slug === toSlug)) {
    fail(
      `Zeile ${i + 1}: "${name}" hat eine Spielzeit. Mit Running Order steckt der Name in den Slot-IDs –\n` +
        '  umbenennen im Veranstalter-Editor oder per Import mit id= (Skill lineup-import).'
    );
  }
  if (!slot && inAnnounced) {
    if (slug === fromSlug && target < 0) target = i;
    else if (slug === toSlug && toSlug !== fromSlug) {
      fail(`Zeile ${i + 1}: "${name}" steht schon in der Datei – zusammenlegen kann dieser Weg nicht.`);
    }
  }
}
if (target < 0) fail(`"${from}" steht nicht im [announced]-Block von ${args.file}`);

/* ---------- App ---------- */

if (!args.fileOnly) {
  const result = await operatorCall(
    'PATCH',
    '/lineup',
    { festivalId: args.festival, from, to, dryRun: args.dryRun },
    {
      404: `Steht "${from}" live überhaupt (noch) so im Lineup? Prüfen: npm run lineup:announce -- --festival ${args.festival} --status`,
      409: 'Nichts geändert.',
    }
  );
  const marks = result.slugChanged
    ? `${result.interests} ${result.interests === 1 ? 'Merkung zieht' : 'Merkungen ziehen'} mit um`
    : 'der Slug bleibt, Merkungen sind nicht betroffen';
  console.log(
    `${args.dryRun ? '(dry-run) ' : '✓ '}${result.festival}: "${result.from.name}" → "${result.to.name}" ` +
      `${args.dryRun ? 'würde umbenannt' : 'umbenannt'} – ${marks}. Keine Mitteilung, kein Push.`
  );
}

/* ---------- Textdatei ---------- */

if (args.dryRun) {
  console.log(`(dry-run) ${args.file}, Zeile ${target + 1}: "${lines[target].trim()}" würde angepasst`);
  process.exit(0);
}

// Nur den Namen vor dem ersten "|" ersetzen – Optionen wie spotify= bleiben.
const original = lines[target];
const indent = original.match(/^\s*/)[0];
const [, ...options] = original.trim().split('|').map((p) => p.trim());
lines[target] = indent + [to, ...options].join(' | ');
await writeFile(filePath, lines.join(eol), 'utf8');

const rel = path.relative(process.cwd(), filePath);
console.log(`✓ ${rel}, Zeile ${target + 1}: ${lines[target].trim()}`);
console.log(
  `→ Jetzt die Importdatei neu bauen und beides committen:\n` +
    `  npm run lineup -- ${rel}${args.festival ? ` --festival ${args.festival}` : ' --festival <id>'}`
);
