/* ============================================================
   주일예배 준비실 — 앱 셸 (1단계: 입장 + 역할별 홈 골격)
   세션: 기기당 30일 localStorage 유지 + 로그아웃 (확정 결정 D3)
   ⚠️ 현재 PIN 검증은 목(mock) — 3단계에서 Edge Function 검증으로 교체
   ============================================================ */

(function () {
  'use strict';

  const SESSION_KEY = 'kzppt_session';
  const SESSION_DAYS = 30;

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    pin: $('#screen-pin'),
    home: $('#screen-home'),
    pastor: $('#screen-pastor'),
    songs: $('#screen-songs'),
    choir: $('#screen-choir'),
    review: $('#screen-review'),
    setorder: $('#screen-setorder'),
    admin: $('#screen-admin'),
    generate: $('#screen-generate'),
    preview: $('#screen-preview')
  };
  let currentRole = null;
  let currentScreen = null;   // 현재 보이는 화면 — 충돌 리로드 후 재렌더(#3)에 사용

  /* ---------- 세션 ---------- */

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.role || !MOCK.roles[s.role]) return null;
      if (Date.now() - s.at > SESSION_DAYS * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  function setSession(role) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role, at: Date.now() }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* ---------- 화면 전환 ---------- */

  // 충돌 리로드 후 현재 화면을 그 자리에서 다시 그림(#3) — 곡 목록/성가대/편집 화면만 해당
  function refreshCurrent() {
    if (currentScreen === 'songs' && typeof Songs !== 'undefined') Songs.render();
    else if (currentScreen === 'choir' && typeof Choir !== 'undefined') Choir.render();
    else if (currentScreen === 'setorder' && typeof SetOrder !== 'undefined') SetOrder.render();
  }

  function show(name) {
    currentScreen = name;
    Object.entries(screens).forEach(([k, el]) => { el.hidden = (k !== name); });
    // 로그아웃 버튼을 현재 화면 상단바로 이동 → 어느 화면에서든 우측 상단에 노출 (버튼은 하나만 유지)
    const lo = $('#btn-logout'), cur = screens[name];
    if (lo && cur && name !== 'pin') {
      const bar = cur.querySelector('.topbar');
      if (bar && lo.parentElement !== bar) bar.appendChild(lo);
    }
    mountAdminNav(name);   // 관리자·owner 전용 상단바 액션(⬇ 받기 / ⋯ 관리) — 어느 화면에서든
    window.scrollTo(0, 0);
  }

  // 관리자·owner 상단바 네비게이션. 매 화면 전환마다 현재 헤더에 주입(로그아웃 왼쪽).
  //   admin  = [⬇ 받기] [PPT 미리보기·생성]
  //   owner  = [⬇ 받기] [⋯ 관리]  (⋯ = PPT 미리보기·생성 / 이미지·문구 관리 / 슬라이드 디자인 미리보기)
  function mountAdminNav(name) {
    document.querySelectorAll('.admin-nav').forEach(n => n.remove());   // 중복 방지(단일 유지)
    if (name === 'pin') return;
    if (currentRole !== 'admin' && currentRole !== 'owner') return;
    const cur = screens[name]; if (!cur) return;
    const bar = cur.querySelector('.topbar'); if (!bar) return;
    const isOwner = (currentRole === 'owner');

    // 생성 화면은 자체 다운로드 버튼("최신 PPT 받기")이 있으므로 상단바 받기·생성 버튼은 중복 → 숨김
    const onGenerate = (name === 'generate');

    const nav = document.createElement('div');
    nav.className = 'admin-nav';

    if (!onGenerate) {
      const dl = document.createElement('button');
      dl.className = 'btn btn-primary btn-sm dl-btn';
      dl.textContent = '⬇ 받기';
      dl.title = '저장된 최신 상태로 전체 PPT 받기';
      const dot = document.createElement('span');   // 신선도 점(미다운로드/변경됨) — #PPT 신선도
      dot.className = 'dl-dot';
      dl.appendChild(dot);
      dl.addEventListener('click', () => Generate.quickDownload(dl));
      nav.appendChild(dl);
    }

    if (isOwner) {
      const wrap = document.createElement('div');
      wrap.className = 'admin-menu-wrap';
      const more = document.createElement('button');
      more.className = 'btn btn-outline btn-sm';
      more.textContent = '⋯ 관리';
      const menu = document.createElement('div');
      menu.className = 'admin-menu'; menu.hidden = true;
      [['PPT 미리보기 · 생성', () => Generate.open()],
       ['이미지 · 문구 관리', () => Admin.open()],
       ['슬라이드 디자인 미리보기', () => { renderPreview(); show('preview'); }]
      ].forEach(([label, fn]) => {
        const mi = document.createElement('button');
        mi.className = 'admin-menu-item';
        mi.textContent = label;
        mi.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = true; fn(); });
        menu.appendChild(mi);
      });
      more.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
      wrap.append(more, menu);
      nav.appendChild(wrap);
    } else if (!onGenerate) {   // 생성 화면에선 '미리보기·생성'도 중복(이미 그 화면)
      const gen = document.createElement('button');
      gen.className = 'btn btn-outline btn-sm';
      gen.textContent = 'PPT 미리보기 · 생성';
      gen.addEventListener('click', () => Generate.open());
      nav.appendChild(gen);
    }

    if (!nav.children.length) return;   // 넣을 게 없으면(관리자·생성화면) 빈 nav 미부착
    const loBtn = bar.querySelector('#btn-logout');
    if (loBtn) bar.insertBefore(nav, loBtn); else bar.appendChild(nav);

    // 신선도 점: 이미 불러온 주 데이터로 즉시 반영 + 서버 확인(가벼움: 화면이동·탭복귀 때)
    if (window.PptFresh) {
      const w = SongStore.week && SongStore.week();
      if (w && w.weekId) PptFresh.refreshFromWeek(w);
      updateDlIndicator();
      maybeProbe();
    }
  }

  // "⬇ 받기" 버튼의 점 상태 갱신 (none=미다운로드 / stale=변경됨 / fresh=숨김)
  function updateDlIndicator() {
    const dot = document.querySelector('.admin-nav .dl-btn .dl-dot');
    if (!dot || !window.PptFresh) return;
    const st = PptFresh.state();
    dot.className = 'dl-dot' + (st === 'none' ? ' show none' : st === 'stale' ? ' show stale' : '');
    const btn = dot.parentElement;
    if (btn) btn.title = st === 'stale' ? '변경됨 — 최신본으로 다시 받으세요'
      : st === 'none' ? '이번 주 아직 받지 않았어요 — 받기'
      : '저장된 최신 상태로 전체 PPT 받기';
  }

  // 서버에 최신 버전 확인(관리자·owner만, 10초 이내 중복 호출 방지)
  let lastProbe = 0;
  function maybeProbe() {
    if (currentRole !== 'admin' && currentRole !== 'owner') return;
    if (!window.PptFresh) return;
    const now = Date.now();
    if (now - lastProbe < 10000) return;
    lastProbe = now;
    PptFresh.probe();
  }
  // ⋯ 관리 메뉴: 바깥 클릭 시 닫기 (1회 등록)
  document.addEventListener('click', () => {
    document.querySelectorAll('.admin-menu').forEach(m => { m.hidden = true; });
  });

  /* ---------- 주일 날짜 (표시용) ---------- */

  function nextSundayText() {
    // 이번 주 일요일(오늘이 일요일이면 오늘). 실데이터는 3단계부터 서버(PT 기준)가 정한다 (D4)
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 주일예배`;
  }

  /* ---------- 홈 렌더 ---------- */

  // 곡 데이터 미리 로드(홈의 실제 곡 수 표시용) — 실패해도 홈은 그려짐
  async function loadSongsSafe(role) {
    try { await SongStore.load(role); } catch (e) {}
  }

  // 내용이 있는 곡만 '등록된 곡'으로 셈 — 악보·가사·곡명 다 없는 빈 껍데기는 제외 (2026-07-05)
  function hasSongContent(s) {
    return (s.blocks && s.blocks.length) || (s.images && s.images.length) || (s.name && s.name.trim());
  }

  // 찬양팀·성가대 섹션 항목 = 실제 등록 곡 수 기반(가짜 문구 제거, 2026-07-05)
  function sectionItems(sec) {
    if (sec.owner === 'praise' || sec.owner === 'choir') {
      const list = SongStore.all().filter(s => (s.role || sec.owner) === sec.owner && hasSongContent(s));
      const n = list.length;
      if (!n) return ['아직 등록된 곡이 없습니다'];
      const ordered = list.filter(s => s.status === 'ordered').length;
      return ['등록된 곡 ' + n + '곡',
        ordered === n ? '순서까지 모두 완료' : '순서 지정 ' + ordered + '/' + n + '곡'];
    }
    return sec.items;
  }

  // 목사님 섹션 상태 — 담당자가 '이번 주 준비 완료'를 눌렀으면 완료, 아니면 내용 유무로 작성중/대기
  function pastorStatus(p) {
    if (!p) return 'empty';
    if (p.done) return 'done';                                   // 명시적 완료(내용과 무관)
    const any = [
      (p.title || '').trim(),
      (p.passages || []).some(x => (x || '').trim()),
      (p.prayer || '').trim(),
      (p.ref || '').trim(),
      (p.readings || []).some(x => (x || '').trim()),
      (p.hymn && ((p.hymn.blocks || []).length || (p.hymn.raw || '').trim()))
    ].some(Boolean);
    return any ? 'progress' : 'empty';
  }

  // 섹션 상태를 '실제 데이터'로 계산. 데이터가 없는(=내 소관 아님, 관리자 아님) 섹션은 null → 상태칩 미표시
  //  · getWeek는 역할별로 자기 데이터만 반환(praise→자기 곡+완료플래그, pastor→pastor, owner/admin→전체) — 서버 제약 반영
  //  · 완료 = 담당자가 '이번 주 준비 완료' 버튼을 누른 경우에만. 안 눌렀으면 내용 있으면 작성중·없으면 대기
  function sectionStatus(sec, role) {
    if (!CONFIG.USE_SERVER) return sec.status;   // 목/데모 모드는 샘플 상태 유지
    const w = SongStore.week && SongStore.week();
    if (sec.owner === 'praise' || sec.owner === 'choir') {
      if (role !== 'owner' && role !== sec.owner) return null;   // 데이터 없음
      const sd = (w && w.sectionDone) || {};
      if (sd[sec.owner]) return 'done';                          // 명시적 완료
      const list = SongStore.all().filter(s => (s.role || sec.owner) === sec.owner && hasSongContent(s));
      return list.length ? 'progress' : 'empty';
    }
    // pastor
    if (role !== 'owner' && role !== 'pastor') return null;      // 데이터 없음
    return pastorStatus(w && w.pastor && (w.pastor.data || w.pastor));
  }

  function renderHome(role) {
    currentRole = role;
    $('#home-role').textContent = MOCK.roles[role].label;

    $('#home-week').innerHTML = '';
    const label = document.createElement('div');
    label.className = 'week-label';
    label.textContent = '이번 주 준비 문서';
    const date = document.createElement('div');
    date.className = 'week-date';
    date.textContent = nextSundayText();
    $('#home-week').append(label, date);

    const list = $('#home-sections');
    list.innerHTML = '';
    MOCK.sections.forEach(sec => {
      const mine = (role === sec.owner);
      const card = document.createElement('div');
      card.className = 'sec-card' + (mine ? ' mine' : '');

      const head = document.createElement('div');
      head.className = 'sec-head';
      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'sec-name';
      name.textContent = sec.name + (mine ? ' — 내 담당' : '');
      left.appendChild(name);
      // 위임 관리자(admin)는 이름·상태만 — '담당:'·상세 항목은 owner/본인만
      const showDetail = mine || role === 'owner';
      if (showDetail) {
        const owner = document.createElement('div');
        owner.className = 'sec-owner';
        owner.textContent = '담당: ' + MOCK.roles[sec.owner].label;
        left.appendChild(owner);
      }
      const status = sectionStatus(sec, role);   // 실데이터 기반(없으면 null)
      if (status) {
        const st = document.createElement('span');
        st.className = 'status status-' + status;
        st.textContent = MOCK.statusLabel[status];
        head.append(left, st);
      } else {
        head.append(left);
      }
      card.appendChild(head);

      if (showDetail) {
        const ul = document.createElement('ul');
        ul.className = 'sec-items';
        sectionItems(sec).forEach(it => {
          const li = document.createElement('li');
          li.textContent = '· ' + it;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }

      if (mine) {
        const actions = document.createElement('div');
        actions.className = 'sec-actions';
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        if (role === 'praise') {
          btn.textContent = '이번 주 곡목';
          btn.addEventListener('click', () => Songs.open());
        } else if (role === 'choir') {
          btn.textContent = '곡 입력 시작';
          btn.addEventListener('click', () => Choir.open());
        } else if (role === 'pastor') {
          btn.textContent = '입력 시작';
          btn.addEventListener('click', () => Pastor.open());
        }
        actions.appendChild(btn);
        card.appendChild(actions);
      } else if (role === 'owner' || role === 'admin') {
        // 본부장(owner)·위임 관리자(admin)는 각 섹션 화면에 직접 들어가 대리편집(#2, 서버 saveSong이 admin·owner 허용).
        // 단 목사님 섹션 저장은 서버가 owner만 허용 → admin에겐 목사님 입구 미노출.
        let text = null, fn = null;
        if (sec.owner === 'praise') { text = '찬양팀 화면 열기'; fn = () => Songs.open(); }
        else if (sec.owner === 'choir') { text = '성가대 화면 열기'; fn = () => Choir.open(); }
        else if (sec.owner === 'pastor' && role === 'owner') { text = '목사님 화면 열기'; fn = () => Pastor.open(); }
        if (text) {
          const actions = document.createElement('div');
          actions.className = 'sec-actions';
          const btn = document.createElement('button');
          btn.className = 'btn btn-outline';
          btn.textContent = text;
          btn.addEventListener('click', fn);
          actions.appendChild(btn);
          card.appendChild(actions);
        }
      }

      list.appendChild(card);
    });

    // 관리자·owner 액션(이미지·문구 관리 / 디자인 미리보기 / PPT 생성 / ⬇ 받기)은
    // 이제 상단바(mountAdminNav)로 이동 — 어느 화면에서든 접근 가능. 홈 하단 블록은 비운다.
    $('#home-admin-extra').innerHTML = '';
  }

  /* ---------- 디자인 미리보기 데모 ---------- */

  function renderPreview() {
    const list = $('#preview-list');
    list.innerHTML = '';
    MOCK.sampleSlides.forEach(s => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const label = document.createElement('div');
      label.className = 'pv-label';
      label.textContent = s.label;
      item.appendChild(label);
      item.appendChild(renderSlide(s));
      if (s.note) {
        const note = document.createElement('div');
        note.className = 'pv-note';
        note.textContent = s.note;
        item.appendChild(note);
      }
      list.appendChild(item);
    });
    // 카드·다크 슬라이드 글자 크기 자동 맞춤(요소가 화면에 붙은 뒤)
    requestAnimationFrame(() => { fitDarkSlides(list); fitBandLyrics(list); });
  }

  /* ---------- 이벤트 ---------- */

  $('#pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('#pin-input').value.trim();
    let role = null;

    if (CONFIG.USE_SERVER) {
      // 서버 검증 (보안 규칙 9, D14)
      try {
        const r = await API.call('login', { pin });
        API.setToken(r.token);
        role = r.role;
      } catch (err) {
        $('#pin-error').textContent = err.status === 401
          ? 'PIN이 올바르지 않습니다. 다시 확인해 주세요.'
          : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        $('#pin-error').hidden = false;
        $('#pin-input').value = '';
        $('#pin-input').focus();
        return;
      }
    } else {
      role = MOCK.pins[pin]; // ⚠️ 목 모드 전용 — USE_SERVER 전환 시 미사용
      if (!role) {
        $('#pin-error').hidden = false;
        $('#pin-input').value = '';
        $('#pin-input').focus();
        return;
      }
    }

    $('#pin-error').hidden = true;
    $('#pin-input').value = '';
    setSession(role);
    await loadSongsSafe(role);   // 실제 곡 수 반영
    renderHome(role);
    show('home');
  });

  $('#btn-logout').addEventListener('click', () => {
    if (CONFIG.USE_SERVER && API.hasToken()) { API.call('logout').catch(() => {}); }
    API.clearToken();
    clearSession();
    show('pin');
  });

  $('#btn-preview-back').addEventListener('click', () => show('home'));

  /* ---------- 시작 ---------- */

  window.KZ = { show, role: () => currentRole, refresh: refreshCurrent };

  // PPT 신선도(#): 버전 갱신되면 점 다시 그림 + 탭 복귀 시 서버 확인
  if (window.PptFresh) {
    PptFresh.setNotify(updateDlIndicator);
    window.addEventListener('focus', maybeProbe);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeProbe(); });
  }
  Songs.init();
  Choir.init();
  Review.init();
  SetOrder.init();
  Admin.init();
  Generate.init();

  const session = getSession();
  if (session) {
    currentRole = session.role;
    renderHome(session.role);                 // 즉시 표시(곡 수는 로드 후 갱신)
    show('home');
    loadSongsSafe(session.role).then(() => renderHome(session.role));
  } else {
    show('pin');
  }
})();
