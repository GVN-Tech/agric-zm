// Service Worker for Agrilovers
// Provides offline support and caching

const CACHE_NAME = 'agrilovers-v4';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/posts.js',
    '/js/market.js',
    '/js/groups.js',
    '/js/messaging.js',
    '/js/tools.js',
    '/js/utils.js',
    '/js/toast.js',
    '/config/supabase-config.js',
    '/config/env.js',
    '/manifest.json',
    '/icons/icon.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(STATIC_ASSETS);
            })
            .catch((error) => {
                console.error('Cache install error:', error);
            })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip Supabase API calls (they need to be fresh)
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Otherwise fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache the response
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // If network fails and we have a cached version, return it
                        // Otherwise return offline page
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// Background sync for offline actions (future enhancement)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-posts') {
        event.waitUntil(syncPosts());
    }
});

async function syncPosts() {
    // Sync offline posts when connection is restored
    // This would require IndexedDB to store offline posts
    console.log('Syncing posts...');
}


