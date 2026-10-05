/* 말씀 페이지 — 탭(고정 높이 칸) · 퀴즈(질문 → 이야기처럼 넘어가는 결과) · 한 칸 넘김 · 눌렀을 때 영상 재생
   글은 전부 HTML에 있고, 여기서는 보여주는 방식만 바꾼다. 스크립트가 없어도 모든 글이 보인다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STEP = 3000;   // 결과 장면 하나가 머무는 시간(ms)

  // 메뉴 열기 — 홈은 main.js가 이미 맡으므로 건너뛴다(두 번 붙으면 열자마자 닫힘)
  var toggle = document.querySelector('.nav-toggle'), links = document.querySelector('.nav-links');
  if (toggle && links && !document.querySelector('script[src*="main.js"]')) toggle.addEventListener('click', function () { links.classList.toggle('open'); });

  // 영상: 처음엔 썸네일만(빠른 첫 화면). 영상 칸이 실제로 화면에 보이면 그 자리에 유튜브 플레이어를 미리 넣어 둔다 —
  // 방문자가 누르는 곳이 곧 플레이어라 한 번에 소리와 함께 재생된다(아이폰 등은 스크립트로 소리 있는 자동 재생을 막음).
  // 준비되기 전에 누르면 그때 불러와 재생을 시도한다.
  function toFrame(b, autoplay) {
    if (!b.parentNode) return;
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube.com/embed/' + b.getAttribute('data-yt') + '?rel=0&playsinline=1' + (autoplay ? '&autoplay=1' : '');
    f.title = b.getAttribute('aria-label');
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.allowFullscreen = true;
    f.className = b.className.replace('yt ', 'yt-frame ');
    f.setAttribute('data-yt', b.getAttribute('data-yt'));
    b.parentNode.replaceChild(f, b);
  }
  // 화면 근처(넘김 칸 안에서 가려진 건 제외 — 관찰자가 판단)에 있고, 숨은 탭·장면(visibility)이 아닐 때만 준비
  var ytIO = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && getComputedStyle(e.target).visibility === 'visible') { ytIO.unobserve(e.target); toFrame(e.target, false); }
    });
  }, { rootMargin: '200px 0px' });
  // 탭을 바꾸거나 장면이 넘어가 새로 보이게 됐을 때 — 지금 화면 근처에 보이면 바로 준비.
  // sure: 부르는 쪽이 이미 보이는 줄 안다(결과 마지막 장은 서서히 나타나 그 순간엔 아직 hidden으로 읽힘)
  function armIn(root, sure) {
    if (!ytIO || !root) return;
    root.querySelectorAll('button.yt').forEach(function (b) {
      if (b.closest('.cz-track')) return;   // 넘김 칸 안의 영상은 관찰자가 넘길 때 판단
      var r = b.getBoundingClientRect();
      if ((sure || getComputedStyle(b).visibility === 'visible') && r.width && r.bottom > -200 && r.top < innerHeight + 200) { ytIO.unobserve(b); toFrame(b, false); }
    });
  }
  document.querySelectorAll('button.yt').forEach(function (b) {
    b.addEventListener('click', function () { if (ytIO) ytIO.unobserve(b); toFrame(b, true); });
    if (ytIO) ytIO.observe(b);
  });

  // 1분 영상의 '설교에서 이어 듣기' — 새 창 대신 아래 전체 설교를 그 시각부터 그 자리에서 재생
  document.querySelectorAll('.sh-more[data-start]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var box = document.querySelector('#watch .sw-video'); if (!box) return;
      var cur = box.querySelector('.yt, .yt-frame'); if (!cur) return;
      e.preventDefault();
      var id = cur.getAttribute('data-yt') || (cur.src.match(/embed\/([\w-]+)/) || [])[1];
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1&start=' + a.getAttribute('data-start');
      f.title = cur.getAttribute('aria-label') || cur.title || '설교 영상';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen = true;
      f.className = 'yt-frame yt-wide';
      f.setAttribute('data-yt', id);
      box.replaceChild(f, cur);
      document.getElementById('watch').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
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
    box._czReset = function () { dots = box.querySelectorAll('.cz-dots i'); track.scrollLeft = 0; mark(0); };   // 내용을 다시 채운 뒤(배경화면 태그) 처음 장으로
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
      if (last) { bars[cur].classList.add('done'); armIn(scenes[cur], true); return; }
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
      q.classList.toggle('ready', k > 0);
      return k;
    }
    q.querySelectorAll('.qz-note input').forEach(function (i) { i.addEventListener('change', meter); });
    var go = q.querySelector('.qz-next');
    if (go) go.addEventListener('click', function () {
      // 고르기 퀴즈(C 3장·D 2장)는 하나를 골라야 넘어간다 — 안 골랐으면 카드가 살짝 흔들려 알려 준다
      var fmt = q.getAttribute('data-format');
      if ((fmt === 'C' || fmt === 'D') && !q.classList.contains('picked')) {
        q.classList.add('nudge'); setTimeout(function () { q.classList.remove('nudge'); }, 500); return;
      }
      meter(); open();
    });
    // 고르기: 고른 카드가 떠오르고 안내 한 줄이 나타난다. 화살표를 누르기 전까지는 다른 카드로 바꿀 수 있다
    q.querySelectorAll('.qz-card').forEach(function (c) {
      c.addEventListener('click', function () {
        q.querySelectorAll('.qz-card').forEach(function (x) { x.classList.toggle('on', x === c); });
        q.classList.add('picked', 'ready');
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
      armIn(panels[i]);
    }
    tabs.forEach(function (tb, i) { tb.addEventListener('click', function () { show(i); }); });
    // 주소 끝 #q1 처럼 특정 질문으로 들어오면 그 탭을 연다
    var start = 0;
    var hash = decodeURIComponent(location.hash);   // #wallpaper-소망 처럼 뒤에 태그가 붙어도 그 탭을 연다
    panels.forEach(function (p, k) { if (hash && p.id && (hash === '#' + p.id || hash.indexOf('#' + p.id + '-') === 0)) start = k; });
    show(start);
    if (start) {
      var toBox = function () { box.scrollIntoView({ block: 'start', behavior: 'instant' }); };
      toBox(); window.addEventListener('load', function () { setTimeout(toBox, 0); });   // 브라우저의 #주소 점프가 뒤늦게 덮어써도 탭 줄이 보이게
    }
    box._show = show;
  });

  // 교재 맛보기: 과를 누르면 그 과 한 장이 뜬다. 위 화살표로 옆 과, 바깥·× ·Esc로 닫힘. 주소 #lesson-3 으로 바로 열 수 있다
  var sheets = document.querySelectorAll('dialog.lp');
  if (sheets.length && sheets[0].showModal) {
    var lesson = function (n, swap) {
      var d = document.getElementById('lesson-' + n); if (!d) return;
      d.classList.toggle('sw', !!swap); d.classList.remove('out');
      d.showModal(); d.querySelector('.lp-body').scrollTop = 0;
    };
    var shut = function (d, then) {
      if (reduce || then) { d.close(); if (then) then(); return; }
      d.classList.add('out');
      setTimeout(function () { d.classList.remove('out'); d.close(); }, 200);
    };
    document.querySelectorAll('[data-lesson]').forEach(function (b) {
      b.addEventListener('click', function () { lesson(+b.getAttribute('data-lesson')); });
    });
    sheets.forEach(function (d) {
      d.querySelector('.lp-x').addEventListener('click', function () { shut(d); });
      d.addEventListener('click', function (e) { if (e.target === d) shut(d); });   // 장 바깥(배경)
      d.querySelectorAll('[data-go]').forEach(function (b) {
        b.addEventListener('click', function () { var n = +b.getAttribute('data-go'); shut(d, function () { lesson(n, true); }); });
      });
      d.addEventListener('keydown', function (e) {
        var b = e.key === 'ArrowRight' ? d.querySelector('[data-go]:last-of-type') : e.key === 'ArrowLeft' ? d.querySelector('[data-go]') : null;
        if (b && !b.disabled) b.click();
      });
    });
    var m = /^#lesson-(\d)$/.exec(location.hash), book = document.getElementById('book');
    if (m && book) {
      var box = book.closest('[data-tabs]'), ps = box ? [].slice.call(box.querySelectorAll('.st-frame > [role="tabpanel"]')) : [];
      if (box && box._show) { box._show(ps.indexOf(book)); box.scrollIntoView({ block: 'start', behavior: 'instant' }); }
      lesson(+m[1]);
    }
  }

  // 같은 페이지의 탭 칸을 가리키는 링크(예: 홈 '말씀 듣기' → #word-video) — 그 탭을 열고 탭 줄이 보이게 내려간다
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    var id = a.getAttribute('href').slice(1), p = id && document.getElementById(id);
    var box = p && p.getAttribute('role') === 'tabpanel' && p.closest('[data-tabs]');
    if (!box) return;
    a.addEventListener('click', function (e) {
      if (!box._show) return;
      e.preventDefault();
      box._show([].slice.call(box.querySelectorAll('.st-frame > [role="tabpanel"]')).indexOf(p));
      box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // 말씀 모음: '최근 질문' 카드를 누르면 위 '질문으로 만나는 설교' 묶음이 그 질문·설교로 바뀐다
  var stack = document.querySelector('.pr-stack');
  if (stack) document.querySelectorAll('.qx[data-pair]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var unit = document.getElementById(a.getAttribute('data-pair')); if (!unit) return;
      e.preventDefault();
      stack.querySelectorAll('.pr').forEach(function (u) {
        u.classList.toggle('on', u === unit);
        if (u === unit) armIn(u);
        if (u !== unit) u.querySelectorAll('.qz').forEach(function (p) { if (p._stop) p._stop(); });
      });
      if (unit._show) unit._show(+a.getAttribute('data-q'));
      stack.closest('section').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // 말씀 배경화면: 카드를 누르면 원본이 크게 뜬다. 아이폰은 길게 눌러 사진에 저장(내려받기 링크는 사파리에서 사진 앱으로 안 감), 그 외는 저장 버튼
  var wp = document.getElementById('wp-view');
  if (wp && wp.showModal) {
    if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('ios');
    var wImg = wp.querySelector('.wp-img'), wRef = wp.querySelector('.wp-ref'), wVerse = wp.querySelector('.wp-verse'),
        wSave = wp.querySelector('.wp-save'), wGo = wp.querySelector('.wp-go'), wTags = wp.querySelector('.wp-taglinks'),
        chipSet = ' ' + (wp.dataset.chips || '') + ' ';
    document.querySelectorAll('.wpc').forEach(function (b) {
      b.addEventListener('click', function () {
        wImg.src = b.dataset.wpImg; wImg.alt = b.dataset.wpRef + ' 말씀 배경화면 — ' + b.dataset.wpVerse;
        wRef.textContent = b.dataset.wpRef; wVerse.textContent = b.dataset.wpVerse;
        wSave.href = b.dataset.wpImg; wSave.setAttribute('download', b.dataset.wpName || '');
        if (b.dataset.wpSermon) { wGo.href = b.dataset.wpSermon; wGo.hidden = false; } else { wGo.hidden = true; }
        wTags.textContent = '';   // 이 카드의 태그 중 칩으로 있는 것만 링크(누르면 그 태그 카드 모음)
        (b.dataset.wpTags || '').split(' ').filter(function (x) { return x && chipSet.indexOf(' ' + x + ' ') >= 0; }).forEach(function (x) {
          var a = document.createElement('a'); a.href = (wp.dataset.home || '') + '#wallpaper-' + encodeURIComponent(x); a.textContent = '#' + x; wTags.appendChild(a);
        });
        wp.showModal();
      });
    });
    wp.querySelector('.wp-x').addEventListener('click', function () { wp.close(); });
    wp.addEventListener('click', function (e) { if (e.target === wp) wp.close(); });
  }

  // 배경화면 주제 태그: 칩을 누르면 그 태그 카드만 남기고 3장씩 다시 나눈다. 주소 #wallpaper-소망 (kzion.net/wallpaper#소망)으로 바로 열림
  var wpBox = document.getElementById('wallpaper'), wpChips = wpBox ? wpBox.querySelectorAll('.wp-tag') : [];
  if (wpChips.length) {
    var wTrack = wpBox.querySelector('.cz-track'), wCards = [].slice.call(wTrack.querySelectorAll('.wpc')),
        wDots = wpBox.querySelector('.cz-dots'), wBar = wpBox.querySelector('.cz-bar'), wCount = wpBox.querySelector('.wp-count');
    var wpFilter = function (tag) {
      if (![].some.call(wpChips, function (c) { return c.dataset.tag === tag; })) tag = '';
      var list = wCards.filter(function (c) { return !tag || (' ' + c.dataset.wpTags + ' ').indexOf(' ' + tag + ' ') >= 0; });
      wTrack.textContent = '';
      for (var i = 0; i < list.length; i += 3) {
        var s = document.createElement('div'); s.className = 'cz-slide wp-page';
        list.slice(i, i + 3).forEach(function (c) { s.appendChild(c); }); wTrack.appendChild(s);
      }
      var pages = wTrack.children.length;
      if (wDots) wDots.innerHTML = Array.apply(null, Array(pages)).map(function (_, k) { return '<i>' + (k + 1) + '</i>'; }).join('');
      if (wBar) wBar.style.display = pages < 2 ? 'none' : '';
      if (wCount) wCount.textContent = list.length;
      wpChips.forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.tag === tag ? 'true' : 'false'); });
      if (wpBox._czReset) wpBox._czReset();
      return tag;
    };
    wpChips.forEach(function (c) {
      c.addEventListener('click', function () { var tag = wpFilter(c.dataset.tag); history.replaceState(null, '', '#wallpaper' + (tag ? '-' + tag : '')); });
    });
    var wpFromHash = function () {
      var h = decodeURIComponent(location.hash); if (h.indexOf('#wallpaper') !== 0) return false;
      wpFilter(h.indexOf('#wallpaper-') === 0 ? h.slice(11) : ''); return true;
    };
    wpFromHash();
    // 원본 창의 태그 링크를 같은 페이지에서 누르면: 창을 닫고 배경화면 탭을 열어 그 태그로
    window.addEventListener('hashchange', function () {
      if (!wpFromHash()) return;
      if (wp && wp.open) wp.close();
      var box = wpBox.closest('[data-tabs]');
      if (box && box._show) box._show([].indexOf.call(box.querySelectorAll('.st-frame > [role="tabpanel"]'), wpBox));
      if (box) box.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
  }
})();
