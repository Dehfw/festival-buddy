/**
 * Betreiber-CLI für Push-Mitteilungen: sendet eine Nachricht an alle
 * Push-Abos – app-weit oder auf ein Festival begrenzt – und persistiert
 * sie als Mitteilung (in der App sichtbar, auch für Nutzer ohne Push).
 * Wie bei den Veranstalter-Codes gibt es bewusst kein Web-Interface;
 * alles läuft über die Datenbank-URL + VAPID-Keys.
 *
 *   DATABASE_URL=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... \
 *     node scripts/push-broadcast.mjs [--festival <festival-id>] "Titel" "Text"
 *
 * Ohne --festival geht die Nachricht an ALLE Abos (festival_id NULL =
 * app-weite Mitteilung, erscheint bei jedem Festival). Mit --festival nur
 * an die Mitglieder der Gruppen dieses Festivals – wie eine Veranstalter-
 * Mitteilung, nur ohne Web-UI.
 */
import pg from 'pg';
import webpush from 'web-push';
import { randomUUID } from 'node:crypto';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const USAGE =
  'Aufruf: node scripts/push-broadcast.mjs [--festival <festival-id>] "Titel" "Text"';

// Muss zu PUSH_TITLE_MAX/PUSH_BODY_MAX in src/lib/push.ts passen
const TITLE_MAX = 80;
const BODY_MAX = 500;

const argv = process.argv.slice(2);
let festivalId = null;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--festival') {
    festivalId = argv[++i] ?? null;
    if (!festivalId) fail(USAGE);
  } else {
    rest.push(argv[i]);
  }
}
const [title, body] = rest;
if (!title || !body || rest.length !== 2) fail(USAGE);
if (title.length > TITLE_MAX) fail(`Titel länger als ${TITLE_MAX} Zeichen`);
if (body.length > BODY_MAX) fail(`Text länger als ${BODY_MAX} Zeichen`);

const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) fail('DATABASE_URL ist nicht gesetzt');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  fail(
    'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT sind nicht gesetzt (erzeugen: npx web-push generate-vapid-keys)'
  );
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
  // Tabellen entstehen beim ersten Start der App (createSchema in src/lib/db.ts)
  const tables = await client.query("SELECT to_regclass('public.push_subscriptions') AS t");
  if (!tables.rows[0]?.t) {
    fail('Tabelle push_subscriptions fehlt – die App einmal starten, damit das Schema angelegt wird');
  }

  let pushTitle = title;
  if (festivalId) {
    const fest = await client.query('SELECT name FROM festivals WHERE id = $1', [festivalId]);
    if (fest.rows.length === 0) fail(`Festival "${festivalId}" gibt es nicht`);
    // Wie beim Veranstalter-Versand: das Festival ist der Absender
    pushTitle = `${fest.rows[0].name}: ${title}`;
  }

  // Mitteilung persistieren (in-App sichtbar) und Polling-Clients aufwecken
  const id = `a-${randomUUID()}`;
  await client.query(
    'INSERT INTO announcements (id, festival_id, title, body) VALUES ($1, $2, $3, $4)',
    [id, festivalId, title, body]
  );
  await client.query("SELECT nextval('db_rev')");

  const subs = festivalId
    ? await client.query(
        `SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
          WHERE p.user_id IN (
            SELECT gm.user_id FROM groups g
            JOIN group_members gm ON gm.group_id = g.id
            WHERE g.festival_id = $1
          )`,
        [festivalId]
      )
    : await client.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');

  const json = JSON.stringify({
    type: 'announcement',
    title: pushTitle,
    body,
    url: `/app?announcement=${id}`,
    tag: id,
  });

  let sent = 0;
  let gone = 0;
  let failed = 0;
  // Kleines Concurrency-Fenster wie in src/lib/push.ts
  let next = 0;
  const rows = subs.rows;
  const workers = Array.from({ length: Math.min(10, rows.length) }, async () => {
    while (next < rows.length) {
      const sub = rows[next++];
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          { TTL: 3600, urgency: 'high' }
        );
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await client
            .query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint])
            .catch(() => {});
          gone++;
        } else {
          failed++;
        }
      }
    }
  });
  await Promise.all(workers);

  const scope = festivalId ? `Festival ${festivalId}` : 'app-weit';
  console.log(`✓ Mitteilung gespeichert (${scope}): "${title}"`);
  console.log(
    `  Push: ${sent} zugestellt, ${gone} tote Abos entfernt, ${failed} Fehler (von ${rows.length} Abos)`
  );
  console.log('  In der App sehen die Mitteilung auch alle ohne Push (Glocke).');
} finally {
  await client.end();
}
