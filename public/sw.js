/* Keel service worker: offline-first.
 * - Install: precache the app shell plus every file in Vite's asset manifest (lazy screens,
 *   fonts, CSS), so every screen works with no signal.
 * - Navigations: network first, fall back to the cached shell.
 * - Static assets: cache first (filenames are content-hashed).
 * - Activate: drop cached assets that the current build no longer references.
 */
const SHELL_CACHE = 'keel-shell-v2';
const ASSET_CACHE = 'keel-assets-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icons/apple-touch-icon.png'];

async function buildFiles() {
  try {
    const res = await fetch('./asset-manifest.json', { cache: 'no-store' });
    const manifest = await res.json();
    const files = new Set();
    for (const entry of Object.values(manifest)) {
      files.add('./' + entry.file);
      for (const f of entry.css ?? []) files.add('./' + f);
      for (const f of entry.assets ?? []) files.add('./' + f);
    }
    return [...files];
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL);
      const assets = await caches.open(ASSET_CACHE);
      const files = await buildFiles();
      await Promise.all(files.map((f) => assets.add(f).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      const files = new Set((await buildFiles()).map((f) => new URL(f, self.registration.scope).href));
      if (files.size) {
        const assets = await caches.open(ASSET_CACHE);
        for (const req of await assets.keys()) if (!files.has(req.url)) await assets.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
