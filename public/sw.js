/**
 * Service worker for the installed (home screen) app.
 *
 * Deliberately hand-rolled rather than pulled from a toolchain: the Next.js
 * PWA guide points at Serwist for offline support, but that still requires
 * webpack config and this project builds with Turbopack. The caching rules
 * below are the whole of what this app needs.
 *
 * Strategy, by request type:
 *   /_next/static/*  cache-first     — content-hashed filenames, immutable
 *   navigations      network-first   — falls back to cache, then /offline
 *   /api/series      network-first   — falls back to cache, so tickers you
 *                                      already looked at still analyze offline
 *   everything else  passthrough
 *
 * Daily closes don't change intraday, so serving a stale series beats an
 * error screen when the network drops.
 */

const VERSION = "v1";
const STATIC_CACHE = `dd-static-${VERSION}`;
const PAGES_CACHE = `dd-pages-${VERSION}`;
const DATA_CACHE = `dd-data-${VERSION}`;

const OFFLINE_URL = "/offline";

// Kept small on purpose. Everything else fills in as the user browses.
const PRECACHE_URLS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      // Individual puts, so one 404 can't fail the whole install the way
      // cache.addAll() would.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch {
            /* offline at install time; it'll be cached on first visit */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE, DATA_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("dd-") && !keep.has(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch writes, and never touch other origins (the ticker logos come
  // from financialmodelingprep.com and are fine going straight to network).
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build output: safe to serve from cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // `mode === "navigate"` is a real page load, which excludes the RSC payload
  // fetches App Router makes for client-side navigation.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES_CACHE, OFFLINE_URL));
    return;
  }

  if (url.pathname === "/api/series") {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
});
