// Bei jedem Update CACHE hochzählen, sonst behalten installierte Apps die alte Version.
const CACHE = 'lernklar-v2';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'ics.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Nur eigene Caches löschen: VIGIL, Sonnenklar und Sales Universe liegen auf derselben Adresse
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lernklar-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com|unpkg\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
// Tipp auf eine Erinnerung öffnet Lernklar (oder holt das offene Fenster nach vorn)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});
