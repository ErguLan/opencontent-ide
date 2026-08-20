/**
 * OpenContent IDE Service Worker
 *
 * Caches the app shell for offline use. Uses a cache-first strategy for
 * static assets and network-first for API/data requests.
 */

const CACHE_NAME = 'opencontent-ide-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/brand/logo.svg',
    '/brand/logo-192.png',
    '/brand/logo-512.png',
    '/icons/logo.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    // API and MCP requests go directly to the network
    if (request.url.includes('/api/') || request.url.includes('/v1/')) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                return response;
            }).catch(() => cached);
        })
    );
});
