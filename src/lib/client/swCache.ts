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
 *  3. Der Merker in localStorage wird erst entfernt, wenn die Bereinigung
 *     NACHWEISLICH vollständig war: direkte Löschung erfolgreich UND der
 *     SW hat den Epoch-Bump bestätigt (bzw. es gibt keinen Controller,
 *     der eine noch laufende Antwort cachen könnte). Alles andere ->
 *     Ergebnis false, der Merker bleibt stehen.
 *  4. ensurePrivateCachesPurged() liefert den Bereinigungsstatus; der
 *     AppProvider blockiert damit JEDEN Datenabruf, solange die
 *     Bereinigung nicht bestätigt ist (fail-closed) – eine nachfolgende
 *     Session kann den privaten Cache der vorherigen also weder
 *     stillschweigend übernehmen noch per Offline-Fallback abrufen.
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
 * zuerst den Merker und entfernt ihn NUR, wenn die Bereinigung bestätigt
 * ist: direkte Löschung erfolgreich UND SW-Bestätigung des Epoch-Bumps
 * (bzw. kein Controller vorhanden). Liefert false, solange das nicht der
 * Fall ist – der Aufrufer darf dann keinen Datenabruf starten, der auf
 * den alten SW-Cache zurückfallen könnte (siehe AppProvider).
 */
export async function purgePrivateCaches(): Promise<boolean> {
  markPurgePending();
  // SW zuerst anstoßen (Epoch-Zähler stoppt laufende Cache-Writes), die
  // direkte Löschung ist die maßgebliche Bereinigung.
  const swClear = requestSwClear().catch((err: unknown) =>
    err instanceof Error ? err : new Error(String(err))
  );
  let deleted = false;
  try {
    await deleteDataCaches();
    deleted = true;
  } catch (err) {
    console.error('Private Daten-Caches konnten nicht gelöscht werden:', err);
  }
  const swErr = await swClear;
  if (swErr !== undefined) {
    // Ohne SW-Bestätigung ist der Epoch-Bump nicht garantiert: Eine beim
    // Logout noch laufende /api/data-Antwort könnte den soeben geleerten
    // Cache wieder mit privaten Daten befüllen. Der Merker bleibt stehen,
    // die Bereinigung wird vor dem nächsten Datenabruf wiederholt.
    console.warn('SW-Cache-Bereinigung ohne Bestätigung:', swErr);
  }
  if (!deleted || swErr !== undefined) return false;
  clearPurgePending();
  return true;
}

/**
 * Eine zuvor fehlgeschlagene Bereinigung nachholen. Beim App-Start und
 * beim Login VOR dem ersten Datenabruf aufrufen. Liefert true, wenn kein
 * privater Cache einer Vorsession (mehr) aussteht; liefert false, solange
 * die Bereinigung nicht bestätigt ist – dann darf KEIN /api/data-Abruf
 * starten (fail-closed), sonst könnte die neue Session per SW-Fallback
 * die Daten der vorherigen erhalten.
 */
export async function ensurePrivateCachesPurged(): Promise<boolean> {
  if (!isPurgePending()) return true;
  return purgePrivateCaches();
}
