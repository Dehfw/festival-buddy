/**
 * Betreiber-CLI: Wie viele Leute haben die PWA noch auf dem Home-Screen?
 *
 *   DATABASE_URL=... node scripts/install-stats.mjs
 *   DATABASE_URL=... node scripts/install-stats.mjs --json
 *   DATABASE_URL=... node scripts/install-stats.mjs --prune [tage]   (Standard 365)
 *   DISCORD_WEBHOOK_URL=... node scripts/install-stats.mjs --discord
 *
 * Datenquelle ist die Tabelle app_installs: Jede Installation meldet beim
 * App-Start ein Lebenszeichen (src/lib/client/install.ts, ~alle 12 h).
 * "Deinstalliert" meldet KEIN Browser – die Statistik zählt deshalb, wer
 * sich zuletzt aus der installierten App gemeldet hat. Bleibt eine
 * Installation 30/90 Tage still, ist sie weg oder ungenutzt.
 *
 * --discord schickt dieselbe Zusammenfassung an den Betreiber-Webhook;
 * so lässt sich das Ganze z. B. wöchentlich per Cron laufen lassen.
 */
import pg from 'pg';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const toDiscord = argv.includes('--discord');
const pruneIdx = argv.indexOf('--prune');
let pruneDays = null;
if (pruneIdx !== -1) {
  const next = argv[pruneIdx + 1];
  pruneDays = next && /^\d+$/.test(next) ? Number(next) : 365;
  if (pruneDays < 30) fail('--prune erwartet mindestens 30 Tage');
}

const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) fail('DATABASE_URL ist nicht gesetzt');

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
  // Die Tabelle entsteht beim ersten Start der App (createSchema in src/lib/db.ts)
  const exists = await client.query("SELECT to_regclass('public.app_installs') AS t");
  if (!exists.rows[0]?.t) {
    fail('Tabelle app_installs fehlt – die App einmal starten, damit das Schema angelegt wird');
  }

  if (pruneDays !== null) {
    const del = await client.query(
      `DELETE FROM app_installs WHERE last_seen_at < now() - ($1 || ' days')::interval`,
      [String(pruneDays)]
    );
    console.log(`🧹 ${del.rowCount} Installation(en) ohne Lebenszeichen seit ${pruneDays} Tagen gelöscht`);
  }

  const totals = await client.query(`
    SELECT
      count(*) FILTER (WHERE last_standalone_at > now() - interval '7 days')   AS active_7,
      count(*) FILTER (WHERE last_standalone_at > now() - interval '30 days')  AS active_30,
      count(*) FILTER (WHERE last_standalone_at > now() - interval '90 days')  AS active_90,
      count(DISTINCT user_id) FILTER (
        WHERE last_standalone_at > now() - interval '30 days')                 AS users_30,
      count(*) FILTER (WHERE installed_at > now() - interval '7 days')         AS new_7,
      count(*) FILTER (WHERE installed_at > now() - interval '30 days')        AS new_30,
      count(*) FILTER (WHERE installed_at IS NOT NULL
                         AND last_standalone_at <= now() - interval '30 days') AS dormant_30,
      count(*) FILTER (WHERE installed_at IS NOT NULL
                         AND last_standalone_at <= now() - interval '90 days') AS dormant_90,
      count(*) FILTER (WHERE installed_at IS NULL
                         AND last_seen_at > now() - interval '30 days')        AS browser_30,
      count(*) FILTER (WHERE installed_at IS NOT NULL)                         AS ever
    FROM app_installs
  `);
  const platforms = await client.query(`
    SELECT platform,
           count(*) FILTER (WHERE last_standalone_at > now() - interval '30 days') AS active_30,
           count(*) FILTER (WHERE installed_at IS NOT NULL)                        AS ever
      FROM app_installs
     WHERE installed_at IS NOT NULL
     GROUP BY platform
     ORDER BY active_30 DESC, platform
  `);
  const push = await client.query(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE user_agent ~* '(iphone|ipad|ipod)') AS ios
      FROM push_subscriptions
  `);

  const t = totals.rows[0];
  const n = (v) => Number(v ?? 0);
  const stats = {
    aktiveInstallationen: { tage7: n(t.active_7), tage30: n(t.active_30), tage90: n(t.active_90) },
    aktiveNutzer30: n(t.users_30),
    neuInstalliert: { tage7: n(t.new_7), tage30: n(t.new_30) },
    stillgelegt: { seit30Tagen: n(t.dormant_30), seit90Tagen: n(t.dormant_90) },
    nurBrowser30: n(t.browser_30),
    jemalsInstalliert: n(t.ever),
    plattformen: platforms.rows.map((r) => ({
      plattform: r.platform,
      aktiv30: n(r.active_30),
      jemals: n(r.ever),
    })),
    pushAbos: { gesamt: n(push.rows[0].total), ios: n(push.rows[0].ios) },
  };

  if (asJson) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log('📲 PWA auf dem Home-Screen');
    console.log(
      `   aktiv:      ${stats.aktiveInstallationen.tage7} (7 T) · ` +
        `${stats.aktiveInstallationen.tage30} (30 T) · ` +
        `${stats.aktiveInstallationen.tage90} (90 T) Installationen`
    );
    console.log(`   Personen:   ${stats.aktiveNutzer30} verschiedene Nutzer (30 T)`);
    console.log(
      `   neu:        ${stats.neuInstalliert.tage7} (7 T) · ${stats.neuInstalliert.tage30} (30 T)`
    );
    console.log(
      `   still:      ${stats.stillgelegt.seit30Tagen} seit >30 T · ` +
        `${stats.stillgelegt.seit90Tagen} seit >90 T (deinstalliert oder ungenutzt)`
    );
    console.log(`   jemals:     ${stats.jemalsInstalliert} Installationen insgesamt`);
    console.log(`   nur Browser: ${stats.nurBrowser30} Geräte (30 T aktiv, nie installiert)`);
    for (const p of stats.plattformen) {
      console.log(`   · ${p.plattform.padEnd(8)} ${p.aktiv30} aktiv / ${p.jemals} jemals`);
    }
    console.log(
      `   Push-Abos:  ${stats.pushAbos.gesamt} gesamt, davon ${stats.pushAbos.ios} iOS ` +
        '(iOS-Push gibt es NUR installiert – gute Gegenprobe)'
    );
  }

  if (toDiscord) {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) fail('DISCORD_WEBHOOK_URL ist nicht gesetzt');
    const lines = [
      '📲 **PWA auf dem Home-Screen**',
      `Aktiv: **${stats.aktiveInstallationen.tage7}** (7 T) · **${stats.aktiveInstallationen.tage30}** (30 T) Installationen, ` +
        `**${stats.aktiveNutzer30}** Personen`,
      `Neu: ${stats.neuInstalliert.tage7} (7 T) · ${stats.neuInstalliert.tage30} (30 T) — ` +
        `still: ${stats.stillgelegt.seit30Tagen} seit >30 T`,
      stats.plattformen.map((p) => `${p.plattform}: ${p.aktiv30}`).join(' · ') || '—',
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: lines.join('\n'), allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) fail(`Discord-Webhook antwortete ${res.status}`);
    console.log('✓ an Discord geschickt');
  }
} finally {
  await client.end();
}
