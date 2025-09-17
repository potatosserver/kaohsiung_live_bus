// service-worker.js (最終防禦版)

// 再次提升版本號，以強制更新
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v7';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v7';

// 核心資源，也就是App的外殼
const CORE_ASSETS = [
    '/index.html',
    '/manifest.json',
    '/icons/icon.ico',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// 安裝事件：打開快取並存入核心資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CORE_CACHE_NAME).then((cache) => {
            console.log('Service Worker: Caching core assets...');
            return cache.addAll(CORE_ASSETS);
        }).then(() => self.skipWaiting()) // 強制新的 Service Worker 立即啟用
    );
});

// 啟用事件：清理舊版本的快取
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
        }).then(() => self.clients.claim()) // 讓新的 Service Worker 控制所有已開啟的頁面
    );
});

// 攔截網路請求事件
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 策略1：對於App主頁面的導覽請求 (HTML文件)
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // 優先嘗試從網路獲取
                    const networkResponse = await fetch(request);

                    // 【關鍵防禦】在存入快取前，確保回應是有效的 (非重新導向、非錯誤)
                    if (networkResponse && networkResponse.ok) {
                        const cache = await caches.open(CORE_CACHE_NAME);
                        // 為了離線時能穩定讀取，總是將導航回應存為 /index.html
                        cache.put('/index.html', networkResponse.clone());
                    }
                    
                    return networkResponse;
                } catch (error) {
                    // 如果網路請求失敗 (離線)，則從快取中提供頁面
                    console.log('Fetch failed; returning offline page from cache.');
                    const cache = await caches.open(CORE_CACHE_NAME);
                    // 直接回傳快取的 index.html 內容，避免任何重新導向
                    return await cache.match('/index.html');
                }
            })()
        );
        return;
    }

    // 策略2：對於API和第三方資源，採用 "Stale-While-Revalidate" 策略
    // (先從快取提供，同時在背景更新)
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||
        url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                // 先嘗試從快取中拿
                const cachedResponse = await cache.match(request);
                
                // 同時，非同步地從網路獲取最新版本
                const fetchPromise = fetch(request).then((networkResponse) => {
                    // 【關鍵防禦】同樣，只快取有效的回應
                    if (networkResponse && networkResponse.ok && request.method === 'GET') {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(err => {
                    // 如果網路請求失敗，靜默處理，因為我們可能已經有快取版本了
                    console.warn(`SW: Network fetch failed for ${request.url}.`, err);
                });

                // 如果快取中有，立即回傳；否則等待網路的回應
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 策略3：對於其他同源靜態資源，採用 "快取優先" 策略
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            return cachedResponse || fetch(request);
        })
    );
});
