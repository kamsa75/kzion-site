-- ============================================================
-- 담당자 PIN 설정 함수 — owner "담당자 PIN 관리" 화면에서 사용 (2026-07-11)
-- owner가 화면에서 PIN을 입력하면 Edge Function(api)이 이 함수를 호출해
-- 평문을 bcrypt로 해시 저장한다. PIN 평문은 소스·로그 어디에도 남기지 않는다(지침 10).
-- ⚠️ 실행 순서: 이 SQL을 SQL Editor에서 Run → Edge Function `api` 재배포 → 클라이언트 배포.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 한 번.
-- ============================================================

create or replace function set_pin(r text, p text) returns void
language sql security definer set search_path = public, extensions as
$$ update roles set pin_hash = extensions.crypt(p, extensions.gen_salt('bf')) where role = r $$;

-- service_role(Edge Function)만 호출 가능 — verify_pin과 동일 원칙
revoke all on function set_pin(text, text) from public, anon, authenticated;
