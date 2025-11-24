// 變更 CACHE_NAME 來強制瀏覽器更新 Service Worker (關鍵)
const CACHE_NAME = 'jp-wordvault-cache-v2'; 

// 修正快取檔案路徑為相對路徑
const urlsToCache = [
  './', // 網站根目錄
  'index.html',
  'manifest.json', // 修正路徑
  // 如果您有其他圖片或 CSS/JS 檔案，也請加入相對路徑
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// 新增 activate 事件，用於清理舊的快取版本
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // 刪除不在白名單中的舊快取
          }
        })
      );
    })
  );
});