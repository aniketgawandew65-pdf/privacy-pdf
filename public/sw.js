const CACHE_NAME = 'ocr-offline-v2';
const OFFLINE_ASSETS = [
  '/tessdata/worker.min.js',
  '/tessdata/tesseract-core-simd-lstm.wasm.js',
  '/tessdata/tesseract-core-simd-lstm.wasm',
  '/tessdata/eng.traineddata.gz',
];

// Non-blocking installation: caches each asset individually
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of OFFLINE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Non-critical: Failed to pre-cache ${asset}:`, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Clean up stale caches and claim active clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Intercept /tessdata/ requests: Serve local cache first, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/tessdata/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          // Only cache valid 200 OK responses
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
  }
});