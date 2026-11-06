/* Service worker: cache-first agar game jalan offline & cepat dimuat. Naikkan VERSI saat ada pembaruan. */
const VERSI = 'distorsi-v2';
const ASET = ['./', 'index.html', 'css/style.css', 'js/engine.js', 'js/ui.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(ASET)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return; // hanya file sendiri
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
    if (res.ok) { const salin = res.clone(); caches.open(VERSI).then(c => c.put(r, salin)); }
    return res;
  })).catch(() => caches.match('index.html')));
});
