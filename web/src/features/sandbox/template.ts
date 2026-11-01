/**
 * 브리지 클라이언트: 웹 도구 HTML 안에서 `window.platform.xxx()`를 Promise로 쓰게 해 준다.
 * 플랫폼이 게시 HTML의 <head> 바로 뒤에 넣는다. 시작 템플릿(public/tool-template.html)에도 같은 코드가 들어 있고,
 * 이미 window.platform이 있으면 다시 만들지 않는다.
 * 내용 높이가 바뀌면 자동으로 resize를 보낸다.
 */
export const BRIDGE_CLIENT = `(function () {
  if (window.platform) return;
  var seq = 0, pending = {};
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.__bridge !== 1 || !pending[d.id]) return;
    var p = pending[d.id]; delete pending[d.id];
    if (d.ok) p.resolve(d.result);
    else { var err = new Error((d.error && d.error.message) || 'bridge error'); err.code = d.error && d.error.code; p.reject(err); }
  });
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'b' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ __bridge: 1, id: id, method: method, args: args || [] }, '*');
    });
  }
  window.platform = {
    getUser: function () { return call('getUser'); },
    getCampaign: function () { return call('getCampaign'); },
    getParticipation: function () { return call('getParticipation'); },
    saveRecord: function (values) { return call('saveRecord', [values]); },
    listMyRecords: function () { return call('listMyRecords'); },
    getAggregate: function (key) { return call('getAggregate', [key]); },
    resize: function (height) { return call('resize', [height]); },
    toast: function (text) { return call('toast', [text]); }
  };
  var last = -1;
  function measure() {
    var b = document.body; if (!b) return;
    var cs = getComputedStyle(b);
    var h = Math.ceil(b.getBoundingClientRect().height + parseFloat(cs.marginTop || '0') + parseFloat(cs.marginBottom || '0'));
    if (h !== last) { last = h; call('resize', [h]).catch(function () {}); }
  }
  function watch() {
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    window.addEventListener('load', measure);
  }
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
})();`;

/** 게시 HTML에 브리지 클라이언트를 넣는다(<head> 뒤 → <html> 뒤 → doctype 뒤 → 맨 앞 순). */
export function injectBridge(html: string): string {
  const tag = `<script>${BRIDGE_CLIENT}</script>`;
  const at = (m: RegExpExecArray | null, wrap = (s: string) => s) => (m ? html.slice(0, m.index + m[0].length) + wrap(tag) + html.slice(m.index + m[0].length) : null);
  return at(/<head\b[^>]*>/i.exec(html))
    ?? at(/<html\b[^>]*>/i.exec(html), (s) => `<head>${s}</head>`)
    ?? at(/^\s*<!doctype[^>]*>/i.exec(html))
    ?? tag + html;
}
