// إعداد تطبيق ميزان للموبايل — رابط سكربت جوجل (صندوق الموبايل). بيتحدد مرة واحدة بعد نشر relay/Code.gs.
// apiKey (اختياري): مفتاح Google API مقصور على Drive API — لو موجود الموبايل بيجيب قضاياه من درايف مباشرة (أسرع).
window.MIZAN_CFG = {
  relay: 'https://script.google.com/macros/s/AKfycbylWe7pONjnWaZYTWdj1kryattAKAp2RHbjAyjcRmaURFNBzrNr3ZgQwhHqV4uuBQ6_/exec',
  // (3.8.0) السيرفر السريع (Cloudflare) — فاضي = سكربت جوجل لوحده زي الأول. بيتكتب بعد تركيب relay/worker.js على حساب صاحب البرنامج.
  fast: 'https://mizan-relay.mizan-law-eg.workers.dev/',
  apiKey: '',
  // (3.0.0) ملف التحديثات على Drive (Mizan-Updates.txt) — «الموبايل لوحده» بيقرا منه حزمة البرنامج الموقّعة (سطر MZB1)
  channel: '15xN9DKJ6CvsuLNuYuem4VgTNU4VSpvoS',
};
