// ميزان — تطبيق المحامي على الموبايل (2.2.0)
// © 2026 ميزان لإدارة مكاتب المحاماة — أشرف سلامة أبوسريع المحامي. MZN-ASA-1141940663-2026
// الربط بكود من 9 حروف (أو رابط واتساب) ← قضايا المحامي بتنزل من ملف مشفّر في درايف المكتب ← بيشتغل من غير نت
// ← القرارات بتطلع مشفّرة لصندوق المكتب. التشفير وفكّه بيحصلوا هنا على الموبايل بس (AES-256-GCM).
(function () {
  'use strict';
  var CFG = window.MIZAN_CFG || {};
  var app = document.getElementById('app');
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var SYNC_MS = 5 * 60 * 1000; var RESEND_MS = 10 * 60 * 1000;

  // ===== أدوات =====
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ls = {
    get: function (k) { try { return localStorage.getItem('mz_' + k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem('mz_' + k); else localStorage.setItem('mz_' + k, v); return true; } catch (e) { return false; } },
    json: function (k, d) { try { var v = JSON.parse(ls.get(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
  };
  var enc8 = new TextEncoder(); var dec8 = new TextDecoder();
  function b64ToBytes(s) { var b = atob(s); var u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function bytesToB64(u) { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  var normCode = function (c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  function aesKey(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function decrypt(rawKey, bytes, magic) {
    if (bytes.length < 32 || dec8.decode(bytes.subarray(0, 4)) !== magic) return Promise.reject(new Error('صيغة غير معروفة'));
    return aesKey(rawKey).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(4, 16) }, k, bytes.subarray(16)); })
      .then(function (p) { return new Uint8Array(p); });
  }
  function encrypt(rawKey, bytes, magic) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return aesKey(rawKey).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, bytes); }).then(function (c) {
      var ct = new Uint8Array(c); var out = new Uint8Array(16 + ct.length);
      out.set(enc8.encode(magic), 0); out.set(iv, 4); out.set(ct, 16); return out;
    });
  }
  function relay(op, body) {
    if (!CFG.relay || /RELAY_URL/.test(CFG.relay)) return Promise.reject(new Error('التطبيق لسه مش متجهز (رابط الصندوق ناقص)'));
    body = body || {}; body.op = op;
    return fetch(CFG.relay, { method: 'POST', body: JSON.stringify(body), redirect: 'follow', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) { var e = new Error((j && j.error) || 'خطأ'); e.code = j && j.error; throw e; } return j; });
  }

  // ===== الحالة =====
  var T = ls.json('t', null);            // تذكرة الربط: f ملف درايف، k المفتاح، b الصندوق، o المكتب، u المحامي، d اسم الموبايل
  var pack = ls.json('pack', null);
  var outbox = ls.json('outbox', []);     // {uid, op, hearing_id, decision, next_date, next_time, at, sent}
  var lastSync = Number(ls.get('last') || 0);
  var notes = ls.json('notes', []);       // رسايل للمحامي (قرار ماوصلش...)
  var tab = 'h'; var open = null; var q = ''; var syncing = false; var syncErr = ''; var form = false; // form: شاشة القرار/القايمة مفتوحة — المزامنة ماتمسحهاش
  var saveOutbox = function () { ls.set('outbox', JSON.stringify(outbox)); };
  var today = (function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  var fmt = function (d) { if (!d) return ''; var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }); };
  var ago = function (ms) { if (!ms) return 'لسه'; var m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'دلوقتي' : m < 60 ? 'من ' + m + ' دقيقة' : m < 1440 ? 'من ' + Math.round(m / 60) + ' ساعة' : 'من ' + Math.round(m / 1440) + ' يوم'; };

  function wipe(msg) {
    ['t', 'pack', 'outbox', 'last', 'notes'].forEach(function (k) { ls.set(k, null); });
    T = null; pack = null; outbox = []; notes = []; lastSync = 0;
    pairScreen('', msg);
  }

  // ===== الربط =====
  function pair(code) {
    var c = normCode(code);
    if (c.length !== 9 || c.split('').some(function (x) { return ALPHA.indexOf(x) < 0; })) return Promise.reject(new Error('الكود 9 حروف وأرقام — راجعه تاني'));
    var tk;
    // نفس اللي على الكمبيوتر: PBKDF2 (300 ألف لفة) ⇒ رقم التذكرة + مفتاح فكّها
    return crypto.subtle.importKey('raw', enc8.encode(c), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc8.encode('mizan-ticket-v1'), iterations: 300000, hash: 'SHA-256' }, k, 512); })
      .then(function (bits) { var b = new Uint8Array(bits); tk = b.slice(32); return relay('claim', { id: hex(b.slice(0, 32)) }); })
      .catch(function (e) { if (e.code === 'expired') throw new Error('الكود ده خلص أو اتستخدم قبل كده. اطلب من المكتب كود جديد.'); throw e.message === 'Failed to fetch' ? new Error('مفيش نت — اتصل بالنت وجرّب تاني') : e; })
      .then(function (j) { return decrypt(tk, b64ToBytes(j.blob), 'MZT1'); })
      .then(function (p) {
        T = JSON.parse(dec8.decode(p)); ls.set('t', JSON.stringify(T));
        pack = null; ls.set('pack', null); outbox = []; saveOutbox();
        return send({ t: 'hello', ua: navigator.userAgent.slice(0, 120), at: Date.now() }).catch(function () {});
      })
      .then(function () { return sync(true); });
  }
  function send(msg) {
    return encrypt(b64ToBytes(T.k), enc8.encode(JSON.stringify(msg)), 'MZM1').then(function (b) { return relay('put', { box: T.b, data: bytesToB64(b) }); });
  }
  function fetchPack() {
    var get = CFG.apiKey
      ? fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(T.f) + '?alt=media&key=' + encodeURIComponent(CFG.apiKey), { cache: 'no-store' })
        .then(function (r) { if (r.status === 404) return { gone: true }; if (!r.ok) throw new Error('درايف: ' + r.status); return r.arrayBuffer().then(function (a) { return { bytes: new Uint8Array(a) }; }); })
      : relay('pack', { f: T.f }).then(function (j) { if (j.status === 404) return { gone: true }; if (j.status !== 200) throw new Error('درايف: ' + j.status); return { bytes: b64ToBytes(j.data) }; });
    return get.then(function (r) { if (r.gone) return { gone: true }; return decrypt(b64ToBytes(T.k), r.bytes, 'MZP1').then(function (p) { return JSON.parse(dec8.decode(p)); }); });
  }

  // ===== المزامنة =====
  function sync(force) {
    if (!T || syncing) return Promise.resolve();
    syncing = true; syncErr = ''; if (pack && !form) render();
    var pending = outbox.filter(function (o) { return force || !o.sent || Date.now() - o.sent > RESEND_MS; });
    var p = pending.length ? send({ t: 'items', items: pending.map(function (o) { return { uid: o.uid, op: o.op, hearing_id: o.hearing_id, decision: o.decision, next_date: o.next_date, next_time: o.next_time, at: o.at }; }) })
      .then(function () { var now = Date.now(); pending.forEach(function (o) { o.sent = now; }); saveOutbox(); }) : Promise.resolve();
    return p.then(fetchPack).then(function (np) {
      if (np.gone) return wipe('المكتب لغى ربط الموبايل ده، فالقضايا اتمسحت منه. لو ده غلط اطلب كود جديد.');
      if (np.wipe) return wipe('المكتب قفل نسخة الموبايل لحسابك، فالقضايا اتمسحت من الموبايل.');
      // القرارات اللي وصلت للمكتب تتشال من «مستني يترفع»
      var res = {}; (np.results || []).forEach(function (r) { res[r.uid] = r; });
      outbox = outbox.filter(function (o) {
        var r = res[o.uid]; if (!r) return true;
        if (!r.ok) notes.push({ t: 'red', m: 'قرار جلسة ' + (o.decision || '').slice(0, 40) + ' ماتسجلش في المكتب: ' + (r.error || '') });
        else if (r.conflict) notes.push({ t: '', m: 'الجلسة كان ليها قرار تاني في المكتب، فقرارك «' + (o.decision || '').slice(0, 40) + '» اتحط في الملاحظات.' });
        return false;
      });
      saveOutbox(); ls.set('notes', JSON.stringify(notes.slice(-10)));
      pack = np; lastSync = Date.now(); ls.set('pack', JSON.stringify(pack)); ls.set('last', String(lastSync));
    }).catch(function (e) { syncErr = e.message === 'Failed to fetch' || /NetworkError|network/i.test(e.message) ? 'مفيش نت' : e.message; })
      .then(function () { syncing = false; if (T && !form) render(); });
  }

  // ===== الشاشات =====
  function pairScreen(code, msg) {
    var standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone || /MizanApp/.test(navigator.userAgent);
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    app.innerHTML = '<header><div class="w">ميزان</div><small>موبايل المحامي</small></header><main>' +
      (msg ? '<div class="note red">' + esc(msg) + '</div>' : '') +
      '<h1>اربط الموبايل بمكتبك</h1><p>اطلب من مدير المكتب «ربط موبايل» في برنامج ميزان، واكتب الكود اللي هيديهولك (أو دوس على رابط الواتساب).</p>' +
      '<label for="code">كود الربط</label><input id="code" class="code" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="13" placeholder="XXX-XXX-XXX" value="' + esc(code || '') + '">' +
      '<div class="err" id="er"></div><button id="go">اربط</button>' +
      (!standalone ? '<div class="install"><b>عشان يبقى زي التطبيق:</b> ' + (ios ? 'في Safari دوس زرار المشاركة <b>⎋</b> ثم «إضافة إلى الشاشة الرئيسية».' : 'من قايمة Chrome (⋮) دوس «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».') + '</div>' : '') +
      '<div class="hint">الكود صالح 15 دقيقة ولمرة واحدة. قضاياك بتوصل مشفّرة، ومحدش يقدر يقراها غير الموبايل ده.</div></main>';
    var inp = document.getElementById('code'); var btn = document.getElementById('go'); var er = document.getElementById('er');
    inp.addEventListener('input', function () { var c = normCode(inp.value).slice(0, 9); var f = c.replace(/(.{3})(?=.)/g, '$1-'); if (f !== inp.value) inp.value = f; });
    var go = function () {
      er.style.display = 'none'; btn.disabled = true; btn.textContent = 'بيربط...';
      pair(inp.value).then(function () { if (T && !pack) { syncErr = syncErr || 'اتربط، بس القضايا لسه ما نزلتش — هتنزل أول ما النت يرجع'; render(); } })
        .catch(function (e) { er.textContent = e.message; er.style.display = 'block'; btn.disabled = false; btn.textContent = 'اربط'; });
    };
    btn.onclick = go; inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    if (code && normCode(code).length === 9) go();
  }

  var caseOf = {}; var pendingFor = {};
  var caseNo = function (c) { return c.case_number ? c.case_number + (c.case_year ? ' لسنة ' + c.case_year : '') : 'بدون رقم'; };
  function header() {
    var st = syncing ? 'بيحدّث...' : syncErr ? syncErr + ' · آخر تحديث ' + ago(lastSync) : 'آخر تحديث ' + ago(lastSync);
    return '<div class="bar"><div class="t"><b>ميزان</b><small>' + esc((pack && pack.user) || T.u) + ' · ' + esc(st) +
      (outbox.length ? ' · <b style="color:#E2C27A;font-size:12px">' + outbox.length + ' مستني يترفع</b>' : '') + '</small></div>' +
      '<button class="ib" data-sync>' + (syncing ? '...' : 'حدّث') + '</button><button class="ib" data-menu>☰</button></div>' +
      '<div class="tabs"><button data-t="h" class="' + (tab === 'h' ? 'on' : '') + '">الجلسات</button><button data-t="c" class="' + (tab === 'c' ? 'on' : '') + '">القضايا</button></div>';
  }
  function hearingCard(h, withCase) {
    var c = caseOf[h.case_id] || {}; var p = pendingFor[h.id];
    var late = h.date < today && !h.done && !p;
    return '<div class="card"><h3>' + (withCase ? esc(c.subject) : esc(fmt(h.date))) + (h.time ? ' <span class="pill">' + esc(h.time) + '</span>' : '') +
      (p ? '<span class="pill">القرار مستني يترفع</span>' : h.done ? '<span class="pill green">اتسجّل القرار</span>' : late ? '<span class="pill red">محتاج قرار</span>' : '') + '</h3>' +
      (withCase ? '<div class="muted">' + esc(caseNo(c)) + ' · ' + esc(c.court || '') + (c.circuit ? ' — ' + esc(c.circuit) : '') + ' · ' + esc(c.client_name || '') + '</div>' : '') +
      (h.purpose ? '<div class="muted">' + esc(h.purpose) + '</div>' : '') +
      (h.decision ? '<div class="muted"><b>القرار:</b> ' + esc(h.decision) + '</div>' : '') +
      (p ? '<div class="muted"><b>قرارك:</b> ' + esc(p.decision) + (p.next_date ? ' — الجاية ' + esc(p.next_date) : '') + '</div>' : '') +
      (!h.done && !p && h.date <= today ? '<button class="sm" data-dec="' + h.id + '">سجّل القرار</button>' : '') +
      (withCase ? ' <button class="sm ghost" data-open="' + h.case_id + '">القضية</button>' : '') + '</div>';
  }
  function render() {
    form = false;
    if (!T) return pairScreen();
    var expired = pack && pack.until && Date.now() > pack.until;
    if (!pack || expired) {
      app.innerHTML = header() + '<div class="wrap">' + (expired ? '<div class="note red">النسخة اللي على الموبايل عدّى عليها أكتر من 7 أيام من غير تحديث، فاتقفلت لحماية بيانات المكتب. اتصل بالنت ودوس «حدّث».</div>'
        : '<div class="note">' + esc(syncErr || 'بيجيب قضاياك من المكتب...') + '</div>') +
        (outbox.length ? '<div class="note">' + outbox.length + ' قرار مستنيين يترفعوا.</div>' : '') + '<button data-sync>حدّث دلوقتي</button></div>';
      return;
    }
    caseOf = {}; pack.cases.forEach(function (c) { caseOf[c.id] = c; });
    pendingFor = {}; outbox.forEach(function (o) { pendingFor[o.hearing_id] = o; });
    var body = notes.map(function (n, i) { return '<div class="note ' + esc(n.t) + '">' + esc(n.m) + ' <a href="#" data-nn="' + i + '">تمام</a></div>'; }).join('');
    if (open && caseOf[open]) {
      var c = caseOf[open];
      var hs = pack.hearings.filter(function (h) { return h.case_id === c.id; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      var dls = (pack.deadlines || []).filter(function (d) { return d.case_id === c.id; });
      body += '<button class="sm ghost" data-back>رجوع</button><div class="card"><h3>' + esc(c.subject) + '</h3>' +
        '<div class="muted">' + [caseNo(c), c.case_type, c.degree].filter(Boolean).map(esc).join(' · ') + '<br>' + esc(c.court || '') + (c.circuit ? ' — دائرة ' + esc(c.circuit) : '') +
        '<br>الموكل: ' + esc(c.client_name || '') + (c.client_phone ? ' — <a href="tel:' + esc(c.client_phone) + '">' + esc(c.client_phone) + '</a>' : '') +
        (c.opponent ? '<br>الخصم: ' + esc(c.opponent) : '') + '<br>الحالة: ' + esc(c.status || '') + '</div></div>' +
        (dls.length ? '<div class="day">مواعيد قانونية</div>' + dls.map(function (d) { return '<div class="card"><h3>' + esc(d.kind) + '<span class="pill ' + (d.due_date <= today ? 'red' : '') + '">' + esc(fmt(d.due_date)) + '</span></h3></div>'; }).join('') : '') +
        '<div class="day">الجلسات</div>' + (hs.length ? hs.map(function (h) { return hearingCard(h, false); }).join('') : '<div class="empty">مفيش جلسات</div>');
    } else if (tab === 'h') {
      open = null;
      var need = pack.hearings.filter(function (h) { return h.date < today && !h.done && !pendingFor[h.id]; });
      var up = pack.hearings.filter(function (h) { return h.date >= today; });
      var days = {}; up.forEach(function (h) { (days[h.date] = days[h.date] || []).push(h); });
      body += (need.length ? '<div class="day" style="color:#8E2F2F">جلسات محتاجة قرار (' + need.length + ')</div>' + need.map(function (h) { return hearingCard(h, true); }).join('') : '') +
        Object.keys(days).sort().map(function (d) { return '<div class="day">' + (d === today ? 'النهارده — ' : '') + esc(fmt(d)) + '</div>' + days[d].map(function (h) { return hearingCard(h, true); }).join(''); }).join('') +
        (!need.length && !up.length ? '<div class="empty">مفيش جلسات جاية في قضاياك</div>' : '');
    } else {
      var list = pack.cases.filter(function (c) { return !q || [c.subject, c.case_number, c.client_name, c.court, c.opponent].some(function (x) { return x && String(x).indexOf(q) >= 0; }); });
      body += '<input id="q" placeholder="بحث: موضوع، رقم، موكل، محكمة" value="' + esc(q) + '">' + list.map(function (c) {
        return '<div class="card" data-open="' + c.id + '"><h3>' + esc(c.subject) + '</h3><div class="muted">' + esc(caseNo(c)) + ' · ' + esc(c.court || '') + ' · ' + esc(c.client_name || '') + '</div></div>';
      }).join('') + (list.length ? '' : '<div class="empty">مفيش قضايا</div>');
    }
    app.innerHTML = header() + '<div class="wrap">' + body + '</div>';
    var qi = document.getElementById('q'); if (qi) { qi.oninput = function () { q = qi.value.trim(); var pos = qi.selectionStart; render(); var n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); }; }
    watermark();
  }
  function decisionForm(id) {
    var h = pack.hearings.filter(function (x) { return x.id === id; })[0]; var c = caseOf[h.case_id]; form = true;
    app.innerHTML = header() + '<div class="wrap"><div class="card"><h3>قرار جلسة ' + esc(fmt(h.date)) + '</h3><div class="muted">' + esc(c.subject) + ' · ' + esc(caseNo(c)) + '</div>' +
      '<label>القرار</label><textarea id="dc" placeholder="مثال: التأجيل لجلسة ... للاطلاع"></textarea>' +
      '<label>الجلسة الجاية (لو فيه)</label><input id="nd" type="date"><label>الساعة (اختياري)</label><input id="nt" type="time">' +
      '<div class="err" id="er"></div><button id="sv">حفظ</button><button class="ghost" id="cn" style="color:#14213D;border-color:#D7D0BD">إلغاء</button>' +
      '<div class="hint">القرار بيتحفظ على الموبايل على طول، وبيوصل للمكتب أول ما يبقى فيه نت.</div></div></div>';
    document.getElementById('cn').onclick = render;
    document.getElementById('sv').onclick = function () {
      var dc = document.getElementById('dc').value.trim(); var nd = document.getElementById('nd').value; var nt = document.getElementById('nt').value;
      var er = document.getElementById('er');
      if (!dc) { er.textContent = 'اكتب القرار'; er.style.display = 'block'; return; }
      if (nd && nd <= h.date) { er.textContent = 'الجلسة الجاية لازم تكون بعد الجلسة دي'; er.style.display = 'block'; return; }
      outbox.push({ uid: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), op: 'decision', hearing_id: h.id, decision: dc, next_date: nd || null, next_time: nt || null, at: new Date().toISOString() });
      saveOutbox(); render(); sync();
    };
  }
  function menu() {
    form = true;
    app.innerHTML = header() + '<div class="wrap"><div class="card"><h3>' + esc(T.o || 'المكتب') + '</h3><div class="muted">المحامي: ' + esc(T.u) + '<br>الموبايل: ' + esc(T.d) +
      '<br>آخر تحديث: ' + esc(lastSync ? new Date(lastSync).toLocaleString('ar-EG') : 'لسه') + (pack && pack.until ? '<br>النسخة صالحة لحد: ' + esc(new Date(pack.until).toLocaleString('ar-EG')) : '') + '</div></div>' +
      '<button class="sm ghost" data-back>رجوع</button><button class="ghost" data-unlink>افصل الموبايل ده عن المكتب</button>' +
      '<div class="hint">الفصل بيمسح كل القضايا من الموبايل. ' + (outbox.length ? '<b>فيه ' + outbox.length + ' قرار لسه ماوصلوش للمكتب وهيتمسحوا.</b>' : '') + '</div></div>';
  }
  function watermark() {
    if (document.querySelector('.wm')) return;
    var t = esc(((pack && pack.user) || T.u) + ' · ' + T.d + ' · ' + new Date().toLocaleDateString('ar-EG'));
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><text x="10" y="120" transform="rotate(-24 160 100)" font-family="Tahoma" font-size="13" fill="#777" fill-opacity="0.14">' + t + '</text></svg>';
    var d = document.createElement('div'); d.className = 'wm'; d.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")'; document.body.appendChild(d);
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; open = null; return render(); }
    var o = e.target.closest('[data-open]'); if (o) { open = +o.dataset.open; return render(); }
    if (e.target.closest('[data-back]')) { open = null; return render(); }
    var d = e.target.closest('[data-dec]'); if (d) return decisionForm(+d.dataset.dec);
    if (e.target.closest('[data-sync]')) return sync(true);
    if (e.target.closest('[data-menu]')) return menu();
    var nn = e.target.closest('[data-nn]'); if (nn) { e.preventDefault(); notes.splice(+nn.dataset.nn, 1); ls.set('notes', JSON.stringify(notes)); return render(); }
    if (e.target.closest('[data-unlink]')) { if (confirm('الموبايل هيتفصل عن المكتب وكل القضايا هتتمسح منه. تكمل؟')) wipe(); }
  });

  // ===== البداية =====
  if (!window.crypto || !crypto.subtle) { app.innerHTML = '<main><h1>المتصفح ده قديم</h1><p>حدّث Chrome أو Safari وافتح الرابط تاني.</p></main>'; return; }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(function () {});
  var m = /[#&]c=([A-Za-z0-9-]{9,13})/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    if (!T || confirm('الموبايل ده مربوط بالفعل (' + T.u + '). تربطه بالكود الجديد بدل القديم؟')) { T = null; pairScreen(m[1].replace(/-/g, '')); }
    else render();
  } else render();
  if (T) sync();
  setInterval(function () { if (!document.hidden) sync(); }, SYNC_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - lastSync > 60000) sync(); });
  window.addEventListener('online', function () { sync(); });
})();
