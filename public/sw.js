self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Basic fetch handler for PWA requirements.
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
