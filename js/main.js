/* 시애틀 시온장로교회 — 공용 스크립트
   reveal 스크롤 애니메이션 · 모바일 내비 · AI 안내자 오브 · 마음 날씨(index 전용) */
(function () {
  'use strict';

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.13 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- 모바일 내비 토글 ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  /* ---------- AI 안내자 오브 (1차 배포: 안내 토스트) ---------- */
  var orb = document.getElementById('orb');
  var toast = document.getElementById('toast');
  if (orb && toast) {
    var tt;
    orb.addEventListener('click', function () {
      toast.classList.add('show');
      clearTimeout(tt);
      tt = setTimeout(function () { toast.classList.remove('show'); }, 4200);
    });
  }

  /* ---------- 마음 날씨 (index 전용) ---------- */
  var moodsEl = document.getElementById('moods');
  if (moodsEl) {
    var WEATHER = [
      { k: '맑음', w: 'sun', svg: '<circle cx="12" cy="12" r="4.2"/><g><line x1="12" y1="2" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="22"/><line x1="2" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="17.4" y2="6.6"/><line x1="6.6" y1="17.4" x2="4.9" y2="19.1"/></g>', verse: '무엇이든지 감사함으로 받으면 버릴 것이 없나니', ref: '데살로니가전서 5:18 · 마음이 벅차고 감사할 때' },
      { k: '흐림', w: 'cloud', svg: '<path d="M7 17h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 9.5 3.75 3.75 0 0 0 7 17z"/>', verse: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니', ref: '이사야 40:31 · 지치고 힘이 빠질 때' },
      { k: '비', w: 'rain', svg: '<path d="M7 13h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 5.5 3.75 3.75 0 0 0 7 13z"/><g class="drops"><line x1="8" y1="17" x2="7" y2="20.5"/><line x1="13" y1="17" x2="12" y2="20.5"/><line x1="18" y1="17" x2="17" y2="20.5"/></g>', verse: '애통하는 자는 복이 있나니 그들이 위로를 받을 것임이요', ref: '마태복음 5:4 · 슬픔에 잠겨 눈물이 날 때' },
      { k: '안개', w: 'fog', svg: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="6" y1="20" x2="18" y2="20"/>', verse: '내일 일을 위하여 염려하지 말라', ref: '마태복음 6:34 · 앞이 막막하고 불안할 때' },
      { k: '바람', w: 'wind', svg: '<g class="gust"><path d="M3 9h11a3 3 0 1 0-3-5"/><path d="M3 13h15a3 3 0 1 1-3 5"/><path d="M3 17h7a2.5 2.5 0 1 1-2.5 4"/></g>', verse: '보라 내가 새 일을 행하리니 이제 나타낼 것이라', ref: '이사야 43:19 · 새로 시작하거나 변화 앞에 설 때' }
    ];
    var resEl = document.getElementById('wResult'),
        vEl = document.getElementById('wVerse'),
        rEl = document.getElementById('wRef');
    WEATHER.forEach(function (w) {
      var b = document.createElement('button');
      b.className = 'mood';
      b.setAttribute('data-w', w.w);
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + w.svg + '</svg>' + w.k;
      b.onclick = function () {
        document.querySelectorAll('.mood').forEach(function (m) { m.classList.remove('active'); });
        b.classList.add('active');
        resEl.classList.remove('show');
        setTimeout(function () {
          vEl.textContent = '“' + w.verse + '”';
          rEl.textContent = w.ref;
          resEl.classList.add('show');
          resEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 180);
      };
      moodsEl.appendChild(b);
    });

    var WX_ICONS = {
      sun: '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="22"/><line x1="2" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="17.4" y2="6.6"/><line x1="6.6" y1="17.4" x2="4.9" y2="19.1"/>',
      cloud: '<path d="M7 17h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 9.5 3.75 3.75 0 0 0 7 17z"/>',
      rain: '<path d="M7 13h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 5.5 3.75 3.75 0 0 0 7 13z"/><line x1="8" y1="17" x2="7" y2="20.5"/><line x1="13" y1="17" x2="12" y2="20.5"/><line x1="18" y1="17" x2="17" y2="20.5"/>',
      fog: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="6" y1="20" x2="18" y2="20"/>',
      snow: '<path d="M7 13h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 5.5 3.75 3.75 0 0 0 7 13z"/><circle cx="8" cy="18.5" r="1"/><circle cx="13" cy="18.5" r="1"/><circle cx="18" cy="18.5" r="1"/>'
    };
    function mapWx(code) {
      if (code === 0) return { k: 'sun', l: '맑음' };
      if (code === 1) return { k: 'sun', l: '대체로 맑음' };
      if (code === 2) return { k: 'cloud', l: '구름 조금' };
      if (code === 3) return { k: 'cloud', l: '흐림' };
      if (code === 45 || code === 48) return { k: 'fog', l: '안개' };
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { k: 'snow', l: '눈' };
      if (code >= 95) return { k: 'rain', l: '뇌우' };
      if (code >= 51 && code <= 82) return { k: 'rain', l: '비' };
      return { k: 'cloud', l: '흐림' };
    }
    (function loadWx() {
      var el = document.getElementById('liveWx');
      if (!el) return;
      fetch('https://api.open-meteo.com/v1/forecast?latitude=47.7557&longitude=-122.3415&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America/Los_Angeles')
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) {
          var c = d.current, m = mapWx(c.weather_code);
          el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + WX_ICONS[m.k] + '</svg> 지금 시애틀은 <b>' + m.l + ' ' + Math.round(c.temperature_2m) + '°F</b>';
        })
        .catch(function () {
          el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + WX_ICONS.cloud + '</svg> 지금, 시애틀 하늘 아래에서';
        });
    })();
  }
})();
