// ميزان — «سجّل بصوتك» جوه تطبيق الأندرويد مع أي نسخة من البرنامج (3.5.1+)
// الـ WebView بتاع أندرويد مابيحوّلش الصوت لكلام (بيرد not-allowed). لو التطبيق فيه MizanAndroid.listen
// (APK 3.5.1+) بنبدّل SpeechRecognition بنسخة بتفتح نافذة جوجل «اتكلم دلوقتي» وترجّع النص بنفس شكل المتصفح.
// مابيعملش أي حاجة في كروم ولا على الكمبيوتر. MZN-ASA-1141940663-2026
(function () {
  'use strict';
  var A = null;
  try { A = (window.MizanAndroid && typeof window.MizanAndroid.listen === 'function') ? window.MizanAndroid : null; } catch (e) { A = null; }
  if (!A) return;
  var top = window; try { top = window.top || window; } catch (e) { top = window; }
  function Rec() { this.lang = 'ar-EG'; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1; this._on = false; }
  Rec.prototype.start = function () {
    var self = this; if (self._on) return; self._on = true;
    var done = false;
    var end = function () { if (done) return; done = true; self._on = false; try { delete top.__mzVoice; } catch (e) { /* */ } if (typeof self.onend === 'function') self.onend({ type: 'end' }); };
    top.__mzVoice = function (t) {
      var s = t ? String(t).trim() : '';
      if (s && typeof self.onresult === 'function') {
        var alt = { transcript: s, confidence: 1 }; var res = [alt]; res.isFinal = true; res.item = function (i) { return res[i]; };
        var list = [res]; list.item = function (i) { return list[i]; };
        self.onresult({ type: 'result', resultIndex: 0, results: list });
      } else if (!s && typeof self.onerror === 'function') self.onerror({ type: 'error', error: 'no-speech' });
      end();
    };
    var r = 'none'; try { r = A.listen(self.lang || 'ar-EG'); } catch (e) { r = 'none'; }
    if (r !== 'ok') { if (typeof self.onerror === 'function') self.onerror({ type: 'error', error: 'service-not-allowed' }); end(); }
    if (typeof self.onstart === 'function') self.onstart({ type: 'start' });
  };
  Rec.prototype.stop = function () { /* نافذة جوجل بتقفل لوحدها لما الكلام يخلص */ };
  Rec.prototype.abort = function () {};
  Rec.prototype.addEventListener = function (n, f) { this['on' + n] = f; };
  try { window.SpeechRecognition = Rec; window.webkitSpeechRecognition = Rec; } catch (e) { /* */ }
})();
