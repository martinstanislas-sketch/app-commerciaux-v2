/* Service Worker — My Coach Nutrition (Web Push + deep links) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = data.title || 'My Coach Nutrition';
  const opts = {
    body: data.body || '',
    icon: data.icon || '/nutrition/icon-192.png?v=2', // grande image de la notif : icône de marque
    badge: '/nutrition/icon.svg',                 // petite pastille (silhouette monochrome)
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
        // App déjà ouverte (ou en arrière-plan) : on demande à la page d'ouvrir la
        // conversation SANS recharger (postMessage), puis on la met au premier plan.
        try { c.postMessage({ type: 'mcn-open', url: url }); } catch (_) { /* ignore */ }
        try { await c.focus(); } catch (_) { /* ignore */ }
        return;
      }
    }
    // App fermée : on ouvre une nouvelle fenêtre sur l'URL profonde (le boot ouvre la conv).
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
