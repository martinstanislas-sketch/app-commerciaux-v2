/* Service Worker — My Coach Nutrition (Web Push + deep links) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = data.title || 'My Coach Nutrition';
  const opts = {
    body: data.body || '',
    icon: '/nutrition/icon.svg',
    badge: '/nutrition/icon.svg',
    tag: data.type || 'mcn',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || '/nutrition/', logId: data.logId || 0 },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  let url = d.url || '/nutrition/';
  if (d.logId) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'plog=' + d.logId; // suivi d'ouverture
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if (c.url.indexOf('/nutrition') >= 0 && 'focus' in c) {
        try { await c.navigate(url); } catch (_) { /* certains navigateurs bloquent navigate */ }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
