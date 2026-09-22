/* 関西 → 関東 — offline cache.
   Bump CACHE when the itinerary changes so phones pick up the new version. */
var CACHE = "kansai-kanto-v4";
var TILES = "kansai-kanto-tiles-v1";
var ASSETS = ["./", "./index.html", "./leaflet.js", "./leaflet.css",
              "./manifest.webmanifest", "./icon.svg", "./icon-180.png", "./icon-512.png", "./robots.txt"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === CACHE || k === TILES) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  /* Map tiles: keep whatever has been viewed, capped so it can't grow forever.
     Pan around each city once on wifi and those tiles are yours offline. */
  if (url.hostname.indexOf("tile.openstreetmap.org") >= 0) {
    e.respondWith(
      caches.open(TILES).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            c.put(req, res.clone());
            c.keys().then(function (ks) {
              if (ks.length > 1200) for (var i = 0; i < 200; i++) c.delete(ks[i]);
            });
            return res;
          }).catch(function () { return new Response("", { status: 504 }); });
        });
      })
    );
    return;
  }

  /* Google Maps and 小红书 links leave the app entirely — never intercepted. */
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match("./index.html"); });
    })
  );
});
