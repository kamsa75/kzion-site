/* ============================================================
   환경 설정 — 여기 값은 전부 공개 가능(비밀 아님).
   비밀 키는 Supabase Edge Function 안에만 존재한다 (지침 5번, D14).
   ============================================================ */

const CONFIG = {
  FUNCTIONS_URL: 'https://kwezbhanfxludoafmmem.supabase.co/functions/v1',
  // 서버(Edge Function `api`) 배포 완료 — 2026-07-02 전환
  USE_SERVER: true
};
