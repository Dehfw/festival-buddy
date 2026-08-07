/**
 * Die komplette Strecke von der Running-Order-Textdatei zur geprüften
 * Importdatei, in einem Kommando:
 *
 *   npm run lineup -- lineups/psoa2026.txt --festival psoa2026
 *
 * 1. Spotify-IDs ergänzen  (spotify-ids.mjs)
 * 2. Importdatei bauen     (build-timetable.mjs)
 * 3. Datei prüfen          (validate-timetable.mjs)
 *
 * Die Reihenfolge ist der Grund für dieses Script: Die Spotify-Suche
 * schreibt in die Textdatei, also muss sie vor dem Bauen laufen – sonst
 * landen die IDs erst beim übernächsten Durchlauf im JSON. Als
 * freiwilliger Zwischenschritt wird das zuverlässig vergessen, und der
 * "Auf Spotify anhören"-Button fehlt dann still.
 *
 * Fehlende Spotify-Zugangsdaten halten die Strecke nicht auf – der
 * Schritt wird übersprungen und gemeldet. Ein Fehler beim Bauen oder
 * Prüfen bricht dagegen ab: Was hier durchrutscht, geht sonst kaputt in
 * die Datenbank.
 *
 * Der Import selbst ist bewusst nicht Teil davon; er braucht eine
 * Bestätigung, sobald der Vergleich entfallene Slot-IDs meldet (siehe
 * .claude/skills/lineup-import/SKILL.md).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function parseArgs(argv) {
  const args = { file: null, festival: null, out: null, force: false, skipSpotify: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--festival') args.festival = argv[++i];
    else if (argv[i] === '-o' || argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--no-spotify') args.skipSpotify = true;
    else if (!argv[i].startsWith('-')) args.file ??= argv[i];
  }
  return args;
}

const { file, festival, out, force, skipSpotify } = parseArgs(process.argv.slice(2));
if (!file || (!festival && !out)) {
  console.error(
    'Aufruf: node scripts/lineup.mjs <lineups/x.txt> --festival <id> [-o data/x.json]\n' +
      '        [--no-spotify]  Spotify-Suche auslassen\n' +
      '        [--force]       vorhandene Spotify-IDs neu auflösen'
  );
  process.exit(2);
}

const outPath = out ?? path.join('data', `${festival}.json`);

function run(label, script, args) {
  console.log(`\n\x1b[1m── ${label}\x1b[0m`);
  const res = spawnSync(process.execPath, [path.join('scripts', script), ...args], {
    stdio: 'inherit',
    // Die Einzelscripts weisen am Ende auf den jeweils nächsten Schritt
    // hin – innerhalb der Strecke ist das nur Rauschen.
    env: { ...process.env, LINEUP_PIPELINE: '1' },
  });
  if (res.error) {
    console.error(`✗ ${script} konnte nicht gestartet werden: ${res.error.message}`);
    process.exit(1);
  }
  return res.status ?? 1;
}

if (skipSpotify) {
  console.log('\n⏭  Spotify-Suche ausgelassen (--no-spotify)');
} else {
  run('Spotify-IDs ergänzen', 'spotify-ids.mjs', [
    file,
    '--optional',
    ...(force ? ['--force'] : []),
  ]);
}

const built = run('Importdatei bauen', 'build-timetable.mjs', [
  file,
  ...(out ? ['-o', out] : ['--festival', festival]),
]);
if (built !== 0) process.exit(built);

const checked = run('Datei prüfen', 'validate-timetable.mjs', [
  outPath,
  ...(festival ? ['--festival', festival] : []),
]);

if (checked !== 0) {
  console.log(`\n✗ ${outPath} hat Fehler – bitte beheben, dann erneut laufen lassen.`);
  process.exit(checked);
}

console.log(
  `\n\x1b[1m✓ ${outPath} ist fertig und geprüft.\x1b[0m\n` +
    '  Warnungen oben bitte lesen – vor allem entfallene Slot-IDs.\n' +
    `  Import:  npm run import:db -- --festival ${festival ?? '<id>'} ${outPath}`
);
