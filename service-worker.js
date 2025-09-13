const CACHE_NAME = 'kaohsiung-bus-cache-v1';
const CORE_ASSETS = [
    '/', // 或者直接用 '/index.html'
    '/index.html',
    '/manifest.json',
    '/icons/icon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching core assets...');
                return cache.addAll(CORE_ASSETS);
            })
            .catch(error => {
                console.error('Failed to cache core assets:', error);
            })
    );
});

// 啟用 Service Worker 並清理舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 對於 CDN 資源和 API，優先使用網路，失敗則回退到快取
    if (request.url.startsWith('https://cdn.tailwindcss.com') || 
        request.url.startsWith('https://fonts.googleapis.com') || 
        request.url.startsWith('https://fonts.gstatic.com') ||
        request.url.includes('ibus.tbkc.gov.tw')) {
        
        event.respondWith(
            fetch(request)
                .then(response => {
                    // 如果成功，則將回應放入快取並回傳
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // 如果網路失敗，則從快取中尋找
                    return caches.match(request);
                })
        );
        return;
    }

    // 對於 App 的核心檔案，優先使用快取
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                // 如果快取中有，直接回傳
                if (cachedResponse) {
                    return cachedResponse;
                }
                // 如果快取中沒有，則從網路獲取
                return fetch(request);
            })
    );
});
