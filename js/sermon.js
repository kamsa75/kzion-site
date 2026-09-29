/* 말씀 페이지 — 탭(고정 높이 칸) · 퀴즈(질문 → 이야기처럼 넘어가는 결과) · 한 칸 넘김 · 눌렀을 때 영상 재생
   글은 전부 HTML에 있고, 여기서는 보여주는 방식만 바꾼다. 스크립트가 없어도 모든 글이 보인다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STEP = 5200;   // 결과 장면 하나가 머무는 시간(ms)

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

  // 한 칸 넘김 — 1분 영상, 지난 설교 목록, 질문 카드
  document.querySelectorAll('.cz').forEach(function (box) {
    var track = box.querySelector('.cz-track'); if (!track) return;
    var slides = track.children, dots = box.querySelectorAll('.cz-dots i');
    var prev = box.querySelector('.cz-arrow.prev'), next = box.querySelector('.cz-arrow.next'), cur = 0, t;
    function mark(i) {
      cur = i;
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
    }
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' }); mark(i);
    }
    track.addEventListener('scroll', function () {
      clearTimeout(t); t = setTimeout(function () { mark(Math.round(track.scrollLeft / track.clientWidth)); }, 80);
    }, { passive: true });
    if (prev) prev.addEventListener('click', function () { go(cur - 1); });
    if (next) next.addEventListener('click', function () { go(cur + 1); });
    window.addEventListener('resize', function () { go(cur); });
    mark(0);
  });

  // 퀴즈
  document.querySelectorAll('.qz').forEach(function (q) {
    var story = q.querySelector('.qz-story'); if (!story) return;
    var scenes = story.querySelectorAll('.qs-s'), bars = story.querySelectorAll('.qs-bars i');
    var cur = -1, timer = null;
    q.style.setProperty('--dur', STEP + 'ms');

    function show(i) {
      clearTimeout(timer);
      cur = Math.max(0, Math.min(scenes.length - 1, i));
      scenes.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
      bars.forEach(function (b, k) {
        b.classList.toggle('done', k < cur); b.classList.remove('run');
        if (k === cur) { void b.offsetWidth; b.classList.add('run'); }
      });
      var last = cur === scenes.length - 1;
      q.classList.toggle('ended', last);
      if (last) { bars[cur].classList.add('done'); return; }
      if (!reduce) timer = setTimeout(function () { if (!q.classList.contains('paused')) show(cur + 1); }, STEP);
    }
    function open() { q.classList.add('open'); show(0); }
    q._stop = function () { clearTimeout(timer); };

    // 체크리스트: 체크할 때마다 게이지가 차고, 기준 개수에 닿으면 숫자가 튄다
    var m = q.querySelector('.qz-meter');
    function meter() {
      if (!m) return 0;
      var k = q.querySelectorAll('.qz-note input:checked').length, n = +m.dataset.n, t = +m.dataset.t;
      m.querySelector('.qm-track i').style.width = (k / n * 100) + '%';
      m.querySelector('em').textContent = k;
      m.classList.toggle('hit', k >= t);
      return k;
    }
    q.querySelectorAll('.qz-note input').forEach(function (i) { i.addEventListener('change', meter); });
    var go = q.querySelector('.qz-next');
    if (go) go.addEventListener('click', function () { meter(); open(); });
    // 고르기: 고른 카드가 떠오르고, 안내 한 줄을 읽을 틈을 준 뒤 결과로
    q.querySelectorAll('.qz-card').forEach(function (c) {
      c.addEventListener('click', function () {
        if (q.classList.contains('picked')) return;
        c.classList.add('on'); q.classList.add('picked');
        setTimeout(open, 1400);
      });
    });

    // 이야기 넘김: 오른쪽 누르면 다음, 왼쪽은 이전, 누르고 있으면 멈춤
    story.querySelector('.qs-zone.next').addEventListener('click', function () { show(cur + 1); });
    story.querySelector('.qs-zone.prev').addEventListener('click', function () { show(cur - 1); });
    story.querySelectorAll('.qs-zone').forEach(function (z) {
      z.addEventListener('pointerdown', function () { q.classList.add('paused'); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        z.addEventListener(ev, function () { q.classList.remove('paused'); });
      });
    });
    q.addEventListener('keydown', function (e) {
      if (!q.classList.contains('open')) return;
      if (e.key === 'ArrowRight') show(cur + 1);
      if (e.key === 'ArrowLeft') show(cur - 1);
    });

  });

  // 탭 — 칸 높이는 가장 긴 탭에 맞춰 고정(CSS grid 겹치기), 여기서는 보이는 칸만 바꾼다
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var tabs = box.querySelectorAll('[role="tab"]'), panels = box.querySelectorAll('.st-frame > [role="tabpanel"]');
    function show(i) {
      tabs.forEach(function (tb, k) { tb.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      panels.forEach(function (p, k) {
        p.classList.toggle('on', k === i); p.setAttribute('aria-hidden', k === i ? 'false' : 'true');
        if (k !== i && p._stop) p._stop();
      });
    }
    tabs.forEach(function (tb, i) { tb.addEventListener('click', function () { show(i); }); });
    // 주소 끝 #q1 처럼 특정 질문으로 들어오면 그 탭을 연다
    var start = 0;
    panels.forEach(function (p, k) { if (location.hash && p.id && '#' + p.id === location.hash) start = k; });
    show(start);
    if (start) box.scrollIntoView({ block: 'start' });
    box._show = show;
  });

  // 말씀 모음: '모든 질문' 카드를 누르면 위 '질문으로 만나는 설교' 묶음이 그 질문·설교로 바뀐다
  var stack = document.querySelector('.pr-stack');
  if (stack) document.querySelectorAll('.qx[data-pair]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var unit = document.getElementById(a.getAttribute('data-pair')); if (!unit) return;
      e.preventDefault();
      stack.querySelectorAll('.pr').forEach(function (u) {
        u.classList.toggle('on', u === unit);
        if (u !== unit) u.querySelectorAll('.qz').forEach(function (p) { if (p._stop) p._stop(); });
      });
      if (unit._show) unit._show(+a.getAttribute('data-q'));
      stack.closest('section').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });
})();
