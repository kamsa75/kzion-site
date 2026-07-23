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
// n일 뒤 날짜 (UTC 정오 기준 — 서머타임 무관)
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}
// 한글 받침에 따라 조사 선택 (이/가, 은/는 …)
function pickJosa(text, withBatchim, without) {
  const t = String(text).replace(/[)\s\d]+$/, '');   // 끝의 괄호·공백·숫자 무시
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
// 그 주 토요일 날짜 'M월 D일' (weekId=일요일 → 전날 토요일, 주보 원본 표기)
function saturdayOf(S) {
  const sat = addDaysISO(S.weekId, -1);
  const [, m, d] = sat.split('-').map(Number);
  return `${m}월 ${d}일`;
}
function pastorNameOf(S) {
  const staff = (S.meta && S.meta.staff_panel && S.meta.staff_panel.rows) || [];
  return (staff.find((r) => r.label === '담임목사') || {}).value || '';
}
// 예배순서 행 — app(편집)·print(인쇄) 공용. detail = 사용자 오버라이드 ?? 자동 기본값
function buildOrderRows(S) {
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
  const rows = [
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
  // 성찬식 = 성찬식 예정 주간이면 설교 뒤에 자동삽입(§6-4). 이번 주만 빼면 hideCommunion.
  if (S.communionThisWeek && !(S.bulletin && S.bulletin.hideCommunion)) {
    const si = rows.findIndex((r) => r.id === 'sermon');
    rows.splice(si + 1, 0, { id: 'communion', label: '성찬식' });
  }
  // 공유 필드 = 한 곳에서만 입력(값 갈라짐 차단). 주보에선 읽기전용으로 표시.
  //   설교·본문·찬송 = PPT에서 입력 / 대표기도 = 섬기는이들 표·PPT(자동)
  const SHARED = { sermon: 'PPT', reading: 'PPT', hymn: 'PPT', prayer: '자동' };
  return rows.map((r) => {
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

// 연간 행사표 → 교회소식 자동 안내 (컨셉 락 §4 확장, A안)
//  · 주일 당일 행사(event_date 없음): 그 전 주 "다음 주일은…" + 당일 "오늘은…있는 날입니다"
//  · 주중 행사(event_date 있음): 그 주 "이번 주 …"
function autoNewsItems(S) {
  const items = [];
  const thisWk = S.weekId;
  const nextWk = addDaysISO(thisWk, 7);
  const hidden = new Set(((S.bulletin && S.bulletin.autoNewsHidden)) || []);
  const edits = (S.bulletin && S.bulletin.autoNewsEdits) || {};   // 사용자 수정·추가분(#5)
  (S.events || []).forEach((e) => {
    const sundayEvent = !e.event_date;   // 당일이 주일
    let text = null; let key = null;
    if (e.display_week === thisWk) {
      if (sundayEvent) {
        text = `오늘은 ${e.label}${pickJosa(e.label, '이', '가')} 있는 날입니다`;
        key = 'today|' + e.display_week;
      } else {
        text = `이번 주 ${e.label}`;
        key = 'thisweek|' + e.display_week;
      }
    } else if (e.display_week === nextWk && sundayEvent) {
      text = `다음 주일(${fmtMD(e.display_week)})은 ${e.label}${pickJosa(e.label, '이', '가')} 있습니다`;
      key = 'next|' + e.display_week;
    }
    if (!text || hidden.has(key)) return;
    const shown = edits[key] !== undefined ? edits[key] : text;   // 수정본 우선
    if (shown.trim()) items.push({ key, text: shown });
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
