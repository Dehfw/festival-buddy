/**
 * Installations-Telemetrie: Wie viele Leute haben die App noch auf dem
 * Home-Screen?
 *
 * Es gibt KEINE Browser-API, die "wurde deinstalliert" meldet – weder
 * Android noch iOS verraten das. Messbar ist nur das Gegenteil: Startet
 * die App im Standalone-Modus (Home-Screen/App-Fenster statt Browser-Tab),
 * schickt sie ein Lebenszeichen. "Noch installiert" heißt in der Statistik
 * also: hat sich zuletzt innerhalb von X Tagen aus der installierten App
 * gemeldet. Wer sich nicht mehr meldet, hat die App deinstalliert – oder
 * benutzt sie einfach nicht mehr; unterscheiden lässt sich das nicht.
 *
 * Was gespeichert wird: eine zufällige install_id (kein Fingerprint, keine
 * IP, keine Geräte-ID), die grobe Plattform-Klasse und Zeitstempel. Die ID
 * liegt im localStorage – auf iOS hat die installierte PWA einen eigenen
 * Storage, sie zählt dort also sauber als eigene Installation. Unter
 * Android teilen sich Tab und installierte App den Storage; deshalb wertet
 * der Server den Standalone-Start separat aus (siehe recordInstallPing).
 */

const INSTALL_ID_KEY = 'fb.install.v1';
const LAST_PING_KEY = 'fb.installPing.v1';

/** Höchstens alle 12 h ein Lebenszeichen – feiner braucht es die Statistik nicht. */
const PING_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other';

/** Läuft die App gerade als installierte App (Home-Screen/App-Fenster)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.bind(window);
  return (
    Boolean(
      mq &&
        (mq('(display-mode: standalone)').matches ||
          mq('(display-mode: fullscreen)').matches ||
          mq('(display-mode: minimal-ui)').matches)
    ) ||
    // iOS Safari kennt display-mode erst spät, hat aber immer navigator.standalone
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS meldet sich als "Macintosh" – Touch-Punkte verraten das Tablet
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop';
  return 'other';
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback für alte WebViews ohne randomUUID
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${rand()}${rand()}${rand()}`;
}

/**
 * ID dieser Installation, beim ersten Aufruf erzeugt. Gibt null zurück,
 * wenn localStorage nicht verfügbar ist (Privatmodus/geblockt) – dann
 * zählt dieses Gerät eben nicht mit, statt bei jedem Start als "neu" zu
 * erscheinen.
 */
export function getInstallId(): string | null {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(INSTALL_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

type PingMemo = { t: number; s: boolean };

function loadLastPing(): PingMemo | null {
  try {
    const raw = localStorage.getItem(LAST_PING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PingMemo>;
    if (typeof parsed?.t !== 'number' || typeof parsed?.s !== 'boolean') return null;
    return { t: parsed.t, s: parsed.s };
  } catch {
    return null;
  }
}

/**
 * Lebenszeichen dieser Installation an den Server melden. Wird beim
 * App-Start aufgerufen und ist absichtlich geräuschlos: gedrosselt auf
 * einmal pro 12 h, ohne Netz passiert nichts, Fehler werden geschluckt.
 * Wechselt der Modus (Browser-Tab -> installiert oder zurück), wird die
 * Drossel übersprungen – genau dieser Wechsel ist die interessante
 * Information.
 *
 * `force` überspringt die Drossel: beim Login, damit die Installation
 * sofort dem (neuen) Nutzer zugeordnet wird und die Statistik nicht nur
 * Geräte, sondern auch Personen zählen kann.
 */
export async function pingInstall(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  const installId = getInstallId();
  if (!installId) return;
  const standalone = isStandalone();
  const last = loadLastPing();
  if (!force && last && last.s === standalone && Date.now() - last.t < PING_INTERVAL_MS) {
    return;
  }
  if (navigator.onLine === false) return;
  try {
    const res = await fetch('/api/install/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, standalone, platform: detectPlatform() }),
      keepalive: true,
    });
    if (!res.ok) return;
    localStorage.setItem(
      LAST_PING_KEY,
      JSON.stringify({ t: Date.now(), s: standalone } satisfies PingMemo)
    );
  } catch {
    // Offline oder Server weg: beim nächsten App-Start wieder versuchen
  }
}
