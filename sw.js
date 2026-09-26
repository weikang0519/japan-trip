/* 関西 → 関東 — offline cache.
   Navigations are NETWORK-FIRST so a pushed itinerary change lands immediately
   when online, and still works from cache when there is no signal.
   Static assets and map tiles stay cache-first: they rarely change and are
   what make the app usable underground. */
var CACHE = "kansai-kanto-v27";
var TILES = "kansai-kanto-tiles-v1";
var ASSETS = ["./", "./index.html", "./leaflet.js", "./leaflet.css",
              "./manifest.webmanifest", "./icon.svg", "./icon-180.png",
              "./icon-512.png", "./robots.txt", "./tickets/pending.svg",
              "./tickets/u7f3a1c-studio-a.jpg", "./tickets/u7f3a1c-studio-b.jpg",
              "./tickets/u7f3a1c-express-a.jpg", "./tickets/u7f3a1c-express-b.jpg",
              "./tickets/s9d4e22-sky-1of2.png", "./tickets/s9d4e22-sky-2of2.png",
              "./tickets/n4b8e07-nozomi86.webp"];

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

function isPage(req, url) {
  return req.mode === "navigate" ||
         url.pathname.endsWith("/") ||
         url.pathname.endsWith("/index.html");
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  /* Map tiles: keep whatever has been viewed, capped so it can't grow forever. */
  if (url.hostname.indexOf("cyberjapandata.gsi.go.jp") >= 0 || url.hostname.indexOf("arcgisonline.com") >= 0) {
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

  /* Google Maps, Tabelog and the e-ticket host leave the app — never intercepted. */
  if (url.origin !== self.location.origin) return;

  /* The page itself: network first, so updates are never stuck behind the cache. */
  if (isPage(req, url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (hit) {
          return hit || caches.match("./");
        });
      })
    );
    return;
  }

  /* Everything else (Leaflet, icons, ticket images): cache first. */
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
