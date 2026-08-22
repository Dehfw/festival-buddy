/**
 * Betreiber-CLI für die Merch-Links der Bands: pflegt die Tabelle
 * `band_merch`, aus der die App im Band-Sheet und im Lineup-Sheet den
 * Button „Merch der Band" baut (siehe getTimetable in src/lib/db.ts).
 *
 *   DATABASE_URL=... node scripts/merch-links.mjs list
 *   DATABASE_URL=... node scripts/merch-links.mjs set "Hämatom" https://shop.haematom.de
 *   DATABASE_URL=... node scripts/merch-links.mjs remove "Hämatom"
 *   DATABASE_URL=... node scripts/merch-links.mjs import data/merch.json
 *   DATABASE_URL=... node scripts/merch-links.mjs check
 *
 * Ein Shop gehört der Band, nicht einem Festival: Einmal gesetzt, taucht
 * er überall auf, wo die Band spielt – auch im nächsten Jahr und auf
 * jedem anderen Festival. Schlüssel ist der Band-Slug, derselbe wie bei
 * den Merkungen; „Hämatom", "haematom" und "HAEMATOM" landen also auf
 * derselben Zeile.
 *
 * `import` erwartet eine JSON-Datei mit { "Bandname": "https://…", … }
 * und setzt alles in einem Rutsch – der Weg für eine Liste aus
 * MerchMaster. `check` listet Bands aus den Timetables, für die noch
 * kein Shop hinterlegt ist.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import './env.mjs';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const USAGE =
  'Aufruf: node scripts/merch-links.mjs <list | set <band> <url> | remove <band> | import <datei.json> | check>';

const [command, ...args] = process.argv.slice(2);
if (!['list', 'set', 'remove', 'import', 'check'].includes(command ?? '')) fail(USAGE);

const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) fail('DATABASE_URL ist nicht gesetzt');

// Identisch zu bandSlug in src/lib/types.ts (.mjs kann TS nicht laden).
// Ändert sich der Algorithmus dort, gehört er hier mit umgestellt –
// sonst zeigen bestehende Zeilen ins Leere.
function bandSlug(name) {
  const slug = String(name)
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

/** Nur http(s) – die URL landet in der App ungefiltert in einem href. */
function normalizeUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return parsed.href;
}

// sslmode aus der URL in eine pg-SSL-Config übersetzen (wie in src/lib/db.ts)
let connectionString = raw;
let ssl;
try {
  const url = new URL(raw);
  const mode = url.searchParams.get('sslmode');
  if (mode) {
    url.searchParams.delete('sslmode');
    connectionString = url.toString();
    if (mode === 'disable') ssl = false;
    else if (mode === 'no-verify') ssl = { rejectUnauthorized: false };
    else ssl = { rejectUnauthorized: true };
  }
} catch {
  // Socket-Pfad o. Ä. – unverändert lassen
}

const client = new pg.Client({ connectionString, ssl });
await client.connect();
try {
  // Wie bei organizer-code.mjs: Das Schema legt die App an, nicht die CLI.
  const table = await client.query("SELECT to_regclass('public.band_merch') AS t");
  if (!table.rows[0]?.t) {
    fail('Tabelle band_merch fehlt – die App einmal starten, damit das Schema angelegt wird');
  }

  if (command === 'list') {
    const rows = await client.query(
      'SELECT slug, name, url, updated_at FROM band_merch ORDER BY name'
    );
    if (rows.rows.length === 0) {
      console.log('Noch kein Merch-Link hinterlegt.');
    } else {
      for (const r of rows.rows) {
        console.log(`${r.name}  (${r.slug})`);
        console.log(`  ${r.url}`);
      }
      console.log('');
      console.log(`${rows.rows.length} Band(s) mit Shop.`);
    }
  } else if (command === 'set') {
    const [band, url] = args;
    if (!band || !url) fail(USAGE);
    const href = normalizeUrl(url);
    if (!href) fail(`"${url}" ist keine gültige http(s)-URL`);
    const slug = bandSlug(band);
    await client.query(
      `INSERT INTO band_merch (slug, name, url) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = $2, url = $3, updated_at = now()`,
      [slug, band.trim(), href]
    );
    console.log(`✓ ${band.trim()} (${slug}) -> ${href}`);
    console.log('  In der App sichtbar, sobald die Caches durch sind (max. ~75 s).');
  } else if (command === 'remove') {
    const [band] = args;
    if (!band) fail(USAGE);
    const slug = bandSlug(band);
    const res = await client.query('DELETE FROM band_merch WHERE slug = $1', [slug]);
    if (res.rowCount === 0) fail(`Für "${band}" (${slug}) war kein Shop hinterlegt`);
    console.log(`✓ Shop von ${band} (${slug}) entfernt`);
  } else if (command === 'import') {
    const [file] = args;
    if (!file) fail(USAGE);
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      fail(`${file} nicht lesbar: ${err.message}`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      fail('Erwartet wird ein Objekt: { "Bandname": "https://…", … }');
    }
    let ok = 0;
    const skipped = [];
    for (const [band, url] of Object.entries(data)) {
      const href = normalizeUrl(url);
      if (!href) {
        skipped.push(`${band}: "${url}" ist keine gültige http(s)-URL`);
        continue;
      }
      await client.query(
        `INSERT INTO band_merch (slug, name, url) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET name = $2, url = $3, updated_at = now()`,
        [bandSlug(band), band.trim(), href]
      );
      ok++;
    }
    console.log(`✓ ${ok} Shop(s) gesetzt`);
    for (const s of skipped) console.log(`  übersprungen – ${s}`);
  } else if (command === 'check') {
    // Alle Bands aus allen Timetables gegen die gepflegten Shops halten.
    const rows = await client.query(
      `SELECT f.id AS festival, slot->>'band' AS band
         FROM festivals f, jsonb_array_elements(f.timetable->'slots') slot
        UNION
       SELECT f.id AS festival, band->>'name' AS band
         FROM festivals f, jsonb_array_elements(COALESCE(f.timetable->'bands', '[]'::jsonb)) band`
    );
    const have = new Set(
      (await client.query('SELECT slug FROM band_merch')).rows.map((r) => r.slug)
    );
    const missing = new Map();
    for (const r of rows.rows) {
      if (!r.band) continue;
      const slug = bandSlug(r.band);
      if (have.has(slug)) continue;
      if (!missing.has(slug)) missing.set(slug, r.band);
    }
    console.log(`${have.size} Band(s) mit Shop, ${missing.size} ohne.`);
    if (missing.size > 0) {
      console.log('');
      console.log('Ohne Shop:');
      for (const name of [...missing.values()].sort((a, b) => a.localeCompare(b, 'de'))) {
        console.log(`  ${name}`);
      }
    }
  }
} finally {
  await client.end();
}
