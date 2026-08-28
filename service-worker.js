const CACHE = "googlefeud-shell-v21";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=21",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/favicon-48.png",
  "./assets/gameshow-stage.webp",
  "./assets/social-share.jpg",
  "./assets/footer-wordmark.webp",
  "./src/app.js?v=21",
  "./src/config.js",
  "./src/core.js",
  "./src/data/question-bank.js",
  "./src/services/effects.js?v=21",
  "./src/services/firebase-service.js",
  "./src/services/live-suggestions.js",
  "./src/services/storage.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
