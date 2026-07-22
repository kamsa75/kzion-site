/* ============================================================
   주보 인쇄 (트라이폴드 6패널) — 7/19 실물 배치 기반 (컨셉 락 §3)
   legal(14"×8.5") 가로, 양면. 접지 배치(imposition):
     A면(겉):  [설교노트] [설교노트] [예배찬양·섬기는사람·주소]
     B면(속):  [교회소식] [사랑의나눔·토요새벽·행사·헌금] [표지]
   화면 미리보기 = 인쇄 결과 1:1.
   ============================================================ */

const PE = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

// ---------- 인쇄 게이트 (§6) ----------
// 필수 빈칸 검사 → 빨강. 남아 있으면 인쇄 잠금(목사님 확인 체크로 해제).
function printChecklist(S) {
  const p = S.pastor || {};
  const b = S.bulletin || {};
  const items = [];
  const need = (ok, label) => items.push({ ok, label });

  need(!!p.title, '설교 제목');
  need(!!p.ref, '설교 본문(성경)');
  const thisWeek = (S.serveWindow || [])[0] || {};
  need(!!(p.prayer || thisWeek.prayer), '대표기도 담당');
  need(!!((p.hymn && p.hymn.title)), '찬송(중간)');
  need(Array.isArray(b.news) && b.news.some((n) => (n.title || n.body)), '교회 소식');
  need(!!(b.offering && b.offering.total), '지난주 헌금 합계');

  return items;
}

// ---------- 진입 ----------
function openPrint(S) {
  buildGate(S);
  buildSheets(S);
}

function buildGate(S) {
  const gate = document.getElementById('print-gate');
  gate.innerHTML = '';
  const items = printChecklist(S);
  const missing = items.filter((i) => !i.ok);

  const box = PE('div', 'gate-box');
  if (!missing.length) {
    box.classList.add('gate-ok');
    box.appendChild(PE('span', 'gate-ic', '✓'));
    box.appendChild(PE('span', null, '필수 항목이 모두 채워졌습니다. 인쇄할 수 있습니다.'));
    setPrintEnabled(true);
  } else {
    box.classList.add('gate-warn');
    box.appendChild(PE('span', 'gate-ic', '!'));
    const wrap = PE('div', 'gate-list');
    wrap.appendChild(PE('div', 'gate-title', '아직 비어 있는 항목이 있습니다'));
    missing.forEach((m) => wrap.appendChild(PE('span', 'gate-chip', m.label)));
    box.appendChild(wrap);
    setPrintEnabled(false);

    // 확인하고 그냥 인쇄 (목사님이 의도적으로 비운 경우 — 체크로 해제)
    const ov = PE('label', 'gate-override');
    const cb = PE('input'); cb.type = 'checkbox';
    cb.addEventListener('change', () => setPrintEnabled(cb.checked));
    ov.appendChild(cb);
    ov.appendChild(PE('span', null, ' 비어 있어도 이대로 인쇄합니다'));
    box.appendChild(ov);
  }
  gate.appendChild(box);
}

function setPrintEnabled(on) {
  const btn = document.getElementById('btn-do-print');
  btn.disabled = !on;
}

// ---------- 6패널 ----------
function buildSheets(S) {
  const root = document.getElementById('print-root');
  root.innerHTML = '';

  // A면 (겉)
  const a = PE('div', 'sheet-page');
  a.appendChild(panelSermonNote());
  a.appendChild(panelSermonNote());
  a.appendChild(panelPraiseServe(S));
  root.appendChild(a);

  // B면 (속)
  const b = PE('div', 'sheet-page');
  b.appendChild(panelNews(S));
  b.appendChild(panelWeeklyInfo(S));
  b.appendChild(panelCover(S));
  root.appendChild(b);
}

// ── 패널 공통: 상단 갈색 제목 바 ──
function panelHeadBar(title) {
  const bar = PE('div', 'p-headbar', title);
  return bar;
}
function panel(cls) { return PE('div', 'panel ' + (cls || '')); }

// ── A-1·A-2 설교노트 (빈 양식 고정) ──
function panelSermonNote() {
  const p = panel('p-note');
  p.appendChild(panelHeadBar('설교노트'));
  const lines = PE('div', 'note-lines');
  for (let i = 0; i < 22; i++) lines.appendChild(PE('div', 'note-line'));
  p.appendChild(lines);
  return p;
}

// ── A-3 예배찬양(자유) + 섬기는 사람들 + 주소 ──
function panelPraiseServe(S) {
  const p = panel('p-praise');
  p.appendChild(panelHeadBar('예배찬양'));

  const free = PE('div', 'praise-free');
  const pp = (S.bulletin && S.bulletin.praise_panel) || {};
  if (pp.mode === 'text' && pp.text) {
    free.appendChild(PE('div', 'praise-text', pp.text));
  } else if (pp.image_path) {
    const img = PE('img', 'praise-img'); img.src = pp.image_url || '';
    free.appendChild(img);
  } else {
    free.appendChild(PE('div', 'praise-empty', '예배찬양 (이미지 또는 글 — 편집에서 넣기)'));
  }
  p.appendChild(free);

  // 섬기는 사람들 (준고정)
  const staff = (S.meta && S.meta.staff_panel && S.meta.staff_panel.rows) || [];
  const box = PE('div', 'serve-box');
  box.appendChild(PE('div', 'serve-h', '섬기는 사람들'));
  staff.forEach((r) => {
    const row = PE('div', 'serve-row');
    row.appendChild(PE('span', 'serve-k', r.label));
    row.appendChild(PE('span', 'serve-v', r.value));
    box.appendChild(row);
  });
  p.appendChild(box);

  // 주소
  const ci = (S.meta && S.meta.church_info) || {};
  const addr = PE('div', 'p-addr');
  addr.appendChild(PE('div', null, ci.address || ''));
  addr.appendChild(PE('div', null, `${ci.site || ''}   ${ci.tel || ''}`));
  p.appendChild(addr);
  return p;
}

// ── B-1 교회소식 ──
function panelNews(S) {
  const p = panel('p-news');
  p.appendChild(topMotto(S));
  p.appendChild(panelHeadBar('교/회/소/식'));
  const list = PE('div', 'news-print');
  const news = (S.bulletin && S.bulletin.news) || [];
  news.filter((n) => n.title || n.body).forEach((n, i) => {
    const item = PE('div', 'np-item');
    const t = PE('div', 'np-t');
    t.appendChild(PE('span', 'np-num', (i + 1) + '.'));
    t.appendChild(PE('span', null, ' ' + (n.title || '')));
    item.appendChild(t);
    if (n.body) item.appendChild(PE('div', 'np-b', n.body));
    list.appendChild(item);
  });
  p.appendChild(list);
  return p;
}

// ── B-2 사랑의나눔 · 토요새벽 · 행사계획 · 지난주헌금 ──
function panelWeeklyInfo(S) {
  const p = panel('p-info');
  p.appendChild(topMotto(S));

  // 사랑의 나눔 (4주)
  p.appendChild(panelHeadBar('사랑의 나눔'));
  const love = S.loveWindow || [];
  const lt = PE('table', 'p-grid');
  const lhr = PE('tr'); lhr.appendChild(PE('th', null, ''));
  love.forEach((r) => lhr.appendChild(PE('th', null, fmtMD(r.week))));
  lt.appendChild(lhr);
  [['친교헌금', 'love_offering'], ['봉사담당', 'love_service']].forEach(([lab, k]) => {
    const tr = PE('tr'); tr.appendChild(PE('th', 'p-grid-rh', lab));
    love.forEach((r) => tr.appendChild(PE('td', null, r[k] || '')));
    lt.appendChild(tr);
  });
  p.appendChild(lt);

  // 토요새벽예배
  p.appendChild(panelHeadBar('토요새벽예배'));
  const sat = (S.bulletin && S.bulletin.saturday) || {};
  const satBox = PE('div', 'p-sat');
  const st = (S.meta && S.meta.service_times && S.meta.service_times.saturday) || '토요일 오전 7시';
  satBox.appendChild(PE('div', 'p-sat-when', sat.date ? `${sat.date} · ${st}` : st));
  [['찬 송', sat.hymn || '다같이'], ['설 교', sat.sermon || ''], ['합심기도', sat.pray || '다같이']]
    .forEach(([k, v]) => {
      const r = PE('div', 'p-sat-row');
      r.appendChild(PE('span', 'p-sat-k', k));
      r.appendChild(PE('span', 'p-sat-v', v));
      satBox.appendChild(r);
    });
  p.appendChild(satBox);

  // 행사계획
  p.appendChild(panelHeadBar('행사계획'));
  const ev = PE('table', 'p-events');
  (S.events || []).forEach((e) => {
    const tr = PE('tr');
    tr.appendChild(PE('td', 'pe-date', fmtMD(e.display_week)));
    tr.appendChild(PE('td', 'pe-label', e.label));
    ev.appendChild(tr);
  });
  p.appendChild(ev);

  // 지난 주 헌금
  const prevW = love.length >= 2 ? fmtMD(love[love.length - 2].week) : '';
  p.appendChild(panelHeadBar(`지난 주 헌금 (${prevW})`));
  const o = (S.bulletin && S.bulletin.offering) || {};
  const ot = PE('div', 'p-offering');
  [['감 사', o.thanks], ['십일조', o.tithe], ['주 정', o.weekly], ['선 교', o.mission]]
    .forEach(([lab, arr]) => {
      if (!arr || !arr.length) return;
      const r = PE('div', 'po-row');
      r.appendChild(PE('span', 'po-k', lab));
      r.appendChild(PE('span', 'po-v', arr.join(' ')));
      ot.appendChild(r);
    });
  const tot = PE('div', 'po-row po-total');
  tot.appendChild(PE('span', 'po-k', '합 계'));
  tot.appendChild(PE('span', 'po-v', o.total ? '$' + o.total : ''));
  ot.appendChild(tot);
  p.appendChild(ot);
  return p;
}

// ── B-3 표지 ──
function panelCover(S) {
  const p = panel('p-cover');
  const ci = (S.meta && S.meta.church_info) || {};
  const motto = (S.meta && S.meta.motto) || {};

  const head = PE('div', 'cover-head');
  head.appendChild(PE('div', 'cover-ribbon', 'You will be a BLESSING'));
  head.appendChild(PE('div', 'cover-name', ci.name || '시애틀 시온장로교회'));
  head.appendChild(PE('div', 'cover-sub', '행복을 전하는 교회'));
  const meta = PE('div', 'cover-meta');
  meta.appendChild(PE('span', null, ci.site || 'www.kzion.net'));
  meta.appendChild(PE('span', 'cover-volno', `제 ${S.vol}권 ${S.no}호`));
  meta.appendChild(PE('span', null, fmtKDate(S.weekId)));
  head.appendChild(meta);
  p.appendChild(head);

  // 예배 순서
  p.appendChild(PE('div', 'cover-order-h', '예 배 순 서'));
  const time = PE('div', 'cover-time', (S.meta && S.meta.service_times && S.meta.service_times.sunday) || '오전10:45');
  p.appendChild(time);

  const pastor = S.pastor || {};
  const thisWeek = (S.serveWindow || [])[0] || {};
  const prayer = pastor.prayer || thisWeek.prayer || '';
  const hymn = (pastor.hymn && pastor.hymn.title) || '';
  const closing = (S.meta && S.meta.closing_hymn && S.meta.closing_hymn.title) || '';
  const offertory = (S.meta && S.meta.offertory_hymn && S.meta.offertory_hymn.title) || '';
  const refs = [pastor.ref].concat(pastor.readings || []).filter(Boolean).join(' · ');

  const order = [
    ['예배의 부름', '인도자', false],
    ['신앙고백', '사도신경 · 다같이', false],
    ['다함께 찬양', '(인도: 블레싱) · 다같이', false],
    ['합심기도', '다같이', false],
    ['축복', '다음 세대를 향한 축복 · 다같이', false],
    ['찬송', hymn + ' · 다같이', false],
    ['대표기도', prayer, false],
    ['특송', (pastor.choir_name || '') + ' · 성가대', false],
    ['봉헌', offertory + ' · 다같이', false],
    ['교회소식', '인도자', false],
    ['성경봉독', refs + ' · 다같이', false],
    ['설교', pastor.title || '', false],
    ['찬송', closing + ' · 다같이', true],
    ['축도', '', true],
  ];
  const ol = PE('div', 'cover-order');
  order.forEach(([k, v, star]) => {
    const r = PE('div', 'co-row');
    const kk = PE('span', 'co-k');
    if (star) kk.appendChild(PE('span', 'co-star', '※'));
    kk.appendChild(document.createTextNode(k));
    r.appendChild(kk);
    r.appendChild(PE('span', 'co-v', v));
    ol.appendChild(r);
  });
  p.appendChild(ol);

  const note = (S.meta && S.meta.standing_note) || {};
  const sn = PE('div', 'cover-note');
  sn.appendChild(PE('div', null, note.text || ''));
  sn.appendChild(PE('div', null, note.offering || ''));
  p.appendChild(sn);

  // 예배를 섬기는 이들 (4주)
  p.appendChild(PE('div', 'cover-serve-h', '예배를 섬기는 이들'));
  const st = PE('table', 'p-grid cover-serve');
  const hr = PE('tr');
  hr.appendChild(PE('th', null, ''));
  hr.appendChild(PE('th', null, '기 도'));
  hr.appendChild(PE('th', null, '안 내'));
  hr.appendChild(PE('th', null, '봉헌위원'));
  st.appendChild(hr);
  (S.serveWindow || []).forEach((r) => {
    const tr = PE('tr');
    tr.appendChild(PE('th', 'p-grid-rh', fmtMD(r.week)));
    tr.appendChild(PE('td', null, r.prayer || ''));
    tr.appendChild(PE('td', null, r.usher || ''));
    tr.appendChild(PE('td', null, r.offering || ''));
    st.appendChild(tr);
  });
  p.appendChild(st);
  return p;
}

function topMotto(S) {
  const motto = (S.meta && S.meta.motto) || {};
  return PE('div', 'p-motto', `${motto.year || ''}년 교회표어 : "${motto.text || ''}" (${motto.ref || ''})`);
}
