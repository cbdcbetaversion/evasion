/* ÉVASION Service Worker v5 — Offline-First App Shell, API Cache & Push Notifications */

var CACHE_PREFIX = 'evasion-v5-';
var SHELL_CACHE = CACHE_PREFIX + 'shell';
var ASSETS_CACHE = CACHE_PREFIX + 'assets';
var API_CACHE = CACHE_PREFIX + 'api';

var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

var CACHEABLE_API_PREFIXES = [
  '/api/posts',
  '/api/chat',
  '/api/salons',
  '/api/lives',
  '/api/users/online',
  '/api/friends',
  '/api/health',
];

self.addEventListener('install', function (event) {
  if (typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  }
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return Promise.all(
          PRECACHE_URLS.map(function (url) {
            return cache.add(new Request(url, { cache: 'reload' })).catch(function () {
              return null;
            });
          })
        );
      })
      .catch(function () {
        return null;
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
          return caches.keys().then(function (keys) {
            return Promise.all(
              keys.map(function (key) {
                if (key.indexOf(CACHE_PREFIX) !== 0) {
                  return caches.delete(key);
                }
                return false;
              })
            );
          });
        }
      })
      .then(function () {
        if (self.clients && typeof self.clients.claim === 'function') {
          return self.clients.claim();
        }
      })
  );
});

function isCacheableGetApi(pathname) {
  for (var i = 0; i < CACHEABLE_API_PREFIXES.length; i++) {
    if (pathname.indexOf(CACHEABLE_API_PREFIXES[i]) === 0) {
      return true;
    }
  }
  return false;
}

function isStaticAssetRequest(url) {
  var p = url.pathname;
  if (p.indexOf('/assets/') === 0) return true;
  if (p === '/manifest.webmanifest' || p === '/api/manifest.webmanifest') return true;
  return /\.(?:js|mjs|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf|otf)$/i.test(p);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (!req || req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (_e) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept SSE streams, WebSocket upgrades, Auth mutations, or Supabase realtime/auth requests
  if (
    url.pathname.indexOf('/api/auth/') === 0 ||
    url.pathname.indexOf('/api/posts/stream') === 0 ||
    url.pathname.indexOf('/api/sync/stream') === 0 ||
    url.pathname.indexOf('/ws') === 0 ||
    url.pathname.indexOf('/sw') === 0 ||
    url.hostname.indexOf('supabase.co') !== -1
  ) {
    return;
  }

  // 1. HTML Navigations (App Shell): Network-first with timeout fallback to cached /index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (networkRes) {
          if (networkRes && networkRes.ok) {
            var resCopy = networkRes.clone();
            caches.open(SHELL_CACHE).then(function (cache) {
              cache.put('/index.html', resCopy).catch(function () {});
            });
          }
          return networkRes;
        })
        .catch(function () {
          return caches.match('/index.html').then(function (cachedIndex) {
            if (cachedIndex) return cachedIndex;
            return caches.match('/');
          });
        })
    );
    return;
  }

  // 2. Read-only GET APIs: Network-first, fallback to cached JSON offline
  if (url.origin === self.location.origin && isCacheableGetApi(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(function (networkRes) {
          if (networkRes && networkRes.ok) {
            var clone = networkRes.clone();
            caches.open(API_CACHE).then(function (cache) {
              cache.put(req, clone).catch(function () {});
            });
          }
          return networkRes;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            if (cached) return cached;
            return new Response(JSON.stringify({ offline: true, cached: false }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'X-Evasion-Offline': '1' },
            });
          });
        })
    );
    return;
  }

  // 3. Static JS/CSS/Icons/Fonts (same-origin or Google Fonts): Stale-While-Revalidate
  var isFontOrigin =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if ((url.origin === self.location.origin && isStaticAssetRequest(url)) || isFontOrigin) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var networkPromise = fetch(req)
            .then(function (networkRes) {
              if (networkRes && (networkRes.ok || networkRes.type === 'opaque')) {
                cache.put(req, networkRes.clone()).catch(function () {});
              }
              return networkRes;
            })
            .catch(function () {
              return cached;
            });
          return cached || networkPromise;
        });
      })
    );
  }
});

function buildNotificationOptions(payload) {
  var body = (payload && payload.body) || 'Nouveau message reçu sur ÉVASION.';
  var tag = (payload && payload.tag) || 'evasion-msg-' + Date.now();
  var data = Object.assign(
    {
      url: (payload && payload.url) || '/',
      type: (payload && payload.type) || 'message',
    },
    (payload && payload.data) || {}
  );

  var options = {
    body: body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: tag,
    renotify: true,
    requireInteraction: data.type === 'dm' || data.type === 'comment',
    vibrate: [140, 70, 140],
    timestamp: (payload && payload.timestamp) || Date.now(),
    data: data,
  };

  if (data.type === 'dm' || data.type === 'comment' || data.type === 'cour' || data.type === 'test') {
    options.actions = [
      {
        action: 'reply',
        title: 'Voir & Répondre',
      },
    ];
  }

  return options;
}

function showEvasionNotification(title, payload) {
  var finalTitle = title || 'ÉVASION · Nouveau message';
  var opts = buildNotificationOptions(payload);
  return self.registration.showNotification(finalTitle, opts).catch(function () {
    delete opts.actions;
    delete opts.requireInteraction;
    return self.registration.showNotification(finalTitle, opts);
  });
}

self.addEventListener('push', function (event) {
  var payload = {
    title: 'ÉVASION · Nouveau message',
    body: 'Tu as reçu un nouveau message.',
    url: '/',
  };

  try {
    if (event.data) {
      var parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = Object.assign(payload, parsed);
      }
    }
  } catch (_e) {
    try {
      if (event.data) {
        payload.body = event.data.text() || payload.body;
      }
    } catch (_err) {
      // keep fallback payload
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        var hasVisibleFocusedClient = false;
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.focused && client.visibilityState === 'visible') {
            hasVisibleFocusedClient = true;
          }
          try {
            client.postMessage({ type: 'PUSH_RECEIVED', payload: payload });
          } catch (_err) {
            // ignore client postMessage errors
          }
        }

        if (payload.forceShow || !hasVisibleFocusedClient) {
          return showEvasionNotification(payload.title, payload);
        }
        return Promise.resolve();
      })
  );
});

self.addEventListener('message', function (event) {
  var msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SHOW_LOCAL_NOTIFICATION' && msg.payload) {
    var payload = msg.payload;
    event.waitUntil(showEvasionNotification(payload.title, payload));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var notifData = Object.assign({}, (event.notification && event.notification.data) || {});
  if (event.action === 'reply') {
    notifData.wantsReply = true;
  }
  var targetUrl = notifData.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('focus' in client) {
            return client.focus().then(function (focusedClient) {
              var target = focusedClient || client;
              try {
                target.postMessage({ type: 'NOTIFICATION_CLICK', data: notifData });
              } catch (_err) {
                // ignore
              }
              return target;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
