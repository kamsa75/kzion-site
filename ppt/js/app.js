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
    review: $('#screen-review'),
    admin: $('#screen-admin'),
    generate: $('#screen-generate'),
    preview: $('#screen-preview')
  };
  let currentRole = null;

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

  function show(name) {
    Object.entries(screens).forEach(([k, el]) => { el.hidden = (k !== name); });
    window.scrollTo(0, 0);
  }

  /* ---------- 주일 날짜 (표시용) ---------- */

  function nextSundayText() {
    // 이번 주 일요일(오늘이 일요일이면 오늘). 실데이터는 3단계부터 서버(PT 기준)가 정한다 (D4)
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 주일예배`;
  }

  /* ---------- 홈 렌더 ---------- */

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
      const owner = document.createElement('div');
      owner.className = 'sec-owner';
      owner.textContent = '담당: ' + MOCK.roles[sec.owner].label;
      left.appendChild(owner);
      const st = document.createElement('span');
      st.className = 'status status-' + sec.status;
      st.textContent = MOCK.statusLabel[sec.status];
      head.append(left, st);
      card.appendChild(head);

      if (mine || role === 'admin') {
        const ul = document.createElement('ul');
        ul.className = 'sec-items';
        sec.items.forEach(it => {
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
        if (role === 'praise' || role === 'choir') {
          btn.textContent = '곡 준비 시작';
          btn.addEventListener('click', () => Songs.open());
        } else if (role === 'pastor') {
          btn.textContent = '입력 시작';
          btn.addEventListener('click', () => Pastor.open());
        }
        actions.appendChild(btn);
        card.appendChild(actions);
      }

      list.appendChild(card);
    });

    // 관리자 전용 블록
    const extra = $('#home-admin-extra');
    extra.innerHTML = '';
    if (role === 'admin') {
      const block = document.createElement('div');
      block.className = 'admin-block';
      const h = document.createElement('h2');
      h.textContent = '관리자';
      block.appendChild(h);

      const card = document.createElement('div');
      card.className = 'sec-card';
      const actions = document.createElement('div');
      actions.className = 'sec-actions';

      const btnAssets = document.createElement('button');
      btnAssets.className = 'btn btn-outline';
      btnAssets.textContent = '이미지 · 문구 관리';
      btnAssets.addEventListener('click', () => Admin.open());
      actions.appendChild(btnAssets);

      const btnPreview = document.createElement('button');
      btnPreview.className = 'btn btn-outline';
      btnPreview.textContent = '슬라이드 디자인 미리보기';
      btnPreview.addEventListener('click', () => { renderPreview(); show('preview'); });
      actions.appendChild(btnPreview);

      const btnGen = document.createElement('button');
      btnGen.className = 'btn btn-primary';
      btnGen.textContent = 'PPT 미리보기 · 생성';
      btnGen.addEventListener('click', () => Generate.open());
      actions.appendChild(btnGen);

      card.appendChild(actions);
      block.appendChild(card);
      extra.appendChild(block);
    }
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

  window.KZ = { show, role: () => currentRole };
  Songs.init();
  Review.init();
  Admin.init();
  Generate.init();

  const session = getSession();
  if (session) currentRole = session.role;
  if (session) {
    renderHome(session.role);
    show('home');
  } else {
    show('pin');
  }
})();
