// service-worker.js (修復版：移除 POST 快取邏輯)

// 提升版本號以觸發更新
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v9'; // 版本號 +1
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v9';
const PRECACHE_NAME = 'kaohsiung-bus-precache-v9';

// 核心 App 外殼資源
const CORE_ASSETS = [
    '/index.html',
    '/manifest.json',
    '/icons/icon.ico',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// 【修改】要在安裝時就下載的額外資源
// 移除 API URL，因為那是 POST 請求，不能放入 Cache Storage
const PRECACHE_ASSETS = [
    // Google Fonts 的 CSS 檔案
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Montserrat:wght@700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons&display=swap',
    // TailwindCSS
    'https://cdn.tailwindcss.com'
];


// 安裝事件：快取所有核心和預先快取的資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            // 任務1: 快取核心App外殼
            caches.open(CORE_CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)),
            
            // 任務2: 快取字體、CSS
            // 【修改】移除了 POST API 的預先快取邏輯，避免安裝失敗
            caches.open(PRECACHE_NAME).then(cache => {
                return Promise.all(
                    PRECACHE_ASSETS.map(url => cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err)))
                );
            })
        ]).then(() => self.skipWaiting())
    );
});


// 啟用事件：清理舊版本的快取
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CORE_CACHE_NAME, DYNAMIC_CACHE_NAME, PRECACHE_NAME];
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


// 攔截網路請求事件
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 【新增】重要修復：如果請求方法不是 GET (例如 GraphQL 的 POST)，直接忽略
    // 這解決了 "Request method 'POST' is unsupported" 的錯誤
    if (request.method !== 'GET') {
        return;
    }

    // 策略1：對於App主頁面的導覽請求 (HTML文件)
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const networkResponse = await fetch(request);
                    if (networkResponse && networkResponse.ok) {
                        const cache = await caches.open(CORE_CACHE_NAME);
                        cache.put('/index.html', networkResponse.clone());
                    }
                    return networkResponse;
                } catch (error) {
                    const cache = await caches.open(CORE_CACHE_NAME);
                    return await cache.match('/index.html');
                }
            })()
        );
        return;
    }

    // 策略2：對於外部 CDN 資源，採用 "Stale-While-Revalidate" 策略
    if (url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await caches.match(request);
                
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(err => {
                    console.warn(`SW: Network fetch failed for ${request.url}.`, err);
                });

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
