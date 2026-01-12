const CACHE_NAME = 'multitrack-pro-v1.0.3';
const STATIC_CACHE = 'multitrack-static-v1.0.3';
const DYNAMIC_CACHE = 'multitrack-dynamic-v1.0.3';

// Arquivos essenciais que SEMPRE devem estar no cache
const CORE_FILES = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Recursos externos importantes
const EXTERNAL_RESOURCES = [
  'https://unpkg.com/lucide@latest/dist/umd/lucide.js'
];

// Instalação - cacheia arquivos essenciais
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Instalando v1.0.3...');
  event.waitUntil(
    Promise.all([
      // Cache de arquivos estáticos
      caches.open(STATIC_CACHE).then(cache => {
        console.log('📦 Cacheando arquivos estáticos...');
        return cache.addAll(CORE_FILES);
      }),
      // Cache de recursos externos
      caches.open(DYNAMIC_CACHE).then(cache => {
        console.log('🌐 Cacheando recursos externos...');
        return Promise.allSettled(
          EXTERNAL_RESOURCES.map(url => 
            fetch(url)
              .then(response => cache.put(url, response))
              .catch(err => console.warn('⚠️ Não foi possível cachear:', url))
          )
        );
      })
    ]).then(() => {
      console.log('✅ Instalação concluída - forçando ativação');
      return self.skipWaiting();
    })
  );
});

// Ativação - limpa caches antigos e assume controle
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remove qualquer cache que não seja o atual
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker ativado e assumiu controle');
      return self.clients.claim();
    })
  );
});

// Fetch - estratégia híbrida
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignora requisições não-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Estratégia para arquivos estáticos (HTML, CSS, JS, imagens)
  const isStaticFile = CORE_FILES.some(file => 
    event.request.url.includes(file.replace('./', ''))
  );

  if (isStaticFile) {
    // Cache First para arquivos estáticos
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          console.log('📦 Cache HIT:', event.request.url);
          // Retorna do cache mas atualiza em background
          fetch(event.request).then(response => {
            if (response && response.status === 200) {
              caches.open(STATIC_CACHE).then(cache => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        // Se não tem no cache, busca da rede
        console.log('🌐 Cache MISS, buscando da rede:', event.request.url);
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          // Fallback para index.html se for navegação
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
  } else {
    // Network First para recursos externos e dinâmicos
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Se offline, busca do cache
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              console.log('📦 Servindo do cache (offline):', event.request.url);
              return cachedResponse;
            }
            // Fallback final
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
  }
});

// Mensagens do cliente
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
