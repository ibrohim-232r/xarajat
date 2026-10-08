// Service worker "Mening moliyam".
// Правила:
//  - /api/* и любые не-GET запросы НЕ трогаем (данные и сессия только с сервера, никакого кеша);
//  - страницы (навигация): сначала сеть, при отсутствии интернета показываем offline.html;
//  - /assets/* (файлы Vite с хешем в имени, не меняются): сначала кеш, потом сеть;
//  - иконки, manifest: из кеша с фоновым обновлением.
const VER = 'v1'
const STATIC = 'fin-static-' + VER
const ASSETS = 'fin-assets-' + VER
const MAX_ASSETS = 80
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fin-') && k !== STATIC && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

async function trim(cache) {
  const keys = await cache.keys()
  if (keys.length > MAX_ASSETS) await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map(k => cache.delete(k)))
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return // данные и сессия: только сеть

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(ASSETS).then(async cache => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) { cache.put(req, res.clone()); trim(cache) }
        return res
      })
    )
    return
  }

  if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.open(STATIC).then(async cache => {
        const hit = await cache.match(req)
        const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res }).catch(() => hit)
        return hit || net
      })
    )
  }
})
