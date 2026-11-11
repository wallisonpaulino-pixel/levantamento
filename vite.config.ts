import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

// Gera o service worker com a lista de arquivos do build, para o app abrir sem internet.
function swOffline(): Plugin {
  return {
    name: 'sw-offline',
    apply: 'build',
    closeBundle() {
      const dist = 'dist'
      const arquivos: string[] = []
      const andar = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f)
          if (statSync(p).isDirectory()) andar(p)
          else arquivos.push(relative(dist, p).replace(/\\/g, '/'))
        }
      }
      andar(dist)
      const lista = arquivos.filter((f) => f !== 'sw.js').sort()
      const hash = createHash('sha1')
      for (const f of lista) hash.update(f).update(readFileSync(join(dist, f)))
      const versao = hash.digest('hex').slice(0, 10)
      const urls = ['./', ...lista.filter((f) => f !== 'index.html').map((f) => './' + f)]
      const sw = `// gerado no build
const CACHE = 'lev-${versao}';
const ARQUIVOS = ${JSON.stringify(urls)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('lev-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).catch(() => caches.match('./')))
  );
});
`
      writeFileSync(join(dist, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), swOffline()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
