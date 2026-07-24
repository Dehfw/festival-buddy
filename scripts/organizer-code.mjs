/**
 * Betreiber-CLI für Veranstalter-Zugänge: erzeugt/verwaltet die
 * Einladungscodes, mit denen sich ein Passkey-Nutzer in der App
 * (/veranstalter) zum Veranstalter eines Festivals macht. Es gibt bewusst
 * kein Web-Interface dafür – wie beim Festival-Import läuft alles über
 * die Datenbank-URL.
 *
 *   DATABASE_URL=... node scripts/organizer-code.mjs generate <festival-id>
 *   DATABASE_URL=... node scripts/organizer-code.mjs list <festival-id>
 *   DATABASE_URL=... node scripts/organizer-code.mjs revoke <code>
 *   DATABASE_URL=... node scripts/organizer-code.mjs remove <festival-id> <user-id>
 *
 * generate druckt den Code (Format XXXX-XXXX) samt Einlöse-Link.
 * revoke sperrt einen noch NICHT eingelösten Code; einen bereits
 * aktiven Veranstalter entfernt nur `remove` (wirkt sofort, die App
 * prüft die Zuweisung bei jeder Anfrage).
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const USAGE =
  'Aufruf: node scripts/organizer-code.mjs <generate <festival-id> | list <festival-id> | revoke <code> | remove <festival-id> <user-id>>';

const [command, ...args] = process.argv.slice(2);
if (!['generate', 'list', 'revoke', 'remove'].includes(command ?? '')) fail(USAGE);

const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!raw) fail('DATABASE_URL ist nicht gesetzt');

// Crockford-Base32 ohne Verwechsler + Normalisierung – identisch zur App
// (src/lib/db.ts / src/lib/types.ts; .mjs kann die TS-Module nicht laden)
const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateInviteCode() {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += INVITE_ALPHABET[bytes[i] % 32];
  return code;
}

function normalizeInviteCode(input) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

function formatInviteCode(code) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
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
  // Anders als beim Festival-Import legen wir hier NICHTS selbst an: die
  // Tabellen haben Fremdschlüssel auf users/festivals und entstehen beim
  // ersten Start der App (createSchema in src/lib/db.ts).
  const tables = await client.query(
    "SELECT to_regclass('public.organizer_invites') AS t"
  );
  if (!tables.rows[0]?.t) {
    fail('Tabelle organizer_invites fehlt – die App einmal starten, damit das Schema angelegt wird');
  }

  if (command === 'generate') {
    const festivalId = args[0];
    if (!festivalId) fail(USAGE);
    const fest = await client.query('SELECT name FROM festivals WHERE id = $1', [festivalId]);
    if (fest.rows.length === 0) {
      fail(`Festival "${festivalId}" gibt es nicht – erst anlegen (npm run import:db -- --festival ${festivalId} datei.json)`);
    }
    const code = generateInviteCode();
    await client.query(
      'INSERT INTO organizer_invites (code, festival_id) VALUES ($1, $2)',
      [code, festivalId]
    );
    console.log(`✓ Veranstalter-Code für ${fest.rows[0].name} (${festivalId}):`);
    console.log('');
    console.log(`  ${formatInviteCode(code)}`);
    console.log('');
    console.log(`  Einlösen in der App unter /veranstalter?code=${formatInviteCode(code)}`);
    console.log('  (Der Veranstalter braucht dafür ein normales Passkey-Konto.)');
  } else if (command === 'list') {
    const festivalId = args[0];
    if (!festivalId) fail(USAGE);
    const invites = await client.query(
      `SELECT i.code, i.created_at, i.revoked_at, i.used_at, u.name AS used_by_name, i.used_by
         FROM organizer_invites i LEFT JOIN users u ON u.id = i.used_by
        WHERE i.festival_id = $1 ORDER BY i.created_at`,
      [festivalId]
    );
    console.log(`Codes für ${festivalId}:`);
    if (invites.rows.length === 0) console.log('  (keine)');
    for (const r of invites.rows) {
      const status = r.revoked_at
        ? `widerrufen am ${r.revoked_at.toISOString().slice(0, 10)}`
        : r.used_by
          ? `eingelöst von ${r.used_by_name ?? r.used_by} am ${r.used_at.toISOString().slice(0, 10)}`
          : 'offen';
      console.log(`  ${formatInviteCode(r.code)}  ${status}`);
    }
    const organizers = await client.query(
      `SELECT o.user_id, u.name, o.created_at
         FROM festival_organizers o LEFT JOIN users u ON u.id = o.user_id
        WHERE o.festival_id = $1 ORDER BY o.created_at`,
      [festivalId]
    );
    console.log(`Veranstalter für ${festivalId}:`);
    if (organizers.rows.length === 0) console.log('  (keine)');
    for (const r of organizers.rows) {
      console.log(
        `  ${r.user_id}  ${r.name ?? '(Nutzer gelöscht)'}  seit ${r.created_at.toISOString().slice(0, 10)}`
      );
    }
  } else if (command === 'revoke') {
    const code = normalizeInviteCode(args[0] ?? '');
    if (code.length !== 8) fail(USAGE);
    const res = await client.query(
      'UPDATE organizer_invites SET revoked_at = now() WHERE code = $1 AND revoked_at IS NULL RETURNING used_by',
      [code]
    );
    if (res.rows.length === 0) fail(`Code ${formatInviteCode(code)} nicht gefunden oder bereits widerrufen`);
    if (res.rows[0].used_by) {
      console.log(
        `⚠ Code ${formatInviteCode(code)} war schon eingelöst – der Veranstalter bleibt aktiv. ` +
          'Zugang entziehen mit: remove <festival-id> <user-id>'
      );
    } else {
      console.log(`✓ Code ${formatInviteCode(code)} widerrufen`);
    }
  } else if (command === 'remove') {
    const [festivalId, userId] = args;
    if (!festivalId || !userId) fail(USAGE);
    const res = await client.query(
      'DELETE FROM festival_organizers WHERE festival_id = $1 AND user_id = $2',
      [festivalId, userId]
    );
    if ((res.rowCount ?? 0) === 0) {
      fail(`${userId} ist kein Veranstalter von ${festivalId} (IDs prüfen mit: list ${festivalId})`);
    }
    // Offene Veranstalter-UIs merken den Entzug spätestens beim nächsten Poll
    await client.query('CREATE SEQUENCE IF NOT EXISTS db_rev START 1');
    await client.query("SELECT nextval('db_rev')");
    console.log(`✓ ${userId} ist kein Veranstalter von ${festivalId} mehr (wirkt sofort)`);
  }
} finally {
  await client.end();
}
