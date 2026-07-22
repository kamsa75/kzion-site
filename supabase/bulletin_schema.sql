-- ============================================================
-- 주보 생성 엔진 — DB 스키마 v2 (컨셉 락 v1 §10-1 + B1~B6)
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 Run 한 번.
--
-- 보안 원칙: 기존 schema.sql과 동일 — 모든 테이블 RLS ON + 정책 0개.
--            접근은 Edge Function(service_role)만 가능.
-- 주차 키는 기존 weeks(id date) 재사용 — PPT와 주보가 같은 주차 문서 공유.
--
-- ★ 이 파일에는 개인정보(교인 이름)를 절대 넣지 않는다.
--   supabase/ 폴더는 GitHub Pages로 웹에 그대로 공개된다(kzion.net/supabase/…).
--   명단·풀·섬기는사람들 등 이름이 들어가는 값은 별도 시드로 SQL Editor에서만 실행.
-- ============================================================

-- ---------- 교인 명단 (컨셉 락 §8 — 삭제 대신 비활동 처리) ----------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '교인',
  -- 담임목사/협동목사/교육간사/반주자/시무장로/장로/명예장로/
  -- 안수집사/권사/명예권사/서리집사/교인
  active boolean not null default true,
  sort_key text,                    -- ㄱㄴㄷ 정렬용 (null이면 name 사용)
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists members_active_name on members (active, name);

-- ---------- 로테이션 풀 (B2 — 순서만 보관, 커서 없음) ----------
-- member_names = 순환 순서대로의 이름 배열. 명단 관리 화면에서 드래그로 편집.
-- ★ v1의 cursor 컬럼은 폐기(B1). 진행 위치는 rotation_anchors가 담당한다.
create table if not exists rotation_pools (
  id text primary key,              -- 'prayer_elders' / 'prayer_deacons' / 'offering'
  label text not null,
  cycle text not null default 'weekly',   -- weekly / monthly
  member_names jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- 로테이션 기준점 = 앵커 (B1) ----------
-- "이 주일은 이 사람" 한 줄. 매주 갱신하지 않는다 → 중복 호출·미리보기로 틀어지지 않음.
-- ★ 인덱스가 아니라 '이름'으로 저장한다(B3): 명단을 편집해도 기준점이 흔들리지 않게.
--
-- effective_from 이후 구간에 적용. 수동 개입(당기기·끼워넣기)은 새 앵커를 추가해
-- 그 시점 이후만 바꾸고, 과거 주차는 절대 건드리지 않는다.
--
-- spec 구조
--   prayer   : {"elder":"장로A","deacon":"안집A","phase":0}
--              phase 0=장로① 1=장로② 2=안집/권사 (3주 주기)
--   offering : {"month":"2026-07","name":"안집A"}   (월 단위 순환)
create table if not exists rotation_anchors (
  role text not null,               -- 'prayer' / 'offering'
  effective_from date not null,     -- 이 주일부터 적용
  spec jsonb not null,
  note text,                        -- 왜 이 앵커가 생겼는지 (예: '장로C 장로 순서 당김')
  created_at timestamptz not null default now(),
  primary key (role, effective_from)
);

-- ---------- 주차별 배정 결과 ----------
-- 용도 3가지
--  (a) 수동 대타 — "이번 주만 교체" (is_manual=true). 계산 결과보다 우선.
--  (b) 손입력 항목 — 친교헌금·봉사담당(사랑의 나눔, §5)·안내 예외.
--  (c) 인쇄 스냅샷 — locked_at이 찍히면 이후 재계산 금지.
--      명단을 나중에 고쳐도 이미 인쇄한 주보가 달라지지 않게 한다.
create table if not exists rotation_assignments (
  week_id date not null,
  role text not null,               -- prayer / offering / usher / love_offering / love_service
  assigned text not null,
  is_manual boolean not null default false,
  locked_at timestamptz,            -- 인쇄 시점 스냅샷 (과거 보존)
  note text,
  updated_at timestamptz not null default now(),
  primary key (week_id, role)
);

-- ---------- 연간 행사표 (B4 — 게재 주일과 실제 날짜 분리) ----------
-- 일람 원본이 "10월 11일 칸에 '17일(토) 밀알선교회 식사 봉사'" 형태로 적혀 있다.
-- = 행사는 토요일, 공지는 그 앞 주일 주보. 그래서 두 값을 나눠 담는다.
--   display_week : 이 주일 주보의 '행사계획' 블록에 실린다  ← 추출 기준
--   label        : 주보에 그대로 인쇄될 문구 ("17일(토) 밀알선교회 식사 봉사")
--   event_date   : 실제 날짜(참고용). 주일과 같으면 null.
-- 같은 주일에 여러 건이면 일람 표기대로 label 하나에 쉼표로 합친다.
create table if not exists annual_events (
  id uuid primary key default gen_random_uuid(),
  display_week date not null,
  label text not null,
  event_date date,
  is_communion boolean not null default false,  -- 성찬식 → §6-4 선제 제안 트리거
  show_in_bulletin boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists annual_events_week on annual_events (display_week);

-- 행사계획 블록 추출 = display_week >= 이번 주일 인 것 5건
--   select label, display_week from annual_events
--    where show_in_bulletin and display_week >= $1 order by display_week limit 5;
-- (2026-07-19 주보 실측과 일치: 7/19 당회, 7/26 연합마을모임, 8/16, 8/23, 8/30)

-- ---------- 주보 본문 (주당 1행 — pastor_inputs와 같은 패턴) ----------
create table if not exists bulletin_inputs (
  week_id date primary key references weeks(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  -- data 구조(초안): {
  --   vol, no,                          자동 계산 결과 스냅샷 (제N권 N호)
  --   order_items: [{id, label, detail, person, hymn_no, special, expires}],
  --   news: [{title, body}],
  --   offering: {thanks[], tithe[], weekly[], mission[], total},
  --   saturday: {date, sermon, note},
  --   praise_panel: {mode: 'image'|'text', image_path, text},
  --   confirms: {field: timestamptz}    인쇄 게이트 확인 체크 기록
  -- }
  -- ★ 사랑의 나눔은 여기 넣지 않는다(B5). 4주 롤링 표라 같은 값을 4번 입력하게 된다.
  --   주별 1건씩 rotation_assignments(love_offering / love_service)에 저장하고,
  --   표는 최근 4주를 읽어와 그린다 → 목사님은 새로 생긴 한 칸만 입력.
  field_times jsonb not null default '{}'::jsonb,  -- 필드별 최종 입력 시각 (§6-2 타임스탬프 검증)
  printed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- 준고정 설정 ----------
-- 이름이 들어가는 값(staff_panel, usher_current 등)은 시드에서 넣는다 — 이 파일엔 두지 않음.
create table if not exists bulletin_meta (
  key text primary key,
  value jsonb not null
);

-- 권/호 시드 (§4 — 리셋 없는 권 + 연초 리셋 호. 기준일 하나면 전부 계산 가능)
-- 검증: 2026-01-04이 그 해 첫 주일 → 7/19는 29번째 주일. 41권 = 교회 41주년(4/19 설립기념).
insert into bulletin_meta (key, value) values
  ('vol_seed', '{"date":"2026-07-19","vol":41,"no":29}'::jsonb)
on conflict (key) do nothing;

-- 마을 목록 (일람 §12 — 1촌 없음, 5촌은 '방주'). 사랑의 나눔 '봉사담당' 선택지.
insert into bulletin_meta (key, value) values
  ('villages', '["2촌","3촌","4촌","5촌(방주)"]'::jsonb)
on conflict (key) do nothing;

-- 완전 고정 문구 (§9). 교회 주소·전화는 이미 웹사이트 공개 정보.
insert into bulletin_meta (key, value) values
  ('church_info', '{"name":"시애틀 시온장로교회","en":"Korean Zion Presbyterian Church","address":"17920 Meridian Ave. N. Shoreline, WA 98133","site":"www.kzion.net","tel":"(206)363.5041"}'::jsonb),
  ('motto', '{"year":2026,"text":"너 하나님의 사람아!","ref":"딤전 6:11-12"}'::jsonb),
  ('standing_note', '{"text":"‘※’ 표시에는 일어서 주시기 바랍니다 / 몸이 불편하신 분은 앉아 계셔도 됩니다","offering":"[헌금은 들어오시면서 헌금함에 합니다]"}'::jsonb),
  ('service_times', '{"sunday":"오전10:45","saturday":"토요일 오전 7시"}'::jsonb)
on conflict (key) do nothing;

-- 예배찬양 패널 이미지 버킷 (비공개 — 기존 scores 버킷과 동일 패턴)
insert into storage.buckets (id, name, public)
values ('bulletin', 'bulletin', false)
on conflict (id) do nothing;

-- RLS: 전부 켜고 정책 없음 → anon/authenticated 전면 차단
alter table members enable row level security;
alter table rotation_pools enable row level security;
alter table rotation_anchors enable row level security;
alter table rotation_assignments enable row level security;
alter table annual_events enable row level security;
alter table bulletin_inputs enable row level security;
alter table bulletin_meta enable row level security;
