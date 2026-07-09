/* ============================================================
   환경 설정 — 여기 값은 전부 공개 가능(비밀 아님).
   비밀 키는 Supabase Edge Function 안에만 존재한다 (지침 5번, D14).
   ============================================================ */

const CONFIG = {
  FUNCTIONS_URL: 'https://kwezbhanfxludoafmmem.supabase.co/functions/v1',
  // 서버(Edge Function `api`) 배포 완료 — 2026-07-02 전환
  USE_SERVER: true
};

// 상대시간 표시 — 곡 카드 "마지막 수정: N분 전" (#3 동시편집 표시, 시간만)
// updated_at은 DB 기준(UTC ISO). 미래·직전은 '방금'으로 뭉갬.
function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return '방금';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + '분 전';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + '시간 전';
  const day = Math.floor(hr / 24);
  if (day < 7) return day + '일 전';
  const d = new Date(t);
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
}
