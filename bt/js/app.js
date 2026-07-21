/* ============================================================
   주보 엔진 — 앱 진입점 (3-1: 로그인 + 표지)
   화면: PIN 입장 → getBulletin 로드 → 표지(권/호·날짜·예배순서·섬기는 이들)
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

let STATE = null;   // getBulletin 응답 캐시

// ---------- 토스트 ----------
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- 화면 전환 ----------
function show(screen) {
  ['#screen-pin', '#screen-bt'].forEach((s) => { $(s).hidden = (s !== screen); });
}

// ---------- 로그인 ----------
function initPin() {
  const form = $('#pin-form');
  const input = $('#pin-input');
  const errP = $('#pin-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errP.hidden = true;
    const pin = input.value.trim();
    if (!pin) return;
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = '확인 중…';
    try {
      const r = await BT_API.login(pin);
      if (!r.token) throw new Error('로그인 실패');
      // 주보는 목사님·본부장만 (찬양팀·성가대 PIN은 여기서 막는다)
      if (!['pastor', 'owner', 'admin'].includes(r.role)) {
        errP.textContent = '주보는 목사님·관리자만 사용할 수 있습니다.';
        errP.hidden = false;
        return;
      }
      BT_API.setToken(r.token);
      input.value = '';
      await enter();
    } catch (err) {
      errP.textContent = err.message || 'PIN이 올바르지 않습니다.';
      errP.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = '입장';
    }
  });
}

// ---------- 로그아웃 ----------
function initLogout() {
  $('#btn-logout').addEventListener('click', async () => {
    await BT_API.logout();
    BT_API.clearToken();
    STATE = null;
    show('#screen-pin');
  });
}

// ---------- 진입 (로그인 후 / 재방문) ----------
async function enter() {
  show('#screen-bt');
  $('#bt-body').innerHTML = '<p class="center-note">불러오는 중…</p>';
  try {
    STATE = await BT_API.call('getBulletin');
    $('#bt-role').textContent =
      STATE.role === 'pastor' ? '목사님' : (STATE.role === 'owner' ? '본부장' : '관리자');
    render();
  } catch (err) {
    if (err.status === 401) { BT_API.clearToken(); show('#screen-pin'); return; }
    $('#bt-body').innerHTML =
      `<p class="center-note">불러오지 못했습니다.<br>${err.message || ''}</p>`;
  }
}

// ============================================================
// 렌더 (3-1: 표지)
// ============================================================
function render() {
  const S = STATE;
  const body = $('#bt-body');
  body.innerHTML = '';

  // ── 주차 헤더 (권/호·날짜 자동) ──
  const head = el('div', 'week-head');
  head.appendChild(el('span', 'week-date', fmtKDate(S.weekId)));
  head.appendChild(el('span', 'week-vol', `제 ${S.vol}권 ${S.no}호`));
  head.appendChild(el('span', 'week-auto', '자동 계산'));
  body.appendChild(head);

  // ── 성찬식 선제 제안 (§6-4) ──
  if (S.communionThisWeek) {
    const n = el('div', 'notice');
    n.appendChild(el('span', null, '이번 주는 성찬식이 예정되어 있습니다. 예배순서에 넣을까요?'));
    const b = el('button', 'btn btn-line', '순서에 추가');
    b.disabled = true; b.title = '다음 단계에서 연결됩니다';
    n.appendChild(b);
    body.appendChild(n);
  }

  body.appendChild(renderOrderCard(S));
  body.appendChild(renderServeCard(S));

  // 3-2 이후 자리 안내 (개발 단계 표시)
  const soon = el('div', 'card');
  soon.style.opacity = '.7';
  soon.innerHTML =
    '<div class="card-h"><h2>교회소식 · 헌금 · 사랑의 나눔 · 행사계획</h2></div>' +
    '<p class="hint" style="margin:0">다음 단계에서 이어서 만듭니다.</p>';
  body.appendChild(soon);
}

// ── 예배순서 카드 ──
// 고정 순서를 기본 문구로 깔고, 담당자(기도·설교 등)는 서버 값으로 채운다.
function renderOrderCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '예배 순서'));
  h.appendChild(el('span', 'sub', S.meta?.service_times?.sunday || '오전10:45'));
  card.appendChild(h);

  const pastor = S.pastor || {};
  // 이번 주 기도 담당 = serveWindow[0].prayer (이번 주)
  const thisWeek = (S.serveWindow || [])[0] || {};
  const prayer = pastor.prayer || thisWeek.prayer || '';
  const choirName = pastor.choir_name || '';
  const hymnTitle = (pastor.hymn && pastor.hymn.title) || '';
  const closing = S.meta?.closing_hymn?.title || '';
  const sermon = pastor.title || '';

  // [문구, 상세, ※여부]
  const rows = [
    ['예배의 부름', '인도자', false],
    ['신앙고백', '사도신경 · 다같이', false],
    ['다함께 찬양', '다같이', false],
    ['합심기도', '다같이', false],
    ['축복', '다음 세대를 향한 축복 · 다같이', false],
    ['찬송', hymnTitle, false],
    ['대표기도', prayer, false],
    ['특송', choirName || '성가대', false],
    ['봉헌', S.meta?.offertory_hymn?.title || '', false],
    ['교회소식', '인도자', false],
    ['성경봉독', joinPassages(pastor), false],
    ['설교', sermon, false],
    ['찬송', closing, true],
    ['축도', '', true],
  ];

  const list = el('div', 'order-list');
  rows.forEach(([label, detail, star]) => {
    const row = el('div', 'order-row');
    const l = el('div', 'order-label');
    if (star) { const s = el('span', 'star', '※'); l.appendChild(s); }
    l.appendChild(document.createTextNode(label));
    row.appendChild(l);
    const d = el('div', 'order-detail' + (detail ? ' filled' : ''),
      detail || '— 다음 단계에서 입력 —');
    row.appendChild(d);
    list.appendChild(row);
  });
  card.appendChild(list);
  return card;
}

function joinPassages(pastor) {
  const refs = [];
  if (pastor.ref) refs.push(pastor.ref);
  (pastor.readings || []).forEach((r) => { if (r) refs.push(r); });
  return refs.join(' · ');
}

// ── 예배를 섬기는 이들 (4주 표: 이번 주 + 앞 3주) ──
function renderServeCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '예배를 섬기는 이들'));
  h.appendChild(el('span', 'sub', '자동 · 4주'));
  card.appendChild(h);

  const rows = S.serveWindow || [];
  const table = el('table', 'grid4');
  const thead = el('thead');
  const htr = el('tr');
  htr.appendChild(el('th', null, ''));
  rows.forEach((r, i) => htr.appendChild(el('th', null, fmtMD(r.week) + (i === 0 ? ' (이번 주)' : ''))));
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = el('tbody');
  [['기 도', 'prayer'], ['안 내', 'usher'], ['봉헌위원', 'offering']].forEach(([label, key]) => {
    const tr = el('tr');
    tr.appendChild(el('th', null, label));
    rows.forEach((r, i) => {
      const td = el('td', i === 0 ? 'thisweek' : null);
      td.appendChild(document.createTextNode(r[key] || '—'));
      if (r.manual && r.manual[key]) {
        const dot = el('span', 'manual-dot', '●');
        dot.title = '수동 지정';
        td.appendChild(dot);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);

  const note = el('p', 'hint');
  note.style.margin = '10px 0 0';
  note.textContent = '● = 자동 순서를 손으로 바꾼 자리. 순서 조정은 다음 단계에서.';
  card.appendChild(note);
  return card;
}

// ---------- 부팅 ----------
(function boot() {
  initPin();
  initLogout();
  if (BT_API.hasToken()) enter();
  else show('#screen-pin');
})();
