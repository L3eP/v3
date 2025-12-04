const CACHE_NAME = 'login-app-v2'; // Increment version
const ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/user-dashboard.html',
    '/ticket-list.html',
    '/ticket-details.html',
    '/new-ticket.html',
    '/activity.html',
    '/register.html',
    '/user-list.html',
    '/settings.html',
    '/css/style.css',
    '/js/script.js',
    '/js/navbar.js',
    '/js/dashboard.js',
    '/js/user-dashboard.js',
    '/js/ticket-list.js',
    '/js/ticket-details.js',
    '/js/new-ticket.js',
    '/js/activity.js',
    '/js/register.js',
    '/js/settings.js',
    '/js/user-list.js',
    '/js/edit-user.js',
    '/manifest.json',
    '/vendor/fontawesome/css/all.min.css'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS);
            })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Network First for API calls
    if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Stale-While-Revalidate for static assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});
