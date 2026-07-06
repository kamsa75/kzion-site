-- ============================================================
-- 본부장 전용 역할(owner) 추가 — 진짜 관리자 vs 위임 관리자 분리 (2026-07-06)
-- owner = 본부장님: 관리자 기능 전부 + 접근(이미지·문구·PIN·역할) 관리
-- admin = 위임 관리자: PPT 생성만 (읽기는 되지만 저장·관리 불가)
-- ⚠️ 이 SQL을 먼저 Run → 그다음 Edge Function `api` 재배포 → 그다음 클라이언트 배포.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 한 번.
-- ============================================================

-- roles 테이블의 역할 목록에 'owner' 추가 (기존 체크 제약 교체)
alter table roles drop constraint if exists roles_role_check;
alter table roles add constraint roles_role_check
  check (role in ('pastor','praise','choir','admin','owner'));

-- owner 역할 행 생성 — PIN은 소스에 안 남김(임의값). 실제 PIN은 아래에서 별도 설정.
insert into roles (role, pin_hash) values
  ('owner', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')))
on conflict (role) do nothing;

-- ▼▼▼ 본부장님 전용 PIN 설정 (작은따옴표 안만 원하는 PIN으로 바꿔 Run) ▼▼▼
-- update roles set pin_hash = extensions.crypt('본부장PIN', extensions.gen_salt('bf')) where role='owner';
--
-- 그리고 기존 'admin' PIN은 위임할 사람에게 줄 PIN으로 바꾸면 됩니다(선택):
-- update roles set pin_hash = extensions.crypt('위임관리자PIN', extensions.gen_salt('bf')) where role='admin';
