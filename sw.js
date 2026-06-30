/* RainLog 雨量记录 — service worker
   App-shell offline caching. Bump CACHE_VERSION on every deploy so clients update.
   Strategy:
     - Open-Meteo API calls: network-only (never cached here; the app caches its own
       results in localStorage). Live weather must never be served stale by the SW.
     - App shell (HTML, JS libs, icons): cache-first, with background refresh.
*/
const CACHE_VERSION = "rainlog-lab-20260627-12";   // <-- change this string on each deploy

const SHELL = [
  "./",
  "index.html",
  "xlsx.full.min.js",
  "html2canvas.min.js",
  "favicon-32.png",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png"
];

// Install: pre-cache the app shell. Don't fail the whole install if one optional
// asset (e.g. an icon) is missing — cache what we can.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.all(SHELL.map(async (url) => {
        try { await cache.add(new Request(url, { cache: "reload" })); }
        catch (_) { /* skip assets that aren't present */ }
      }));
      self.skipWaiting();
    })
  );
});

// Activate: drop any old version caches.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle GET; let the browser do everything else normally.
  if (req.method !== "GET") return;

  // Never cache weather API traffic — always go to the network.
  // (open-meteo.com and archive-api.open-meteo.com)
  if (url.hostname.endsWith("open-meteo.com")) {
    return; // default browser fetch; if offline, the app's own try/catch handles it
  }

  // Only manage same-origin shell requests; ignore other cross-origin GETs.
  if (url.origin !== self.location.origin) return;

  // Cache-first for the app shell, with a background refresh so updates land
  // on the next load after a deploy.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached); // offline: fall back to whatever we have

      // Serve cache immediately if present; otherwise wait for the network.
      return cached || network;
    })
  );
});
