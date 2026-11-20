// Service worker do Rumo: rede primeiro (atualizações chegam sozinhas), cache só como reserva offline.
const VERSAO = 'rumo-v6';
const ARQUIVOS = ['./', './index.html', './config.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png',
  './css/cerebro.css', './js/cerebro/index.js', './js/cerebro/theme.js', './js/cerebro/math.js', './js/cerebro/gl.js', './js/cerebro/regions.js',
  './js/cerebro/shaders.js', './js/cerebro/brain.js', './js/cerebro/post.js', './js/cerebro/camera.js', './js/cerebro/scene.js', './js/cerebro/cards.js', './js/cerebro/cursor.js', './js/xlsx.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Só arquivos do próprio site. Chamadas ao Apps Script e ao Google nunca passam pelo cache.
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
