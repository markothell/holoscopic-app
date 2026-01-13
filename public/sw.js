// Holoscopic Service Worker
// Network-first caching strategy for fresh data with offline fallback

const CACHE_NAME = 'holoscopic-v1';
const OFFLINE_URL = '/offline.html';

// Files to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/holoLogo_dark.svg',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - precache essential files
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching app shell');
      return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network-first strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome extension requests
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Skip all Next.js internal requests - these should not be cached
  // This includes development chunks, hot-reload, and dynamic routes
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/_next/') ||
      url.pathname.includes('/__nextjs') ||
      url.pathname.includes('.hot-update.')) {
    return;
  }

  // Skip API requests
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    networkFirstStrategy(event.request)
  );
});

// Network-first strategy: Try network, fall back to cache, then offline page
async function networkFirstStrategy(request) {
  try {
    // Try to fetch from network
    const networkResponse = await fetch(request);

    // If successful (2xx status), cache the response for offline use
    if (networkResponse.ok && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      // Only cache same-origin requests and valid responses
      if (new URL(request.url).origin === location.origin) {
        try {
          await cache.put(request, networkResponse.clone());
        } catch (cacheError) {
          // Silently fail if caching doesn't work
          console.log('[Service Worker] Cache put failed:', cacheError.message);
        }
      }
    }

    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('[Service Worker] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // If it's a navigation request and we have no cache, show offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match(OFFLINE_URL);
      if (offlinePage) {
        return offlinePage;
      }
    }

    // Nothing worked, throw the error
    throw error;
  }
}

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});
