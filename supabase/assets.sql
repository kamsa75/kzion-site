-- ============================================================
-- ④-a 관리자 자산 테이블 — 날짜 썸네일·봉헌송·폐회송·마침 이미지 (D21·D22)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 한 번.
-- 교회 공용·매주 재사용. 파일은 기존 scores 버킷의 assets/ 경로에 저장.
-- 보안(D14): RLS ON + 정책 0개 = Edge Function(service_role)만 접근.
-- ============================================================

create table if not exists public.assets (
  key text primary key,                         -- 'thumb:27' … 'thumb:52' / 'offering' / 'closing' / 'ending'
  paths jsonb not null default '[]'::jsonb,      -- storage 경로 배열(단일 이미지도 배열 1개)
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;
-- 정책을 만들지 않는다 → anon/authenticated 전면 차단 (Edge Function만 접근)
