import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

function serviceWorkerPlugin(): Plugin {
  return {
    name: 'shift-ledger-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const buildAssets = Object.keys(bundle)
        .filter((file) => !file.endsWith('.map') && file !== 'index.html')
        .map((file) => `/${file}`);
      const precache = Array.from(
        new Set([
          '/',
          '/index.html',
          '/manifest.webmanifest',
          '/icons/icon.svg',
          '/icons/favicon-32.png',
          '/icons/icon-192.png',
          '/icons/icon-512.png',
          '/icons/icon-maskable-512.png',
          '/icons/apple-touch-icon.png',
          ...buildAssets,
        ]),
      );
      const version = Date.now().toString(36);
      const source = `const CACHE_NAME = 'shift-ledger-${version}';
const PRECACHE = ${JSON.stringify(precache)};
const APP_SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 单个资源失败不应让整份离线缓存失效
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        /* 忽略单个资源 */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // 只缓存正常的页面响应，避免把错误页当成离线外壳
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(APP_SHELL)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
