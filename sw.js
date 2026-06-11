/* Service Worker IURAN WIFI — network-first dengan fallback cache */
const CACHE = 'iuranwifi-v1';
const SHELL = ['./', './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Biarkan request lintas-domain (Firebase, Leaflet, Google tiles, font) langsung ke jaringan
  if (url.origin !== location.origin) return;
  // Same-origin: network-first, simpan ke cache, fallback ke cache lalu ke index.html
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});
