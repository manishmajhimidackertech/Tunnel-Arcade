// Service worker template. At build time vite.config.js replaces the two placeholders
// with a content hash and the list of every emitted file, so the whole game is
// precached on first visit and then runs offline.
const CACHE = 'tunnel-trouble-__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tunnel-trouble-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    const index = new URL('./index.html', self.registration.scope);
    event.respondWith(caches.match(index).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
