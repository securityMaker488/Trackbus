const CACHE = "trackbus-public-v7";
const PUBLIC = [
  "/offline.html",
  "/trackbus-logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PUBLIC)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("trackbus-public-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    u.origin !== self.location.origin ||
    u.pathname.startsWith("/api/") ||
    u.pathname.includes("sign") ||
    e.request.method !== "GET"
  )
    return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (PUBLIC.includes(u.pathname))
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    /* Generic notice remains safe for old senders. */
  }
  const current = Number(data.expires) > Date.now();
  const path =
    typeof data.path === "string" && data.path.startsWith("/#/map?")
      ? data.path
      : "/#/map";
  event.waitUntil(
    self.registration.showNotification("TrackBus · Sua viagem", {
      body:
        current && typeof data.body === "string"
          ? data.body.slice(0, 350)
          : "Há uma atualização na sua viagem. Abra o TrackBus para consultar a previsão atual.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag:
        typeof data.tag === "string"
          ? data.tag.slice(0, 256)
          : "trackbus-route",
      renotify: false,
      data: { path },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const value = event.notification.data?.path;
  const path =
    typeof value === "string" && value.startsWith("/#/map?") ? value : "/#/map";
  event.waitUntil(
    (async () => {
      const url = new URL(path, self.location.origin).href;
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients)
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(url);
          await client.focus();
          return;
        }
      await self.clients.openWindow(url);
    })(),
  );
});
