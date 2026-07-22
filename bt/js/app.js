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

  // 3-2
  body.appendChild(renderNewsCard(S));
  body.appendChild(renderOfferingCard(S));
  body.appendChild(renderLoveCard(S));
  body.appendChild(renderEventsCard(S));

  // 3-3 이후 자리 안내
  const soon = el('div', 'card');
  soon.style.opacity = '.7';
  soon.innerHTML =
    '<div class="card-h"><h2>명단 관리 · 순서 조정 · 인쇄</h2></div>' +
    '<p class="hint" style="margin:0">다음 단계에서 이어서 만듭니다.</p>';
  body.appendChild(soon);
}

// ============================================================
// 저장 인프라 (bulletin_inputs.data — 자동 저장, §3)
// ============================================================
// STATE.bulletin이 편집 대상. 필드 바뀔 때마다 debounce 저장.
let saveTimer = null;
function markSaving() { $('#bt-saved').textContent = '저장 중…'; }
function markSaved() {
  const n = $('#bt-saved');
  n.textContent = '저장됨';
  setTimeout(() => { if (n.textContent === '저장됨') n.textContent = ''; }, 1500);
}

function queueSave() {
  markSaving();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 700);
}
async function doSave() {
  try {
    const r = await BT_API.call('saveBulletin', {
      data: STATE.bulletin,
      baseUpdatedAt: STATE.bulletinUpdatedAt || undefined,
    });
    STATE.bulletinUpdatedAt = r.updatedAt;
    markSaved();
  } catch (err) {
    if (err.conflict) {
      $('#bt-saved').textContent = '';
      toast('다른 기기에서 먼저 저장했습니다. 새로고침하세요.');
      return;
    }
    $('#bt-saved').textContent = '';
    toast('저장 실패: ' + (err.message || ''));
  }
}

// bulletin.data 하위 경로 편의 접근
function bd() { STATE.bulletin = STATE.bulletin || {}; return STATE.bulletin; }

// ============================================================
// 이름 고르기 (§8 — 타이핑 대신 명단 클릭). 헌금자·사랑의나눔 공용.
// 선택된 이름 배열을 관리하고, 눌러서 추가/빼기.
// ============================================================
function namePicker(opts) {
  // opts: { selected:[], onChange:fn, source:'members'|villages, placeholder }
  const wrap = el('div', 'picker');

  // 선택된 칩들
  const chips = el('div', 'picker-chips');
  const empty = el('span', 'picker-empty', opts.placeholder || '아래에서 눌러 추가');
  function paintChips() {
    chips.innerHTML = '';
    if (!opts.selected.length) { chips.appendChild(empty); return; }
    opts.selected.forEach((name, i) => {
      const c = el('span', 'picker-chip', name);
      const x = el('span', 'picker-x', '✕');
      x.addEventListener('click', () => {
        opts.selected.splice(i, 1);
        paintChips(); paintPool(); opts.onChange();
      });
      c.appendChild(x);
      chips.appendChild(c);
    });
  }
  wrap.appendChild(chips);

  // 열기 버튼
  const toggle = el('button', 'btn btn-line picker-open', '＋ 명단에서 고르기');
  wrap.appendChild(toggle);

  // 후보 목록 (접힘)
  const pool = el('div', 'picker-pool');
  pool.hidden = true;
  const search = el('input', 'picker-search');
  search.type = 'text'; search.placeholder = '이름 찾기';
  pool.appendChild(search);
  const grid = el('div', 'picker-grid');
  pool.appendChild(grid);
  wrap.appendChild(pool);

  const candidates = () => opts.source === 'villages'
    ? (STATE.meta?.villages || [])
    : (STATE.members || []).map((m) => m.name);

  function paintPool() {
    const q = (search.value || '').trim();
    grid.innerHTML = '';
    candidates()
      .filter((n) => !q || n.includes(q))
      .forEach((name) => {
        const on = opts.selected.includes(name);
        const b = el('button', 'pool-name' + (on ? ' on' : ''), name);
        b.addEventListener('click', () => {
          if (opts.multi === false) {
            opts.selected.length = 0; opts.selected.push(name);
          } else if (on) {
            opts.selected.splice(opts.selected.indexOf(name), 1);
          } else {
            opts.selected.push(name);
          }
          paintChips(); paintPool(); opts.onChange();
        });
        grid.appendChild(b);
      });
  }
  toggle.addEventListener('click', () => {
    pool.hidden = !pool.hidden;
    toggle.textContent = pool.hidden ? '＋ 명단에서 고르기' : '닫기';
    if (!pool.hidden) { paintPool(); search.focus(); }
  });
  search.addEventListener('input', paintPool);

  paintChips();
  return wrap;
}

// ── 교회소식 (1·2·3 개별 입력창, 추가/삭제 — §9) ──
function renderNewsCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '교회 소식'));
  card.appendChild(h);

  const data = bd();
  data.news = Array.isArray(data.news) ? data.news : [];
  if (!data.news.length) data.news.push({ title: '', body: '' });

  const list = el('div', 'news-list');
  function paint() {
    list.innerHTML = '';
    data.news.forEach((item, i) => {
      const row = el('div', 'news-item');
      const num = el('div', 'news-num', String(i + 1));
      row.appendChild(num);

      const fields = el('div', 'news-fields');
      const t = el('input', 'news-title'); t.type = 'text';
      t.placeholder = '제목 (예: [당회])'; t.value = item.title || '';
      t.addEventListener('input', () => { item.title = t.value; queueSave(); });
      const b = el('textarea', 'news-body'); b.rows = 2;
      b.placeholder = '내용'; b.value = item.body || '';
      b.addEventListener('input', () => { item.body = b.value; queueSave(); });
      fields.appendChild(t); fields.appendChild(b);
      row.appendChild(fields);

      const del = el('button', 'news-del', '✕');
      del.title = '이 소식 삭제';
      del.addEventListener('click', () => {
        data.news.splice(i, 1);
        if (!data.news.length) data.news.push({ title: '', body: '' });
        paint(); queueSave();
      });
      row.appendChild(del);
      list.appendChild(row);
    });
  }
  paint();
  card.appendChild(list);

  const add = el('button', 'btn btn-line btn-wide', '＋ 소식 추가');
  add.style.marginTop = '8px';
  add.addEventListener('click', () => { data.news.push({ title: '', body: '' }); paint(); queueSave(); });
  card.appendChild(add);
  return card;
}

// ── 지난주 헌금 (분류별 이름 클릭 + 합계 숫자) ──
function renderOfferingCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  const prevWeek = fmtMD((S.loveWindow && S.loveWindow.length >= 2)
    ? S.loveWindow[S.loveWindow.length - 2].week : '');
  h.appendChild(el('h2', null, '지난 주 헌금'));
  if (prevWeek) h.appendChild(el('span', 'sub', prevWeek));
  card.appendChild(h);

  const data = bd();
  data.offering = data.offering || { thanks: [], tithe: [], weekly: [], mission: [], total: '' };
  const o = data.offering;
  ['thanks', 'tithe', 'weekly', 'mission'].forEach((k) => { o[k] = Array.isArray(o[k]) ? o[k] : []; });

  [['thanks', '감사'], ['tithe', '십일조'], ['weekly', '주정'], ['mission', '선교']].forEach(([key, label]) => {
    const f = el('div', 'field');
    f.appendChild(el('label', null, label));
    f.appendChild(namePicker({
      selected: o[key], source: 'members',
      placeholder: '헌금하신 분을 명단에서 고르세요',
      onChange: queueSave,
    }));
    card.appendChild(f);
  });

  const tf = el('div', 'field');
  tf.appendChild(el('label', null, '합계 ($)'));
  const ti = el('input'); ti.type = 'text'; ti.inputMode = 'decimal';
  ti.placeholder = '예: 1,316.00'; ti.value = o.total || '';
  ti.addEventListener('input', () => { o.total = ti.value; queueSave(); });
  tf.appendChild(ti);
  card.appendChild(tf);
  return card;
}

// ── 사랑의 나눔 (4주 표, 이번 주 칸만 입력) ──
function renderLoveCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '사랑의 나눔'));
  h.appendChild(el('span', 'sub', '이번 주만 입력 · 앞 3주 자동'));
  card.appendChild(h);

  const rows = S.loveWindow || [];
  const table = el('table', 'grid4');
  const thead = el('thead'); const htr = el('tr');
  htr.appendChild(el('th', null, ''));
  rows.forEach((r, i) => htr.appendChild(el('th', null,
    fmtMD(r.week) + (i === rows.length - 1 ? ' (이번 주)' : ''))));
  thead.appendChild(htr); table.appendChild(thead);

  const tbody = el('tbody');
  [['친교헌금', 'love_offering'], ['봉사담당', 'love_service']].forEach(([label, key]) => {
    const tr = el('tr');
    tr.appendChild(el('th', null, label));
    rows.forEach((r, i) => {
      const isThis = i === rows.length - 1;
      const td = el('td', isThis ? 'thisweek' : null);
      td.textContent = r[key] || (isThis ? '' : '—');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); card.appendChild(table);

  // 이번 주 입력 (친교헌금=이름 1명 / 봉사담당=마을 1개)
  const thisWeekId = rows.length ? rows[rows.length - 1].week : S.weekId;
  const box = el('div', 'love-inputs');

  const f1 = el('div', 'field');
  f1.appendChild(el('label', null, '이번 주 친교헌금 (한 분)'));
  const sel1 = [];
  const cur1 = rows.length ? rows[rows.length - 1].love_offering : '';
  if (cur1) sel1.push(cur1);
  f1.appendChild(namePicker({
    selected: sel1, source: 'members', multi: false,
    placeholder: '명단에서 한 분',
    onChange: () => saveLove(thisWeekId, 'love_offering', sel1[0] || ''),
  }));
  box.appendChild(f1);

  const f2 = el('div', 'field');
  f2.appendChild(el('label', null, '이번 주 봉사담당 (마을)'));
  const sel2 = [];
  const cur2 = rows.length ? rows[rows.length - 1].love_service : '';
  if (cur2) sel2.push(cur2);
  f2.appendChild(namePicker({
    selected: sel2, source: 'villages', multi: false,
    placeholder: '마을 선택',
    onChange: () => saveLove(thisWeekId, 'love_service', sel2[0] || ''),
  }));
  box.appendChild(f2);
  card.appendChild(box);
  return card;
}

async function saveLove(weekId, role, name) {
  if (!name) return;
  markSaving();
  try {
    await BT_API.call('overrideRotation', { weekId, role, mode: 'once', name });
    markSaved();
    // 로컬 표도 갱신
    const row = (STATE.loveWindow || []).find((r) => r.week === weekId);
    if (row) row[role] = name;
  } catch (err) { toast('저장 실패: ' + (err.message || '')); }
}

// ── 행사계획 (자동 5줄 + 수정) ──
function renderEventsCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '행사 계획'));
  h.appendChild(el('span', 'sub', '자동'));
  card.appendChild(h);

  const list = el('div', 'event-list');
  (S.events || []).forEach((e) => {
    const row = el('div', 'event-row');
    row.appendChild(el('div', 'event-date', fmtMD(e.display_week)));
    row.appendChild(el('div', 'event-label', e.label));
    list.appendChild(row);
  });
  if (!(S.events || []).length) {
    list.appendChild(el('p', 'hint', '다가오는 행사가 없습니다.'));
  }
  card.appendChild(list);

  const note = el('p', 'hint');
  note.style.margin = '8px 0 0';
  note.textContent = '연간 행사표에서 자동으로 가져옵니다. 수정은 다음 단계(설정)에서.';
  card.appendChild(note);
  return card;
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
