/* ============================================================
   절기 테마 — 날짜(시애틀 PT)에 따라 <html data-season="…"> 을 붙인다.
   색·장식은 css/season.css 가 담당. 글 내용·제목은 바꾸지 않는다.
   <head> 에서 바로 실행(화면이 그려지기 전에 색이 정해지도록).
   실패하면 아무것도 붙지 않아 기본 모습 그대로 보인다.
   미리보기: 주소 끝에 ?season=thanksgiving / ?season=none
   ============================================================ */
(function () {
  // n번째 요일 (month 0-11, weekday 0=일 … 4=목)
  function nthWeekday(y, month, weekday, n) {
    var first = new Date(y, month, 1).getDay();
    return new Date(y, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  // 절기 목록 — [시작일, 끝일](둘 다 포함). 위에 있는 것이 우선.
  var SEASONS = [
    { id: 'thanksgiving',                       // 가을·추수감사: 9/25 ~ 추수감사절(11월 넷째 목) 뒤 주일
      range: function (y) { return [new Date(y, 8, 25), addDays(nthWeekday(y, 10, 4, 4), 3)]; } }
  ];

  function todayPT() {
    var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
      year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
    var v = {}; p.forEach(function (x) { v[x.type] = +x.value; });
    return new Date(v.year, v.month - 1, v.day);
  }

  var season = '';
  try {
    var q = /[?&]season=([a-z]+)/.exec(location.search);
    if (q) {
      season = q[1] === 'none' ? '' : q[1];
    } else {
      var t = todayPT();
      for (var i = 0; i < SEASONS.length; i++) {
        var r = SEASONS[i].range(t.getFullYear());
        if (t >= r[0] && t <= r[1]) { season = SEASONS[i].id; break; }
      }
    }
  } catch (e) { season = ''; }
  if (!season) return;
  document.documentElement.setAttribute('data-season', season);

  /* ---------- 장식 (히어로·페이지 머리에 작은 그림 몇 개) ---------- */
  var ART = {
    thanksgiving: [
      // 단풍잎
      '<svg viewBox="0 0 48 48"><path class="a" d="M24 4l4 9 7-4-2 9 9 1-6 7 6 6-9 1 1 8-9-5-1 8-1-8-9 5 1-8-9-1 6-6-6-7 9-1-2-9 7 4z"/><path class="s" d="M24 20v24"/></svg>',
      // 호박
      '<svg viewBox="0 0 48 48"><path class="s2" d="M24 14c0-4 2-7 5-8"/><ellipse class="b" cx="14" cy="28" rx="9" ry="13"/><ellipse class="b" cx="34" cy="28" rx="9" ry="13"/><ellipse class="a" cx="24" cy="28" rx="10" ry="14"/></svg>',
      // 도토리
      '<svg viewBox="0 0 48 48"><path class="a" d="M12 22c0 12 6 20 12 22 6-2 12-10 12-22z"/><path class="c" d="M9 22c0-8 7-12 15-12s15 4 15 12z"/><path class="s2" d="M24 10V5"/></svg>',
      // 밀 이삭
      '<svg viewBox="0 0 48 48"><path class="s2" d="M24 46V16"/><path class="b" d="M24 6c4 3 4 8 0 11-4-3-4-8 0-11zM24 19c5 0 8 3 8 8-5 0-8-3-8-8zM24 19c-5 0-8 3-8 8 5 0 8-3 8-8zM24 29c5 0 8 3 8 8-5 0-8-3-8-8zM24 29c-5 0-8 3-8 8 5 0 8-3 8-8z"/></svg>',
      // 작은 잎
      '<svg viewBox="0 0 48 48"><path class="c" d="M8 40C8 20 20 8 42 6c-2 22-14 34-34 34z"/><path class="s" d="M8 40L32 16"/></svg>'
    ]
  };

  function decorate() {
    var art = ART[season]; if (!art) return;
    var hosts = document.querySelectorAll('.hero, .page-head');
    for (var h = 0; h < hosts.length; h++) {
      var box = document.createElement('div');
      box.className = 'season-deco'; box.setAttribute('aria-hidden', 'true');
      var html = '';
      for (var i = 0; i < art.length; i++) html += '<span class="sd sd-' + (i + 1) + '">' + art[i] + '</span>';
      box.innerHTML = html;
      hosts[h].appendChild(box);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();
})();
