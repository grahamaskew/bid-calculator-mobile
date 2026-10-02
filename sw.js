// Offline support. Pages: network first (so a push goes live on next open), cached copy when offline.
// Everything else (icons, Geist font): cached copy first, refreshed in the background.
// Every app on grahamaskew.github.io shares one cache store, so only touch caches named bidcalc-mobile-*.
// Behind Cloudflare Access an expired login redirects every request to the login page. A redirected
// response, or an opaque one for our own files, is that login page: never cache it.
const PREFIX = 'bidcalc-mobile-';
const CACHE = PREFIX + 'v2';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Saves a copy, keeping the worker alive until it's written. A failed write (e.g. storage full) is ignored.
const store = (e, key, res) => e.waitUntil(caches.open(CACHE).then(c => c.put(key, res)).catch(() => {}));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    // Ignore ?s= and #settings when matching: every page load is the same index.html.
    // A server error (5xx) falls back to the cached copy too; with no copy, the error page is shown.
    e.respondWith(fetch(req)
      .then(res => {
        if (res.ok && !res.redirected) { store(e, './', res.clone()); return res; }
        if (res.status >= 500) return caches.match('./').then(hit => hit || res);
        return res;
      })
      .catch(() => caches.match('./')));
    return;
  }

  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      const ours = new URL(req.url).origin === self.location.origin;
      if ((res.ok && !res.redirected) || (res.type === 'opaque' && !ours)) store(e, req, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
