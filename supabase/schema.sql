-- ============================================================
-- 주일예배 PPT 허브 — DB 스키마 v1 (3단계)
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 Run 한 번.
-- 보안 원칙(D14): 모든 테이블 RLS ON + 정책 0개 = 클라이언트 직접 접근 차단.
--                 접근은 Edge Function(service_role)만 가능.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- 역할 (역할–PIN–이메일, 지침: 역할 테이블)
create table if not exists roles (
  role text primary key check (role in ('pastor','praise','choir','admin')),
  pin_hash text not null,
  email text,
  updated_at timestamptz not null default now()
);

-- 로그인 세션 (기기당 30일 — D3)
create table if not exists sessions (
  token uuid primary key default gen_random_uuid(),
  role text not null references roles(role) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- 주차 문서 (키 = 예배 일요일 날짜, PT 기준 — D4)
create table if not exists weeks (
  id date primary key,
  status text not null default 'open',   -- open / submitted / approved (5단계에서 확장)
  template jsonb,                        -- 생성 시점 템플릿 스냅샷 (D6, 5단계에서 사용)
  created_at timestamptz not null default now()
);

-- 목사님 섹션 (주당 1행 — 지침 28번)
create table if not exists pastor_inputs (
  week_id date primary key references weeks(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- {title, ref, passage, reading, prayer}
  hymn_images jsonb not null default '[]'::jsonb, -- storage 경로 배열
  updated_at timestamptz not null default now()
);

-- 곡 (찬양팀/성가대 공용 — 블록·순서는 jsonb, D5·D7 스키마)
create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  week_id date not null references weeks(id) on delete cascade,
  role text not null check (role in ('praise','choir')),
  name text not null default '',
  position int not null default 0,
  status text not null default 'review',          -- extracting / review / ordered
  blocks jsonb,                                    -- {version, blocks:[...]} (D7)
  ord jsonb not null default '[]'::jsonb,          -- 블록 ID 참조 배열 (D5)
  images jsonb not null default '[]'::jsonb,       -- storage 경로 배열
  warn_dark boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists songs_week_role on songs (week_id, role, position);

-- RLS: 전부 켜고 정책 없음 → anon/authenticated 전면 차단 (D14)
alter table roles enable row level security;
alter table sessions enable row level security;
alter table weeks enable row level security;
alter table pastor_inputs enable row level security;
alter table songs enable row level security;

-- PIN 검증 함수 (service_role 전용)
create or replace function verify_pin(p text) returns text
language sql security definer set search_path = public, extensions as
$$ select role from roles where pin_hash = extensions.crypt(p, pin_hash) limit 1 $$;
revoke all on function verify_pin(text) from public, anon, authenticated;

-- 악보 이미지 버킷 (비공개 — 접근은 Edge Function이 발급한 서명 URL로만)
insert into storage.buckets (id, name, public)
values ('scores', 'scores', false)
on conflict (id) do nothing;

-- 초기 PIN (개발용 임시값 — 실운영 전 반드시 교체 예정)
insert into roles (role, pin_hash) values
  ('pastor', extensions.crypt('1111', extensions.gen_salt('bf'))),
  ('praise', extensions.crypt('2222', extensions.gen_salt('bf'))),
  ('choir',  extensions.crypt('3333', extensions.gen_salt('bf'))),
  ('admin',  extensions.crypt('9999', extensions.gen_salt('bf')))
on conflict (role) do nothing;
