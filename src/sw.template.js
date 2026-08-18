/*
 * Festival Buddy – Service Worker (Vorlage)
 *
 * Diese Datei wird NICHT direkt ausgeliefert. Der Route-Handler unter
 * src/app/sw.js/route.ts liest sie ein und ersetzt __SW_VERSION__ durch
 * eine pro Deploy eindeutige Version (siehe next.config.mjs). Dadurch
 * ändert sich der Byte-Inhalt von /sw.js bei jedem Deploy -> der Browser
 * erkennt den neuen SW und die App kann einen Update-Hinweis anzeigen.
 *
 * Strategie:
 *  - Landing ('/'), App-Shell ('/app') samt Gruppen- und
 *    Veranstalter-Seite, Manifest & Icons
 *    werden beim Install vorge-cached.
 *  - GET /api/data: Netz zuerst (kurzer Timeout), Fallback auf Cache.
 *    Jede erfolgreiche Antwort aktualisiert den Cache -> die App funktioniert
 *    komplett offline mit dem letzten bekannten Stand.
 *  - Statische Assets (/_next/static, Icons): stale-while-revalidate.
 *  - Schreibzugriffe (POST) laufen NICHT über den SW – die App hat dafür
 *    eine eigene Offline-Warteschlange, die synct, sobald Netz da ist.
 *  - Web Push: push/notificationclick/pushsubscriptionchange ganz unten –
 *    zeigt Mitteilungen & Band-Erinnerungen an und öffnet die App per
 *    Deep-Link.
 *
 * Sicherheitsgrenze (privater Daten-Cache):
 *  - /api/data enthält geschützte Gruppendaten und ist serverseitig mit
 *    no-store markiert. Der SW cached die Antwort BEWUSST trotzdem – das
 *    ist die dokumentierte Offline-Funktion. Dafür gilt der Cache nur
 *    innerhalb der Session: Beim Logout/Nutzerwechsel schickt die App
 *    {type:'CLEAR_DATA_CACHE'} -> der SW löscht alle fb-data-*-Caches
 *    (auch die älterer SW-Versionen) und bestätigt über den mitgesendeten
 *    MessagePort. Antworten, die beim Löschen noch unterwegs waren,
 *    werden über einen Epoch-Zähler verworfen statt erneut gecached.
 *
 * Update-Ablauf:
 *  - Beim Install wird NICHT sofort skipWaiting() gerufen: der neue SW
 *    bleibt "waiting", bis der Nutzer im UI-Hinweis "Neu laden" tippt.
 *  - Die App schickt dann {type:'SKIP_WAITING'} -> der SW aktiviert sich,
 *    übernimmt via clients.claim() und die Seite lädt sich einmal neu.
 */

const VERSION = '__SW_VERSION__';
const STATIC_CACHE = 'fb-static-' + VERSION;
const DATA_CACHE_PREFIX = 'fb-data-';
const DATA_CACHE = DATA_CACHE_PREFIX + VERSION;
const PAGE_CACHE = 'fb-pages-' + VERSION;

// Zähler für Bereinigungen des privaten Daten-Caches: networkFirst()
// merkt sich den Stand vor dem fetch und schreibt die Antwort nur in den
// Cache, wenn zwischenzeitlich kein CLEAR_DATA_CACHE lief. So kann eine
// beim Logout noch laufende Anfrage den frisch geleerten Cache nicht
// wieder mit privaten Daten befüllen. (SW-Neustart setzt den Zähler
// zurück – dann gibt es aber auch keine laufenden Anfragen mehr.)
let dataCacheEpoch = 0;

/** Alle privaten Daten-Caches löschen – auch die älterer SW-Versionen. */
function clearDataCaches() {
  dataCacheEpoch++;
  return caches
    .keys()
    .then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(DATA_CACHE_PREFIX))
          .map((k) => caches.delete(k))
      )
    );
}

const PRECACHE = [
  '/',
  '/app',
  '/app/gruppe',
  '/app/veranstalter',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Kein skipWaiting(): der neue SW wartet, bis der Nutzer das Update
  // über den Hinweis in der App bestätigt (siehe message-Listener unten).
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC_CACHE, DATA_CACHE, PAGE_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Vom UI ausgelöst:
//  - SKIP_WAITING ("Neu laden"-Hinweis): wartenden SW sofort aktivieren.
//  - CLEAR_DATA_CACHE (Logout/Nutzerwechsel): private Daten-Caches löschen
//    und dem Absender Erfolg/Fehler über den MessagePort bestätigen –
//    der Logout darf sich nicht auf eine stille Bereinigung verlassen.
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (msg.type === 'CLEAR_DATA_CACHE') {
    const port = event.ports && event.ports[0];
    const clearing = clearDataCaches().then(
      () => port && port.postMessage({ ok: true }),
      () => port && port.postMessage({ ok: false })
    );
    if (event.waitUntil) event.waitUntil(clearing);
  }
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Netz zuerst, bei Fehler/Timeout aus dem Cache */
async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  // Stand der Daten-Cache-Bereinigung VOR dem fetch festhalten: Trifft die
  // Antwort erst nach einem CLEAR_DATA_CACHE ein (Logout während laufender
  // Anfrage), gehört sie zur beendeten Session und wird nicht gespeichert.
  const epoch = dataCacheEpoch;
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (
      response &&
      response.ok &&
      (cacheName !== DATA_CACHE || epoch === dataCacheEpoch)
    ) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    throw new Error('offline und nichts im Cache');
  }
}

/** Cache sofort, Netz aktualisiert im Hintergrund */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || update.then((r) => r || Response.error());
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Daten-API: Netz zuerst, Cache als Offline-Fallback
  if (url.pathname === '/api/data') {
    event.respondWith(networkFirst(request, DATA_CACHE, 5000));
    return;
  }
  // Andere API-Routen nicht cachen
  if (url.pathname.startsWith('/api/')) return;

  // Seiten-Navigation: Netz zuerst, sonst gecachte Shell
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, PAGE_CACHE, 5000).catch(async () => {
        const cache = await caches.open(PAGE_CACHE);
        // Offline zählt die App-Shell; die Landing ist nur der Fallback davon.
        return (
          (await cache.match('/app')) ||
          (await cache.match('/')) ||
          Response.error()
        );
      })
    );
    return;
  }

  // Statische Assets
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

/* ------------------------------------------------------------------ */
/* Web Push (Mitteilungen, Band-Erinnerungen & Standort der Gruppe)    */
/* ------------------------------------------------------------------ */

// Payload: { type, title, body, url, tag? } – siehe src/lib/push.ts.
// Es wird IMMER eine Notification gezeigt: iOS entzieht Abos, deren
// Pushes still bleiben.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // kein/kaputtes JSON -> generische Anzeige
  }
  const title = payload.title || 'Festival Buddy';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/app' },
  };
  if (payload.tag) options.tag = payload.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klick auf die Notification: vorhandenes App-Fenster fokussieren und zum
// Deep-Link navigieren, sonst ein neues öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin) {
            return client
              .focus()
              .then(() => (client.navigate ? client.navigate(url) : undefined));
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// Push-Dienst hat das Abo rotiert/invalidiert: best effort neu abonnieren
// und an den Server melden (Same-Origin-Fetch schickt das Session-Cookie
// mit; ohne Session räumt der nächste 410 die Karteileiche ohnehin ab).
self.addEventListener('pushsubscriptionchange', (event) => {
  const oldSub = event.oldSubscription;
  const key = oldSub && oldSub.options && oldSub.options.applicationServerKey;
  if (!key) return;
  const resubscribe = self.registration.pushManager
    .subscribe({ userVisibleOnly: true, applicationServerKey: key })
    .then((sub) =>
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
    )
    .catch(() => undefined);
  if (event.waitUntil) event.waitUntil(resubscribe);
});
