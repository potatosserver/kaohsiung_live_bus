// service-worker.js (最終專業修復版 - 採用 Stale-While-Revalidate)

// 1. 再次提升版本號，確保瀏覽器觸發更新
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v4';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v4';

const CORE_ASSETS = [
    '/index.html',
    '/manifest.json',
    '/icons/icon.ico',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// 安裝 Service Worker 並快取核心檔案
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CORE_CACHE_NAME).then((cache) => {
            console.log('Service Worker: Caching core assets...');
            return cache.addAll(CORE_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// 啟用 Service Worker 並清理舊快取
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CORE_CACHE_NAME, DYNAMIC_CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 2. 【核心修復】對導航請求採用 "Stale-While-Revalidate" 策略
    if (request.mode === 'navigate') {
        event.respondWith(
            caches.open(CORE_CACHE_NAME).then(async (cache) => {
                // 立即從快取提供頁面，達到最快速度
                const cachedResponse = await cache.match('/index.html');

                // 同時，在背景從網路獲取最新版本並更新快取
                const fetchPromise = fetch('/index.html').then((networkResponse) => {
                    cache.put('/index.html', networkResponse.clone());
                    return networkResponse;
                }).catch(err => {
                    // 離線時網路請求失敗是正常的，靜默處理即可
                    console.log('Service Worker: Navigation fetch failed, serving stale content.');
                });

                // 如果快取存在，立即回傳；如果快取不存在（首次訪問），則等待網路回應
                return cachedResponse || await fetchPromise;
            })
        );
        return;
    }

    // 3. 對於 API 和第三方資源，繼續採用 "Stale-While-Revalidate" 策略
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||
        url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                const fetchPromise = fetch(request).then((networkResponse) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                }).catch(err => {
                    console.warn(`Service Worker: Network fetch failed for ${request.url}.`);
                });

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 4. 對於其他同源靜態資源，採用 "快取優先" 策略
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            return cachedResponse || fetch(request);
        })
    );
});
