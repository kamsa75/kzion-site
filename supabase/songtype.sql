-- ============================================================
-- 성가대(특송) 개편 + 권한 확장용 마이그레이션
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run]
-- 안전: IF NOT EXISTS 라서 여러 번 실행해도 문제 없음
-- ============================================================

-- 곡 타입: 'choir'(성가대, 기본) | 'special'(특송)
--   성가대 = 곡목 입력 → 그린 큰 곡목 + 작은 "시온 성가대"
--   특송   = 팀/사람 이름(name)에 넣고 → 그린 "특송 : OOO"
alter table songs add column if not exists song_type text not null default 'choir';

-- (참고) 저장 충돌 감지·마지막 수정 표시는 이미 있는 songs.updated_at /
--         pastor_inputs.updated_at 컬럼을 그대로 사용하므로 추가 작업 없음.
