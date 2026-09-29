/* 말씀 페이지 — 탭(고정 높이 칸) · 한 칸 넘김(퀴즈·영상·목록) · 눌렀을 때 영상 재생 · 모바일 메뉴
   글은 전부 HTML에 있고, 여기서는 보여주는 방식만 바꾼다. 스크립트가 없어도 모든 글이 보인다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var toggle = document.querySelector('.nav-toggle'), links = document.querySelector('.nav-links');
  if (toggle && links) toggle.addEventListener('click', function () { links.classList.toggle('open'); });

  // 영상: 눌렀을 때만 유튜브를 불러와 그 자리에서 재생
  document.querySelectorAll('.yt').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube.com/embed/' + b.getAttribute('data-yt') + '?autoplay=1&rel=0&playsinline=1';
      f.title = b.getAttribute('aria-label');
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen = true;
      f.className = b.className.replace('yt ', 'yt-frame ');
      b.parentNode.replaceChild(f, b);
    });
  });

  // 한 칸 넘김 — 퀴즈 장면, 1분 영상, 지난 설교 목록이 같은 부품을 쓴다
  function carousel(box) {
    var track = box.querySelector('.cz-track');
    if (!track) return null;
    var slides = track.children, dots = box.querySelectorAll('.cz-dots i');
    var prev = box.querySelector('.cz-arrow.prev'), next = box.querySelector('.cz-arrow.next');
    var locked = box.hasAttribute('data-lock'), cur = 0, timer = null, t;
    function mark(i) {
      cur = i;
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      var open = !locked || box.classList.contains('open');
      if (prev) prev.disabled = i === 0 || !open;
      if (next) next.disabled = i === slides.length - 1 || !open;
    }
    function go(i, smooth) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduce ? 'smooth' : 'auto' });
      mark(i);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function auto() {
      stop(); if (reduce) return;
      timer = setInterval(function () { if (cur >= slides.length - 1) return stop(); go(cur + 1, true); }, 4800);
    }
    track.addEventListener('scroll', function () {
      clearTimeout(t); t = setTimeout(function () { mark(Math.round(track.scrollLeft / track.clientWidth)); }, 80);
    }, { passive: true });
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (ev) { track.addEventListener(ev, stop, { passive: true }); });
    if (prev) prev.addEventListener('click', function () { stop(); go(cur - 1, true); });
    if (next) next.addEventListener('click', function () { stop(); go(cur + 1, true); });
    window.addEventListener('resize', function () { go(cur, false); });
    mark(0);
    return { open: function () { box.classList.add('open'); go(1, true); auto(); }, stop: stop };
  }

  // 퀴즈: 답하면 같은 칸에서 장면이 넘어간다
  document.querySelectorAll('.cz').forEach(function (box) {
    var c = carousel(box); if (!c) return;
    box._cz = c;
    var btn = box.querySelector('.qz-next');
    if (btn) btn.addEventListener('click', c.open);
    box.querySelectorAll('.qz-opt').forEach(function (o) {
      o.addEventListener('click', function () {
        box.querySelectorAll('.qz-opt').forEach(function (x) { x.classList.remove('on'); });
        o.classList.add('on'); box.classList.add('picked');
        setTimeout(c.open, 900);
      });
    });
  });

  // 탭 — 칸 높이는 가장 긴 탭에 맞춰 고정(CSS grid 겹치기), 여기서는 보이는 칸만 바꾼다
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var tabs = box.querySelectorAll('[role="tab"]'), panels = box.querySelectorAll('[role="tabpanel"]');
    function show(i) {
      tabs.forEach(function (tb, k) { tb.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      panels.forEach(function (p, k) {
        p.classList.toggle('on', k === i); p.setAttribute('aria-hidden', k === i ? 'false' : 'true');
        if (k !== i && p._cz) p._cz.stop();
      });
    }
    tabs.forEach(function (tb, i) { tb.addEventListener('click', function () { show(i); }); });
    show(0);
  });
})();
