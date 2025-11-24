// Service Worker 版本號 (每次更新內容時，請增加版本號以強制更新快取)
const CACHE_NAME = 'wordvault-cache-v1.0.1'; 

// 應用程式所需快取的所有檔案列表
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    // 必須包含的圖標檔案
    '/icon-192.png',
    '/icon-512.png',
    // 外部字體快取 (確保離線時字體顯示正常)
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap'
];

// 安裝階段：快取所有靜態資源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: 成功打開並快取核心檔案');
                return cache.addAll(urlsToCache).catch(error => {
                    console.error('部分檔案快取失敗 (可能因跨域):', error);
                });
            })
    );
    self.skipWaiting(); 
});

// 啟用階段：清除舊版本的快取
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Service Worker: 刪除舊的快取:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// 擷取請求階段：使用「快取優先，網路備用」策略
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 快取命中，直接回傳
                if (response) {
                    return response;
                }
                
                // 快取未命中，從網路請求
                return fetch(event.request);
            })
    );
});