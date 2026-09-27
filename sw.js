// Network first: every request tries the network and refreshes the cache,
// falling back to the cache only when offline. Deploys take effect without
// a cache version bump. STATIC_FILES is precached so every page works
// offline after the first visit; the name changes only if this strategy does.
const CACHE = "expense-log-network-first";
const STATIC_FILES = [
  "/",
  "/transactions/",
  "/add/",
  "/categories/",
  "/analytics/",
  "/js/site.js",
  "/js/charts.js",
  "/js/db.js",
  "/js/format.js",
  "/js/sync.js",
  "/js/pages/add.js",
  "/js/pages/categories.js",
  "/js/pages/home.js",
  "/js/pages/ledger.js",
  "/style.css",
  "/fonts/ABCArealSuperfamilyVariable.woff2",
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

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  // Cache pages without their query string (e.g. /add/?id=...), so one
  // entry per page serves every variant offline.
  const key = request.mode === "navigate" ? new URL(request.url).pathname : request;
  try {
    const response = await fetch(request);
    // Skip redirects (such as an expired Vercel sign-in) and errors.
    if (response.ok && response.type === "basic") {
      await cache.put(key, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}
