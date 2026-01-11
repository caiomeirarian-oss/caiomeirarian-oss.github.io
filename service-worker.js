const CACHE_NAME = 'multitrack-pro-v1.0.2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.js'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Tentando cachear arquivos...');
        // Cacheia um por um para não falhar tudo se um arquivo der erro
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn('⚠️ Não foi possível cachear:', url, err);
            })
          )
        );
      })
      .then(() => {
        console.log('✅ Cache finalizado');
        return self.skipWaiting();
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Interceptar requisições - ESTRATÉGIA: Network First, Cache Fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignora requisições não-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignora URLs externas (CDN, etc) - MAS cacheia se for requisição GET válida
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cacheia recursos externos também
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Se offline, tenta do cache
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    // Tenta buscar da rede primeiro
    fetch(event.request)
      .then(response => {
        // Se conseguiu da rede, cacheia e retorna
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhou (offline), tenta do cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              console.log('📦 Servindo do cache (offline):', event.request.url);
              return cachedResponse;
            }
            // Se não tem no cache, retorna index.html
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
