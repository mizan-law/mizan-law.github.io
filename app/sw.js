// ميزان — بيخلّي التطبيق يفتح من غير نت. البيانات نفسها مش هنا (في التخزين المحلي، ومشفّرة وهي ماشية).
const V = 'mizan-app-2.3.4-light2';
const SHELL = ['./', 'index.html', 'mobile.js', 'app.js', 'config.js', 'style.css', 'mobile.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // الخطوط (jsdelivr): من النسخة المحفوظة على طول
  if (e.request.method === 'GET' && u.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((x) => { const c = x.clone(); caches.open(V).then((k) => k.put(e.request, c)); return x; })));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // السكربت ودرايف: دايمًا من النت
  // ملفات التطبيق: من النت لو موجود (عشان التحديثات)، ولو مفيش نت من النسخة المحفوظة
  // cache: 'no-cache' = يسأل السيرفر كل مرة (لو مفيش جديد بيرد 304 بسرعة) — عشان التحديث يوصل على طول
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
