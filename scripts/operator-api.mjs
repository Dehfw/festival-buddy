/**
 * Gemeinsamer Aufruf der Betreiber-API (/api/operator/*) für die kleinen
 * Scripts, die sofort eine Antwort bekommen (Festival anlegen, Band
 * umbenennen, auflisten). Kümmert sich um Basis-URL, Secret, Proxy und um
 * lesbare Fehlermeldungen – ein Fehler beendet das Script.
 *
 * scripts/lineup-announce.mjs nutzt das bewusst nicht: Dort wartet die App
 * vor der Antwort auf den Push-Versand, und ein Ausbleiben der Antwort
 * heißt etwas anderes als hier.
 *
 *   LINEUP_API_URL     Basis-URL der App (Default https://festivalbuddy.app)
 *   LINEUP_API_SECRET  Bearer-Secret; in Cloud-Sessions setzt es der Proxy ein
 */
import './env.mjs';
import './proxy.mjs';

export function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

export const base = (process.env.LINEUP_API_URL || 'https://festivalbuddy.app').replace(/\/+$/, '');

// Ohne eigenes Secret trotzdem einen Authorization-Header schicken: In
// Cloud-Sessions ersetzt der Proxy ihn durch das hinterlegte Secret.
const authorization = `Bearer ${process.env.LINEUP_API_SECRET || 'proxy-injected'}`;

const DEFAULT_HINTS = {
  401: 'Secret stimmt nicht – LINEUP_API_SECRET hier und in der App vergleichen.',
  503: 'In der App ist LINEUP_API_SECRET nicht gesetzt.',
};

/**
 * @param {string} method  GET | POST | PATCH
 * @param {string} route   Pfad unter /api/operator, z. B. "/festival"
 * @param {object} [body]  JSON-Body
 * @param {Record<number, string>} [hints]  Zusatzhinweise je Statuscode
 */
export async function operatorCall(method, route, body, hints = {}) {
  const url = `${base}/api/operator${route}`;
  let res;
  try {
    res = await fetch(url, {
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
    // keine JSON-Antwort (Proxy-Fehlerseite, 404/405-HTML vor dem Deploy)
  }
  if (!res.ok) {
    // Ohne JSON kommt die Antwort nicht von unserer Route: Der Endpunkt
    // (oder diese Methode darauf) ist dort noch nicht ausgerollt.
    const notDeployed =
      json === null && [404, 405].includes(res.status)
        ? 'Den Endpunkt gibt es dort (noch) nicht – ist der Stand schon deployt?'
        : null;
    const hint = notDeployed ?? hints[res.status] ?? DEFAULT_HINTS[res.status];
    fail(
      `${method} ${url} → ${res.status}: ${json?.error ?? text.slice(0, 200)}` +
        (hint ? `\n  ${hint}` : '')
    );
  }
  return json;
}
