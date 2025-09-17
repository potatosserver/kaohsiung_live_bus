// service-worker.js (具備預先快取功能的最終版)

// 提升版本號以觸發更新
const CORE_CACHE_NAME = 'kaohsiung-bus-core-v8';
const DYNAMIC_CACHE_NAME = 'kaohsiung-bus-dynamic-v8';
const PRECACHE_NAME = 'kaohsiung-bus-precache-v8'; // 新增一個專門的預先快取儲存區

// 核心 App 外殼資源
const CORE_ASSETS = [
    '/index.html',
    '/manifest.json',
    '/icons/icon.ico',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// 【新增】要在安裝時就下載的額外資源
const PRECACHE_ASSETS = [
    // Google Fonts 的 CSS 檔案
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Montserrat:wght@700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons&display=swap',
    // TailwindCSS
    'https://cdn.tailwindcss.com',
    // 初始的路線資料 API (我們將在安裝時主動請求並快取它)
    'https://ibus.tbkc.gov.tw/ibus/graphql' 
];


// 安裝事件：快取所有核心和預先快取的資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            // 任務1: 快取核心App外殼
            caches.open(CORE_CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)),
            
            // 任務2: 快取字體、CSS和初始API資料
            caches.open(PRECACHE_NAME).then(cache => {
                // 對於跨域請求(如API)，我們需要手動建立 Request 物件
                // 這裡我們只預先快取路線列表，這是App啟動最關鍵的資料
                const apiRequest = new Request(PRECACHE_ASSETS[3], {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: `query QUERY_SIDE_ROUTES($lang: String!) {
                            routes(lang: $lang) {
                                edges { node { id, opType, id, seq, name, description } }
                            }
                        }`,
                        variables: { lang: "zh" } // 預設快取中文版
                    })
                });

                // 將其他靜態資源和API請求一起加入快取
                return Promise.all([
                    ...PRECACHE_ASSETS.slice(0, 3).map(url => cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err))),
                    cache.add(apiRequest).catch(err => console.warn('Failed to pre-cache API data:', err))
                ]);
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

    // 策略2：對於 API 和第三方資源，採用 "Stale-While-Revalidate" 策略
    // 這個邏輯現在會自動處理我們預先快取的資源
    if (url.hostname.includes('ibus.tbkc.gov.tw') ||
        url.hostname.includes('api.open-meteo.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
                // caches.match 會自動搜尋所有快取，所以它能找到我們在 PRECACHE_NAME 中的項目
                const cachedResponse = await caches.match(request);
                
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        // 我們將更新的資料存入動態快取，保持預先快取的純淨
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
