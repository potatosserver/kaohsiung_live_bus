// service-worker.js (已採用 Stale-While-Revalidate 並修復離線導航問題)

const CORE_CACHE_NAME = 'kaohsiung-bus-core-v2'; // <--- 版本升級!
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v2'; // <--- 版本升級!

// 應用程式核心檔案 (App Shell) - 移除了模糊的 '/'
const CORE_ASSETS = [
    '/index.html', // 明确指定 index.html 作為唯一的入口點
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

    // 【關鍵修正】 - 優先處理導航請求
    // 如果這是一個頁面導航請求 (使用者想打開一個頁面)
    if (request.mode === 'navigate') {
        // 我們統一回傳快取的 index.html，這能處理所有對根目錄或子路徑的直接訪問
        event.respondWith(
            caches.match('/index.html').then(response => {
                return response || fetch('/index.html'); // 如果快取沒有，還是嘗試從網路獲取
            })
        );
        return; // 結束後續處理
    }

    // 策略一：API 請求、字型等動態資源，採用「Stale-While-Revalidate (先用快取，背景更新)」
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||
        url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('fonts.googleapis.com')) {
        
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                const fetchPromise = fetch(request).then((networkResponse) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                }).catch(err => {
                    console.warn(`Service Worker: Network fetch failed for ${request.url}.`, err);
                    if (request.destination === 'style') {
                        return new Response('', {
                            status: 200,
                            statusText: 'OK',
                            headers: { 'Content-Type': 'text/css' }
                        });
                    }
                    return; // 對於其他請求，若失敗且快取中沒有，則回傳 undefined
                });
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 策略二：對於非導航、非API的核心檔案 (如 manifest.json, icons)，採用「快取優先」
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            return cachedResponse || fetch(request).then((networkResponse) => {
                return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                });
            });
        })
    );
});
