-- ============================================================
-- 4단계: 가사 추출 설정 테이블 (지침 6번 — 관리자가 모델 변경 가능)
-- 대시보드 → SQL Editor에 붙여넣고 Run 한 번. (schema.sql 이후에 실행)
-- ============================================================

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;  -- 클라이언트 직접 접근 차단, Edge Function만 (D14)

-- 추출 모델 기본값(Haiku 4.5). 나중에 관리자 화면에서 value만 바꾸면 됨.
insert into settings (key, value) values ('extract_model', 'claude-haiku-4-5')
on conflict (key) do nothing;
