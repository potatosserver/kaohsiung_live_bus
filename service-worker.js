// service-worker.js (專業修復與強化版)

// 1. 提升版本號以觸發更新
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v3';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v3';

// 2. 核心 App Shell 應只包含最關鍵、無外部依賴的檔案
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
        }).then(() => self.skipWaiting()) // 強制新的 Service Worker 立即啟用
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
        }).then(() => self.clients.claim()) // 讓 Service Worker 立即控制所有開啟的頁面
    );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 3. 【核心修復】對導航請求採用「網路優先，快取備援」策略
    // 這確保使用者永遠能拿到最新的 index.html，同時在離線時能完美運作
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // 先嘗試從網路獲取最新的 index.html
                    const networkResponse = await fetch(request);
                    // 成功後，放入核心快取中更新
                    const cache = await caches.open(CORE_CACHE_NAME);
                    cache.put('/index.html', networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    // 網路請求失敗（離線），從快取中取得備援
                    console.log('Service Worker: Serving app shell from cache.');
                    return await caches.match('/index.html');
                }
            })()
        );
        return;
    }

    // 4. 對於 API 和第三方資源，採用「Stale-While-Revalidate」策略
    // 立即從快取回應以加速載入，同時在背景更新快取
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
                    console.warn(`Service Worker: Network fetch failed for ${request.url}.`, err);
                    // 【強化】如果字型或樣式請求失敗，回傳一個空的成功回應，避免阻擋頁面渲染
                    if (request.destination === 'style' || request.destination === 'font') {
                        return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
                    }
                    // 如果是 API 失敗，讓瀏覽器處理錯誤
                });

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 5. 對於其他同源靜態資源（如未來新增的 JS, CSS），採用「快取優先」策略
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            return cachedResponse || fetch(request).then((networkResponse) => {
                // 動態加入快取
                return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                });
            });
        })
    );
});
