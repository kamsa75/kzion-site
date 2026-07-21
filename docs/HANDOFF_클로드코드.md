# 클로드 코드 인수인계 — 주보 생성 엔진

이 폴더의 파일 3개를 repo(kamsa75/kzion-site)에 넣고 아래 순서대로 진행할 것.
모든 설계 결정은 `주보엔진_컨셉락_v1.md`에 있으며, 이 문서와 충돌 시 컨셉 락이 우선.

> **[2026-07-21 갱신]** 이 문서는 1차 인수인계본이다. 이후 7/19 주보·2026 교회일람 실측으로
> 결정 B1~B10이 추가됐다 — **컨셉 락의 「확정 결정 B1~B10」 절이 최신본**이며 아래와 충돌하면 그쪽이 우선.
> 특히 파일 배치표의 `bulletin_seed.sql → supabase/`는 **폐기**(B10, 아래 참조).

## 파일 배치

| 파일 | 넣을 위치 |
|---|---|
| 주보엔진_컨셉락_v1.md | docs/ ✅ |
| bulletin_schema.sql | supabase/ ✅ (테이블 정의만 — 이름 0건) |
| ~~bulletin_seed.sql~~ | ❌ **repo 밖.** SQL Editor에서 1회 실행 후 폐기 |

**왜 시드는 repo에 두지 않는가 (B10)** — `supabase/` 폴더는 GitHub Pages로 웹에 그대로 공개된다.
`kzion.net/supabase/schema.sql`이 HTTP 200으로 다운로드되는 것을 실측 확인했다.
시드를 커밋하면 **교인 명단 전체가 웹에 공개**된다. 아래 「주의」의
"데이터는 절대 GitHub에 넣지 않는다"와 위 배치표가 서로 모순이었고, 개인정보 원칙 쪽을 따랐다.

## 진행 순서

1. **DB**: Supabase SQL Editor에서 bulletin_schema.sql 실행 → bulletin_seed.sql 실행.
   시드 파일 하단의 [초기 세팅 확인 2가지](로테이션 cursor)는 사용자에게 물어본 뒤 업데이트.
2. **Edge Function**: supabase/functions/api/index.ts에 주보 action 추가.
   기존 패턴(POST {action, token, ...}) 그대로. pastor 세션 토큰 재사용.
   필요 action 초안: getBulletin, saveBulletin, getMembers, saveMember,
   getRotations, overrideRotation(mode: skip|shift), getAnnualEvents, confirmPrint
3. **PPT 쪽 수정 1건**: 목사님 입력 화면(ppt/js/pastor.js)에 찬송가 장 번호 필드 추가.
   숫자만 입력받고 표시할 때 "장" 자동 접미사, 1~645 검증. pastor_inputs.data에 hymn_no로 저장.
4. **주보 화면**: /bulletin 폴더 신설. 컨셉 락 §10의 3~6단계 순서로.
   - 트라이폴드 인쇄: @page size 14in 8.5in (legal landscape), 6패널 CSS,
     현행 주보 디자인 복제(주보.pdf 참조)
   - dragsort.js 등 기존 ppt/js 모듈 재사용 가능

## 주의

- 데이터는 절대 GitHub에 넣지 않는다 (교인 명단·헌금자 = 개인정보 → Supabase only)
- RLS 정책 0개 원칙 유지 — 새 테이블도 Edge Function 경유만 허용
- weeks 테이블은 기존 것 공유 — 새로 만들지 말 것
