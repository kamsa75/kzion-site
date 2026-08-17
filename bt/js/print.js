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

// 라벨 양끝맞춤 — text-align-last/text-justify:inter-character는 인쇄 렌더러·Safari에서
//   불안정(붙은 글자가 안 벌어짐). 글자를 span으로 쪼개 flex(space-between)로 균등하게 편다:
//   화면·인쇄·모든 브라우저에서 동일하게 동작. 공백은 무시하고 붙여서 균등 배분.
function spreadLabel(cls, text) {
  const el = PE('span', cls);
  const chars = String(text == null ? '' : text).replace(/\s+/g, '').split('');
  if (chars.length < 2) { el.textContent = text || ''; return el; }
  el.classList.add('is-spread');
  chars.forEach((c) => el.appendChild(PE('span', 'sp-ch', c)));
  return el;
}

// 이름 목록 렌더 (§8 표기 규칙) — 7/19 주보 배치 재현:
//   · 이름과 이름 사이는 넓게 (요소 여백)
//   · 두 글자 이름은 안쪽만 좁게 벌려 세 글자 이름과 폭을 맞춤 ("김정"→"김 정")
// 입력은 띄어쓰기로 구분한 이름들. 각 이름을 span으로 그린다.
// 이름 한 개를 그린다 — 두 글자 이름은 세 글자 이름과 같은 폭이 되게 가운데에
// '안 보이는 한 글자'를 끼운다('김정'→'김 정'). em으로 계산하지 않으므로 폰트가 바뀌어도 안 틀어짐.
// ★ 이름을 그리는 곳은 전부 이 함수를 쓴다(헌금·섬기는이들·사랑의나눔) — 모양이 갈라지지 않게.
function fillName(node, name) {
  if (/^[가-힣]{2}$/.test(name)) {
    node.classList.add('nm2');
    const a = PE('span', 'nm2a', name[0]);
    a.setAttribute('data-gap', name[0]);   // CSS가 이 글자를 '안 보이게' 덧그려 딱 한 글자 폭을 만든다
    node.appendChild(a);                   //   (실제 글자가 아니라 복사·검색에 안 잡힘)
    node.appendChild(PE('span', 'nm2b', name[1]));
  } else {
    node.textContent = name;
  }
  return node;
}
// '이름 직분' 형태의 값에서 맨 앞 이름만 두 글자 벌림 적용 ('김정 장로' → '김 정 장로').
//   교인 명단에 있는 이름일 때만 손댄다 — 사용자가 다른 문구로 바꿔 적었으면 그대로 둔다.
function leadNameNode(S, detail) {
  const frag = document.createDocumentFragment();
  const s = String(detail || '');
  const m = s.match(/^(\S+)([\s\S]*)$/);
  const known = m && ((S && S.members) || []).some((x) => x && x.name === m[1]);
  if (m && known && /^[가-힣]{2}$/.test(m[1])) {
    frag.appendChild(fillName(PE('span', 'co-name'), m[1]));
    if (m[2]) frag.appendChild(document.createTextNode(m[2]));
  } else {
    frag.appendChild(document.createTextNode(s));
  }
  return frag;
}
function nameSpans(text) {
  const frag = document.createDocumentFragment();
  String(text).trim().split(/\s+/).filter(Boolean).forEach((t) => {
    frag.appendChild(fillName(PE('span', 'nm'), t));
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

  // 특송 줄은 늘 나가되(순서명만), 곡명이 비었으면 성가대 미입력을 조용히 넘기지 않도록 알림
  const spRow = buildOrderRows(S).find((r) => r.id === 'special');
  if (spRow && !String(spRow.detail || '').trim()) {
    const sp = PE('div', 'gate-order');
    sp.textContent = '🎵 특송 곡명이 아직 비어 있습니다 — 성가대가 PPT에 곡을 넣으면 자동으로 채워집니다';
    gate.appendChild(sp);
  }

  // 이번 주 순서가 기본과 다르면 인쇄 직전 마지막 확인 줄(3단계 — 몰랐던 변화 방지)
  const chg = orderChangeSummary(S);
  if (chg) {
    const ln = PE('div', 'gate-order');
    ln.textContent = '🔔 이번 주 예배순서 (' + buildOrderRows(S).length + '개): ' + chg;
    gate.appendChild(ln);
  }
}

// ---------- 6패널 ----------
function buildSheets(S) {
  const root = document.getElementById('print-root');
  root.innerHTML = '';
  // 모바일 축소용 래퍼 — 데스크톱/인쇄에선 display:contents로 투명(레이아웃 영향 없음),
  // 모바일에선 래퍼가 축소된 크기를 차지해 잘림·겹침 없이 표시(#1)
  const wrap = (sheet) => { const w = PE('div', 'sheet-scale'); w.appendChild(sheet); return w; };

  // A면 (겉)
  const a = PE('div', 'sheet-page');
  a.appendChild(panelSermonNote(S, 0));
  a.appendChild(panelSermonNote(S, 1));
  a.appendChild(panelPraiseServe(S));
  root.appendChild(wrap(a));

  // B면 (속)
  const b = PE('div', 'sheet-page');
  b.appendChild(panelNews(S));
  b.appendChild(panelWeeklyInfo(S));
  b.appendChild(panelCover(S));
  root.appendChild(wrap(b));

  // 슬로건 배지 폭을 www.kzion.net에 맞춤 — min-width로 주면 www만큼 넓히되(매칭),
  // 글자가 더 넓은 폰트에선 배지가 늘어나 절대 안 삐져나옴(잘림 없음·안정적).
  // offsetWidth = 레이아웃 폭이라 모바일 transform:scale 영향 없음. goPrint가 화면 먼저 띄운 뒤 build.
  root.querySelectorAll('.p-cover').forEach((cover) => {
    const www = cover.querySelector('.cover-meta > :first-child');
    const badge = cover.querySelector('.cover-badge');
    if (www && badge && www.offsetWidth > 0) badge.style.minWidth = www.offsetWidth + 'px';
  });

  fitSheets(true);   // 새로 그렸으니 강제로 다시 맞춘다
}

// 화면 폭에 맞춰 주보를 축소한다 — 폭 구간을 손으로 적지 않고 그때그때 계산(기기 무관).
//   래퍼가 '축소된 크기'를 레이아웃으로 차지하고, 그 안의 시트를 transform으로 줄인다
//   (transform은 글자까지 균일 축소 → iOS 글자 팽창 회피, 래퍼 덕에 잘림·겹침 없음)
const SHEET_W = 1344, SHEET_H = 816;   // 14in × 8.5in @96dpi
let fitLastW = -1, fitWatching = false;
function fitSheets(force) {
  const root = document.getElementById('print-root');
  if (!root) return;
  const cs = getComputedStyle(root);
  const avail = root.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  if (avail <= 0) return;                   // 인쇄 화면이 숨겨져 있을 때는 건드리지 않는다
  if (!force && Math.abs(avail - fitLastW) < 0.5) return;
  fitLastW = avail;
  const scale = Math.min(1, avail / SHEET_W);
  root.querySelectorAll('.sheet-scale').forEach((w) => {
    if (scale >= 1) {                       // 데스크톱 — 원본 크기 그대로(래퍼는 투명)
      w.classList.remove('is-fit');
      w.style.removeProperty('--fit-w');
      w.style.removeProperty('--fit-h');
      w.style.removeProperty('--fit-s');
      return;
    }
    w.style.setProperty('--fit-w', Math.round(SHEET_W * scale) + 'px');
    w.style.setProperty('--fit-h', Math.round(SHEET_H * scale) + 'px');
    w.style.setProperty('--fit-s', String(scale));
    w.classList.add('is-fit');
  });
  // 화면 폭 변화 감지 — resize 이벤트가 안 오는 경우(탭 전환·분할 화면 등)까지 잡는다
  if (!fitWatching && typeof ResizeObserver === 'function') {
    fitWatching = true;
    new ResizeObserver(() => fitSheets()).observe(root);
  }
}
// 회전·창 크기 변경에도 다시 맞춘다 (아이패드 가로↔세로)
window.addEventListener('resize', () => fitSheets());
window.addEventListener('orientationchange', () => setTimeout(() => fitSheets(true), 60));

// ── 패널 공통: 상단 갈색 제목 바 ──
function panelHeadBar(title) {
  const bar = PE('div', 'p-headbar', title);
  return bar;
}
function panel(cls) { return PE('div', 'panel ' + (cls || '')); }

// 갈색 제목바 + 내용 한 덩어리(그룹). pinBottom=true면 패널 하단에 고정(margin-top:auto)
function buildGroup(title, buildInner, pinBottom) {
  const g = PE('div', 'p-group' + (pinBottom ? ' pin-bottom' : ''));
  g.appendChild(panelHeadBar(title));
  buildInner(g);
  return g;
}

// ── A-1·A-2 설교노트 — 제목 수정 가능 + 이미지·본문 선택(#3·#4). 비우면 손글씨용 빈 줄 ──
function panelSermonNote(S, idx) {
  const p = panel('p-note');
  const np = ((S && S.bulletin && S.bulletin.notePanels) || [])[idx] || {};
  p.appendChild(panelHeadBar((np.title && np.title.trim()) || '설교노트'));
  const hasImg = !!np.image_data;
  const hasText = !!(np.text && np.text.trim());
  if (hasImg || hasText) {
    const box = PE('div', 'note-content');
    if (hasImg) { const img = PE('img', 'note-img'); img.src = np.image_data; box.appendChild(img); }
    if (hasText) box.appendChild(PE('div', 'note-text', np.text));
    p.appendChild(box);
  } else {
    const lines = PE('div', 'note-lines');
    for (let i = 0; i < 22; i++) lines.appendChild(PE('div', 'note-line'));
    p.appendChild(lines);
  }
  return p;
}

// ── A-3 예배찬양(자유) + 섬기는 사람들 + 주소 ──
function panelPraiseServe(S) {
  const p = panel('p-praise');
  p.appendChild(panelHeadBar('예배찬양'));

  const free = PE('div', 'praise-free');
  const pp = (S.bulletin && S.bulletin.praise_panel) || {};
  const praiseImg = pp.image_data || pp.image_url || '';
  if (pp.mode === 'text' && pp.text) {
    free.appendChild(PE('div', 'praise-text', pp.text));
  } else if (praiseImg) {
    const img = PE('img', 'praise-img'); img.src = praiseImg;
    free.appendChild(img);
  }
  // 비어 있으면 안내문구 없이 빈 공간(#3)
  p.appendChild(free);

  // 섬기는 사람들 (준고정) — 원본 주보 격자 구조(#6)
  p.appendChild(serveTable(S));

  // 주소
  const ci = (S.meta && S.meta.church_info) || {};
  const addr = PE('div', 'p-addr');
  addr.appendChild(PE('div', null, ci.address || ''));
  addr.appendChild(PE('div', null, `${ci.site || ''}   ${ci.tel || ''}`));
  p.appendChild(addr);
  return p;
}

// 섬기는 사람들 표 — 원본 주보 격자(#6). 준고정 staff_panel.rows를 라벨로 배치.
//   핵심 라벨(담임/협동/유초/뮤직/시무)이 있으면 원본 격자, 없으면 단순 2열로 폴백(안전).
function serveTable(S) {
  const rows = staffRows(S);   // 그 주에 못 박아 둔 기록 우선 (공용)
  const box = PE('div', 'serve-box');
  box.appendChild(PE('div', 'serve-h', '섬기는 사람들'));
  const get = (kw) => { const r = rows.find((x) => (x.label || '').indexOf(kw) >= 0); return r ? (r.value || '') : null; };
  const senior = get('담임'); const assoc = get('협동'); const youth = get('유초');
  const music = get('뮤직'); const elder = get('시무');
  const t = PE('table', 'serve-table');
  const td = (cls, txt, span) => { const c = PE('td', cls, txt); if (span) c.colSpan = span; return c; };

  if ([senior, assoc, youth, music, elder].every((v) => v !== null)) {
    // 협동목사도 뮤직디렉터처럼 [색상칸 라벨][이름칸] 구조(#5)
    const r1 = PE('tr');
    r1.appendChild(td('st-k', '담임목사'));
    r1.appendChild(td('st-v', senior));
    r1.appendChild(td('st-k', '협동목사'));
    r1.appendChild(td('st-v', assoc));
    t.appendChild(r1);

    const r2 = PE('tr');
    r2.appendChild(td('st-k', '유초등부'));
    r2.appendChild(td('st-v', youth));
    r2.appendChild(td('st-k', '뮤직디렉터'));
    r2.appendChild(td('st-v', music));
    t.appendChild(r2);

    // 시무장로 이름은 헌금 이름처럼 넓게(#4)
    const r3 = PE('tr');
    r3.appendChild(td('st-k', '시무장로'));
    const c3 = td('st-v', null, 3);
    c3.appendChild(nameSpans(elder));
    r3.appendChild(c3);
    t.appendChild(r3);
  } else {
    rows.forEach((r) => {
      const tr = PE('tr');
      tr.appendChild(td('st-k', r.label || ''));
      tr.appendChild(td('st-v', r.value || '', 3));
      t.appendChild(tr);
    });
  }
  box.appendChild(t);
  return box;
}

// ── B-1 교회소식 ──
function panelNews(S) {
  const p = panel('p-news');
  p.appendChild(topMotto(S));
  p.appendChild(panelHeadBar('교회소식'));
  const list = PE('div', 'news-print');
  let n = 0;
  // 자동 안내 먼저 (연간 행사표 기반)
  autoNewsItems(S).forEach((a) => {
    n += 1;
    const item = PE('div', 'np-item');
    const t = PE('div', 'np-t np-plain');   // 자동 안내 본문은 일반 굵기(#3)
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

  // 행사계획 — 공지 성격이라 교회소식과 같은 면 하단에 고정
  p.appendChild(buildGroup('행사계획', (g) => {
    const ev = PE('table', 'p-events');
    bulletinEvents(S).forEach((e) => {
      const tr = PE('tr');
      tr.appendChild(PE('td', 'pe-date', e.dateText));
      tr.appendChild(PE('td', 'pe-label', e.label));
      ev.appendChild(tr);
    });
    g.appendChild(ev);
  }, true));
  return p;
}

// ── B-2 사랑의나눔 · 토요새벽 · 행사계획 · 지난주헌금 ──
// 4개 섹션을 그룹으로 묶어 패널 세로를 고르게 채운다(space-between).
function panelWeeklyInfo(S) {
  const p = panel('p-info');
  p.appendChild(topMotto(S));

  const groups = PE('div', 'p-groups');   // 토요새벽 → 사랑의 나눔 → 지난주 헌금(하단 고정)
  p.appendChild(groups);

  const love = S.loveWindow || [];

  // 토요새벽예배 (제일 위) — 날짜 자동, 설교 본문·담당자
  groups.appendChild(buildGroup('토요새벽예배', (g) => {
    const sat = (S.bulletin && S.bulletin.saturday) || {};
    const satBox = PE('div', 'p-sat');
    const date = (sat.date && sat.date.trim()) || (saturdayOf(S) + ' 오전 7시');
    satBox.appendChild(PE('div', 'p-sat-when', date));
    const pastorName = pastorNameOf(S);   // 그 주 기록 우선 (공용)
    const defPreacher = pastorName ? pastorName + ' 목사' : '';
    const preacher = (sat.preacher && sat.preacher.trim()) || defPreacher;
    const sermonLine = [sat.sermon, preacher].filter((x) => x && x.trim()).join(' · ');
    [['찬송', sat.hymn || '다같이'], ['설교', sermonLine], ['합심기도', sat.pray || '다같이']]
      .forEach(([k, v]) => {
        const r = PE('div', 'p-sat-row');
        r.appendChild(spreadLabel('p-sat-k', k));
        r.appendChild(PE('span', 'p-sat-v', v));
        satBox.appendChild(r);
      });
    g.appendChild(satBox);
  }));

  // 사랑의 나눔 (4주) — 헌금과 한 세트로 하단에 붙도록 여기서부터 하단 고정
  groups.appendChild(buildGroup('사랑의 나눔', (g) => {
    const lt = PE('table', 'p-grid p-love');
    const lhr = PE('tr'); lhr.appendChild(PE('th', null, ''));
    love.forEach((r) => lhr.appendChild(PE('th', null, fmtMDKorean(r.week))));
    lt.appendChild(lhr);
    [['친교헌금', 'love_offering'], ['봉사담당', 'love_service']].forEach(([lab, k]) => {
      const tr = PE('tr'); const rh = PE('th', 'p-grid-rh');
      rh.appendChild(spreadLabel('rh-inner', lab)); tr.appendChild(rh);
      love.forEach((r) => {
        const cell = PE('td', null);
        const v = Array.isArray(r[k]) ? r[k].join(' ') : (r[k] || '');
        // 친교헌금은 두 분이면 두 줄(#6-1)
        if (k === 'love_offering' && v.trim()) {
          v.trim().split(/\s+/).forEach((n) => cell.appendChild(fillName(PE('div', 'love-name'), n)));
        } else {
          cell.textContent = v;
        }
        tr.appendChild(cell);
      });
      lt.appendChild(tr);
    });
    g.appendChild(lt);
  }, true));   // 사랑나눔부터 하단 고정 → 헌금과 세트로 아래에 붙음

  // 지난 주 헌금 — 사랑의 나눔 바로 아래(세트). 이번 주의 지난 주(사랑의나눔 창이 미래라 독립 계산)
  const prevW = fmtMDKorean(addDaysISO(S.weekId, -7));   // 예: 7월 19일
  groups.appendChild(buildGroup(`지난 주 헌금 · ${prevW}`, (g) => {
    const o = (S.bulletin && S.bulletin.offering) || {};
    const ot = PE('div', 'p-offering');
    const asStr = (v) => (Array.isArray(v) ? v.join(' ') : (v || ''));
    // 이름을 그리드 고정 칸에 하나씩 → 가변폭 폰트여도 열이 완벽 정렬(기존 디자인 유지)
    const poRow = (lab, txt) => {
      const r = PE('div', 'po-row');
      r.appendChild(spreadLabel('po-k', lab));
      const val = PE('div', 'po-v po-names');
      // 저장값이 '김 정'처럼 갈라져 있어도 여기서 한 번 더 합친다(옛 데이터 보호, 공용 로직)
      mergeSplitNames(txt, S.members).text.split(/\s+/).filter(Boolean)
        .forEach((n) => val.appendChild(fillName(PE('span', 'po-name'), n)));
      r.appendChild(val);
      return r;
    };
    [['감사', o.thanks], ['십일조', o.tithe], ['주정', o.weekly], ['선교', o.mission]]
      .forEach(([lab, v]) => {
        const txt = asStr(v).trim();
        if (txt) ot.appendChild(poRow(lab, txt));
      });
    // 특별헌금(맥추·친교 등) — 수동 추가분, 선교 다음·합계 위
    (o.extras || []).forEach((ex) => {
      const lab = ((ex && ex.label) || '').trim();
      const txt = asStr(ex && ex.names).trim();
      if (lab || txt) ot.appendChild(poRow(lab, txt));
    });
    const tot = PE('div', 'po-row po-total');
    tot.appendChild(spreadLabel('po-k', '합계'));
    // 저장값이 어떻든 출력할 때 다시 표기 — 세 자리 콤마 + $·콤마 중복 방지 (공용 fmtMoney)
    const totVal = fmtMoney(o.total);
    // 숫자일 때만 $를 붙인다 ('미집계' 같은 글자에 $가 붙지 않게)
    tot.appendChild(PE('span', 'po-v', totVal ? (/^\d/.test(totVal) ? '$' + totVal : totVal) : ''));
    ot.appendChild(tot);
    g.appendChild(ot);
  }));   // 사랑나눔이 하단 고정이라 헌금은 그 아래에 자연히 붙음
  return p;
}

// ── B-3 표지 ──
function panelCover(S) {
  const p = panel('p-cover');
  const ci = (S.meta && S.meta.church_info) || {};
  // 마스트헤드 브랜딩(고정) — 필요 시 meta.masthead로 덮어쓸 수 있게 기본값 제공
  const mh = (S.meta && S.meta.masthead) || {};
  const verse = mh.verse || '네게 복을 주어 네 이름을 창대하게 하리니 너는 복이 될지라 (창 12:1-3)';
  const slogan = mh.slogan || '행복을 전하는 교회';

  const head = PE('div', 'cover-head');

  // 리본
  const ribbon = PE('div', 'cover-ribbon');
  ribbon.appendChild(PE('span', 'rib-wave', '〜'));
  ribbon.appendChild(PE('span', 'rib-txt', 'You will be a BLESSING'));
  ribbon.appendChild(PE('span', 'rib-wave', '〜'));
  head.appendChild(ribbon);

  // 교회명 (로고 없음 — #2)
  head.appendChild(PE('div', 'cover-name', ci.name || '시애틀 시온장로교회'));
  head.appendChild(PE('div', 'cover-en', ci.en || 'Korean Zion Presbyterian Church'));

  // 슬로건 배지 + 성구 — 한 줄에 [배지] 성구 (원본 주보 배치, #4)
  const tagline = PE('div', 'cover-tagline');
  tagline.appendChild(PE('span', 'cover-badge', slogan));
  tagline.appendChild(PE('span', 'cover-verse', verse));
  head.appendChild(tagline);

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
    const kk = PE('span', 'co-k' + (r.star ? ' co-k-star' : ''));
    if (r.star) kk.appendChild(PE('span', 'co-star', '※'));
    kk.appendChild(spreadLabel('co-lab', r.label));   // 라벨 전체 폭 양끝맞춤(설교와 동일), ※는 앞에 매달기
    row.appendChild(kk);
    const vv = PE('span', 'co-v' + (r.bold ? ' co-v-bold' : ''));
    // 대표기도는 맨 앞이 사람 이름이라 두 글자면 벌린다 ('김정 장로' → '김 정 장로')
    if (r.id === 'prayer') vv.appendChild(leadNameNode(S, r.detail || ''));
    else vv.textContent = r.detail || '';
    row.appendChild(vv);
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
    tr.appendChild(PE('th', 'p-grid-rh', fmtMDKorean(r.week)));
    // 이름 사이 넓게 + 두 글자 정렬 (#2 — 헌금과 동일)
    [r.prayer, r.usher, r.offering].forEach((v) => {
      const td = PE('td', 'nm-cell');
      td.appendChild(nameSpans(v || ''));
      tr.appendChild(td);
    });
    st.appendChild(tr);
  });
  p.appendChild(st);
  return p;
}

function topMotto(S) {
  // 그 해 표어 → 없으면 기존 값 (문장 조립은 config.js mottoLine 한 곳에서만)
  return PE('div', 'p-motto', mottoLine(mottoOf(S)));
}
