'use client';

/*
 * Bereinigung der privaten Service-Worker-Daten-Caches.
 *
 * Der SW cached /api/data-Antworten für die Offline-Funktion (fb-data-*).
 * Diese Antworten enthalten geschützte Gruppendaten und dürfen die Session
 * nicht überleben: Nach Logout, Session-Ende (401) oder Nutzerwechsel
 * müssen sie aus der Cache Storage API verschwinden, sonst kann die
 * nächste Person am selben Gerät sie offline als 200 abrufen.
 *
 * Ablauf:
 *  1. Der aktive SW bekommt {type:'CLEAR_DATA_CACHE'} und bestätigt über
 *     einen MessagePort. Das erhöht dort den Epoch-Zähler, damit auch
 *     Antworten, die beim Logout noch unterwegs sind, nicht mehr in den
 *     Cache geschrieben werden.
 *  2. Zusätzlich löschen wir alle fb-data-*-Caches direkt aus dem Fenster –
 *     die Cache Storage ist pro Origin geteilt, das wirkt also auch ohne
 *     Controller (Erstbesuch, harter Reload) und unabhängig davon, ob
 *     gerade ein alter SW ohne CLEAR-Handler aktiv oder ein neuer am
 *     Warten ist.
 *  3. Schlägt die Löschung fehl, bleibt ein Merker in localStorage stehen;
 *     ensurePrivateCachesPurged() holt die Bereinigung beim nächsten
 *     Start bzw. vor dem ersten Datenabruf eines (neuen) Nutzers nach –
 *     eine nachfolgende Session übernimmt den privaten Cache also nie
 *     stillschweigend.
 */

/** Muss zu DATA_CACHE_PREFIX in src/sw.template.js passen. */
const DATA_CACHE_PREFIX = 'fb-data-';
const PURGE_PENDING_KEY = 'fb.cachePurge.v1';
/** Antwortet der SW nicht (z. B. alte Version ohne Handler), nicht ewig warten. */
const SW_REPLY_TIMEOUT_MS = 3000;

/** Alle privaten Daten-Caches direkt aus dem Fenster löschen. */
async function deleteDataCaches(): Promise<void> {
  // Ohne Cache Storage (unsicherer Kontext, alter Browser) hat der SW
  // auch nie etwas gecached – nichts zu tun.
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => k.startsWith(DATA_CACHE_PREFIX))
      .map((k) => caches.delete(k))
  );
}

/**
 * Den aktiven SW bitten, seine Daten-Caches zu leeren (erhöht dort den
 * Epoch-Zähler gegen noch laufende Anfragen). Auflösung erst nach
 * Bestätigung über den MessagePort; Timeout/Fehler -> Rejection.
 */
function requestSwClear(): Promise<void> {
  return new Promise((resolve, reject) => {
    const controller =
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? navigator.serviceWorker.controller
        : null;
    // Kein Controller = kein SW, der gerade Antworten cached; die direkte
    // Löschung (deleteDataCaches) räumt Reste früherer Sessions weg.
    if (!controller) {
      resolve();
      return;
    }
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      reject(new Error('Service Worker hat die Cache-Bereinigung nicht bestätigt'));
    }, SW_REPLY_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean } | null>) => {
      clearTimeout(timer);
      if (event.data?.ok) resolve();
      else reject(new Error('Service Worker konnte den Daten-Cache nicht löschen'));
    };
    try {
      controller.postMessage({ type: 'CLEAR_DATA_CACHE' }, [channel.port2]);
    } catch (err) {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function markPurgePending() {
  try {
    localStorage.setItem(PURGE_PENDING_KEY, String(Date.now()));
  } catch {
    // Storage blockiert – die eigentliche Löschung läuft trotzdem an
  }
}

function clearPurgePending() {
  try {
    localStorage.removeItem(PURGE_PENDING_KEY);
  } catch {
    // dann bleibt der Merker eben stehen -> nächster Start räumt erneut
  }
}

function isPurgePending(): boolean {
  try {
    return localStorage.getItem(PURGE_PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Private SW-Daten-Caches löschen (Logout, 401, Nutzerwechsel). Setzt
 * zuerst den Merker und entfernt ihn erst nach bestätigter Löschung –
 * schlägt sie fehl, wird sie vor dem nächsten Datenabruf nachgeholt
 * (siehe ensurePrivateCachesPurged) statt still ignoriert.
 */
export async function purgePrivateCaches(): Promise<boolean> {
  markPurgePending();
  // SW zuerst anstoßen (Epoch-Zähler stoppt laufende Cache-Writes), die
  // direkte Löschung ist die maßgebliche Bereinigung.
  const swClear = requestSwClear().catch((err: unknown) => err);
  try {
    await deleteDataCaches();
  } catch (err) {
    console.error('Private Daten-Caches konnten nicht gelöscht werden:', err);
    return false;
  }
  const swErr = await swClear;
  if (swErr !== undefined) {
    // Direkte Löschung hat gegriffen, nur die SW-Bestätigung fehlt
    // (z. B. alte SW-Version ohne CLEAR-Handler) – protokollieren.
    console.warn('SW-Cache-Bereinigung ohne Bestätigung:', swErr);
  }
  clearPurgePending();
  return true;
}

/**
 * Eine zuvor fehlgeschlagene Bereinigung nachholen. Beim App-Start und
 * beim Login VOR dem ersten Datenabruf aufrufen, damit keine neue Session
 * den privaten Cache der vorherigen übernimmt.
 */
export async function ensurePrivateCachesPurged(): Promise<void> {
  if (!isPurgePending()) return;
  await purgePrivateCaches();
}
