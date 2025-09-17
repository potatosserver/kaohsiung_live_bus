// service-worker.js (修正版)

// 版本號保持或增加，以觸發更新
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v5';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v5';

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

    // 【核心修正】對導航請求（App的HTML外殼）採用 "網路優先，快取備援" 策略
    // 這可以解決首次啟動時，快取尚未建立完成導致的 ERR_FAILED 問題。
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // 1. 首先嘗試從網路獲取
                    const networkResponse = await fetch(request);

                    // 2. 如果成功，將其存入快取並回傳
                    const cache = await caches.open(CORE_CACHE_NAME);
                    // 為了保持一致性，我們總是將導航回應存為 /index.html
                    cache.put('/index.html', networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    // 3. 如果網路請求失敗（例如離線），則從快取中提供頁面
                    console.log('Service Worker: Network fetch failed for navigation, serving from cache.');
                    const cache = await caches.open(CORE_CACHE_NAME);
                    // 嘗試匹配原始請求，如果失敗再嘗試匹配 /index.html 作為備援
                    return await cache.match(request) || await cache.match('/index.html');
                }
            })()
        );
        return;
    }

    // 對於 API 和第三方資源，繼續採用 "Stale-While-Revalidate" 策略，以獲得最佳效能
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||
        url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (request.method === 'GET') {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(err => {
                    console.warn(`Service Worker: Network fetch failed for ${request.url}.`, err);
                });

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 對於其他同源靜態資源，採用 "快取優先" 策略
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            return cachedResponse || fetch(request);
        })
    );
});
