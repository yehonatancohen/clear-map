
const DATA_CACHE = 'clearmap-data-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('clearmap-data-') && k !== DATA_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Static geo data (polygons, regions, centroids): serve from cache instantly,
// refresh in the background. Live alert data is never cached here.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/data/')) {
    return;
  }
  event.respondWith(
    caches.open(DATA_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return network;
      })
    )
  );
});

// Push notification handler — works even when all tabs are closed
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  // Check if any client window is focused (app is in foreground).
  // If so, skip — the in-app local notifications handle it with richer filtering.
  const promiseChain = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      const hasFocusedClient = clients.some((c) => c.visibilityState === 'visible');
      if (hasFocusedClient) return; // Let in-app notifications handle it

      const options = {
        body: data.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        vibrate: [200, 100, 200],
        tag: data.tag || 'push_alert',
        renotify: true,
        data: {
          url: data.url || '/',
          dateOfArrival: Date.now(),
        },
      };

      return self.registration.showNotification(data.title || 'מפה שקופה', options);
    });

  event.waitUntil(promiseChain);
});

// Open app when notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if one is open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(urlToOpen);
    })
  );
});
