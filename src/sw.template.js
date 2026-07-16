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
 *  - Landing ('/'), App-Shell ('/app'), Gruppe, Admin, Manifest & Icons
 *    werden beim Install vorge-cached.
 *  - GET /api/data: Netz zuerst (kurzer Timeout), Fallback auf Cache.
 *    Jede erfolgreiche Antwort aktualisiert den Cache -> die App funktioniert
 *    komplett offline mit dem letzten bekannten Stand.
 *  - Statische Assets (/_next/static, Icons): stale-while-revalidate.
 *  - Schreibzugriffe (POST) laufen NICHT über den SW – die App hat dafür
 *    eine eigene Offline-Warteschlange, die synct, sobald Netz da ist.
 *
 * Update-Ablauf:
 *  - Beim Install wird NICHT sofort skipWaiting() gerufen: der neue SW
 *    bleibt "waiting", bis der Nutzer im UI-Hinweis "Neu laden" tippt.
 *  - Die App schickt dann {type:'SKIP_WAITING'} -> der SW aktiviert sich,
 *    übernimmt via clients.claim() und die Seite lädt sich einmal neu.
 */

const VERSION = '__SW_VERSION__';
const STATIC_CACHE = 'fb-static-' + VERSION;
const DATA_CACHE = 'fb-data-' + VERSION;
const PAGE_CACHE = 'fb-pages-' + VERSION;

const PRECACHE = [
  '/',
  '/app',
  '/gruppe',
  '/admin',
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

// Vom UI ausgelöst ("Neu laden"-Hinweis): wartenden SW sofort aktivieren.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
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
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (response && response.ok) {
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
