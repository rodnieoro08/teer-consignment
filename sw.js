const CACHE = "teer-consign-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./scan-fix.js",
  "./cloud.js",
  "./data.js",
  "./util.js",
  "./csv.js",
  "./gs1.js",
  "./sync-merge.js",
  "./manifest.json",
  "./icon.svg",
  "./apple-touch-icon.png",
  "./icon-512.png"
];
const CDN = [
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js",
  "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
];
const NETWORK_TIMEOUT_MS = 4000;

function isCdn(url) {
  return CDN.some((item) => url.href === item || url.href.startsWith(item));
}

function shouldHandle(url) {
  return url.origin === self.location.origin || isCdn(url);
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then((response) => {
      clearTimeout(timer);
      resolve(response);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await Promise.all(CDN.map(async (url) => {
      try {
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (response && response.ok) await cache.put(url, response);
      } catch (_) {}
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (!shouldHandle(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request, { ignoreSearch: true })
        || (request.mode === "navigate" ? await caches.match("./index.html") : null);
      if (cached) return cached;
      return new Response("Offline and not cached yet. Open TEER Consignment once while you have signal.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
