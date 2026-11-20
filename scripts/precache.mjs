import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() && entry.name !== "sw.js" && !entry.name.endsWith(".zip"),
  )
  .map((entry) =>
    resolve(entry.parentPath, entry.name)
      .slice(dist.length + 1)
      .replaceAll("\\", "/"),
  )
  .sort();
const hash = createHash("sha256");
for (const name of files)
  hash.update(name).update(await readFile(resolve(dist, name)));
const version = hash.digest("hex").slice(0, 16);

await writeFile(
  resolve(dist, "sw.js"),
  `
const prefix = 'ai-bilingual-story-player:'
const cacheKey = prefix + self.registration.scope + ':${version}'
const urls = ${JSON.stringify(files.map((name) => "./" + name))}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheKey).then(cache => cache.addAll(urls)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix + self.registration.scope + ':') && key !== cacheKey)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(cacheKey).then(cache => cache.match('./index.html'))))
    return
  }
  const relative = './' + url.href.slice(self.registration.scope.length)
  if (relative === './stories/index.json') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(
      () => caches.open(cacheKey).then(cache => cache.match(relative))
    ))
    return
  }
  if (urls.includes(relative)) {
    event.respondWith(caches.open(cacheKey).then(cache => cache.match(event.request)).then(found => found ?? fetch(event.request)))
  }
})
`,
);
