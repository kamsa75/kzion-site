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
// 연간 행사표 → 교회소식 자동 안내 (컨셉 락 §4 확장, A안)
//  · 주일 당일 행사(event_date 없음): 그 전 주 "다음 주일은…" + 당일 "오늘은…있는 날입니다"
//  · 주중 행사(event_date 있음): 그 주 "이번 주 …"
function autoNewsItems(S) {
  const items = [];
  const thisWk = S.weekId;
  const nextWk = addDaysISO(thisWk, 7);
  const hidden = new Set(((S.bulletin && S.bulletin.autoNewsHidden)) || []);
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
    if (text && !hidden.has(key)) items.push({ key, text });
  });
  return items;
}
