/* ============================================================
   주보 엔진 설정 — 여기 값은 전부 공개 가능(비밀 아님).
   비밀 키는 Supabase Edge Function 안에만 존재한다.
   ============================================================ */

const BT_CONFIG = {
  FUNCTIONS_URL: 'https://kwezbhanfxludoafmmem.supabase.co/functions/v1',
};

// 다가오는 주일을 'YYYY년 M월 D일'로 (표시용)
function fmtKDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
// 요일 포함 짧은 표기 'M/D' (4주 표 헤더용)
function fmtMD(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}
// 'M월 D일' (인쇄 표 날짜용 — 사랑의나눔·행사계획·섬기는이들)
function fmtMDKorean(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일`;
}
// 교회표어 — 연도별로 보관한다(bulletin_meta 키 motto_2026 …). 편집칸·인쇄 공용.
//   strict=true(편집 화면): 그 해 것만. 없으면 기존 단일 키 motto가 같은 해일 때만 보여준다.
//   strict=false(인쇄): 그 해 것이 없으면 기존 motto를 그대로 쓴다 — 연도별로 옮기기 전에도
//   지금 주보가 똑같이 나오도록 하는 안전장치.
function mottoOf(S, year, strict) {
  const meta = (S && S.meta) || {};
  const y = Number(year) || Number(String((S && S.weekId) || '').slice(0, 4)) || 0;
  const m = meta['motto_' + y];
  if (m && String(m.text || '').trim()) return { year: y, text: m.text || '', ref: m.ref || '' };
  const legacy = meta.motto || {};
  const hasLegacy = String(legacy.text || '').trim();
  if (strict) {
    return (hasLegacy && Number(legacy.year) === y)
      ? { year: y, text: legacy.text || '', ref: legacy.ref || '' }
      : { year: y, text: '', ref: '' };
  }
  return { year: Number(legacy.year) || y, text: legacy.text || '', ref: legacy.ref || '' };
}
// 주보에 실리는 한 줄 — 따옴표·괄호는 여기서만 붙인다(편집 미리보기와 인쇄가 어긋나지 않게)
function mottoLine(m) {
  const text = String((m && m.text) || '').trim();
  if (!text) return '';
  const ref = String((m && m.ref) || '').trim();
  return `${(m && m.year) || ''}년 교회표어 : "${text}"` + (ref ? ` (${ref})` : '');
}
// 띄어쓰기로 갈라진 이름 합치기 — 편집칸·인쇄 공용.
//   한국 사람 이름에 한 글자짜리는 없다 → 한 글자 토막은 사람이 아니라 조각이다.
//   그래서 '김 정'을 두 사람으로 읽지 않고 '김정' 한 사람으로 합친다. ('박 세영' → '박세영')
//   ※ 합치기는 한 글자 토막이 있을 때만 일어난다 — 멀쩡한 이름 둘을 붙일 위험이 없다.
//   반환: { text: 합친 문자열, fixed: [합쳐진 이름들] }
function mergeSplitNames(text, members) {
  const toks = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  if (toks.length < 2) return { text: toks.join(' '), fixed: [] };
  const roster = {};
  (members || []).forEach((m) => { if (m && m.name) roster[m.name] = 1; });
  const isFrag = (t) => /^[가-힣]$/.test(t);
  const out = [], fixed = [];
  let i = 0;
  while (i < toks.length) {
    let take = 0;
    // ① 교인 명단과 대조 — 뒤 토큰 2~3개를 붙여 실제 이름이 되면 합친다(한 글자 토막이 낄 때만)
    for (let n = 3; n >= 2 && !take; n--) {
      if (i + n > toks.length) continue;
      const slice = toks.slice(i, i + n);
      if (!slice.some(isFrag)) continue;
      if (roster[slice.join('')]) take = n;
    }
    // ② 명단에 없어도 한 글자 토막이면 다음 토큰과 붙인다 (방문자 이름 등)
    if (!take && isFrag(toks[i]) && i + 1 < toks.length) take = 2;
    if (take) {
      const name = toks.slice(i, i + take).join('');
      out.push(name); fixed.push(name); i += take;
    } else { out.push(toks[i]); i += 1; }
  }
  return { text: out.join(' '), fixed };
}
// 인쇄에서 보이는 모양 — 두 글자 이름은 안쪽을 벌려 세 글자와 폭을 맞춘다('김정' → '김 정')
function printedNameForm(name) {
  return /^[가-힣]{2}$/.test(name) ? name[0] + ' ' + name[1] : name;
}
// 조사 '으로/로' — 받침이 없거나 ㄹ 받침이면 '로' (이슬로 ○ / 이슬으로 ✕)
function josaRo(text) {
  const t = String(text || '').trim();
  const c = t.charCodeAt(t.length - 1);
  if (!(c >= 0xAC00 && c <= 0xD7A3)) return '로';
  const jong = (c - 0xAC00) % 28;
  return (jong === 0 || jong === 8) ? '로' : '으로';   // 8 = ㄹ
}
// 금액 표기 — 세 자리마다 콤마. 편집칸·인쇄 공용(둘이 어긋나지 않게 한 곳에서만 계산).
//   · $·콤마·공백을 먼저 전부 떼고 다시 넣으므로 사용자가 콤마를 넣어도 중복되지 않는다
//   · 소수점(센트)은 그대로 두고 정수 부분에만 넣는다 — 1316.00 → 1,316.00
//   · 숫자가 아니면 손대지 않는다 (예: '미집계')
function fmtMoney(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const bare = s.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d*)?$/.test(bare)) return s;
  const dot = bare.indexOf('.');
  const int = dot < 0 ? bare : bare.slice(0, dot);
  const dec = dot < 0 ? '' : bare.slice(dot);          // '.' 포함(입력 중 '1316.'도 유지)
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + dec;
}
// n일 뒤 날짜 (UTC 정오 기준 — 서머타임 무관)
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}
// 한글 받침에 따라 조사 선택 (이/가, 은/는 …)
//   끝의 괄호부는 통째로 떼고 판단 — "고난주간(3/30-4/4)"→'주간' 기준 '이', "공동의회(…)"→'회' 기준 '가'
function pickJosa(text, withBatchim, without) {
  const t = String(text).replace(/\([^()]*\)\s*$/, '').replace(/[)\s\d]+$/, '');
  const c = t.charCodeAt(t.length - 1);
  if (c >= 0xAC00 && c <= 0xD7A3) return ((c - 0xAC00) % 28 !== 0) ? withBatchim : without;
  return without;
}
// 직분 표기 (§8·B9) — 대표기도 이름 뒤 직분. 명단 title → 주보 표기
function orderTitleLabel(S, name) {
  if (!name) return '';
  const m = (S.members || []).find((x) => x.name === name);
  const t = (m && m.title) || '';
  if (t.indexOf('목사') >= 0) return '목사';
  if (t.indexOf('전도사') >= 0) return '전도사';
  if (t.indexOf('간사') >= 0) return '간사';
  if (t.indexOf('장로') >= 0) return '장로';      // 시무장로·장로·명예장로
  if (t.indexOf('안수집사') >= 0) return '집사';
  if (t.indexOf('권사') >= 0) return '권사';       // 권사·명예권사
  if (t.indexOf('서리집사') >= 0) return '집사';
  return '';
}
// 특송 줄 정규화 — "곡제목 성가대"/"곡제목 OOO"처럼 점 없이 넣어도 마지막 낱말(담당) 앞에
//   " · "를 기본으로 넣어준다("사도신경 · 다같이"처럼). 이미 · 있으면 그대로.
function formatSpecial(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t || t.indexOf('·') >= 0) return t;
  const parts = t.split(/\s+/);
  if (parts.length < 2) return t;   // 담당(마지막 낱말)이 없으면 그대로
  return parts.slice(0, -1).join(' ') + ' · ' + parts[parts.length - 1];
}
// 특송/성가대 줄 — PPT 성가대 섹션(songs, role=choir) 값에서
//   라벨이 이미 '특송'이므로 중복 없이: "곡명 · 성가대" 또는 "곡명 · OOO"
function choirLine(S) {
  const songs = S.choirSongs || [];
  return songs.map((s) => {
    const nm = (s.name || '').trim();
    const perf = (s.song_performer || s.performer || '').trim();
    const special = (s.song_type || s.songType) === 'special';
    const tail = special ? (perf || '특송') : '성가대';
    return nm ? nm + ' · ' + tail : tail;
  }).filter(Boolean).join(' / ');
}
// 특송 출처 — 성가대가 PPT에 넣은 '이번 주' 곡인지 한눈에(존재 여부 + 마지막 입력일).
//   서버가 week_id로만 조회하므로 지난주 곡이 섞일 수 없다. updated_at은 UTC라 PT 날짜로 변환.
function choirMeta(S) {
  const songs = (S.choirSongs || []).filter((s) => String(s.name || '').trim());
  if (!songs.length) return { has: false, when: '' };
  let latest = '';
  songs.forEach((s) => { const u = String(s.updated_at || ''); if (u > latest) latest = u; });
  let when = '';
  if (latest) {
    const dt = new Date(latest);
    if (!isNaN(dt.getTime())) {
      when = dt.toLocaleDateString('ko-KR',
        { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric' });
    }
  }
  return { has: true, when };
}

// 토요새벽예배 날짜 'M월 D일' — 이번 주일(weekId) 다음의 다가오는 토요일(주일+6일)
//   예: 주일 8/2 → 토요 8/8. (주보는 주일에 배부되므로 지나간 전날 토요일이 아닌 다음 토요일)
function saturdayOf(S) {
  const sat = addDaysISO(S.weekId, 6);
  const [, m, d] = sat.split('-').map(Number);
  return `${m}월 ${d}일`;
}
// 섬기는 사람들 — 그 주에 못 박아 둔 기록이 있으면 그것을 쓴다(지난 주보가 나중에 안 바뀌게).
//   서버가 주보를 열 때 그 주 기록을 만들어 staffPanel로 실어 보낸다. 없으면 현재 값으로 폴백.
function staffRows(S) {
  const snap = S && S.staffPanel;
  if (snap && Array.isArray(snap.rows) && snap.rows.length) return snap.rows;
  return (S && S.meta && S.meta.staff_panel && S.meta.staff_panel.rows) || [];
}
function staffValueOf(S, label) {
  return (staffRows(S).find((r) => (r.label || '') === label) || {}).value || '';
}
function pastorNameOf(S) {
  return staffValueOf(S, '담임목사');
}
// 예배순서 행 — app(편집)·print(인쇄) 공용. detail = 사용자 오버라이드 ?? 자동 기본값
function buildOrderRows(S, opts) {
  const p = S.pastor || {};
  const meta = S.meta || {};
  const tw = (S.serveWindow || [])[0] || {};
  const ov = (S.bulletin && S.bulletin.orderOverrides) || {};
  const prayerName = p.prayer || tw.prayer || '';
  const pt = orderTitleLabel(S, prayerName);
  const defaults = {
    call: '인도자',
    creed: '사도신경 · 다같이',
    praise: '(인도: 블레싱) · 다같이',
    together: '다같이',
    blessing: '다음 세대를 향한 축복 · 다같이',
    hymn: (p.hymn && p.hymn.title) || '',
    prayer: prayerName ? (prayerName + (pt ? ' ' + pt : '')) : '',
    special: choirLine(S),
    offering: (meta.offertory_hymn && meta.offertory_hymn.title) || '',
    news: '인도자',
    reading: p.ref || '',
    sermon: p.title || '',
    communion: '다같이',
    closing: (meta.closing_hymn && meta.closing_hymn.title) || '',
    benediction: pastorNameOf(S),
  };
  let rows = [
    { id: 'call', label: '예배의 부름' },
    { id: 'creed', label: '신앙고백' },
    { id: 'praise', label: '다함께 찬양' },
    { id: 'together', label: '합심기도' },
    { id: 'blessing', label: '축복' },
    { id: 'hymn', label: '찬송' },
    { id: 'prayer', label: '대표기도' },
    { id: 'special', label: '특송' },
    { id: 'offering', label: '봉헌' },
    { id: 'news', label: '교회소식' },
    { id: 'reading', label: '성경봉독' },
    { id: 'sermon', label: '설교' },
    { id: 'closing', label: '찬송', star: true },
    { id: 'benediction', label: '축도', star: true },
  ];
  // 편집 화면 전용 옵션: 뺀 순서를 지우지 않고 제자리에 removed 표시로 남김(바로 되살리기),
  //   특송이 비어 있어도 편집 화면엔 칸을 보여준다(인쇄에서는 자동 제외 — 아래 emptySpecial)
  const includeRemoved = !!(opts && opts.includeRemoved);
  // 성찬식 = 성찬식 예정 주간이면 설교 뒤에 자동삽입(§6-4). 이번 주만 빼면 hideCommunion.
  //   플래그(is_communion) 외에 label의 '성찬' 단어로도 감지(플래그 깜빡 대비, isCommunionWeek)
  if (isCommunionWeek(S)) {
    const hideC = !!(S.bulletin && S.bulletin.hideCommunion);
    if (!hideC || includeRemoved) {
      const si = rows.findIndex((r) => r.id === 'sermon');
      const cRow = { id: 'communion', label: '성찬식' };
      if (hideC) cRow._removed = true;   // 편집 화면에선 제자리에 '뺌' 표시
      rows.splice(si + 1, 0, cRow);
    }
  }
  // 이번 주만 수동 조정(3단계) — 뺀 순서 제외 + 추가 순서 삽입.
  //   주차 데이터(bulletin)에만 저장되므로 다음 주엔 자동으로 기본 순서로 원복.
  const bws = S.bulletin || {};
  const removedSet = new Set(bws.orderRemoved || []);
  if (removedSet.size) {
    rows = includeRemoved
      ? rows.map((r) => (removedSet.has(r.id) ? Object.assign({}, r, { _removed: true }) : r))
      : rows.filter((r) => !removedSet.has(r.id));
  }
  (bws.orderExtras || []).forEach((x) => {
    if (!x || !String(x.label || '').trim()) return;
    const marker = { id: x.id, label: x.label, _extra: x };
    const i = rows.findIndex((r) => r.id === x.afterId);
    if (i >= 0) rows.splice(i + 1, 0, marker); else rows.push(marker);
  });
  // 공유 필드 = 한 곳에서만 입력(값 갈라짐 차단). 주보에선 읽기전용으로 표시.
  //   설교·본문·찬송·대표기도 = PPT에서 입력(PPT 값 없으면 로테이션 자동값으로 대체)
  const SHARED = { sermon: 'PPT', reading: 'PPT', hymn: 'PPT', prayer: 'PPT' };
  // 특송은 늘 있는 순서라 곡명이 비어도 줄을 남긴다(찬송·성경봉독·설교와 동일 — 순서명만 나오고 내용은 빈칸).
  //   ※ 예전에는 비면 줄째 뺐는데, 성가대 미입력 주에 순서가 통째로 사라져 혼란을 줘서 되돌림(2026-08-10)
  return rows.map((r) => {
    if (r._removed) {   // 편집 화면 전용 — 제자리에 '뺌' 표시로 남겨 바로 되살리기(인쇄엔 안 나감)
      return { id: r.id, label: r.label, star: !!r.star, removed: true };
    }
    if (r._extra) {   // 이번 주 수동 추가 순서 — 내용은 orderExtras에 저장(편집 화면에서 바인딩)
      return { id: r.id, label: r.label, star: false, bold: false,
        detail: String(r._extra.detail || ''), overridden: false, readonly: false,
        source: null, extra: true };
    }
    const src = SHARED[r.id];
    let detail = src ? defaults[r.id] : (ov[r.id] !== undefined ? ov[r.id] : defaults[r.id]);
    if (r.id === 'special') detail = formatSpecial(detail);   // 특송 곡명·담당 사이 점 자동
    return {
      id: r.id, label: r.label, star: !!r.star,
      bold: r.id === 'sermon',   // 설교 제목 자동 볼드
      detail,
      overridden: !src && ov[r.id] !== undefined,
      readonly: !!src,
      source: src || null,
    };
  });
}

// 성찬 위원 안내 — 성찬식(연 3회) 전 주에만 교회소식 카드에 '넣기' 버튼으로 제안.
//   자동 삽입 아님(버튼을 눌러야 들어감), 넣은 뒤에는 일반 소식처럼 자유 수정·삭제 가능.
const COMMUNION_NOTICE_TITLE = '성찬 위원 안내';
function communionNoticeBody(dateText) {
  return `다음 주(${dateText}) 예배 중 성찬식이 거행됩니다. 성찬 위원(담당 장로/집사)으로 봉사하시는 분들께서는 아래 지침을 준수해 주시기 바랍니다.
복장: 단정하고 경건한 복장 (정장 또는 비즈니스 캐주얼)
위생 및 예식 준비: 성찬의 거룩함과 위생을 위해 제공해 드리는 흰 장갑을 반드시 착용해 주시기 바랍니다.
✝️ 성찬기 관리 및 취급 수칙
1. 지정 담당자 전담 관리
 성찬기의 보관, 세척, 준비, 정리 전 과정은 당회나 성찬위원회에서 지정한 전담 담당자만 수행합니다.
2. 준비 및 관리 시 주의사항
 사전 위생: 성찬기를 다루기 전 반드시 손을 깨끗이 씻고, 필요시 전용 장갑을 착용합니다.
 세척 및 보관: 일반 식기와 섞이지 않도록 성찬기 전용 세척 도구를 사용하며, 세척 후 물기를 완전히 제거하여 전용 보관함에 은밀하고 안전하게 보관합니다.
 이동 시 주의: 떡과 포도주를 담은 후 이동할 때는 반드시 두 손으로 소중히 받쳐 들고 이동합니다.`;
}
// 다음 주일이 성찬식이면 그 날짜('11월 1일')를, 아니면 null — 플래그 + label 단어 감지
function communionNextWeekDate(S) {
  const nextWk = addDaysISO(S.weekId, 7);
  const hit = (S.events || []).some((e) => e.display_week === nextWk
    && (e.is_communion || String(e.label || '').indexOf('성찬') >= 0));
  return hit ? fmtMDKorean(nextWk) : null;
}

// 행사 문구 분리 — 괄호 밖 쉼표만 기준(괄호 안 쉼표 보호).
//   "일광절약시간 종료, 성찬식" → 2건 / "공동의회(예산, 결산…)" → 1건 그대로
function splitEventLabel(label) {
  const s = String(label == null ? '' : label);
  const parts = []; let buf = ''; let depth = 0;
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; } else buf += ch;
  }
  parts.push(buf);
  const out = parts.map((p) => p.trim()).filter(Boolean);
  return out.length ? out : [s.trim()].filter(Boolean);
}

// 일광절약시간 전용 문구 — label의 시작/종료 우선, 없으면 월로 판단(상반기=시작).
//   전 주에만 안내하고 당일엔 생략(이미 지난 안내) — autoNewsItems에서 처리
function dstNoticeText(part, weekIso) {
  const p = String(part || '');
  if (p.indexOf('일광절약') < 0 && p.indexOf('서머타임') < 0) return null;
  const [, m] = weekIso.split('-').map(Number);
  const start = p.indexOf('시작') >= 0 ? true : (p.indexOf('종료') >= 0 ? false : m <= 6);
  const d = fmtMDKorean(weekIso);
  return start
    ? `${d}, 일광 절약 시간이 시작됩니다. 잠들기 전, 시계를 1시간 앞으로 돌려주세요.`
    : `${d}, 일광 절약 시간이 종료됩니다. 잠들기 전, 시계를 1시간 뒤로 돌려주세요.`;
}

// 이번 주가 성찬식 주간인가 — 서버 플래그 + label 단어 감지(플래그를 깜빡해도 자동)
function isCommunionWeek(S) {
  if (S.communionThisWeek) return true;
  return (S.events || []).some((e) =>
    e.display_week === S.weekId && !e.event_date && String(e.label || '').indexOf('성찬') >= 0);
}

// 기본 순서 id → 표시 이름 (뺀 순서 칩·변경 요약용)
const ORDER_LABELS = { call: '예배의 부름', creed: '신앙고백', praise: '다함께 찬양',
  together: '합심기도', blessing: '축복', hymn: '찬송', prayer: '대표기도', special: '특송',
  offering: '봉헌', news: '교회소식', reading: '성경봉독', sermon: '설교',
  communion: '성찬식', closing: '찬송(폐회)', benediction: '축도' };

// 이번 주 순서가 기본과 어떻게 다른지 요약(편집 배지·인쇄 게이트용). 변화 없으면 ''
function orderChangeSummary(S) {
  const parts = [];
  const b = S.bulletin || {};
  if (isCommunionWeek(S) && !b.hideCommunion) parts.push('성찬식 자동 추가');
  (b.orderExtras || []).forEach((x) => {
    if (x && String(x.label || '').trim()) parts.push(`${x.label} 추가`);
  });
  (b.orderRemoved || []).forEach((id) => parts.push(`${ORDER_LABELS[id] || id} 뺌`));
  return parts.join(' · ');
}

// 연간 행사표 → 교회소식 자동 안내 (컨셉 락 §4 확장, A안)
//  · 주일 당일 행사(event_date 없음): 그 전 주 "다음 주일은…" + 당일 "오늘은…있는 날입니다"
//  · 주중 행사(event_date 있음): 그 주 "이번 주 …"
//  · 한 행사에 여러 건(쉼표)이면 각각 별도 소식으로 분리, "~주일" 행사는 "…입니다"로
function autoNewsItems(S) {
  const items = [];
  const thisWk = S.weekId;
  const nextWk = addDaysISO(thisWk, 7);
  const hidden = new Set(((S.bulletin && S.bulletin.autoNewsHidden)) || []);
  const edits = (S.bulletin && S.bulletin.autoNewsEdits) || {};   // 사용자 수정·추가분(#5)
  (S.events || []).forEach((e) => {
    const sundayEvent = !e.event_date;   // 당일이 주일
    let mode = null;                     // 'today' | 'thisweek' | 'next'
    if (e.display_week === thisWk) mode = sundayEvent ? 'today' : 'thisweek';
    else if (e.display_week === nextWk && sundayEvent) mode = 'next';
    if (!mode) return;
    const parts = splitEventLabel(e.label);
    const multi = parts.length > 1;
    parts.forEach((part) => {
      let text;
      const dst = dstNoticeText(part, e.display_week);
      if (dst) {
        if (mode !== 'next') return;     // 일광절약: 전 주에만 안내, 당일·주중 생략
        text = dst;
      } else if (mode === 'today') {
        text = /주일$/.test(part) ? `오늘은 ${part}입니다`
          : `오늘은 ${part}${pickJosa(part, '이', '가')} 있는 날입니다`;
      } else if (mode === 'thisweek') {
        text = `이번 주 ${part}`;
      } else {
        text = /주일$/.test(part) ? `다음 주일(${fmtMD(e.display_week)})은 ${part}입니다`
          : `다음 주일(${fmtMD(e.display_week)})은 ${part}${pickJosa(part, '이', '가')} 있습니다`;
      }
      const base = (mode === 'today' ? 'today|' : mode === 'thisweek' ? 'thisweek|' : 'next|') + e.display_week;
      const key = multi ? base + '|' + part : base;   // 1건짜리는 기존 키 그대로(숨김·수정 기록 보존)
      if (hidden.has(key)) return;
      const shown = edits[key] !== undefined ? edits[key] : text;   // 수정본 우선
      if (shown.trim()) items.push({ key, text: shown });
    });
  });
  return items;
}

// 행사계획 목록 — 기본은 자동 4개(다가오는 순), 수동 숨김/추가 반영(#2)
//   반환: [{ key, dateText, label }]
function bulletinEvents(S) {
  const b = S.bulletin || {};
  const hidden = new Set(b.eventsHidden || []);
  const auto = (S.events || []).slice(0, 4).map((e) => ({
    key: 'auto|' + e.display_week + '|' + e.label,
    dateText: fmtMDKorean(e.display_week),
    label: e.label,
    auto: true,
  })).filter((e) => !hidden.has(e.key));
  const added = (b.eventsAdded || []).map((e, i) => ({
    key: 'man|' + i,
    dateText: (e.date || '').trim(),
    label: (e.label || '').trim(),
    auto: false,
  })).filter((e) => e.dateText || e.label);
  return auto.concat(added);
}
