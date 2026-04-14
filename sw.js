/* ═══════════════════════════════
   Coffee Dashboard — Service Worker
   Network-first strategy: תמיד מביא גרסה עדכנית
   ═══════════════════════════════ */

const CACHE = 'coffee-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

/* Install: pre-cache */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* Activate: מחק את כל ה-caches הישנים */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: Network-first — תמיד מנסה רשת, fallback לcache */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // חשוב: HTML/CSS/JS תמיד מהרשת קודם
  const isAppFile = ASSETS.some(a =>
    event.request.url.endsWith(a.replace('./', '/'))
    || event.request.url.includes('index.html')
    || event.request.url.includes('style.css')
    || event.request.url.includes('app.js')
  );

  if (isAppFile) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // שאר הקבצים (fonts וכו') — cache-first
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
});
