// Service worker for the installable Imoth app.
// - Never touches /api: quotes, logins and PDFs always go to the server.
// - Page navigations are network-first, falling back to the cached app
//   shell so the installed app still opens (and keeps the agent logged in)
//   on a poor connection.
// - Hashed build assets and icons are cache-first.
const CACHE = "imoth-app-v1";
const SHELL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || /\.(png|ico|webmanifest|jpg|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
  }
});
