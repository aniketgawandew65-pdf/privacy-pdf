const CACHE_NAME = 'ocr-offline-v1';
const OFFLINE_ASSETS = [
  '/tessdata/worker.min.js',
  '/tessdata/tesseract-core-simd-lstm.wasm.js',
  '/tessdata/tesseract-core-simd-lstm.wasm',
  '/tessdata/eng.traineddata.gz',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/tessdata/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        });
      })
    );
  }
});