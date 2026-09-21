const CACHE = "expense-log-v5";
const STATIC_FILES = [
  "/",
  "/index.html",
  "/transactions/",
  "/transactions/index.html",
  "/add/",
  "/add/index.html",
  "/analytics/",
  "/analytics/index.html",
  "/app.js",
  "/dev-data.js",
  "/js/site.js",
  "/js/db.js",
  "/js/format.js",
  "/js/sync.js",
  "/js/pages/add.js",
  "/js/pages/home.js",
  "/js/pages/ledger.js",
  "/style.css",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
