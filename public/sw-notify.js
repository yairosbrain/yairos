// Imported into the generated service worker (workbox.importScripts).
// Notification click → open the built site (when a URL is attached)
// or focus/open Yairos itself.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      if (/^https?:/.test(url)) return self.clients.openWindow(url);
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.length) return wins[0].focus();
      return self.clients.openWindow(url);
    })()
  );
});
