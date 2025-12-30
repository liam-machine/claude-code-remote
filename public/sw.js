/**
 * Claude Code Remote - Service Worker
 * Provides offline caching for PWA functionality
 */

const CACHE_NAME = 'claude-code-remote-v14';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/resize-coordinator.js',
  '/js/app.js',
  '/js/terminal.js',
  '/js/mobile.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

// External CDN assets
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js',
  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js'
];

// Install event - cache local assets only (fast activation)
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching local assets only (CDN cached in background)');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[SW] Installation complete - activating immediately');
      return self.skipWaiting();
    }).catch(err => {
      console.warn('[SW] Install failed:', err);
    })
  );
});

// Activate event - clean up old caches (NO clients.claim() to avoid page reload)
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activation complete');
      // NOTE: Removed clients.claim() - it was causing page reloads during
      // initialization which delayed WebSocket connections. The SW will
      // take control naturally on the next navigation.
    })
  );

  // Cache CDN assets in background (non-blocking)
  // This runs AFTER activation, so it doesn't delay the app
  caches.open(CACHE_NAME).then((cache) => {
    console.log('[SW] Background caching CDN assets...');
    CDN_ASSETS.forEach(url => {
      cache.match(url).then(cached => {
        if (!cached) {
          cache.add(url).then(() => {
            console.log('[SW] Cached CDN asset:', url);
          }).catch(err => {
            console.warn('[SW] Failed to cache CDN asset:', url, err);
          });
        }
      });
    });
  });
});

// Fetch event - CRITICAL: Minimize interference with WebSocket and API requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL FOR iOS PWA: Skip ALL of these immediately without ANY processing:
  // 1. WebSocket protocol requests (though SW rarely sees these)
  // 2. WebSocket upgrade paths (/ws/*)
  // 3. API requests (/api/*)
  // 4. Non-GET requests (POST, PUT, DELETE, etc.)
  // 5. Requests with Upgrade header (WebSocket handshakes)

  // Skip non-GET requests entirely
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip WebSocket and API paths - let browser handle directly
  if (url.pathname.startsWith('/ws/') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Skip if request has Upgrade header (WebSocket handshake)
  if (event.request.headers.get('Upgrade')) {
    return;
  }

  // Only cache static assets - be very selective
  const isStaticAsset =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.origin === 'https://cdn.jsdelivr.net';

  // If not a static asset, let browser handle it directly
  if (!isStaticAsset) {
    return;
  }

  // For static assets: cache-first for speed, network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately, update cache in background
        fetch(event.request).then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // Not cached, fetch from network
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Network failed, return offline page for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
