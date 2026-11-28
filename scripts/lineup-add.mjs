/**
 * Ergänzt den [announced]-Block einer Running-Order-Textdatei um Bands, die
 * dort noch fehlen – der erste Schritt der Lineup-Watch:
 *
 *   node scripts/lineup-add.mjs lineups/sb2027.txt --from quelle.txt --complete
 *   node scripts/lineup-add.mjs lineups/sb2027.txt "Amon Amarth" "Sabaton"
 *
 * Übergeben wird das Lineup, wie es die Quelle (Festival-Website) zeigt –
 * am besten komplett (`--from`, ein Name pro Zeile). Das Script entscheidet,
 * was davon wirklich neu ist, und hängt nur das unten an.
 *
 * Warum das ein Script macht und niemand von Hand: An "neu" hängt eine
 * Push-Nachricht an alle Crews des Festivals. Websites ändern aber gern
 * die Schreibweise ("Heavens Gate" → "Heaven's Gate", "AMON AMARTH"), und
 * eine andere Schreibweise ist ein anderer Slug – also scheinbar eine neue
 * Band, tatsächlich ein Duplikat samt Fehlalarm. Deshalb:
 *
 *   - gleicher Slug                      → bekannt, nichts zu tun
 *   - gleiche Band, andere Schreibweise  → bekannt, die Datei bleibt wie sie ist
 *   - verdächtig ähnlich                 → NICHT übernommen, im Bericht genannt;
 *                                          nach Prüfung mit --force übernehmen
 *   - sonst                              → neu, wird angehängt
 *
 * "Verdächtig ähnlich" heißt: Der Name liegt einen Tippfehler neben einer
 * bekannten Band ("Fleshgod Apocalpyse") oder beginnt wie sie bzw. sie wie
 * er ("John 5" → "John 5 And The Creatures") – UND die bekannte Band selbst
 * steht nicht mehr in der übergebenen Liste. Das ist das Muster einer
 * Umbenennung oder Korrektur auf der Website, nicht das einer neuen Band.
 * Führt die Quelle beide nebeneinander ("Death" und "Death Angel"), sind es
 * zwei Bands, und die neue wird ganz normal übernommen.
 *
 * Ob die bekannte Band "nicht mehr in der Liste steht", lässt sich nur
 * beurteilen, wenn die Liste das ganze Lineup ist. Die Erkennung von
 * Namenserweiterungen greift deshalb nur mit --complete; wer von Hand
 * einzelne Namen übergibt ("Death Angel", obwohl die Datei "Death" kennt),
 * meint, was er schreibt. Der Tippfehler-Abstand wird dagegen immer geprüft.
 *
 * Eine Zeile der Liste darf die Spotify-ID mitbringen, wenn die Quelle sie
 * liefert: `Avatar | spotify=4jpaXieuls7LVzG1uma5Rs`.
 *
 * Entfernt wird nie etwas. `--complete` (die Liste ist das vollständige
 * Lineup der Quelle) meldet zusätzlich, welche Bands der Datei in der
 * Quelle fehlen – das ist ein Hinweis für einen Menschen, keine Absage.
 *
 *   --dry-run   nur berichten, Datei nicht anfassen
 *   --force     auch verdächtig ähnliche Namen übernehmen. Eine andere
 *               Schreibweise einer bekannten Band übernimmt auch --force
 *               nicht: Das ergäbe dieselbe Band zweimal, mit zwei Slugs.
 *
 * Exit-Code 0, auch wenn nichts neu ist. Die letzte Zeile der Ausgabe ist
 * maschinenlesbar: `RESULT {"added":[…],"variants":[…],"similar":[…],…}`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}

/**
 * Vergleichsformen eines Namens: ohne Satzzeichen, Leerzeichen und
 * führendes "The", Umlaute in beiden üblichen Schreibweisen (ae/a). Zwei
 * Namen meinen dieselbe Band, sobald sich eine Form deckt.
 */
function looseKeys(name) {
  const lower = String(name).toLowerCase().replace(/&/g, ' and ');
  const tidy = (s) =>
    s
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^the /, '')
      .replace(/ /g, '');
  const german = tidy(
    lower.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  );
  const ascii = tidy(lower.replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, ''));
  return new Set([german, ascii].filter(Boolean));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** Ein Tippfehler Abstand bei kurzen Namen, zwei bei langen – darunter zu riskant. */
function isSimilar(a, b) {
  const len = Math.min(a.length, b.length);
  if (len < 5) return false;
  return levenshtein(a, b) <= (len >= 10 ? 2 : 1);
}

/** Wörter eines Namens in Vergleichsform – für die Umbenennungs-Erkennung */
function words(name) {
  return String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w, i) => w && !(i === 0 && w === 'the'));
}

/** Beginnt der eine Name wortweise mit dem anderen? ("John 5" / "John 5 And …") */
function isExtension(a, b) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 0 || short.length === long.length) return false;
  if (short.join('').length < 4) return false;
  return short.every((w, i) => long[i] === w);
}

function parseArgs(argv) {
  const args = { file: null, from: null, names: [], dryRun: false, force: false, complete: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--complete') args.complete = true;
    else if (argv[i].startsWith('--')) fail(`unbekannte Option ${argv[i]}`);
    else if (!args.file) args.file = argv[i];
    else args.names.push(argv[i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.file || (!args.from && args.names.length === 0)) {
  console.error(
    'Aufruf: node scripts/lineup-add.mjs <lineups/x.txt> [--from namen.txt] ["Band" …]\n' +
      '        [--complete]  die Liste ist das vollständige Lineup der Quelle\n' +
      '        [--dry-run]   nur berichten\n' +
      '        [--force]     auch verdächtig ähnliche Namen übernehmen'
  );
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Kandidaten einlesen                                                 */
/* ------------------------------------------------------------------ */

const candidates = [];
if (args.from) {
  const text = await readFile(path.resolve(args.from), 'utf8').catch(() =>
    fail(`${args.from} nicht lesbar`)
  );
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) candidates.push(trimmed);
  }
}
candidates.push(...args.names);

/** Name -> Spotify-ID, sofern die Liste sie mitbringt */
const spotifyIds = new Map();
for (const [i, raw] of candidates.entries()) {
  const [first, ...options] = raw.split('|').map((p) => p.trim());
  const name = first.replace(/\s+/g, ' ');
  for (const opt of options) {
    const m = /^spotify\s*=\s*([A-Za-z0-9]{1,40})$/.exec(opt);
    if (!m) fail(`unbekannte Option "${opt}" bei "${first}" – erlaubt ist nur spotify=<ID>`);
    spotifyIds.set(name, m[1]);
  }
  if (name.length < 1 || name.length > 80) fail(`Bandname muss 1–80 Zeichen lang sein: "${raw}"`);
  // Die Zeichen hätten in der Textdatei eine eigene Bedeutung
  if (/[[\]]/.test(name) || name.startsWith('#')) fail(`Bandname mit [ ] oder # am Anfang: "${raw}"`);
  if (/^(festival|edition|dataVersion|stage|day)\s*:/i.test(name)) fail(`Bandname sieht aus wie eine Kopfzeile: "${raw}"`);
  if (/^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s/.test(name)) fail(`Bandname sieht aus wie eine Slot-Zeile: "${raw}"`);
  candidates[i] = name;
}

/* ------------------------------------------------------------------ */
/* Bestand der Textdatei                                               */
/* ------------------------------------------------------------------ */

const filePath = path.resolve(args.file);
const source = await readFile(filePath, 'utf8').catch(() => fail(`${args.file} nicht lesbar`));
const eol = source.includes('\r\n') ? '\r\n' : '\n';
const lines = source.split(/\r?\n/);

const SLOT_LINE = /^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s+(.+)$/;
const HEADER_LINE = /^(festival|edition|dataVersion|stage|day)\s*:/i;

/** Bands der Datei: Slug -> Name; dazu die Vergleichsformen */
const known = new Map();
let announcedStart = -1;
/** Letzte Bandzeile im [announced]-Block – dahinter wird angehängt */
let announcedLast = -1;
let hasSlots = false;
let section = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.startsWith('#')) continue;
  if (line.startsWith('[')) {
    section = /^\[announced\]$/i.test(line) ? 'announced' : 'slots';
    if (section === 'announced' && announcedStart < 0) {
      announcedStart = i;
      announcedLast = i;
    }
    continue;
  }
  if (HEADER_LINE.test(line)) continue;
  const slot = SLOT_LINE.exec(line);
  let band = null;
  if (slot) {
    band = slot[1];
    hasSlots = true;
  } else if (section === 'announced') {
    band = line;
    announcedLast = i;
  }
  if (!band) continue;
  const name = band.split('|')[0].trim();
  if (name) known.set(slugify(name), name);
}

const knownLoose = new Map();
for (const name of known.values()) for (const key of looseKeys(name)) knownLoose.set(key, name);

/* ------------------------------------------------------------------ */
/* Einordnen                                                           */
/* ------------------------------------------------------------------ */

const added = [];
const variants = [];
const similar = [];
let alreadyKnown = 0;
// Alles, was die übergebene Liste nennt – vorab, weil die Frage "steht die
// bekannte Band selbst noch in der Quelle?" die ganze Liste braucht.
const seenLoose = new Set();
for (const name of candidates) for (const key of looseKeys(name)) seenLoose.add(key);
const inSource = (name) => [...looseKeys(name)].some((k) => seenLoose.has(k));
/** Bestand vor diesem Lauf – nur gegen ihn wird auf Ähnlichkeit geprüft */
const before = [...known.values()];

for (const name of candidates) {
  const slug = slugify(name);
  const keys = looseKeys(name);

  if (known.has(slug)) {
    alreadyKnown++;
    continue;
  }
  const sameBand = [...keys].map((k) => knownLoose.get(k)).find(Boolean);
  if (sameBand) {
    variants.push({ name, known: sameBand });
    continue;
  }
  const nameWords = words(name);
  const lookalike = before.find(
    (other) =>
      !inSource(other) &&
      ((args.complete && isExtension(nameWords, words(other))) ||
        [...looseKeys(other)].some((o) => [...keys].some((k) => isSimilar(k, o))))
  );
  if (lookalike && !args.force) {
    similar.push({ name, known: lookalike });
    continue;
  }
  added.push(name);
  known.set(slug, name);
  for (const key of keys) knownLoose.set(key, name);
}

/** Bands der Datei, die in einer vollständigen Quell-Liste nicht vorkommen */
const missing = [];
if (args.complete) {
  const addedSet = new Set(added);
  for (const name of known.values()) {
    if (addedSet.has(name)) continue;
    if (!inSource(name)) missing.push(name);
  }
}

/* ------------------------------------------------------------------ */
/* Schreiben                                                           */
/* ------------------------------------------------------------------ */

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const toLine = (name) =>
  spotifyIds.has(name) ? `${name} | spotify=${spotifyIds.get(name)}` : name;

if (added.length > 0 && !args.dryRun) {
  if (announcedStart < 0) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', '[announced]', ...added.map(toLine), '');
  } else {
    lines.splice(announcedLast + 1, 0, ...added.map(toLine));
  }
  // Die Datenversion zeigt die App an – sie soll sagen, von wann der Stand ist.
  const versionLine = lines.findIndex((l) => /^dataVersion\s*:/i.test(l.trim()));
  const version = `dataVersion: ${today} (${known.size} Bands${hasSlots ? ' im Lineup' : ' angekündigt'})`;
  if (versionLine >= 0) lines[versionLine] = version;
  else {
    const edition = lines.findIndex((l) => /^edition\s*:/i.test(l.trim()));
    lines.splice(edition >= 0 ? edition + 1 : 0, 0, version);
  }
  await writeFile(filePath, lines.join(eol), 'utf8');
}

/* ------------------------------------------------------------------ */
/* Bericht                                                             */
/* ------------------------------------------------------------------ */

const rel = path.relative(process.cwd(), filePath);
console.log(
  `${rel}: ${candidates.length} Namen geprüft – ${added.length} neu, ${alreadyKnown} bekannt` +
    (variants.length ? `, ${variants.length} in anderer Schreibweise bekannt` : '') +
    (similar.length ? `, ${similar.length} verdächtig ähnlich` : '')
);
for (const name of added) console.log(`  + ${name}`);
if (variants.length) {
  console.log('\nAndere Schreibweise einer bekannten Band (Datei bleibt, wie sie ist):');
  for (const v of variants) console.log(`  = ${v.name}  ↔  ${v.known}`);
}
if (similar.length) {
  console.log(
    '\n⚠ Verdächtig ähnlich zu einer bekannten Band, die selbst nicht mehr in der Liste\n' +
      '  steht – NICHT übernommen. Umbenennung/Tippfehler der Quelle oder wirklich eine\n' +
      '  andere Band? Erst prüfen, dann einzeln mit --force:'
  );
  for (const s of similar) console.log(`  ? ${s.name}  ↔  ${s.known}`);
}
if (missing.length) {
  console.log(
    `\n⚠ ${missing.length} Bands stehen in der Datei, aber nicht in der Quelle – abgesagt oder\n` +
      '  nur anders gelistet? Wird nicht automatisch entfernt:'
  );
  for (const name of missing) console.log(`  − ${name}`);
}
if (added.length > 0) {
  console.log(
    args.dryRun
      ? '\n(dry-run – Datei nicht geändert)'
      : `\n✓ ${added.length} Bands an [announced] angehängt, dataVersion auf ${today} gesetzt`
  );
}
console.log(
  `RESULT ${JSON.stringify({ added, variants, similar, missing, known: alreadyKnown, total: known.size, written: added.length > 0 && !args.dryRun })}`
);
