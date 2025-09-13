// service-worker.js (基於新範本修改的建議版本)

// 定義快取名稱，核心檔案和動態資料分開存放
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v1';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v1';

// 應用程式核心檔案 (App Shell)
const CORE_ASSETS = [
    '/', // 根目錄，對應 index.html，避免重新導向問題
    '/manifest.json',
    '/icons/icon.ico',
    // 預先快取關鍵的 CDN 資源，提升首次載入速度
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Montserrat:wght@700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined&display=swap'
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
    // 這個陣列包含了當前版本會用到的所有快取名稱
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

    // 策略一：API 請求 和 字體 等動態資源，採用「網路優先」
    // (先從網路抓取，失敗才讀快取)
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                try {
                    const response = await fetch(request);
                    // 如果請求成功，將新的回應存入快取並回傳
                    cache.put(request, response.clone());
                    return response;
                } catch (error) {
                    // 如果網路請求失敗，嘗試從快取中尋找備份
                    console.log('Service Worker: Network request failed, trying cache for:', request.url);
                    return await cache.match(request);
                }
            })
        );
        return;
    }

    // 策略二：對於核心檔案 和 其他 CDN 資源，採用「快取優先」
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
