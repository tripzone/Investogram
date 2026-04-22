const CACHE = 'investogram-v4';

// Only cache stable CDN resources — never cache local app files.
// Local files (app.js, styles.css, etc.) are always loaded with a ?v=N
// version query so they go directly to the network. Caching the
// unversioned path could serve stale code to returning users.
const CDN_STATIC = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.umd.min.js',
  'https://unpkg.com/chartjs-chart-financial@0.2.1/dist/chartjs-chart-financial.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CDN_STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls or Firebase auth — always go network
  if (url.pathname.startsWith('/api/') || url.hostname.includes('firebase') || url.hostname.includes('google')) {
    return;
  }

  // CDN resources: cache-first (they have stable versioned URLs)
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Everything else (HTML, local JS/CSS): always network-first, no cache fallback.
  // Local app files use ?v=N versioning so the browser HTTP cache handles them
  // correctly — the SW should not interfere.
  e.respondWith(fetch(e.request));
});
