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
    try { await carryForwardPraise(); } catch (e) { /* 이월 실패해도 로드는 계속 */ }
    // 12월이면 내년 연간 일정이 비었는지 확인 → 새 일람 입력 리마인더 배너(깜빡 방지)
    try {
      if (Number(STATE.weekId.slice(5, 7)) === 12) {
        const r = await BT_API.call('getAnnualEvents');
        const ny = String(Number(STATE.weekId.slice(0, 4)) + 1);
        STATE.nextYearEmpty = !(r.events || []).some((e) => String(e.display_week || '').slice(0, 4) === ny);
      }
    } catch (e) { /* 확인 실패해도 로드는 계속 */ }
    render();
  } catch (err) {
    if (err.status === 401) { BT_API.clearToken(); show('#screen-pin'); return; }
    $('#bt-body').innerHTML =
      `<p class="center-note">불러오지 못했습니다.<br>${err.message || ''}</p>`;
  }
}

// ---------- 예배찬양 악보 이월 (매주 유지 · 교체 전까지) ----------
// 새 주차는 빈 상태로 생성되므로 예배찬양 악보가 매주 사라진다. 이번 주가 비어 있으면
// 가장 최근에 넣어둔 주에서 불러와 이번 주에 복제·저장한다(사용자가 새로 올리면 그게 유지됨).
function hasPraise(b) {   // 이번 주에 뭔가(이미지든 글이든) 있으면 이월 스킵(이번 주 선택 존중)
  const pp = (b && b.praise_panel) || {};
  return !!(pp.image_data || pp.image_url || (pp.text && String(pp.text).trim()));
}
function praiseImageOf(b) {   // 이월 대상 = 이미지만(글은 일회성이라 이월하지 않음)
  const pp = (b && b.praise_panel) || {};
  return pp.image_data || pp.image_url || '';
}
async function carryForwardPraise() {
  if (!STATE || !STATE.weekId) return;
  if (hasPraise(STATE.bulletin)) return;              // 이미 있으면(글 포함) 그대로
  for (let k = 1; k <= 5; k++) {                      // 최근 몇 주를 거슬러 이미지 탐색
    const prevWeek = addDaysISO(STATE.weekId, -7 * k);
    const prev = await BT_API.call('getBulletin', { weekId: prevWeek });
    if (praiseImageOf(prev.bulletin)) {               // 이미지가 있는 주만(글만 있는 주는 건너뜀)
      const src = (prev.bulletin && prev.bulletin.praise_panel) || {};
      STATE.bulletin = STATE.bulletin || {};
      STATE.bulletin.praise_panel = { mode: 'image', image_data: src.image_data, image_url: src.image_url };   // 이미지만 이월
      try {                                            // 이번 주에 저장 → 다음 주도 이어서 이월
        const r = await BT_API.call('saveBulletin', {
          data: STATE.bulletin,
          baseUpdatedAt: STATE.bulletinUpdatedAt || undefined,
        });
        STATE.bulletinUpdatedAt = r.updatedAt;
      } catch (e) { /* 저장 실패(충돌·잠금 등)해도 이번 주 화면·인쇄엔 반영됨 */ }
      return;
    }
  }
}

// ============================================================
// 렌더 (3-1: 표지)
// ============================================================
// ── 이번 주 현황 카드 — 필수 항목 완료 여부 한눈에(무엇이 남았나) ──
function renderStatusCard(S) {
  const card = el('div', 'card status-card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '이번 주 현황'));
  h.appendChild(el('span', 'sub', fmtKDate(S.weekId) + ' · 제' + S.vol + '권 ' + S.no + '호'));
  card.appendChild(h);

  const req = printChecklist(S);   // [{ ok, label }] — 필수 6종
  const done = req.filter((x) => x.ok).length;

  const sum = el('div', 'status-sum');
  const bar = el('div', 'status-bar');
  const fill = el('div', 'status-bar-fill'); fill.style.width = Math.round(done / req.length * 100) + '%';
  if (done === req.length) fill.classList.add('full');
  bar.appendChild(fill); sum.appendChild(bar);
  sum.appendChild(el('span', 'status-count' + (done === req.length ? ' ok' : ''),
    done === req.length ? '필수 항목 모두 완료 ✓' : `필수 ${done}/${req.length} 완료`));
  card.appendChild(sum);

  // 필수 항목 → 눌러서 해당 카드로 이동
  const cardOf = {
    '설교 제목': '예배 순서', '설교 본문(성경)': '예배 순서',
    '대표기도 담당': '예배 순서', '찬송(중간)': '예배 순서',
    '교회 소식': '교회 소식', '지난주 헌금 합계': '지난 주 헌금',
  };
  // 현황 칩은 짧게(누르면 해당 카드로 이동하니 맥락 충분) — 한 줄에 6개
  const shortOf = {
    '설교 본문(성경)': '설교 본문', '대표기도 담당': '대표기도',
    '찬송(중간)': '찬송', '지난주 헌금 합계': '헌금 합계',
  };
  const grid = el('div', 'status-grid');
  req.forEach((item) => {
    const chip = el('button', 'status-chip' + (item.ok ? ' done' : ' todo'));
    chip.appendChild(el('span', 'status-ic', item.ok ? '✓' : '○'));
    chip.appendChild(document.createTextNode(shortOf[item.label] || item.label));
    const target = cardOf[item.label];
    if (target) chip.addEventListener('click', () => scrollToCard(target));
    grid.appendChild(chip);
  });
  card.appendChild(grid);

  // 그 외(정보성) — 채워짐/비어있음만 표시
  const data = bd();
  const lw0 = (S.loveWindow && S.loveWindow[0]) || {};
  const opt = [
    { ok: (S.choirSongs || []).length > 0, label: '성가대 곡', card: null },
    { ok: !!(data.praise_panel && (data.praise_panel.image_data || data.praise_panel.text)), label: '예배찬양', card: '예배찬양 (악보)' },
    { ok: !!(data.saturday && data.saturday.sermon), label: '토요새벽 설교', card: '토요새벽예배' },
    { ok: !!lw0.love_offering, label: '친교헌금', card: '사랑의 나눔' },
  ];
  const optRow = el('div', 'status-opt');
  optRow.appendChild(el('span', 'status-opt-label', '그 외'));
  opt.forEach((o) => {
    const s = el('button', 'status-mini' + (o.ok ? ' on' : ''), (o.ok ? '● ' : '○ ') + o.label);
    if (o.card) s.addEventListener('click', () => scrollToCard(o.card));
    optRow.appendChild(s);
  });
  card.appendChild(optRow);
  return card;
}

// 해당 제목의 카드로 부드럽게 스크롤 + 잠깐 강조
function scrollToCard(headingText) {
  const cards = document.querySelectorAll('#bt-body .card');
  for (const c of cards) {
    const h2 = c.querySelector('.card-h h2');
    if (h2 && h2.textContent.trim() === headingText) {
      c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      c.classList.add('card-flash');
      setTimeout(() => c.classList.remove('card-flash'), 1200);
      return;
    }
  }
}

function render() {
  const S = STATE;
  const body = $('#bt-body');
  body.innerHTML = '';

  // ── 이번 주 현황 (무엇이 남았나 한눈에) ──
  body.appendChild(renderStatusCard(S));

  // ── 12월: 내년 연간 일정 입력 리마인더 (깜빡 방지 — 시스템이 먼저 알림) ──
  if (S.nextYearEmpty) {
    const n = el('div', 'notice');
    n.appendChild(el('span', null, '내년 연간 일정이 아직 비어 있어요. 새 교회일람이 나오면 넣어주세요.'));
    const b = el('button', 'btn btn-line', '연간 일정 열기');
    b.addEventListener('click', openEvents);
    n.appendChild(b);
    body.appendChild(n);
  }

  // ── 주차 헤더 (권/호·날짜 자동) ──
  const head = el('div', 'week-head');
  head.appendChild(el('span', 'week-date', fmtKDate(S.weekId)));
  head.appendChild(el('span', 'week-vol', `제 ${S.vol}권 ${S.no}호`));
  head.appendChild(el('span', 'week-auto', '자동 계산'));
  const reset = el('button', 'week-reset', '↩ 이 주 되돌리기');
  reset.title = '이 주에 직접 고친 내용을 지우고 자동값(원본)으로 되돌립니다';
  reset.addEventListener('click', resetWeek);
  head.appendChild(reset);
  body.appendChild(head);

  // ── 성찬식 자동삽입 (§6-4) — 예정 주간이면 설교 뒤에 자동 추가, 이번 주만 뺄 수 있음 ──
  if (isCommunionWeek(S)) {   // 플래그 + label '성찬' 감지(buildOrderRows와 동일 판정)
    const hidden = !!bd().hideCommunion;
    const n = el('div', 'notice');
    n.appendChild(el('span', null, hidden
      ? '이번 주는 성찬식 예정 주간입니다 (지금은 순서에서 빠져 있어요).'
      : '성찬식이 예배순서 「설교」 뒤에 자동 추가되었습니다.'));
    const b = el('button', 'btn btn-line', hidden ? '순서에 다시 넣기' : '이번 주 순서에서 빼기');
    b.addEventListener('click', () => {
      if (hidden) delete bd().hideCommunion; else bd().hideCommunion = true;
      queueSave();
      render();
    });
    n.appendChild(b);
    body.appendChild(n);
  }

  body.appendChild(renderOrderCard(S));   // 설교·찬송·특송 등 인라인 편집 포함
  body.appendChild(renderServeCard(S));
  body.appendChild(renderPraiseCard(S));  // 예배찬양 악보(이미지)·글
  body.appendChild(renderNotePanelCard(S, 0, '설교노트 (왼쪽)'));   // 제목·이미지·본문(#3·#4)
  body.appendChild(renderNotePanelCard(S, 1, '설교노트 (오른쪽)'));

  // 3-2
  body.appendChild(renderNewsCard(S));
  body.appendChild(renderSaturdayCard(S));
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

  function addCustom() {
    const q = (search.value || '').trim();
    if (!q || opts.selected.includes(q)) return;
    if (opts.multi === false) opts.selected.length = 0;
    opts.selected.push(q);
    search.value = '';
    paintChips(); paintPool(); opts.onChange();
  }

  function paintPool() {
    const q = (search.value || '').trim();
    grid.innerHTML = '';
    // 직접 입력 허용(친교헌금 등): 명단에 없는 이름을 타이핑해서 그대로 추가
    if (opts.allowCustom && q && !candidates().includes(q) && !opts.selected.includes(q)) {
      const add = el('button', 'pool-name pool-custom', "＋ '" + q + "' 직접 넣기");
      add.addEventListener('click', addCustom);
      grid.appendChild(add);
    }
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
  if (opts.allowCustom) {
    search.placeholder = '이름 찾기 · 없으면 타이핑 후 Enter';
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
    });
  }
  search.addEventListener('input', paintPool);

  paintChips();
  return wrap;
}

// ── 교회소식 (자동 안내 + 수동 소식, §9 + A안) ──
function renderNewsCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '교회 소식'));
  card.appendChild(h);

  const data = bd();

  // 자동 안내 (연간 행사표 기반) — 미리 채워지되 그 자리에서 수정·추가 가능(#5)
  const auto = autoNewsItems(S);
  if (auto.length) {
    data.autoNewsEdits = data.autoNewsEdits || {};
    const autoBox = el('div', 'autonews');
    auto.forEach((a) => {
      const row = el('div', 'autonews-item');
      row.appendChild(el('span', 'autonews-tag', '자동'));
      const ta = el('textarea', 'autonews-input');
      ta.rows = 1;
      ta.value = data.autoNewsEdits[a.key] !== undefined ? data.autoNewsEdits[a.key] : a.text;
      const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', () => {
        data.autoNewsEdits[a.key] = ta.value;   // 수정·추가분 저장
        grow(); queueSave();
      });
      setTimeout(grow, 0);
      row.appendChild(ta);
      const x = el('button', 'autonews-x', '✕');
      x.title = '이 자동 안내 숨기기';
      x.addEventListener('click', () => {
        data.autoNewsHidden = (data.autoNewsHidden || []).concat(a.key);
        queueSave();
        card.replaceWith(renderNewsCard(S));
      });
      row.appendChild(x);
      autoBox.appendChild(row);
    });
    card.appendChild(autoBox);
  }
  // 숨긴 자동 안내 되살리기
  if ((data.autoNewsHidden || []).length) {
    const restore = el('button', 'autonews-restore', '숨긴 자동 안내 되살리기');
    restore.addEventListener('click', () => {
      data.autoNewsHidden = []; queueSave(); card.replaceWith(renderNewsCard(S));
    });
    card.appendChild(restore);
  }

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

  // 성찬 위원 안내 — 다음 주일이 성찬식인 주에만 버튼 노출(누르면 지침 전문 삽입, 이후 자유 수정)
  const comDate = communionNextWeekDate(S);
  if (comDate) {
    const already = data.news.some((n) => (n.title || '') === COMMUNION_NOTICE_TITLE);
    const cbtn = el('button', 'btn btn-wide btn-communion',
      already ? '✓ 성찬 위원 안내 넣음' : '＋ 성찬 위원 안내 넣기');
    cbtn.disabled = already;
    cbtn.addEventListener('click', () => {
      data.news.push({ title: COMMUNION_NOTICE_TITLE, body: communionNoticeBody(comDate) });
      paint(); queueSave();
      cbtn.disabled = true; cbtn.textContent = '✓ 성찬 위원 안내 넣음';
      toast('성찬 위원 안내를 넣었습니다 — 내용은 자유롭게 고치세요');
    });
    card.appendChild(cbtn);
  }
  return card;
}

// ── 예배찬양 (A면 자유 패널 — 악보 이미지 또는 글) ──
// 이미지는 서버 업로드 없이 클라이언트에서 리사이즈→data URL로 bulletin에 저장.
function resizeImageToDataURL(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // 투명 PNG → 흰 배경
      ctx.drawImage(img, 0, 0, w, h);
      // 크림/누런 종이 배경 → 흰색 정규화 (밝은 픽셀만 흰색으로, 음표·글자는 보존)
      try {
        const im = ctx.getImageData(0, 0, w, h);
        const d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (lum > 200) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
        }
        ctx.putImageData(im, 0, 0);
      } catch (e) { /* 보안상 읽기 불가 시 원본 유지 */ }
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
    img.src = url;
  });
}

function renderPraiseCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '예배찬양 (악보)'));
  card.appendChild(h);

  const data = bd();
  data.praise_panel = data.praise_panel || {};
  const pp = data.praise_panel;
  if (!pp.mode) pp.mode = 'image';

  // 모드 토글 — 악보 이미지 / 글
  const seg = el('div', 'seg');
  const bImg = el('button', 'seg-btn' + (pp.mode === 'image' ? ' on' : ''), '악보 이미지');
  const bTxt = el('button', 'seg-btn' + (pp.mode === 'text' ? ' on' : ''), '글');
  seg.appendChild(bImg); seg.appendChild(bTxt);
  card.appendChild(seg);

  const wrap = el('div');
  card.appendChild(wrap);

  function paint() {
    wrap.innerHTML = '';
    if (pp.mode === 'text') {
      const f = el('div', 'field');
      f.appendChild(el('label', null, '예배찬양 글 (편지·안내 등)'));
      const ta = el('textarea'); ta.rows = 6; ta.value = pp.text || '';
      ta.placeholder = '이 패널에 넣을 글을 입력하세요';
      ta.addEventListener('input', () => { pp.text = ta.value; queueSave(); });
      f.appendChild(ta); wrap.appendChild(f);
      return;
    }
    const cur = pp.image_data || pp.image_url || '';
    if (cur) {
      const prev = el('div', 'praise-preview');
      const im = el('img'); im.src = cur; prev.appendChild(im);
      wrap.appendChild(prev);
    }
    const pick = el('label', 'btn btn-line btn-wide', cur ? '악보 사진 다시 선택' : '＋ 악보 사진 업로드');
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      pick.firstChild && (pick.childNodes[0].nodeValue = '처리 중…');
      try {
        pp.image_data = await resizeImageToDataURL(file, 2400, 0.92);   // 인쇄용 고해상도(#해상도)
        delete pp.image_url; delete pp.image_path;
        queueSave(); paint();
      } catch (e) { toast('이미지 처리 실패: ' + (e.message || '')); paint(); }
    });
    pick.appendChild(inp);
    wrap.appendChild(pick);

    if (cur) {
      const del = el('button', 'btn btn-ghost btn-wide', '악보 지우기');
      del.style.marginTop = '6px';
      del.addEventListener('click', () => {
        delete pp.image_data; delete pp.image_url; delete pp.image_path;
        queueSave(); paint();
      });
      wrap.appendChild(del);
    }
    const hint = el('p', 'hint', '세로 악보 사진을 밝고 또렷하게. 인쇄 화질을 위해 폭 2400px 고화질로 저장합니다.');
    hint.style.margin = '8px 0 0';
    wrap.appendChild(hint);
  }

  bImg.addEventListener('click', () => {
    pp.mode = 'image'; bImg.classList.add('on'); bTxt.classList.remove('on'); queueSave(); paint();
  });
  bTxt.addEventListener('click', () => {
    pp.mode = 'text'; bTxt.classList.add('on'); bImg.classList.remove('on'); queueSave(); paint();
  });
  paint();
  return card;
}

// ── 토요새벽예배 (#3 — 날짜 자동, 설교 본문·담당자 입력) ──
function renderSaturdayCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '토요새벽예배'));
  card.appendChild(h);

  const data = bd();
  data.saturday = data.saturday || {};
  const sat = data.saturday;
  const pastorName = (S.meta?.staff_panel?.rows || []).find((r) => r.label === '담임목사')?.value || '';
  const defPreacher = pastorName ? pastorName + ' 목사' : '';

  // 날짜 (자동 · 수정 가능)
  const df = el('div', 'field');
  const dl = el('label', null, '날짜');
  dl.appendChild(el('span', 'hint', '  자동: ' + saturdayOf(S) + ' (비우면 자동)'));
  df.appendChild(dl);
  const di = el('input'); di.type = 'text'; di.placeholder = saturdayOf(S) + ' 오전 7시';
  di.value = sat.date || '';
  di.addEventListener('input', () => { sat.date = di.value; queueSave(); });
  df.appendChild(di); card.appendChild(df);

  // 설교 본문
  const sf = el('div', 'field');
  sf.appendChild(el('label', null, '설교 본문'));
  const si = el('input'); si.type = 'text'; si.placeholder = '예: 고린도후서 강해';
  si.value = sat.sermon || '';
  si.addEventListener('input', () => { sat.sermon = si.value; queueSave(); });
  sf.appendChild(si); card.appendChild(sf);

  // 설교 담당자 (기본 담임목사, 수정 가능)
  const pf = el('div', 'field');
  const pl = el('label', null, '설교 담당');
  pl.appendChild(el('span', 'hint', '  비우면 ' + defPreacher));
  pf.appendChild(pl);
  const pi = el('input'); pi.type = 'text'; pi.placeholder = defPreacher;
  pi.value = sat.preacher || '';
  pi.addEventListener('input', () => { sat.preacher = pi.value; queueSave(); });
  pf.appendChild(pi); card.appendChild(pf);
  return card;
}

// ── 지난주 헌금 (분류별 이름 클릭 + 합계 숫자) ──
function renderOfferingCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  const prevWeek = fmtMDKorean(addDaysISO(S.weekId, -7));   // 지난 주일(이번주−7일) = 예: 7월 19일
  h.appendChild(el('h2', null, '지난 주 헌금'));
  if (prevWeek) h.appendChild(el('span', 'sub', prevWeek));
  card.appendChild(h);

  const data = bd();
  data.offering = data.offering || {};
  const o = data.offering;
  // 이전(배열) 데이터가 있으면 문자열로 변환 — 호환
  ['thanks', 'tithe', 'weekly', 'mission'].forEach((k) => {
    if (Array.isArray(o[k])) o[k] = o[k].join(' ');
    if (typeof o[k] !== 'string') o[k] = '';
  });

  const info = el('p', 'hint');
  info.style.margin = '0 2px 10px';
  info.textContent = '이름을 띄어쓰기로 구분해 적으세요. “김 정”처럼 띄어 적으셔도 한 사람으로 자동으로 합칩니다.';
  card.appendChild(info);

  // 이름 입력칸 공용 배선 — 칸을 벗어나면 '김 정'처럼 갈라진 이름을 합치고 무엇을 합쳤는지 알린다
  const wireNames = (inp, get, set) => {
    inp.addEventListener('input', () => { set(inp.value); queueSave(); });
    inp.addEventListener('blur', () => {
      const r = mergeSplitNames(inp.value, STATE.members);
      if (!r.fixed.length) return;
      inp.value = r.text; set(r.text); queueSave();
      const joined = r.fixed.join(', ');
      const shown = r.fixed.map(printedNameForm).join(', ');
      toast(`${joined}${josaRo(joined)} 합쳤고, 인쇄시에는 ${shown}${josaRo(shown)} 인쇄됩니다.`);
    });
  };

  [['thanks', '감사'], ['tithe', '십일조'], ['weekly', '주정'], ['mission', '선교']].forEach(([key, label]) => {
    const f = el('div', 'field');
    f.appendChild(el('label', null, label));
    const inp = el('input'); inp.type = 'text';
    inp.placeholder = '예: 임영숙 김정 남미령 원동휘';
    inp.value = o[key] || '';
    f.appendChild(inp);
    wireNames(inp, () => o[key], (v) => { o[key] = v; });
    card.appendChild(f);
  });

  // 기타헌금(맥추·친교 등) — 있을 때만 제목+이름 수동 추가. 인쇄 표엔 선교 다음·합계 위에 나옴
  o.extras = Array.isArray(o.extras) ? o.extras : [];
  const exWrap = el('div', 'field');
  exWrap.appendChild(el('label', null, '기타헌금 (선택)'));
  const exHint = el('p', 'hint');
  exHint.style.margin = '0 2px 8px';
  exHint.textContent = '맥추·친교 등 기타헌금이 있을 때만 추가하세요. 제목은 2~3자 권장(감사·십일조와 같은 칸에 정렬됩니다).';
  exWrap.appendChild(exHint);
  const exList = el('div', 'ex-list');
  function paintExtras() {
    exList.innerHTML = '';
    o.extras.forEach((ex, i) => {
      const row = el('div', 'ex-row');
      const li = el('input', 'ex-label'); li.type = 'text'; li.placeholder = '제목'; li.value = ex.label || '';
      li.addEventListener('input', () => { ex.label = li.value; queueSave(); });
      const ni = el('input', 'ex-names'); ni.type = 'text'; ni.placeholder = '이름 (띄어쓰기 구분)'; ni.value = ex.names || '';
      const del = el('button', 'ex-del', '×'); del.type = 'button'; del.title = '삭제';
      del.addEventListener('click', () => { o.extras.splice(i, 1); queueSave(); paintExtras(); });
      wireNames(ni, () => ex.names, (v) => { ex.names = v; });
      row.appendChild(li); row.appendChild(ni); row.appendChild(del);
      exList.appendChild(row);
    });
  }
  paintExtras();
  exWrap.appendChild(exList);
  const exAdd = el('button', 'btn btn-line ex-add', '＋ 기타헌금 추가'); exAdd.type = 'button';
  exAdd.addEventListener('click', () => { o.extras.push({ label: '', names: '' }); queueSave(); paintExtras(); });
  exWrap.appendChild(exAdd);
  card.appendChild(exWrap);

  const tf = el('div', 'field');
  const tl = el('label', null, '합계');
  tl.appendChild(el('span', 'hint', '  $는 자동으로 붙어요 — 숫자만 입력하세요'));
  tf.appendChild(tl);
  const ti = el('input'); ti.type = 'text'; ti.inputMode = 'decimal';
  ti.placeholder = '예: 1,316.00'; ti.value = o.total || '';
  // 치는 동안 세 자리 콤마 자동 삽입(공용 fmtMoney). $·콤마를 넣어도 중복되지 않는다.
  //   콤마가 새로 끼면 커서가 끝으로 튀므로, '커서 앞의 숫자 개수'를 세어 제자리로 되돌린다
  ti.addEventListener('input', () => {
    const before = ti.value;
    const caret = ti.selectionStart == null ? before.length : ti.selectionStart;
    const numsBefore = before.slice(0, caret).replace(/[^\d.]/g, '').length;
    const next = fmtMoney(before);
    if (next !== before) {
      ti.value = next;
      let seen = 0, at = 0;
      if (numsBefore > 0) {
        at = next.length;
        for (let i = 0; i < next.length; i++) {
          if (/[\d.]/.test(next[i])) seen++;
          if (seen >= numsBefore) { at = i + 1; break; }
        }
      }
      try { ti.setSelectionRange(at, at); } catch (err) { /* 일부 브라우저 미지원 */ }
    }
    o.total = ti.value; queueSave();
  });
  tf.appendChild(ti);
  card.appendChild(tf);
  return card;
}

// ── 사랑의 나눔 (다가올 4주 표 — 칸을 눌러 바로 수정) ──
function renderLoveCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '사랑의 나눔'));
  h.appendChild(el('span', 'sub', '이번 주 + 다가올 3주 · 칸을 눌러 수정'));
  card.appendChild(h);

  const rows = S.loveWindow || [];   // [이번주, +1, +2, +3]
  const valOf = (r, k) => (Array.isArray(r[k]) ? r[k].join(' ') : (r[k] || ''));

  const table = el('table', 'grid4 love-grid');
  const thead = el('thead'); const htr = el('tr');
  htr.appendChild(el('th', null, ''));
  rows.forEach((r, i) => {
    const th = el('th', i === 0 ? 'thisweek' : null);
    th.appendChild(document.createTextNode(fmtMDKorean(r.week)));
    if (i === 0) th.appendChild(el('span', 'love-now', '이번 주'));
    htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);

  const tbody = el('tbody');
  function paint() {
    tbody.innerHTML = '';
    [['친교헌금', 'love_offering'], ['봉사담당', 'love_service']].forEach(([label, key]) => {
      const tr = el('tr');
      tr.appendChild(el('th', null, label));
      rows.forEach((r, i) => {
        const v = valOf(r, key);
        const td = el('td', 'tap' + (i === 0 ? ' thisweek' : '') + (v ? '' : ' is-empty'));
        // 친교헌금 두 분이면 두 줄로(인쇄와 동일한 안정감, #6-1) — 봉사담당(2촌 등)은 한 줄
        if (key === 'love_offering' && v.trim()) {
          v.trim().split(/\s+/).forEach((n) => td.appendChild(el('div', 'serve-name', n)));
        } else {
          td.textContent = v || '＋';
        }
        td.addEventListener('click', () => openLoveEditor(r.week, key, label, paint));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  paint();
  table.appendChild(tbody); card.appendChild(table);

  const note = el('p', 'hint'); note.style.margin = '8px 2px 0';
  note.textContent = '표의 칸을 눌러 그 주 담당을 지정·수정하세요. 봉사담당은 비우면 자동 순환값으로 돌아갑니다.';
  card.appendChild(note);
  return card;
}

// 표 칸 클릭 → 팝업에서 그 주·항목 편집
function openLoveEditor(week, key, label, onDone) {
  openSheet(`${label} · ${fmtKDate(week)}`, (body) => {
    const row = (STATE.loveWindow || []).find((r) => r.week === week) || {};
    const cur = row[key];
    if (key === 'love_offering') {
      body.appendChild(el('p', 'hint', '한두 분 · 명단에 없으면 직접 타이핑 · 없으면 비움 · 두 분이면 두 줄로 인쇄'));
      const sel = Array.isArray(cur) ? cur.slice() : (cur ? String(cur).trim().split(/\s+/).filter(Boolean) : []);
      body.appendChild(namePicker({
        selected: sel, source: 'members', multi: true, allowCustom: true, placeholder: '명단에서 고르거나 직접 입력',
        onChange: () => saveLove(week, 'love_offering', sel.join(' '), onDone),
      }));
    } else {
      body.appendChild(el('p', 'hint', '마을 선택 · 비우면 월 순환 자동값으로 복귀'));
      const sel = cur ? [String(cur)] : [];
      body.appendChild(namePicker({
        selected: sel, source: 'villages', multi: false, placeholder: '마을 선택(비우면 자동값)',
        onChange: () => saveLove(week, 'love_service', sel[0] || '', onDone),
      }));
    }
  });
}

async function saveLove(weekId, role, name, onDone) {
  // 친교헌금·봉사담당은 빈 값도 허용(비우기). 서버가 love_ 역할 빈값이면 삭제(자동값 복귀).
  markSaving();
  try {
    await BT_API.call('overrideRotation', { weekId, role, mode: 'once', name });
    markSaved();
    // 로컬 표도 갱신 (봉사담당 비우면 자동값은 다음 조회에서 반영)
    const row = (STATE.loveWindow || []).find((r) => r.week === weekId);
    if (row) row[role] = name;
    if (onDone) onDone();
  } catch (err) { toast('저장 실패: ' + (err.message || '')); }
}

// ── 행사계획 (자동 5줄 + 수정) ──
function renderEventsCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '행사 계획'));
  h.appendChild(el('span', 'sub', '기본 4개 · 추가/삭제'));
  card.appendChild(h);

  const data = bd();
  data.eventsHidden = Array.isArray(data.eventsHidden) ? data.eventsHidden : [];
  data.eventsAdded = Array.isArray(data.eventsAdded) ? data.eventsAdded : [];

  // 자동 4개 (다가오는 순) — ✕로 숨기기 / 되살리기
  const auto = (S.events || []).slice(0, 4).map((e) => ({
    key: 'auto|' + e.display_week + '|' + e.label, dateText: fmtMDKorean(e.display_week), label: e.label,
  }));
  const autoBox = el('div', 'ev-auto');
  auto.forEach((a) => {
    const hidden = data.eventsHidden.includes(a.key);
    const row = el('div', 'ev-item' + (hidden ? ' is-hidden' : ''));
    row.appendChild(el('span', 'ev-tag', '자동'));
    row.appendChild(el('span', 'ev-date', a.dateText));
    row.appendChild(el('span', 'ev-label', a.label));
    const x = el('button', 'ev-x', hidden ? '되살리기' : '✕');
    x.addEventListener('click', () => {
      data.eventsHidden = hidden
        ? data.eventsHidden.filter((k) => k !== a.key)
        : data.eventsHidden.concat(a.key);
      queueSave(); card.replaceWith(renderEventsCard(S));
    });
    row.appendChild(x);
    autoBox.appendChild(row);
  });
  if (auto.length) card.appendChild(autoBox);

  // 수동 추가 목록
  const list = el('div', 'ev-list');
  function paint() {
    list.innerHTML = '';
    data.eventsAdded.forEach((item, i) => {
      const row = el('div', 'ev-item ev-manual');
      const d = el('input', 'ev-date-in'); d.type = 'text'; d.placeholder = '날짜(예: 9월 20일)'; d.value = item.date || '';
      d.addEventListener('input', () => { item.date = d.value; queueSave(); });
      const l = el('input', 'ev-label-in'); l.type = 'text'; l.placeholder = '행사 내용'; l.value = item.label || '';
      l.addEventListener('input', () => { item.label = l.value; queueSave(); });
      const del = el('button', 'ev-x', '✕');
      del.addEventListener('click', () => { data.eventsAdded.splice(i, 1); paint(); queueSave(); });
      row.appendChild(d); row.appendChild(l); row.appendChild(del);
      list.appendChild(row);
    });
  }
  paint();
  card.appendChild(list);

  const add = el('button', 'btn btn-line btn-wide', '＋ 행사 추가');
  add.style.marginTop = '8px';
  add.addEventListener('click', () => { data.eventsAdded.push({ date: '', label: '' }); paint(); queueSave(); });
  card.appendChild(add);

  const note = el('p', 'hint'); note.style.margin = '8px 0 0';
  note.textContent = '연간 행사표에서 다가오는 4개를 자동 표시합니다. ✕로 숨기거나 직접 추가할 수 있어요.';
  card.appendChild(note);
  return card;
}

// ── 설교노트 패널 (A-1·A-2) — 제목 수정 + 이미지·본문 선택(#3·#4) ──
function renderNotePanelCard(S, idx, label) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, label));
  h.appendChild(el('span', 'sub', '제목·이미지·본문 선택'));
  card.appendChild(h);

  const data = bd();
  data.notePanels = Array.isArray(data.notePanels) ? data.notePanels : [];
  while (data.notePanels.length <= idx) data.notePanels.push({});
  const np = data.notePanels[idx];

  // 제목
  const tf = el('div', 'field');
  tf.appendChild(el('label', null, '제목'));
  const ti = el('input'); ti.type = 'text'; ti.placeholder = '설교노트'; ti.value = np.title || '';
  ti.addEventListener('input', () => { np.title = ti.value; queueSave(); });
  tf.appendChild(ti); card.appendChild(tf);

  // 이미지 (선택)
  const wrap = el('div');
  function paintImg() {
    wrap.innerHTML = '';
    if (np.image_data) {
      const prev = el('div', 'praise-preview'); const im = el('img'); im.src = np.image_data;
      prev.appendChild(im); wrap.appendChild(prev);
    }
    const pick = el('label', 'btn btn-line btn-wide', np.image_data ? '이미지 다시 선택' : '＋ 이미지 업로드 (선택)');
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      pick.childNodes[0] && (pick.childNodes[0].nodeValue = '처리 중…');
      try { np.image_data = await resizeImageToDataURL(f, 2400, 0.92); queueSave(); paintImg(); }   // 인쇄용 고해상도
      catch (e) { toast('이미지 처리 실패: ' + (e.message || '')); paintImg(); }
    });
    pick.appendChild(inp); wrap.appendChild(pick);
    if (np.image_data) {
      const del = el('button', 'btn btn-ghost btn-wide', '이미지 지우기'); del.style.marginTop = '6px';
      del.addEventListener('click', () => { delete np.image_data; queueSave(); paintImg(); });
      wrap.appendChild(del);
    }
  }
  paintImg(); card.appendChild(wrap);

  // 본문 글 (선택)
  const bf = el('div', 'field'); bf.style.marginTop = '10px';
  bf.appendChild(el('label', null, '본문 글 (선택)'));
  const ta = el('textarea'); ta.rows = 4;
  ta.placeholder = '내용을 입력하면 빈 줄 대신 이 글이 인쇄됩니다';
  ta.value = np.text || '';
  ta.addEventListener('input', () => { np.text = ta.value; queueSave(); });
  bf.appendChild(ta); card.appendChild(bf);

  const note = el('p', 'hint'); note.style.margin = '4px 0 0';
  note.textContent = '제목·이미지·본문을 모두 비우면 손글씨용 빈 줄로 인쇄됩니다.';
  card.appendChild(note);
  return card;
}

// ── 예배순서 카드 (그 자리에서 바로 편집) ──
// PPT·자동값이 기본으로 채워지고, 각 줄을 탭해 수정 → 주보에만 반영(오버라이드).
// 비우면 자동값으로 복귀. 공용 buildOrderRows(config.js) 사용.
function renderOrderCard(S) {
  const card = el('div', 'card');
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, '예배 순서'));
  h.appendChild(el('span', 'sub', S.meta?.service_times?.sunday || '오전10:45'));
  card.appendChild(h);

  // 이번 주 순서가 기본과 다르면 배지(사라지지 않는 알림 — 다음 주 자동 원복)
  const changes = orderChangeSummary(S);
  if (changes) {
    card.appendChild(el('div', 'order-changes',
      '🔔 이번 주 순서 변경: ' + changes + ' — 다음 주엔 기본 순서로 자동 복귀'));
  }

  const overrides = () => { const d = bd(); d.orderOverrides = d.orderOverrides || {}; return d.orderOverrides; };
  const repaint = () => card.replaceWith(renderOrderCard(S));

  const list = el('div', 'order-list');
  buildOrderRows(S, { includeRemoved: true }).forEach((r) => {
    const row = el('div', 'order-row' + (r.readonly ? ' order-ro' : ''));
    const l = el('div', 'order-label');
    if (r.star) l.appendChild(el('span', 'star', '※'));
    l.appendChild(el('span', 'order-lab', r.label));   // ※ 제외, 라벨만 양끝맞춤
    row.appendChild(l);

    if (r.removed) {
      // 뺀 순서 — 제자리에 흐리게 남기고 바로 옆에서 되살리기(찾아다닐 필요 없음)
      row.classList.add('order-removed-row');
      const wrapR = el('div', 'order-ro-val');
      wrapR.appendChild(el('span', 'order-removed-note', '이번 주 뺌'));
      const rb = el('button', 'order-restore', '되살리기'); rb.type = 'button';
      rb.addEventListener('click', () => {
        if (r.id === 'communion') { delete bd().hideCommunion; queueSave(); render(); }   // 상단 안내 카드도 갱신
        else {
          bd().orderRemoved = (bd().orderRemoved || []).filter((x) => x !== r.id);
          queueSave(); repaint();
        }
        toast('「' + r.label + '」' + pickJosa(r.label, '을', '를') + ' 되살렸어요');
      });
      wrapR.appendChild(rb);
      row.appendChild(wrapR);
      list.appendChild(row);
      return;
    }

    if (r.readonly) {
      // 공유 필드 — 읽기전용 + 어디서 입력하는지 배지(값 갈라짐 차단). 빼기 없음(안전)
      const val = el('div', 'order-ro-val');
      const isPPT = r.source === 'PPT';
      const txt = el('span', 'ro-text' + (r.detail ? '' : ' empty') + (r.bold ? ' order-bold' : ''),
        r.detail || (isPPT ? 'PPT에서 입력' : '섬기는이들 표에서'));
      val.appendChild(txt);
      val.appendChild(el('span', 'order-badge' + (isPPT ? ' ppt' : ' auto'),
        isPPT ? 'PPT' : '자동'));
      row.appendChild(val);
      list.appendChild(row);
      return;
    }

    if (r.extra) {
      // 이번 주 수동 추가 순서 — 내용은 orderExtras에 직접 저장, ✕로 삭제
      row.classList.add('order-extra');
      const x = (bd().orderExtras || []).find((e) => e.id === r.id);
      const wrapE = el('div', 'order-editwrap');
      const inpE = el('input', 'order-input is-edited');
      inpE.type = 'text'; inpE.value = (x && x.detail) || '';
      inpE.placeholder = '내용 (예: 집례: 담임목사)';
      inpE.addEventListener('input', () => { if (x) { x.detail = inpE.value; queueSave(); } });
      wrapE.appendChild(inpE);
      const delE = el('button', 'order-del', '✕'); delE.type = 'button'; delE.title = '이 순서 삭제';
      delE.addEventListener('click', () => {
        bd().orderExtras = (bd().orderExtras || []).filter((e) => e.id !== r.id);
        queueSave(); repaint();
        toast('「' + r.label + '」 추가 순서를 삭제했어요');
      });
      wrapE.appendChild(delE);
      row.appendChild(wrapE);
      list.appendChild(row);
      return;
    }

    const inp = el('input', 'order-input' + (r.overridden ? ' is-edited' : '') + (r.bold ? ' order-bold' : ''));
    inp.type = 'text';
    inp.value = r.detail || '';
    inp.placeholder = '입력';
    inp.addEventListener('input', () => {
      overrides()[r.id] = inp.value;
      inp.classList.add('is-edited');
      queueSave();
    });
    // 비우면 오버라이드 삭제 → 자동값 복귀 / 특송은 곡명·담당 사이 점 자동
    inp.addEventListener('blur', () => {
      if (inp.value.trim() === '') {
        delete overrides()[r.id];
        inp.classList.remove('is-edited');
        const back = buildOrderRows(S).find((x) => x.id === r.id);
        inp.value = (back && back.detail) || '';
        queueSave();
      } else if (r.id === 'special') {
        const f = formatSpecial(inp.value);
        if (f !== inp.value) { inp.value = f; overrides()[r.id] = f; queueSave(); }
      }
    });
    // 이번 주만 빼기(✕) — 성찬식은 기존 hideCommunion, 나머지는 orderRemoved. 되살리기 칩으로 복구
    const wrapB = el('div', 'order-editwrap');
    wrapB.appendChild(inp);
    let srcBadge = null, srcBack = null;   // 특송 출처 배지 · 되돌리기(입력칸과 ✕ 사이)

    // 특송 — 다른 PPT 행과 같은 [PPT] 배지. 비어 있으면 '성가대가 채우는 자리'임을 안내(월요일 리셋 후 학습),
    //   목사님이 직접 고쳤을 땐 사실대로 [직접 입력] + 원터치 복귀
    if (r.id === 'special') {
      if (r.overridden) {
        srcBadge = el('span', 'order-badge auto', '직접 입력');
        srcBack = el('button', 'order-src-back', '↩ 성가대 곡으로');
        srcBack.type = 'button';
        srcBack.title = '직접 입력한 값을 지우고 성가대가 PPT에 넣은 곡으로 되돌립니다';
        srcBack.addEventListener('click', () => {
          delete overrides()[r.id];
          queueSave(); repaint();
          toast('성가대 곡으로 되돌렸습니다');
        });
      } else {
        srcBadge = el('span', 'order-badge ppt', 'PPT');
        if (!choirMeta(S).has) inp.placeholder = '성가대가 PPT에 넣으면 자동으로 표시됩니다';
      }
    }
    const delB = el('button', 'order-del', '✕'); delB.type = 'button';
    delB.title = '이번 주만 순서에서 빼기';
    delB.addEventListener('click', () => {
      if (r.id === 'communion') { bd().hideCommunion = true; queueSave(); render(); }   // 상단 안내 카드도 갱신
      else {
        const rm = bd().orderRemoved = bd().orderRemoved || [];
        if (!rm.includes(r.id)) rm.push(r.id);
        queueSave(); repaint();
      }
      toast('「' + r.label + '」' + pickJosa(r.label, '을', '를')
        + ' 이번 주만 뺐어요 — 그 자리의 되살리기로 복구됩니다');
    });
    if (srcBack) wrapB.appendChild(srcBack);   // 값 → (되돌리기) → 배지 → ✕ 한 줄
    if (srcBadge) wrapB.appendChild(srcBadge);
    // 특송은 늘 있는 순서 → ✕ 없음(실수 방지). 비면 인쇄에서 자동 제외되므로 뺄 필요가 없다
    if (r.id !== 'special') wrapB.appendChild(delB);
    row.appendChild(wrapB);
    list.appendChild(row);
  });
  card.appendChild(list);

  // 순서 추가 — 17개부터 경고, 18개면 차단(인쇄 잘림 방지 가드레일)
  const rowCount = buildOrderRows(S).length;
  if (rowCount >= 17) {
    card.appendChild(el('p', 'hint order-warn',
      `⚠️ 순서가 ${rowCount}개라 인쇄 줄간격이 좁아집니다 (한계 18개)`));
  }
  const addOrder = el('button', 'btn btn-line btn-wide', '＋ 이번 주 순서 추가 (세례식 등)');
  addOrder.type = 'button';
  addOrder.style.marginTop = '8px';
  addOrder.addEventListener('click', () => {
    if (buildOrderRows(S).length >= 18) {
      toast('순서가 18개를 넘으면 인쇄에서 잘려요 — 더 추가할 수 없습니다');
      return;
    }
    openOrderAdd(S, () => repaint());
  });
  card.appendChild(addOrder);

  const foot = el('div', 'order-foot');
  const note = el('p', 'hint');
  note.innerHTML = '<b>설교·본문·찬송</b>은 PPT에서, <b>대표기도</b>는 섬기는이들 표에서 입력합니다(값이 갈라지지 않게 읽기전용). 나머지는 여기서 고칠 수 있어요. PPT 입력은 상단 <b>PPT 작성</b> 버튼으로 여세요.';
  foot.appendChild(note);
  card.appendChild(foot);
  return card;
}

// 이번 주 순서 추가 바텀시트 — 이름·내용·위치만 적으면 그 주에만 삽입(다음 주 자동 원복)
function openOrderAdd(S, onDone) {
  openSheet('이번 주 순서 추가', (body) => {
    const f1 = el('div', 'field');
    f1.appendChild(el('label', null, '순서 이름'));
    const li = el('input'); li.type = 'text'; li.placeholder = '예: 세례식';
    f1.appendChild(li);

    const f2 = el('div', 'field');
    f2.appendChild(el('label', null, '내용 (오른쪽 칸 — 비워도 됨)'));
    const di = el('input'); di.type = 'text'; di.placeholder = '예: 집례: 담임목사';
    f2.appendChild(di);

    const f3 = el('div', 'field');
    f3.appendChild(el('label', null, '어느 순서 뒤에 넣을까요?'));
    const sel = el('select');
    buildOrderRows(S).forEach((r) => {
      const o = el('option', null, r.label + ' 뒤'); o.value = r.id; sel.appendChild(o);
    });
    if ([...sel.options].some((o) => o.value === 'sermon')) sel.value = 'sermon';   // 기본: 설교 뒤
    f3.appendChild(sel);

    const go = el('button', 'btn btn-primary btn-wide', '추가');
    go.type = 'button';
    go.addEventListener('click', () => {
      const label = li.value.trim();
      if (!label) { toast('순서 이름을 적어주세요'); li.focus(); return; }
      const ex = bd().orderExtras = bd().orderExtras || [];
      ex.push({ id: 'x' + Date.now(), label, detail: di.value.trim(), afterId: sel.value });
      queueSave(); closeSheet(); onDone();
      toast('「' + label + '」 순서를 넣었습니다 — 이번 주에만 적용돼요');
    });
    body.appendChild(f1); body.appendChild(f2); body.appendChild(f3); body.appendChild(go);
    setTimeout(() => li.focus(), 50);
  });
}

// 이름 문자열 → 사람 단위 배열. "박세영 김 정"처럼 두 글자 이름이 공백으로 나뉘어도
// 연속된 한 글자 둘을 한 사람(김정)으로 묶는다(#3 두 줄 처리용).
function peopleLines(text) {
  const toks = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].length === 1 && i + 1 < toks.length && toks[i + 1].length === 1) {
      out.push(toks[i] + toks[i + 1]); i += 1;
    } else out.push(toks[i]);
  }
  return out.length ? out : ['—'];
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
  rows.forEach((r, i) => {
    const th = el('th', null);
    th.appendChild(document.createTextNode(fmtMD(r.week)));
    if (i === 0) th.appendChild(el('span', 'now-line', '(이번 주)'));   // 다음 줄로(#2)
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = el('tbody');
  // 기도·봉헌위원은 탭하면 수동 개입. 안내는 연 고정이라 탭 시 이번주만 교체.
  [['기 도', 'prayer'], ['안 내', 'usher'], ['봉헌위원', 'offering']].forEach(([label, key]) => {
    const tr = el('tr');
    tr.appendChild(el('th', null, label));
    rows.forEach((r, i) => {
      const td = el('td', 'tap' + (i === 0 ? ' thisweek' : ''));
      const names = r[key] ? peopleLines(r[key]) : ['—'];   // 사람마다 한 줄(#3)
      names.forEach((n, j) => {
        const d = el('div', 'serve-name', n);
        if (j === names.length - 1) {
          if (r.locked) {
            const lk = el('span', 'lock-dot', '🔒'); lk.title = '인쇄 확정됨'; d.appendChild(lk);
          } else if (r.manual && r.manual[key]) {
            const dot = el('span', 'manual-dot', '●'); dot.title = '수동 지정'; d.appendChild(dot);
          }
        }
        td.appendChild(d);
      });
      if (!r.locked) {
        td.addEventListener('click', () => openRotationSheet(key, label.replace(/\s/g, ''), r));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);

  const note = el('p', 'hint');
  note.style.margin = '10px 0 0';
  note.innerHTML = '이름을 <b>탭</b>하면 담당자를 바꿀 수 있습니다. ● = 손으로 바꾼 자리 · 🔒 = 인쇄 확정.';
  card.appendChild(note);
  return card;
}

// ============================================================
// 3-3 로테이션 수동 개입 (B3-1) — 바텀시트
// ============================================================
function openSheet(title, buildBody) {
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.innerHTML = '';
  buildBody(body);
  $('#sheet').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; }

function openRotationSheet(role, roleLabel, row) {
  const isPrayer = role === 'prayer';
  const isUsher = role === 'usher';
  openSheet(`${roleLabel} — ${fmtMD(row.week)} 바꾸기`, (body) => {
    const cur = el('p', 'sheet-cur');
    cur.innerHTML = `현재 <b>${row[role] || '—'}</b>`;
    body.appendChild(cur);

    // 옵션 1: 이 주 담당자 지정 (모든 역할 공통)
    //   엔진 v2 — 저장된 이름이 곧 순서 기준이라, 이후 주는 그분 다음부터 이어진다
    body.appendChild(sheetOption('이 주 담당자 바꾸기',
      isUsher ? '이번 주 안내만 교체합니다. 다음 주는 원래대로.'
              : '이 주를 다른 분으로 지정합니다. 이후 순서는 그분 다음부터 이어집니다.',
      () => pickAndApply(role, row.week, 'once', 'members')));

    if (isPrayer || role === 'offering') {
      // 옵션 2: 건너뛰기
      body.appendChild(sheetOption('이분 건너뛰기',
        '이 주를 명단상 바로 다음 분으로 바꿉니다.',
        () => applyShift(role, row.week, row[role])));
    }
    if (isPrayer) {
      // 옵션 3: 끼워넣기 — 원래 담당자를 다음 차례로 예약
      body.appendChild(sheetOption('다른 분 끼워넣기',
        '이 주는 고른 분이 맡고, 원래 담당자는 다음 차례로 밀립니다.',
        () => pickAndApply('prayer', row.week, 'insert', 'members')));
    }
    if (!isUsher) {
      // 옵션 4: 이 주 지정 취소 → 자동 순서로 복귀
      body.appendChild(sheetOption('↩ 이 주 바꾼 것 되돌리기',
        '이 주 지정을 취소하고 자동 순서로 되돌립니다.',
        () => applyUndo(role, row.week)));
    }
  });
}

// 그 주 로테이션 수동 개입 취소 — 원래 자동 순서로 복귀
function applyUndo(role, weekId) {
  openSheet('이 주 바꾼 것 되돌리기', (body) => {
    const p = el('p', 'sheet-cur');
    p.innerHTML = '이 주에 <b>건너뛰기·대타·끼워넣기</b>로 바꾼 것을 취소하고<br>원래 자동 순서로 되돌립니다.';
    body.appendChild(p);
    const go = el('button', 'btn btn-primary btn-wide', '되돌리기');
    go.type = 'button'; go.style.marginTop = '12px';
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = '되돌리는 중…';
      try {
        const r = await BT_API.call('undoRotation', { weekId, role });
        closeSheet();
        await refreshRotation();
        toast(r && r.removed === 0 ? '바꾼 내역이 없습니다 (이미 자동 순서)' : '원래 순서로 되돌렸습니다');
      } catch (err) {
        const m = err.message || '';
        toast(m.indexOf('알 수 없는') >= 0
          ? '되돌리기는 서버 업데이트 후 쓸 수 있어요 (관리자에게 문의)'
          : '실패: ' + m);
        go.disabled = false; go.textContent = '되돌리기';
      }
    });
    body.appendChild(go);
    const cancel = el('button', 'btn btn-line btn-wide', '취소');
    cancel.type = 'button'; cancel.style.marginTop = '8px';
    cancel.addEventListener('click', closeSheet);
    body.appendChild(cancel);
  });
}

function sheetOption(title, desc, onClick) {
  const b = el('button', 'sheet-opt');
  b.appendChild(el('span', 'sheet-opt-t', title));
  b.appendChild(el('span', 'sheet-opt-d', desc));
  b.addEventListener('click', onClick);
  return b;
}

// 이름/마을 골라서 적용 (once·insert)
function pickAndApply(role, weekId, mode, source) {
  openSheet(mode === 'insert' ? '끼워넣을 분 고르기' : '대신할 분 고르기', (body) => {
    const sel = [];
    body.appendChild(namePicker({
      selected: sel, source, multi: false,
      placeholder: '명단에서 한 분',
      onChange: () => {},
    }));
    const apply = el('button', 'btn btn-primary btn-wide', '적용');
    apply.style.marginTop = '14px';
    apply.addEventListener('click', async () => {
      if (!sel[0]) { toast('한 분을 골라주세요'); return; }
      apply.disabled = true; apply.textContent = '적용 중…';
      try {
        await BT_API.call('overrideRotation', { weekId, role, mode, name: sel[0] });
        closeSheet();
        await refreshRotation();
        toast('바꿨습니다');
      } catch (err) {
        toast('실패: ' + (err.message || ''));
        apply.disabled = false; apply.textContent = '적용';
      }
    });
    body.appendChild(apply);
  });
}

// 건너뛰고 순서 당기기 — 네이티브 confirm은 폰 인앱 브라우저에서 막히는 일이 있어
//   시트 안에서 확인받는다(그래서 '아무 일도 안 일어나는' 현상이 없다)
function applyShift(role, weekId, curName) {
  openSheet('건너뛰고 순서 당기기', (body) => {
    const p = el('p', 'sheet-cur');
    p.innerHTML = `<b>${curName || '이번 담당자'}</b> 님을 건너뛰고, 명단상 바로 다음 분이 이 주를 맡습니다.`;
    body.appendChild(p);
    const go = el('button', 'btn btn-primary btn-wide', '건너뛰기');
    go.type = 'button';
    go.style.marginTop = '12px';
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = '적용 중…';
      try {
        await BT_API.call('overrideRotation', { weekId, role, mode: 'shift' });
        closeSheet();
        await refreshRotation();
        toast('순서를 당겼습니다');
      } catch (err) {
        toast('실패: ' + (err.message || ''));
        go.disabled = false; go.textContent = '건너뛰고 당기기';
      }
    });
    body.appendChild(go);
    const cancel = el('button', 'btn btn-line btn-wide', '취소');
    cancel.type = 'button'; cancel.style.marginTop = '8px';
    cancel.addEventListener('click', closeSheet);
    body.appendChild(cancel);
  });
}

// 로테이션만 다시 계산해 표 갱신 (전체 리로드 없이)
async function refreshRotation() {
  try {
    const r = await BT_API.call('getBulletin');
    STATE.serveWindow = r.serveWindow;
    STATE.loveWindow = r.loveWindow;
    if (VIEW === 'bt') render();
  } catch (err) { /* 조용히 무시 — 다음 새로고침에 반영 */ }
}

// ============================================================
// 3-3 명단 관리 (직분별 목록 + 풀 소속 토글 + 순서)
// ============================================================
let VIEW = 'bt';          // 'bt' | 'roster' | 'events'
let ROSTER = null;        // getMembers 응답
let ROSTER_DIRTY = false; // 명단·풀을 고쳤으면 주보 복귀 시 로테이션 재계산

// 상단바 탭 강조 — 버튼은 항상 5개 유지, 현재 화면만 강조(사라지는 메뉴 없음)
function setNav(view) {
  $('#btn-roster').classList.toggle('on', view === 'roster');
  $('#btn-events').classList.toggle('on', view === 'events');
}

async function openRoster() {
  VIEW = 'roster';
  $('#bt-heading').textContent = '명단 · 순서';
  $('#btn-nav-back').hidden = false;
  setNav('roster');
  const body = $('#bt-body');
  body.innerHTML = '<p class="center-note">불러오는 중…</p>';
  try {
    ROSTER = await BT_API.call('getMembers');
    renderRoster();
  } catch (err) {
    body.innerHTML = `<p class="center-note">불러오지 못했습니다.<br>${err.message || ''}</p>`;
  }
}

function backToBt() {
  VIEW = 'bt';
  $('#bt-heading').textContent = '주보 만들기';
  $('#btn-nav-back').hidden = true;
  setNav('bt');
  // 연간 일정·명단을 고쳤으면 주보를 새로 계산(성찬식·예고·행사표·로테이션 반영)
  if (EVENTS_DIRTY || ROSTER_DIRTY) { EVENTS_DIRTY = false; ROSTER_DIRTY = false; enter(); return; }
  render();
}

// ============================================================
// 연간 일정 관리 — annual_events (성찬식·일광절약 자동 감지의 원천)
//   교회일람을 그대로 받아적기만 하면 됨(체크박스 없음, 글자로 자동 판별)
// ============================================================
let EVENTS = null;          // getAnnualEvents 응답 캐시
let EVENTS_DIRTY = false;   // 수정했으면 주보로 돌아갈 때 다시 불러오기
let EVENTS_YEAR = null;     // 연도 필터
let EVENTS_NEW = [];        // 아직 저장 안 된 새 줄(날짜+내용 채우면 저장)
let EVENTS_SHOW_PAST = false;   // 지난 일정 펼침 여부(기본 접힘)

async function openEvents() {
  VIEW = 'events';
  $('#bt-heading').textContent = '연간 일정';
  $('#btn-nav-back').hidden = false;
  setNav('events');
  const body = $('#bt-body');
  body.innerHTML = '<p class="center-note">불러오는 중…</p>';
  try {
    const r = await BT_API.call('getAnnualEvents');
    EVENTS = r.events || [];
    renderEvents();
  } catch (err) {
    body.innerHTML = `<p class="center-note">불러오지 못했습니다.<br>${err.message || ''}</p>`;
  }
}

// 입력 중 실시간 미리보기 — 교회소식에 몇 건으로 나뉘는지 + 자동 처리 표시
function evPreview(label) {
  const s = String(label || '').trim();
  if (!s) return '';
  const parts = splitEventLabel(s);
  let t = (parts.length > 1 ? `교회소식 ${parts.length}건으로 나뉨: ` : '교회소식 1건: ')
    + parts.map((p) => '「' + p + '」').join(' ');
  const extra = [];
  if (parts.some((p) => p.indexOf('성찬') >= 0)) extra.push('✝️ 성찬식 자동(예배순서·전주 예고)');
  if (parts.some((p) => p.indexOf('일광절약') >= 0 || p.indexOf('서머타임') >= 0)) extra.push('🕐 시계 안내 자동');
  return t + (extra.length ? ' · ' + extra.join(' · ') : '');
}

function renderEvents() {
  const body = $('#bt-body');
  body.innerHTML = '';
  const card = el('div', 'card');
  card.appendChild(cardHead('연간 일정', '교회일람을 그대로 받아적으면 자동 반영'));

  const hint = el('p', 'hint');
  hint.style.margin = '0 2px 10px';
  hint.innerHTML = '내용에 <b>성찬식</b>·<b>일광절약시간</b> 단어가 들어가면 예배순서 삽입·시계 안내가 자동 처리됩니다.<br>'
    + '쉼표(,)로 이으면 교회소식에 각각 나뉘어 실립니다 — 아래 미리보기로 바로 확인돼요.';
  card.appendChild(hint);

  // 연도 칩 (올해·내년 + 데이터에 있는 연도)
  const nowY = Number(String((STATE && STATE.weekId) || new Date().getFullYear()).slice(0, 4));
  const years = new Set([nowY, nowY + 1]);
  (EVENTS || []).forEach((e) => {
    const y = Number(String(e.display_week || '').slice(0, 4));
    if (y) years.add(y);
  });
  if (!EVENTS_YEAR || !years.has(EVENTS_YEAR)) EVENTS_YEAR = nowY;
  const yrow = el('div', 'ev-years');
  [...years].sort().forEach((y) => {
    const c = el('button', 'year-chip' + (y === EVENTS_YEAR ? ' on' : ''), y + '년');
    c.addEventListener('click', () => { EVENTS_YEAR = y; EVENTS_SHOW_PAST = false; renderEvents(); });
    yrow.appendChild(c);
  });
  card.appendChild(yrow);

  const list = el('div', 'evm-list');
  const rows = (EVENTS || [])
    .filter((e) => Number(String(e.display_week || '').slice(0, 4)) === EVENTS_YEAR)
    .sort((a, b) => String(a.display_week).localeCompare(String(b.display_week)));
  if (!rows.length && !EVENTS_NEW.length) {
    list.appendChild(el('p', 'center-note', EVENTS_YEAR + '년 일정이 아직 없습니다. 아래에서 추가하세요.'));
  }
  // 지난 일정은 기본으로 접어둠(다음 일정이 바로 보이게) — 펼치면 회색으로 표시·수정 가능
  const todayIso = (STATE && STATE.weekId) || '';
  const past = rows.filter((e) => todayIso && String(e.display_week) < todayIso);
  const upcoming = rows.filter((e) => !todayIso || String(e.display_week) >= todayIso);
  if (past.length) {
    const tog = el('button', 'evm-past-toggle',
      (EVENTS_SHOW_PAST ? '지난 일정 숨기기 ▴' : `지난 일정 ${past.length}건 보기 ▾`));
    tog.type = 'button';
    tog.addEventListener('click', () => { EVENTS_SHOW_PAST = !EVENTS_SHOW_PAST; renderEvents(); });
    list.appendChild(tog);
    if (EVENTS_SHOW_PAST) past.forEach((ev) => list.appendChild(evmRow(ev, true)));
  }
  upcoming.forEach((ev) => list.appendChild(evmRow(ev)));
  EVENTS_NEW.forEach((ev) => list.appendChild(evmRow(ev)));   // 새 줄은 항상 아래에
  card.appendChild(list);

  const add = el('button', 'btn btn-line btn-wide', '＋ 일정 추가');
  add.style.marginTop = '10px';
  add.addEventListener('click', () => {
    EVENTS_NEW.push({ _new: true, display_week: '', label: '', show_in_bulletin: true });
    renderEvents();
    const inputs = $('#bt-body').querySelectorAll('.evm-row .evm-date');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  card.appendChild(add);
  body.appendChild(card);
}

function evmRow(ev, isPast) {
  const row = el('div', 'evm-row' + (ev.show_in_bulletin === false ? ' off' : '')
    + (isPast ? ' past' : ''));
  const main = el('div', 'evm-main');
  const d = el('input', 'evm-date'); d.type = 'date'; d.value = ev.display_week || '';
  if (ev._new) d.title = '주일 날짜';
  const t = el('input', 'evm-label'); t.type = 'text';
  t.placeholder = '예: 부활주일, 성찬식 — 단어만 적으면 자동 처리';
  t.value = ev.label || '';
  main.appendChild(d); main.appendChild(t);

  if (!ev._new) {
    // 게재 상태 — 시제 혼동 없게 3가지:
    //   미래: '게재 예정' ⟷ '게재 불필요'(눌러서 전환) / 지난: '게재 완료'·'게재 안 함'(자동, 클릭 불가)
    if (isPast) {
      const done = ev.show_in_bulletin === false ? '게재 안 함' : '게재 완료';
      const badge = el('span', 'evm-state done', done);
      badge.title = '지난 일정입니다 (자동 표시)';
      main.appendChild(badge);
    } else {
      const label = () => (ev.show_in_bulletin === false ? '게재 불필요' : '게재 예정');
      const tog = el('button', 'evm-state evm-toggle', label());
      tog.type = 'button';
      tog.title = '누르면 주보 게재 여부가 바뀝니다';
      tog.addEventListener('click', () => {
        ev.show_in_bulletin = ev.show_in_bulletin === false;
        tog.textContent = label();
        row.classList.toggle('off', ev.show_in_bulletin === false);
        markSaving();
        BT_API.call('saveAnnualEvent', { event: { id: ev.id, show_in_bulletin: ev.show_in_bulletin } })
          .then(() => { EVENTS_DIRTY = true; markSaved(); })
          .catch((e) => toast('저장 실패: ' + (e.message || '')));
      });
      main.appendChild(tog);
    }
  }
  row.appendChild(main);

  const prev = el('div', 'evm-preview');
  const paintPrev = () => {
    const txt = evPreview(t.value);
    prev.textContent = txt; prev.hidden = !txt;
  };
  paintPrev();
  row.appendChild(prev);

  // 자동 저장(0.8초 디바운스). 새 줄은 날짜+내용 둘 다 있어야 저장
  let timer = null;
  const commit = () => {
    const week = d.value, label = t.value.trim();
    if (!week || !label) return;
    ev.display_week = week; ev.label = label;
    const detect = label.indexOf('성찬') >= 0;   // 플래그 자동(체크박스 없음)
    markSaving();
    if (ev._new) {
      BT_API.call('saveAnnualEvent', { event: { display_week: week, label, is_communion: detect } })
        .then(async () => {
          EVENTS_DIRTY = true;
          EVENTS_NEW = EVENTS_NEW.filter((x) => x !== ev);
          const r = await BT_API.call('getAnnualEvents');   // id 받으러 다시 로드
          EVENTS = r.events || [];
          markSaved(); renderEvents();
        })
        .catch((e) => toast('저장 실패: ' + (e.message || '')));
    } else {
      BT_API.call('saveAnnualEvent', { event: { id: ev.id, display_week: week, label,
        is_communion: detect, show_in_bulletin: ev.show_in_bulletin !== false } })
        .then(() => { EVENTS_DIRTY = true; markSaved(); })
        .catch((e) => toast('저장 실패: ' + (e.message || '')));
    }
  };
  const queue = () => { clearTimeout(timer); timer = setTimeout(commit, 800); };
  d.addEventListener('change', queue);
  t.addEventListener('input', () => { paintPrev(); queue(); });
  return row;
}

const TITLE_ORDER = ['담임목사', '협동목사', '교육간사', '반주자', '시무장로', '장로',
  '명예장로', '안수집사', '권사', '명예권사', '서리집사', '교인'];

function renderRoster() {
  const body = $('#bt-body');
  body.innerHTML = '';

  // ── 기도 풀 편집 (넣기·빼기 + 순서) ──
  const pools = ROSTER.pools || [];
  const prayerElders = pools.find((p) => p.id === 'prayer_elders');
  const prayerDeacons = pools.find((p) => p.id === 'prayer_deacons');
  const offering = pools.find((p) => p.id === 'offering');

  const poolCard = el('div', 'card');
  poolCard.appendChild(cardHead('기도·봉헌 순서 풀', '넣기·빼기 · 순서 바꾸기'));
  [prayerElders, prayerDeacons, offering].filter(Boolean).forEach((p) => {
    poolCard.appendChild(renderPool(p));
  });
  const poolNote = el('p', 'hint');
  poolNote.style.margin = '4px 2px 0';
  poolNote.innerHTML = '순서 = 돌아가는 차례. ▲▼로 옮기고, ✕로 빼기. 아래 명단에서 넣기.';
  poolCard.appendChild(poolNote);
  body.appendChild(poolCard);

  // ── 교인 명단 (직분별) ──
  const memCard = el('div', 'card');
  const mh = cardHead('교인 명단', '');
  const addBtn = el('button', 'btn btn-line', '＋ 새 교인');
  addBtn.style.marginLeft = 'auto';
  addBtn.addEventListener('click', () => openMemberEdit(null));
  mh.appendChild(addBtn);
  memCard.appendChild(mh);

  const members = (ROSTER.members || []).slice()
    .sort((a, b) => TITLE_ORDER.indexOf(a.title) - TITLE_ORDER.indexOf(b.title));
  const byTitle = {};
  members.forEach((m) => { (byTitle[m.title] = byTitle[m.title] || []).push(m); });

  TITLE_ORDER.forEach((title) => {
    const list = byTitle[title];
    if (!list) return;
    memCard.appendChild(el('div', 'roster-title', title));
    const wrap = el('div', 'roster-names');
    list.forEach((m) => {
      const chip = el('button', 'roster-name' + (m.active ? '' : ' off'), m.name);
      if (!m.active) chip.appendChild(el('span', 'roster-off-tag', '비활동'));
      chip.addEventListener('click', () => openMemberEdit(m));
      wrap.appendChild(chip);
    });
    memCard.appendChild(wrap);
  });
  body.appendChild(memCard);
}

function cardHead(title, sub) {
  const h = el('div', 'card-h');
  h.appendChild(el('h2', null, title));
  if (sub) h.appendChild(el('span', 'sub', sub));
  return h;
}

// 풀 하나 — 순서 있는 이름 목록, ▲▼ 이동 · ✕ 빼기
function renderPool(p) {
  const box = el('div', 'pool-edit');
  box.appendChild(el('div', 'pool-label', p.label));
  const names = Array.isArray(p.member_names) ? p.member_names : [];
  const list = el('div', 'pool-names');

  function save() {
    BT_API.call('savePool', { id: p.id, memberNames: p.member_names })
      .then(() => { ROSTER_DIRTY = true; toast('순서 저장됨'); })   // 주보로 돌아갈 때 재계산
      .catch((e) => toast('저장 실패: ' + (e.message || '')));
  }
  function paint() {
    list.innerHTML = '';
    p.member_names.forEach((name, i) => {
      const row = el('div', 'pool-item');
      row.appendChild(el('span', 'pool-idx', String(i + 1)));
      row.appendChild(el('span', 'pool-nm', name));
      const up = el('button', 'pool-mv', '▲'); up.disabled = i === 0;
      up.addEventListener('click', () => { swap(p.member_names, i, i - 1); paint(); save(); });
      const dn = el('button', 'pool-mv', '▼'); dn.disabled = i === p.member_names.length - 1;
      dn.addEventListener('click', () => { swap(p.member_names, i, i + 1); paint(); save(); });
      const rm = el('button', 'pool-rm', '✕');
      rm.addEventListener('click', () => { p.member_names.splice(i, 1); paint(); save(); });
      row.appendChild(up); row.appendChild(dn); row.appendChild(rm);
      list.appendChild(row);
    });
  }
  p.member_names = names.slice();
  paint();
  box.appendChild(list);

  // 넣기: 명단에서 아직 풀에 없는 사람 고르기
  const addWrap = el('div', 'pool-add');
  const add = el('button', 'btn btn-line', '＋ 이 풀에 넣기');
  add.addEventListener('click', () => {
    openSheet(`${p.label}에 넣기`, (bodyEl) => {
      const sel = [];
      bodyEl.appendChild(namePicker({
        selected: sel, source: 'members', multi: false,
        placeholder: '명단에서 한 분',
        onChange: () => {},
      }));
      const ok = el('button', 'btn btn-primary btn-wide', '넣기');
      ok.style.marginTop = '14px';
      ok.addEventListener('click', () => {
        if (!sel[0]) { toast('한 분을 골라주세요'); return; }
        if (p.member_names.includes(sel[0])) { toast('이미 있습니다'); return; }
        p.member_names.push(sel[0]); paint(); save(); closeSheet();
      });
      bodyEl.appendChild(ok);
    });
  });
  addWrap.appendChild(add);
  box.appendChild(addWrap);
  return box;
}

function swap(arr, i, j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

// 교인 추가·수정 (이름·직분·활동)
function openMemberEdit(m) {
  const isNew = !m;
  openSheet(isNew ? '새 교인' : `${m.name} 수정`, (body) => {
    const nf = el('div', 'field');
    nf.appendChild(el('label', null, '이름'));
    const ni = el('input'); ni.type = 'text'; ni.value = m ? m.name : '';
    nf.appendChild(ni); body.appendChild(nf);

    const tf = el('div', 'field');
    tf.appendChild(el('label', null, '직분'));
    const ts = el('select');
    TITLE_ORDER.forEach((t) => {
      const o = el('option', null, t); o.value = t;
      if (m && m.title === t) o.selected = true;
      ts.appendChild(o);
    });
    tf.appendChild(ts); body.appendChild(tf);

    if (!isNew) {
      const af = el('div', 'field');
      const lab = el('label', 'switch-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!m.active;
      lab.appendChild(cb);
      lab.appendChild(el('span', null, ' 활동 교인 (끄면 명단·순서에서 숨김, 기록은 보존)'));
      af.appendChild(lab); body.appendChild(af);
      m._cb = cb;
    }

    const save = el('button', 'btn btn-primary btn-wide', '저장');
    save.style.marginTop = '10px';
    save.addEventListener('click', async () => {
      const name = ni.value.trim();
      if (!name) { toast('이름을 입력하세요'); return; }
      save.disabled = true; save.textContent = '저장 중…';
      const member = isNew
        ? { name, title: ts.value }
        : { id: m.id, name, title: ts.value, active: m._cb.checked };
      try {
        await BT_API.call('saveMember', { member });
        ROSTER_DIRTY = true;   // 주보로 돌아갈 때 섬기는이들 표 재계산
        closeSheet();
        ROSTER = await BT_API.call('getMembers');
        renderRoster();
        toast('저장됨');
      } catch (err) {
        toast('실패: ' + (err.message || ''));
        save.disabled = false; save.textContent = '저장';
      }
    });
    body.appendChild(save);
  });
}

// ---------- 인쇄 미리보기 ----------
function goPrint() {
  ['#screen-pin', '#screen-bt', '#screen-print'].forEach((s) => { $(s).hidden = (s !== '#screen-print'); });
  openPrint(STATE);
  updateConfirmBtn();
}
function backFromPrint() {
  $('#screen-print').hidden = true;
  $('#screen-bt').hidden = false;
}
// 이 주 되돌리기 — 직접 고친 내용(주보 입력 + 이 주 수동 로테이션)을 지우고 자동값으로 복귀(#9)
async function resetWeek() {
  const ok = confirm(
    '이 주에 직접 고친 내용을 모두 지우고 자동 계산값(원본)으로 되돌립니다.\n\n'
    + '· 예배순서에서 고친 값 · 교회소식 수정 · 성찬식 추가/뺌\n'
    + '· 헌금 · 사랑의 나눔 · 토요새벽 · 예배찬양 등 직접 입력분\n'
    + '· 이 주에 바꾼 담당자(기도·안내·봉헌위원)\n\n'
    + '되돌릴까요?');
  if (!ok) return;
  try {
    // 서버: 이 주 수동 로테이션 초기화 (액션 미배포 시 무시하고 진행)
    try { await BT_API.call('resetRotations', {}); } catch (e) { /* resetRotations 미배포 등 */ }
    // 클라: 주보 입력 통째 비움 → 자동값으로 복귀
    await BT_API.call('saveBulletin', { data: {}, baseUpdatedAt: STATE.bulletinUpdatedAt || undefined });
    toast('원본으로 되돌렸습니다');
    await enter();   // 재조회 후 다시 그림
  } catch (e) {
    if (e.conflict) { toast('다른 기기에서 먼저 저장했습니다. 새로고침 후 다시 시도하세요.'); return; }
    toast('되돌리기 실패: ' + (e.message || ''));
  }
}

function doPrint() {
  const missing = window.__printMissing || [];
  if (missing.length) {
    const ok = confirm('아직 비어 있는 항목이 있습니다:\n\n· ' + missing.join('\n· ') +
      '\n\n그래도 인쇄할까요?');
    if (!ok) return;
  }
  window.print();
}

// ---------- 인쇄 확정(잠금)·해제 ----------
// 확정하면 그 주 담당자 배정(기도·안내·봉헌위원·사랑나눔)이 지금 값으로 고정 → 명단 바뀌어도 안 변함(B3-2)
function updateConfirmBtn() {
  const b = $('#btn-confirm');
  if (!b) return;
  const confirmed = !!STATE.printedAt;
  b.textContent = confirmed ? '🔓 확정 해제' : '🔒 이 주 확정';
  b.title = confirmed
    ? '확정을 해제해 담당자를 다시 수정할 수 있게 합니다'
    : '이 주 담당자 배정을 지금 값으로 고정합니다 (명단 바뀌어도 안 변함)';
  b.onclick = confirmed ? unlockWeek : confirmWeek;
}
async function confirmWeek() {
  const ok = confirm(
    '이 주보를 "확정"하면 담당자 배정(기도·안내·봉헌위원·사랑의 나눔)이 지금 값으로 고정됩니다.\n\n'
    + '· 이후 명단·로테이션을 고쳐도 이 주 담당자는 바뀌지 않습니다.\n'
    + '· 확정 상태에서는 이 주 담당자를 수정할 수 없습니다(해제하면 다시 가능).\n\n'
    + '확정할까요?');
  if (!ok) return;
  try {
    await BT_API.call('confirmPrint', { weekId: STATE.weekId });
    toast('이 주 담당자 배정을 확정(고정)했습니다.');
    await enter();
    goPrint();
  } catch (e) { toast('확정 실패: ' + (e.message || '')); }
}
async function unlockWeek() {
  const ok = confirm('이 주 확정을 해제하면 담당자를 다시 수정할 수 있습니다.\n해제할까요?');
  if (!ok) return;
  try {
    await BT_API.call('unlockPrint', { weekId: STATE.weekId });
    toast('확정을 해제했습니다. 담당자를 수정할 수 있어요.');
    await enter();
    goPrint();
  } catch (e) { toast('해제 실패: ' + (e.message || '')); }
}

// ---------- 네비게이션 ----------
function initNav() {
  $('#btn-roster').addEventListener('click', openRoster);
  $('#btn-events').addEventListener('click', openEvents);
  $('#btn-nav-back').addEventListener('click', backToBt);
  $('#btn-print').addEventListener('click', goPrint);
  $('#btn-print-back').addEventListener('click', backFromPrint);
  $('#btn-do-print').addEventListener('click', doPrint);
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').querySelector('.sheet-back').addEventListener('click', closeSheet);
}

// ---------- 부팅 ----------
(function boot() {
  initPin();
  initLogout();
  initNav();
  if (BT_API.hasToken()) enter();
  else show('#screen-pin');
})();
