// Service worker do Habilita (registrado só no celular): abre rápido e funciona sem sinal
// com o que já foi visto. Índice e telas: rede primeiro (sempre a versão nova); PDFs e miniaturas: cópia guardada e atualiza por trás.
const CACHE = "habilita-v1";
const CASCA = ["./", "index.html", "estilo.css", "app.js", "minisearch.js", "icone.svg", "icone-192.png", "manifest.webmanifest", "dados.json"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // SerproDrive e servidor: direto na rede
  const guardar = (resp) => { if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return resp; };
  if (/\/(arquivos|miniaturas)\//.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((salvo) => { const rede = fetch(e.request).then(guardar).catch(() => salvo); return salvo || rede; }));
    return;
  }
  e.respondWith(fetch(e.request).then(guardar).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
