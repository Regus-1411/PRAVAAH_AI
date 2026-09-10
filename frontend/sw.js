/* =========================================================================
   PRAVAAH-AI Service Worker (PWA & Push Notifications)
   - Handles background mobile emergency alerts & sudden surge warnings
   - Supports haptic vibration patterns and direct notification action routing
========================================================================= */

const CACHE_NAME = 'pravaah-ai-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch((e) => console.log('Cache pre-fill skipped', e))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

/* ── Push Notification Event ── */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'PRAVAAH-AI Emergency Alert', body: event.data ? event.data.text() : 'High disaster risk detected.' };
  }

  const title = data.title || '🚨 PRAVAAH-AI CRITICAL ALERT';
  const options = {
    body: data.body || 'Immediate hazard alert. Open app to view emergency instructions.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: data.vibrate || [300, 100, 300, 100, 500, 100, 500],
    data: data.url || '/',
    requireInteraction: true,
    tag: data.tag || 'emergency-alert',
    renotify: true,
    actions: [
      { action: 'open', title: '🚨 View Evacuation Route' },
      { action: 'dismiss', title: '✕ Acknowledge' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification Click & Action Routing ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
