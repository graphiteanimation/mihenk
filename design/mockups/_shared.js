/* Mihenk maketleri — ortak betik: ?theme=dark|light &lang=tr|en &density=normal|large */
(function () {
  var q = new URLSearchParams(location.search);
  var theme = q.get('theme') || 'light', lang = q.get('lang') || 'tr', density = q.get('density') || 'normal';
  var root = document.documentElement;
  root.setAttribute('data-theme', theme); root.setAttribute('lang', lang); root.setAttribute('data-density', density);
  document.querySelectorAll('[data-t]').forEach(function (el) { var e = window.TX && window.TX[el.getAttribute('data-t')]; if (e) el.textContent = lang === 'en' ? e[1] : e[0]; });
  document.querySelectorAll('[data-n]').forEach(function (el) { var s = el.getAttribute('data-n'); el.textContent = lang === 'tr' ? s.replace('.', ',') : s; });
  function place() {   // 3B sahne koordinatını piksel konumuna çevirir (etiketler ölçeklenmez)
    document.querySelectorAll('.viewwrap[data-scene]').forEach(function (w) {
      var d = w.getAttribute('data-scene').split(',').map(Number), W = d[0], H = d[1], r = w.getBoundingClientRect();
      var s = Math.min(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
      w.querySelectorAll('[data-sx]').forEach(function (e) { e.style.left = (ox + parseFloat(e.getAttribute('data-sx')) * s) + 'px'; e.style.top = (oy + parseFloat(e.getAttribute('data-sy')) * s) + 'px'; });
      w.style.setProperty('--sc', s);
    });
    document.querySelectorAll('[data-tip-for]').forEach(function (t) {
      var tgt = document.getElementById(t.getAttribute('data-tip-for')); if (!tgt) return;
      var a = tgt.getBoundingClientRect(), host = t.offsetParent ? t.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
      t.style.left = (a.left - host.left + a.width / 2 - 24) + 'px'; t.style.top = (a.bottom - host.top + 8) + 'px';
    });
  }
  window.addEventListener('resize', place); document.fonts && document.fonts.ready.then(place); place();
  document.title = document.title + ' — ' + theme + '/' + lang;
})();
