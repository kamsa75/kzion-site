-- ============================================================
-- 세트 편곡 서버 영속 (Phase 3 — D29·D31)
-- songs 테이블에 편곡(arrange)·곡 키(song_key) 컬럼 추가.
-- ⚠️ 이 SQL을 먼저 Run 한 뒤에 Edge Function `api`를 재배포할 것.
--    (순서가 바뀌면 곡 저장이 "저장 실패" 남 — 컬럼이 없어서.)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 한 번.
-- ============================================================

-- arrange = 회차 배열 [{items:[{block,times}|{gap:true}|{memo:''}]}] (D29)
-- null = 아직 편곡 안 함(세트 화면이 부르는 순서에서 자동 시드) / [] = 비운 상태
alter table songs add column if not exists arrange jsonb default null;

-- song_key = 곡 키 (예: G, Bb) — 세트 화면 상단 입력
alter table songs add column if not exists song_key text not null default '';
