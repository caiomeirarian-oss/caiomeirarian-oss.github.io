const CACHE_NAME = 'multitrack-pro-v1.0.0';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache aberto - Cacheando arquivos');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Todos os arquivos cacheados com sucesso');
      })
      .catch(err => {
        console.error('❌ Erro ao cachear arquivos:', err);
      })
  );
  self.skipWaiting();
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
    })
  );
  self.clients.claim();
});

// Interceptar requisições
self.addEventListener('fetch', event => {
  // Ignora requisições não-GET e URLs externas
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna do cache se encontrar
        if (response) {
          console.log('📦 Servindo do cache:', event.request.url);
          return response;
        }

        // Faz requisição de rede
        console.log('🌐 Buscando da rede:', event.request.url);
        return fetch(event.request).then(response => {
          // Verifica se recebeu resposta válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clona a resposta
          const responseToCache = response.clone();

          // Adiciona ao cache para uso futuro
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
              console.log('💾 Adicionado ao cache:', event.request.url);
            });

          return response;
        });
      })
      .catch(err => {
        console.error('❌ Erro no fetch, tentando cache:', err);
        // Retorna página offline se disponível
        return caches.match('./index.html');
      })
  );
});
