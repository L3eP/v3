const CACHE_NAME = 'mayung-app-v55'; // Increment — kompresi foto bukti tiket (kamera HP sering >5MB, batas server) sebelum upload, cegah "gagal upload foto" saat teknisi buat/selesaikan tiket
const ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/ticket-list.html',
    '/ticket-details.html',
    '/activity.html',
    '/admin.html',
    '/ftth.html',
    '/inventory.html',
    '/map.html',
    '/user-list.html',
    '/settings.html',
    '/psb.html',
    '/offline.html',
    '/css/style.css',
    '/js/constants.js',
    '/js/script.js',
    '/js/navbar.js',
    '/js/pdf-loader.js',
    '/js/csrf.js',
    '/js/toast.js',
    '/js/dashboard.js',
    '/js/ticket-list.js',
    '/js/ticket-details.js',
    '/js/activity.js',
    '/js/admin.js',
    '/js/ftth.js',
    '/js/inventory.js',
    '/js/map.js',
    '/js/settings.js',
    '/js/user-list.js',
    '/js/psb.js',
    '/manifest.json',
    '/images/icon-512.png',
    '/images/icon-192.png',
    '/vendor/fontawesome/css/all.min.css'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Aktifkan SW baru segera, tanpa nunggu reload 2x
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
            // Hafalkan client yang masih aktif setelah SW baru menang
            return Promise.all([
                Promise.all(
                    keys.filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                ),
                self.clients.claim()
            ]);
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    const reqUrl = new URL(event.request.url);

    // Tile peta OSM = cross-origin, DILEWATI service worker sama sekali.
    // SW fetch melepas referer elemen/atribut && tile tidak perlu di-cache di app.
    // Tanpa bypass ini OSM menolak tile dengan 403 (sama seperti kasus no-referrer).
    if (reqUrl.hostname.endsWith('.tile.openstreetmap.org')) return;

    // Data endpoint = Network First (JANGAN pakai cache stale).
    // Copy penting: path tepat untuk '/tickets'/'/activities'/'/users' dst,
    // TAPI tidak menangkap halaman '.html' (ticket-list.html, activity.html, dll).
    const path = reqUrl.pathname;
    const isDataRequest =
        event.request.method !== 'GET' ||
        path === '/tickets' || path.startsWith('/tickets/') ||
        path === '/activities' || path.startsWith('/activities/') ||
        path === '/users' || path.startsWith('/users/') ||
        path.startsWith('/settings/') ||
        path.startsWith('/api/') ||
        path === '/login' || path === '/logout' || path === '/register' ||
        path === '/update-profile' || path === '/update-role' ||
        path.startsWith('/admin/');

    if (isDataRequest) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request, { ignoreSearch: true });
                })
        );
        return;
    }

    // Stale-While-Revalidate for static assets
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // Clone SECARA SINCHRON di tick yang sama dengan response datang.
                // Ini mencegah "Response body is already used" — browser tidak
                // sempat mengonsumsi body sebelum clone dibuat.
                if (networkResponse && networkResponse.ok) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, cacheCopy);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If navigation request fails, show offline page
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
                return cachedResponse;
            });
            // Kalau ada cache → kembalikan cache dulu (client baca cache,
            // sedangkan network response dipakai untuk update cache).
            // Kalau tidak ada cache → pakai response jaringan.
            return cachedResponse || fetchPromise;
        })
    );
});
