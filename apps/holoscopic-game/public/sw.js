// Retired service worker. KEEP THIS FILE, and keep it at this path.
//
// holoscopic.io once registered a caching worker here, with an offline page
// that reloaded itself every second whenever a page load failed on a device
// that still reported being online. Deleting the file would leave that worker
// running in every browser that installed it. A browser checks /sw.js for an
// update when it navigates in scope, so serving this version is what reaches
// them: it clears every cache the old worker made and unregisters itself.
//
// It has no fetch handler, so while it is briefly installed every request goes
// straight to the network.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    await self.registration.unregister();
  })());
});
