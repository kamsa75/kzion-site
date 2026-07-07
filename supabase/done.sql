-- ============================================================
-- 섹션 '이번 주 준비 완료' 플래그 (찬양팀·성가대)
-- 곡은 개별 행이라 섹션 단위 완료를 담을 자리가 없어 작은 표 1개 추가.
-- (목사님 완료는 pastor_inputs.data.done JSONB에 저장 — 서버 수정 불필요)
-- ⚠️ 이 SQL을 먼저 Run 한 뒤에 Edge Function `api`를 재배포할 것.
--    (순서가 바뀌면 완료 토글이 "저장 실패" 남 — 표가 없어서.)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 한 번.
-- ============================================================

create table if not exists section_done (
  week_id    text        not null,
  role       text        not null,          -- 'praise' | 'choir'
  done       boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (week_id, role)
);

-- RLS 켜고 정책 0개 = 클라이언트 직접 접근 전면 차단, Edge Function(service_role)만 접근 (D14)
alter table section_done enable row level security;
