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

  /* ---------- 문의 상담창 (처음 오시나요?) ---------- */
  var orb = document.getElementById('orb');
  if (orb) {
    var GREETING = '안녕하세요! 시온교회에 관심 가져 주셔서 감사해요. 😊 예배 시간·주차·아이 동반까지, 아래에서 골라보시거나 궁금한 점을 편하게 적어주세요.';
    var FALLBACK = '그 부분은 제가 정확히 알지 못해서요. 교회 <a href="https://www.facebook.com/kzionchurch" target="_blank" rel="noopener">페이스북</a>·<a href="https://www.instagram.com/seattlezionchurch" target="_blank" rel="noopener">인스타그램</a>으로 메시지 주시거나, 주일에 직접 오셔서 물어봐 주시면 정확히 안내받으실 수 있어요.';
    var FAQ = [
      { q: '처음 방문하는데 뭘 준비하나요?', k: ['처음', '방문', '준비', '뭐 가', '뭘'], a: '아무것도 준비하지 않으셔도 돼요. 편한 차림으로 오시면 입구에서 따뜻하게 맞아드려요. 처음 오신 분도 어색하지 않게 자연스럽게 안내해 드립니다.' },
      { q: '예배는 언제 드리나요?', k: ['예배', '시간', '몇시', '몇 시', '언제', '주일'], a: '주일예배는 일요일 <b>오전 10:45</b>, 본당에서 드려요.<br>· 주일학교 일요일 10:45 (교육관)<br>· 수요통독 수요일 10:00 / 오후 7:30 (두란노실)<br>· 토요예배 매주 오전 7:00 (본당)<br><a href="worship.html">예배안내 자세히 보기</a>' },
      { q: '주차는 어디에 하나요?', k: ['주차', 'parking', '차 댈', '차를'], a: '교회 자체 주차장이 있어 무료로 편하게 주차하실 수 있어요.' },
      { q: '아이를 데려가도 되나요?', k: ['아이', '자녀', '아기', '유아', '어린이', '애기', '키즈'], a: '물론이에요! 예배 시간 동안 주일학교에서 아이들을 따뜻하게 돌봐 드려서, 부모님도 편안히 예배드리실 수 있어요.' },
      { q: '어떤 옷을 입어야 하나요?', k: ['옷', '복장', '드레스코드', '입어', '차림'], a: '정해진 복장 규정이 없어요. 평소 편안한 차림으로 오시면 충분합니다.' },
      { q: '교회가 어디에 있나요?', k: ['어디', '위치', '주소', '오시는', '오는 길', '찾아', '지도', '길'], a: '17920 Meridian Ave N, Shoreline, WA 98133 (시애틀 북쪽 쇼어라인)이에요.<br><a href="https://maps.google.com/maps?q=17920%20Meridian%20Ave%20N%20Shoreline%2C%20WA%2098133" target="_blank" rel="noopener">구글 지도에서 보기</a>' },
      { q: '예배 분위기는 어떤가요?', k: ['분위기', '어떤 교회', '어떤 곳', '느낌'], a: '마음 문이 열린 따뜻한 공동체예요. 처음 오셔도 부담 없이, 예배 후엔 함께 차와 음식을 나누는 따뜻한 교제가 있어요.' },
      { q: '새가족인데 어떻게 등록해요?', k: ['새가족', '등록', '가입', '처음 등록'], a: '예배 후 새가족을 맞아 안내해 드리는 분이 계세요. 편하게 인사 나누시면 됩니다.' },
      { q: '소그룹·성경공부가 있나요?', k: ['소그룹', '성경공부', '모임', '구역', '제자', '셀'], a: '네, 평신도 리더를 위한 소그룹 성경공부(교재 ‘부르심’)를 비롯해 함께 말씀을 나누는 모임들이 있어요. 참여 방법은 예배 후 편하게 문의해 주세요.' },
      { q: '헌금은 어떻게 하나요?', k: ['헌금', '후원', 'offering', '봉헌', '기부'], a: '현장 헌금 외에도 홈페이지에서 PayPal로 안전하게 온라인 헌금하실 수 있어요.<br><a href="https://www.paypal.com/donate/?hosted_button_id=ZRCRQD95SA2VU" target="_blank" rel="noopener">온라인 헌금하기</a>' },
      { q: '지난 설교를 듣고 싶어요', k: ['설교', '유튜브', '말씀', '영상', '예배 영상'], a: '교회 유튜브 채널에서 지난 설교를 언제든 다시 들으실 수 있어요.<br><a href="https://www.youtube.com/@kzionchurch" target="_blank" rel="noopener">유튜브 채널 보기</a>' }
    ];

    var panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '처음 오시나요? 문의');
    panel.innerHTML =
      '<div class="chat-head"><h2>처음 오시나요?</h2><p>예배·주차·아이 동반까지, 편하게 물어보세요.</p><button class="chat-close" aria-label="닫기">&times;</button></div>' +
      '<div class="chat-body"></div>' +
      '<div class="chat-chips"></div>' +
      '<div class="chat-foot"><textarea rows="1" placeholder="궁금한 점을 적어주세요…" aria-label="메시지 입력"></textarea><button class="chat-send" aria-label="보내기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>' +
      '<div class="chat-disclaimer">자세한 안내는 예배 때나 교회 SNS로도 도와드려요.</div>';
    document.body.appendChild(panel);

    var body = panel.querySelector('.chat-body');
    var chipsBox = panel.querySelector('.chat-chips');
    var input = panel.querySelector('textarea');
    var sendBtn = panel.querySelector('.chat-send');
    var closeBtn = panel.querySelector('.chat-close');
    var started = false;

    function addMsg(role, html) {
      var d = document.createElement('div');
      d.className = 'cmsg ' + role;
      if (role === 'user') { d.textContent = html; } else { d.innerHTML = html; }
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
    }
    function renderChips() {
      chipsBox.innerHTML = '';
      FAQ.forEach(function (f) {
        var b = document.createElement('button');
        b.className = 'chat-chip';
        b.textContent = f.q;
        b.onclick = function () { addMsg('user', f.q); setTimeout(function () { addMsg('bot', f.a); }, 220); };
        chipsBox.appendChild(b);
      });
    }
    function matchAnswer(text) {
      var t = text.toLowerCase();
      for (var i = 0; i < FAQ.length; i++) {
        for (var j = 0; j < FAQ[i].k.length; j++) {
          if (t.indexOf(FAQ[i].k[j]) >= 0) return FAQ[i].a;
        }
      }
      return FALLBACK;
    }
    function ask(text) {
      text = (text || '').trim();
      if (!text) return;
      addMsg('user', text);
      input.value = ''; input.style.height = 'auto';
      var a = matchAnswer(text);
      setTimeout(function () { addMsg('bot', a); }, 260);
    }
    function open() {
      panel.classList.add('open');
      if (!started) { addMsg('bot', GREETING); renderChips(); started = true; }
      setTimeout(function () { input.focus(); }, 300);
    }
    function close() { panel.classList.remove('open'); }

    orb.setAttribute('aria-label', '문의 열기 — 처음 오시나요?');
    orb.addEventListener('click', function () { panel.classList.contains('open') ? close() : open(); });
    closeBtn.addEventListener('click', close);
    sendBtn.addEventListener('click', function () { ask(input.value); });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 80) + 'px'; });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  }

  /* ---------- 히어로 사진 갤러리 cross-fade ---------- */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    document.querySelectorAll('.gframe').forEach(function (frame, fi) {
      var imgs = frame.querySelectorAll('img');
      if (imgs.length < 2) return;
      var i = 0;
      setInterval(function () {
        imgs[i].classList.remove('active');
        i = (i + 1) % imgs.length;
        imgs[i].classList.add('active');
      }, 5000 + fi * 1700);
    });
  }

  /* ---------- 마음 날씨 (index 전용) ---------- */
  var moodsEl = document.getElementById('moods');
  if (moodsEl) {
    var WEATHER = [
      { k: '맑음', w: 'sun', svg: '<circle cx="12" cy="12" r="4.2"/><g><line x1="12" y1="2" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="22"/><line x1="2" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="17.4" y2="6.6"/><line x1="6.6" y1="17.4" x2="4.9" y2="19.1"/></g>', verse: '무엇이든지 감사함으로 받으면 버릴 것이 없나니', ref: '데살로니가전서 5:18 · 마음이 벅차고 감사할 때', yt: 'https://www.youtube.com/watch?v=dNQ_71Uce8g', ytTitle: '기도응답, 축복과 계시' },
      { k: '흐림', w: 'cloud', svg: '<path d="M7 17h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 9.5 3.75 3.75 0 0 0 7 17z"/>', verse: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니', ref: '이사야 40:31 · 지치고 힘이 빠질 때', yt: 'https://www.youtube.com/watch?v=u4-jFM-NgAo', ytTitle: '하나님이 함께 하시는 사람' },
      { k: '비', w: 'rain', svg: '<path d="M7 13h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 5.5 3.75 3.75 0 0 0 7 13z"/><g class="drops"><line x1="8" y1="17" x2="7" y2="20.5"/><line x1="13" y1="17" x2="12" y2="20.5"/><line x1="18" y1="17" x2="17" y2="20.5"/></g>', verse: '애통하는 자는 복이 있나니 그들이 위로를 받을 것임이요', ref: '마태복음 5:4 · 슬픔에 잠겨 눈물이 날 때', yt: 'https://www.youtube.com/watch?v=ZxUmb4Uj4n0', ytTitle: '죽어야 사는 신비' },
      { k: '안개', w: 'fog', svg: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="6" y1="20" x2="18" y2="20"/>', verse: '내일 일을 위하여 염려하지 말라', ref: '마태복음 6:34 · 앞이 막막하고 불안할 때', yt: 'https://www.youtube.com/watch?v=N1IMpQnyX9c', ytTitle: '찾아오시는 하나님' },
      { k: '바람', w: 'wind', svg: '<g class="gust"><path d="M3 9h11a3 3 0 1 0-3-5"/><path d="M3 13h15a3 3 0 1 1-3 5"/><path d="M3 17h7a2.5 2.5 0 1 1-2.5 4"/></g>', verse: '보라 내가 새 일을 행하리니 이제 나타낼 것이라', ref: '이사야 43:19 · 새로 시작하거나 변화 앞에 설 때', yt: 'https://www.youtube.com/watch?v=dxx4xAsUgH4', ytTitle: '가겠나이다' }
    ];
    var resEl = document.getElementById('wResult'),
        vEl = document.getElementById('wVerse'),
        rEl = document.getElementById('wRef'),
        moreEl = document.getElementById('wMore');
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
          if (moreEl && w.yt) { moreEl.href = w.yt; moreEl.textContent = '‘' + w.ytTitle + '’ 설교 듣기 →'; }
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
