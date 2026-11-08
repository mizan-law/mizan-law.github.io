// ميزان — بيخلّي التطبيق يفتح من غير نت. البيانات نفسها مش هنا (في التخزين المحلي، ومشفّرة وهي ماشية).
const V = 'mizan-app-3.0.0';
const SHELL = ['./', 'index.html', 'full.js', 'mobile.js', 'app.js', 'config.js', 'style.css', 'mobile.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && !/^mizan-run-/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // 3.0.0: البرنامج الكامل (حزمة موقّعة اتحققنا منها قبل ما تتحفظ) — من الذاكرة بس، عمره ما بيتجاب من النت مباشرة
  if (e.request.method === 'GET' && u.origin === location.origin && /\/run\/[0-9a-f]{16}\//.test(u.pathname)) {
    e.respondWith(caches.match(u.origin + u.pathname).then((r) => r || new Response('الملف مش موجود في حزمة البرنامج', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })));
    return;
  }
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
