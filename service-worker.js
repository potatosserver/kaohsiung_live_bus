// service-worker.js (採用 Stale-While-Revalidate 優化策略)

// 定義快取名稱，核心檔案和動態資料分開存放
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v1';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v1';

// 應用程式核心檔案 (App Shell)
// 注意：移除了 Google Fonts，因為它們最好也由 Stale-While-Revalidate 策略處理
const CORE_ASSETS = [
    '/',
    '/index.html', // 明确指定 index.html
    '/manifest.json',
    '/icons/icon.ico',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    // 預先快取關鍵的 CDN 資源
    'https://cdn.tailwindcss.com'
];

// 1. 安裝 Service Worker 並快取核心檔案
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CORE_CACHE_NAME).then((cache) => {
            console.log('Service Worker: Caching core assets...');
            return cache.addAll(CORE_ASSETS);
        }).then(() => self.skipWaiting()) // 強制新的 Service Worker 立即啟用
    );
});

// 2. 啟用 Service Worker 並清理舊快取
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CORE_CACHE_NAME, DYNAMIC_CACHE_NAME];

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 如果快取名稱不在白名單中，就將其刪除
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // 讓 Service Worker 立即控制所有開啟的頁面
    );
});

// 3. 攔截網路請求，並根據請求類型採用不同快取策略
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const request = event.request;

    // 策略一：API 請求、字型等動態資源，採用「Stale-While-Revalidate (先用快取，背景更新)」
    // 這能提供極速的載入體驗，同時確保資料能適時更新。
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||      // 高雄公車 API
        url.hostname.includes('api.open-meteo.com') ||    // 天氣 API
        url.hostname.includes('fonts.gstatic.com') ||     // Google Fonts
        url.hostname.includes('fonts.googleapis.com')) {
        
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                // 1. 立即從快取中取得回應
                const cachedResponse = await cache.match(request);

                // 2. 在背景中發起網路請求，並在成功後更新快取
                const fetchPromise = fetch(request).then((networkResponse) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                }).catch(err => {
                    console.warn(`Service Worker: Network fetch failed for ${request.url}.`, err);
                });

                // 3. 如果快取中有資料，立即回傳舊資料；否則等待網路請求完成
                // 這確保了即使離線，只要有舊快取，使用者就能看到內容。
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 策略二：對於核心檔案 (App Shell) 和其他 CDN 資源，採用「快取優先」
    // (先從快取讀取，找不到才從網路抓取)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // 如果快取中有，直接回傳
            if (cachedResponse) {
                return cachedResponse;
            }
            // 如果快取中沒有，則從網路獲取，並存入動態快取
            return fetch(request).then((networkResponse) => {
                return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                });
            });
        })
    );
});
