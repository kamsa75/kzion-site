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
