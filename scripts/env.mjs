/**
 * Lädt `.env.local` in process.env – als Seiteneffekt beim Import:
 *
 *   import './env.mjs';   // muss vor allem stehen, was process.env liest
 *
 * Node bringt dafür zwar `--env-file-if-exists` mit, aber erst ab 22.9
 * bzw. 20.18; ältere Versionen brechen mit "bad option" ab, bevor das
 * Script überhaupt startet. Ein paar Zeilen selbst zu lesen ist die
 * Variante, die überall läuft.
 *
 * Bereits gesetzte Variablen gewinnen, damit ein vorangestelltes
 * `DATABASE_URL=... npm run ...` weiterhin die Datei übersteuert.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.env.ENV_FILE ?? '.env.local');

let source = null;
try {
  source = readFileSync(file, 'utf8');
} catch {
  // Keine .env.local – völlig in Ordnung, dann kommt eben alles aus der Umgebung.
}

if (source !== null) {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (key in process.env) continue;

    let value = trimmed.slice(eq + 1).trim();
    // Anführungszeichen abstreifen, aber nur paarweise – Passwörter mit
    // einzelnem ' oder " bleiben unangetastet.
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
