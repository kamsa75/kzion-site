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

// 이름 목록 렌더 (§8 표기 규칙) — 7/19 주보 배치 재현:
//   · 이름과 이름 사이는 넓게 (요소 여백)
//   · 두 글자 이름은 안쪽만 좁게 벌려 세 글자 이름과 폭을 맞춤 ("김정"→"김 정")
// 입력은 띄어쓰기로 구분한 이름들. 각 이름을 span으로 그린다.
function nameSpans(text) {
  const frag = document.createDocumentFragment();
  String(text).trim().split(/\s+/).filter(Boolean).forEach((t) => {
    const span = PE('span', 'nm');
    if (/^[가-힣]{2}$/.test(t)) {
      span.classList.add('nm2');
      span.appendChild(PE('span', 'nm2a', t[0]));
      span.appendChild(PE('span', 'nm2b', t[1]));
    } else {
      span.textContent = t;
    }
    frag.appendChild(span);
  });
  return frag;
}

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
  // 인쇄 버튼은 항상 누를 수 있게 한다. 빈 항목은 경고만 표시하고,
  // 누를 때 확인을 한 번 받는다(app.js doPrint). '왜 안 눌리지'를 없앤다.
  window.__printMissing = missing.map((m) => m.label);

  const box = PE('div', 'gate-box');
  if (!missing.length) {
    box.classList.add('gate-ok');
    box.appendChild(PE('span', 'gate-ic', '✓'));
    box.appendChild(PE('span', null, '필수 항목이 모두 채워졌습니다. 인쇄할 수 있습니다.'));
  } else {
    box.classList.add('gate-warn');
    box.appendChild(PE('span', 'gate-ic', '!'));
    const wrap = PE('div', 'gate-list');
    wrap.appendChild(PE('div', 'gate-title', '아직 비어 있는 항목이 있습니다 (그래도 인쇄는 됩니다)'));
    missing.forEach((m) => wrap.appendChild(PE('span', 'gate-chip', m.label)));
    box.appendChild(wrap);
  }
  gate.appendChild(box);
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
  let n = 0;
  // 자동 안내 먼저 (연간 행사표 기반)
  autoNewsItems(S).forEach((a) => {
    n += 1;
    const item = PE('div', 'np-item');
    const t = PE('div', 'np-t');
    t.appendChild(PE('span', 'np-num', n + '.'));
    t.appendChild(PE('span', null, ' ' + a.text));
    item.appendChild(t);
    list.appendChild(item);
  });
  // 수동 소식
  const news = (S.bulletin && S.bulletin.news) || [];
  news.filter((x) => x.title || x.body).forEach((x) => {
    n += 1;
    const item = PE('div', 'np-item');
    const t = PE('div', 'np-t');
    t.appendChild(PE('span', 'np-num', n + '.'));
    t.appendChild(PE('span', null, ' ' + (x.title || '')));
    item.appendChild(t);
    if (x.body) item.appendChild(PE('div', 'np-b', x.body));
    list.appendChild(item);
  });
  p.appendChild(list);
  return p;
}

// ── B-2 사랑의나눔 · 토요새벽 · 행사계획 · 지난주헌금 ──
// 4개 섹션을 그룹으로 묶어 패널 세로를 고르게 채운다(space-between).
function panelWeeklyInfo(S) {
  const p = panel('p-info');
  p.appendChild(topMotto(S));

  const groups = PE('div', 'p-groups');   // 남은 세로를 4개 섹션이 고르게 채움
  p.appendChild(groups);
  const group = (title, buildInner) => {
    const g = PE('div', 'p-group');
    g.appendChild(panelHeadBar(title));
    buildInner(g);
    groups.appendChild(g);
  };

  const love = S.loveWindow || [];

  // 사랑의 나눔 (4주)
  group('사랑의 나눔', (g) => {
    const lt = PE('table', 'p-grid');
    const lhr = PE('tr'); lhr.appendChild(PE('th', null, ''));
    love.forEach((r) => lhr.appendChild(PE('th', null, fmtMD(r.week))));
    lt.appendChild(lhr);
    [['친교헌금', 'love_offering'], ['봉사담당', 'love_service']].forEach(([lab, k]) => {
      const tr = PE('tr'); tr.appendChild(PE('th', 'p-grid-rh', lab));
      love.forEach((r) => tr.appendChild(PE('td', null, r[k] || '')));
      lt.appendChild(tr);
    });
    g.appendChild(lt);
  });

  // 토요새벽예배
  group('토요새벽예배', (g) => {
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
    g.appendChild(satBox);
  });

  // 행사계획
  group('행사계획', (g) => {
    const ev = PE('table', 'p-events');
    (S.events || []).forEach((e) => {
      const tr = PE('tr');
      tr.appendChild(PE('td', 'pe-date', fmtMD(e.display_week)));
      tr.appendChild(PE('td', 'pe-label', e.label));
      ev.appendChild(tr);
    });
    g.appendChild(ev);
  });

  // 지난 주 헌금
  const prevW = love.length >= 2 ? fmtMD(love[love.length - 2].week) : '';
  group(`지난 주 헌금 (${prevW})`, (g) => {
    const o = (S.bulletin && S.bulletin.offering) || {};
    const ot = PE('div', 'p-offering');
    const asStr = (v) => (Array.isArray(v) ? v.join(' ') : (v || ''));
    [['감 사', o.thanks], ['십일조', o.tithe], ['주 정', o.weekly], ['선 교', o.mission]]
      .forEach(([lab, v]) => {
        const txt = asStr(v).trim();
        if (!txt) return;
        const r = PE('div', 'po-row');
        r.appendChild(PE('span', 'po-k', lab));
        const val = PE('span', 'po-v');
        val.appendChild(nameSpans(txt));
        r.appendChild(val);
        ot.appendChild(r);
      });
    const tot = PE('div', 'po-row po-total');
    tot.appendChild(PE('span', 'po-k', '합 계'));
    tot.appendChild(PE('span', 'po-v', o.total ? '$' + o.total : ''));
    ot.appendChild(tot);
    g.appendChild(ot);
  });
  return p;
}

// ── B-3 표지 ──
function panelCover(S) {
  const p = panel('p-cover');
  const ci = (S.meta && S.meta.church_info) || {};
  // 마스트헤드 브랜딩(고정) — 필요 시 meta.masthead로 덮어쓸 수 있게 기본값 제공
  const mh = (S.meta && S.meta.masthead) || {};
  const verse = mh.verse || '내게 복을 주어 내 이름을 창대하게 하리니 너는 복이 될지라 (창 12:1-3)';
  const slogan = mh.slogan || '행복을 전하는 교회';

  const head = PE('div', 'cover-head');

  // 리본
  const ribbon = PE('div', 'cover-ribbon');
  ribbon.appendChild(PE('span', 'rib-wave', '〜'));
  ribbon.appendChild(PE('span', 'rib-txt', 'You will be a BLESSING'));
  ribbon.appendChild(PE('span', 'rib-wave', '〜'));
  head.appendChild(ribbon);

  // 로고 + 교회명
  const brand = PE('div', 'cover-brand');
  const logo = PE('img', 'cover-logo');
  logo.src = '../images/cropped-favicon-270x270.png'; logo.alt = '';
  brand.appendChild(logo);
  const names = PE('div', 'cover-names');
  names.appendChild(PE('div', 'cover-name', ci.name || '시애틀 시온장로교회'));
  names.appendChild(PE('div', 'cover-en', ci.en || 'Korean Zion Presbyterian Church'));
  brand.appendChild(names);
  head.appendChild(brand);

  // 슬로건 배지 + 성구
  const line = PE('div', 'cover-slogan-line');
  line.appendChild(PE('span', 'cover-badge', slogan));
  line.appendChild(PE('span', 'cover-verse', verse));
  head.appendChild(line);

  // www · 권호 · 날짜 바
  const meta = PE('div', 'cover-meta');
  meta.appendChild(PE('span', null, ci.site || 'www.kzion.net'));
  meta.appendChild(PE('span', 'cover-volno', `제 ${S.vol}권 ${S.no}호`));
  meta.appendChild(PE('span', 'cover-date', fmtKDate(S.weekId)));
  head.appendChild(meta);
  p.appendChild(head);

  // 예배 순서
  p.appendChild(PE('div', 'cover-order-h', '예 배 순 서'));
  const time = PE('div', 'cover-time', (S.meta && S.meta.service_times && S.meta.service_times.sunday) || '오전10:45');
  p.appendChild(time);

  const ol = PE('div', 'cover-order');
  buildOrderRows(S).forEach((r) => {   // app 편집과 동일한 값 (공용)
    const row = PE('div', 'co-row');
    const kk = PE('span', 'co-k');
    if (r.star) kk.appendChild(PE('span', 'co-star', '※'));
    kk.appendChild(document.createTextNode(r.label));
    row.appendChild(kk);
    row.appendChild(PE('span', 'co-v', r.detail || ''));
    ol.appendChild(row);
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
