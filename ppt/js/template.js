/* ============================================================
   예배 순서 템플릿 — 고정 순서의 단일 진실 소스 (① 데이터 모델)
   CLAUDE.md 조항 21 순서표 + 결정 D18~D27을 코드로 옮긴 시드다.

   ⚠️ 지금은 JS 시드(임시). 관리자 편집(④)에서 DB `template` 테이블로
      이관하며, 그때 이 배열이 초기 시드가 된다 (조항 22 "하드코딩 금지").
   ⚠️ 슬라이드 실제 렌더는 preview.js `renderSlide()`가, 최종 .pptx 조립은
      5단계 생성기가 이 데이터를 소비한다. 콘텐츠는 여기 복제하지 않고
      섹션 테이블(songs/pastor_inputs)을 참조 → 생성 시 확장한다 (D5).
   ============================================================ */

/* ---------- 슬라이드 레이아웃 5+1종 (preview.js renderSlide 키와 일치) ---------- */
const LAYOUTS = {
  green:       { name: '그린 자막형',     desc: '그린 배경 + 흰 볼드 자막 (영상 위 키잉)' },
  green_blank: { name: '빈 그린스크린',   desc: '글씨 없는 순수 그린 — 라이브/전환 (D20)' },
  dark:        { name: '다크 전체화면형', desc: '#14181F 배경 + 웜화이트 본문 (자동 분할)' },
  band:        { name: '크로마 밴드형',   desc: '상단 그린 + 하단 검정 밴드, 가사 2줄' },
  score:       { name: '악보 통짜형',     desc: '악보 이미지 통짜 (봉헌송·폐회송)' },
  image:       { name: '이미지형',        desc: '기제작 이미지 (썸네일·마침)' }
};

/* ---------- 콘텐츠 공급원(source) — 슬롯이 무엇을 참조/확장하는가 ---------- */
/* 생성 시(5단계) 각 source가 몇 장으로 펼쳐지는지 주석으로 명시 */
const SLOT_SOURCE = {
  fixed:           'fixed',            // title/body 그대로 1장
  thumbnail:       'thumbnail',        // 그 해 N번째 주일 이미지 자동 선택 (D21) → 1장
  hymn:            'hymn',             // 목사님 찬송가 가사(붙여넣기) → 부르는 순서만큼 밴드 N장 (D19)
  sermon:          'sermon',           // 목사님 설교 제목 (설교자명 없음 D23) → 1장
  passage_long:    'passage_long',     // 목사님 긴 성경 본문 → 다크 자동분할 M장 (D24)
  reading_short:   'reading_short',    // 목사님 짧은 구절 → 밴드 (D24)
  prayer:          'prayer',           // 목사님 기도 담당자명 → 그린 1장 (D13)
  praise_songs:    'praise_songs',     // 찬양팀 곡 전체 → 곡별 부르는 순서만큼 밴드 확장
  choir_name:      'choir_name',       // 성가대 곡명 + "시온 성가대" → 그린 1장
  choir_songs:     'choir_songs',      // 성가대 곡 가사 → 밴드 확장 (특송 옵션 포함 D26)
  offering_images: 'offering_images',  // 봉헌송 고정 이미지 세트 (관리자 교체 D22)
  closing_images:  'closing_images',   // 폐회송 고정 이미지 세트 (관리자 교체 D22)
  ending:          'ending'            // "예배를 마쳤습니다" 마침 이미지 → 항상 맨 끝
};

/* ---------- 슬롯 스키마 ----------
   { id, type(LAYOUTS 키), title, section, source(SLOT_SOURCE), removable, [sub], [placeholder] }
   - section: null|'pastor'|'praise'|'choir'|'admin' — 누가 채우나
   - removable: 주별 예외편집(D25)에서 삭제 허용 여부. 빈 그린스크린은 라이브 자리라 기본 보호(false, D20) */
const TEMPLATE = [
  { id: 'thumbnail',    type: 'image',       title: '주일예배 날짜 썸네일', section: 'admin',  source: 'thumbnail',       removable: false, placeholder: '날짜 썸네일(자동 선택)' },
  { id: 'call',         type: 'green',       title: '예배의 부름',          section: null,     source: 'fixed',           removable: false },
  { id: 'creed',        type: 'dark',        title: '사도신경',             section: null,     source: 'fixed',           removable: false, placeholder: '사도신경 본문(관리자가 교회 사용 버전으로 1회 입력)' },
  { id: 'praise-all',   type: 'green',       title: '다함께 찬양',          section: null,     source: 'fixed',           removable: false, sub: '(찬양곡명)' },
  { id: 'live-1',       type: 'green_blank', title: '빈 그린스크린(라이브)', section: null,     source: 'fixed',           removable: false },
  { id: 'praise-songs', type: 'band',        title: '찬양팀 곡 가사',        section: 'praise', source: 'praise_songs',    removable: false },
  { id: 'live-2',       type: 'green_blank', title: '빈 그린스크린(라이브)', section: null,     source: 'fixed',           removable: false },
  { id: 'pray-together',type: 'green',       title: '합심기도',             section: null,     source: 'fixed',           removable: false },
  { id: 'hymn',         type: 'band',        title: '찬송가 가사',          section: 'pastor', source: 'hymn',            removable: false },
  { id: 'prayer',       type: 'green',       title: '기도',                 section: 'pastor', source: 'prayer',          removable: false },
  { id: 'choir-name',   type: 'green',       title: '성가대 곡명',          section: 'choir',  source: 'choir_name',      removable: false },
  { id: 'choir-songs',  type: 'band',        title: '성가대 곡 가사',        section: 'choir',  source: 'choir_songs',     removable: false },
  { id: 'live-3',       type: 'green_blank', title: '빈 그린스크린(라이브)', section: null,     source: 'fixed',           removable: false },
  { id: 'offering',     type: 'green',       title: '봉헌',                 section: null,     source: 'fixed',           removable: false },
  { id: 'offering-img', type: 'score',       title: '봉헌송 악보',          section: 'admin',  source: 'offering_images', removable: false, placeholder: '봉헌송 악보 이미지(관리자 교체)' },
  { id: 'live-4',       type: 'green_blank', title: '빈 그린스크린(라이브)', section: null,     source: 'fixed',           removable: false },
  { id: 'news',         type: 'green',       title: '교회 소식',            section: null,     source: 'fixed',           removable: false },
  { id: 'sermon',       type: 'green',       title: '설교 제목',            section: 'pastor', source: 'sermon',          removable: false },
  { id: 'passage',      type: 'dark',        title: '성경 본문(긴 본문)',    section: 'pastor', source: 'passage_long',    removable: false, placeholder: '긴 본문(자동 분할)' },
  { id: 'reading',      type: 'band',        title: '함께 읽는 구절(짧은)',  section: 'pastor', source: 'reading_short',   removable: true,  placeholder: '짧은 구절(없으면 생략)' },
  { id: 'live-5',       type: 'green_blank', title: '빈 그린스크린(라이브)', section: null,     source: 'fixed',           removable: false },
  { id: 'closing-img',  type: 'score',       title: '폐회송 악보',          section: 'admin',  source: 'closing_images',  removable: false, placeholder: '폐회송 악보 이미지(관리자 교체)' },
  { id: 'benediction',  type: 'green',       title: '축도',                 section: null,     source: 'fixed',           removable: false },
  { id: 'ending',       type: 'image',       title: '예배를 마쳤습니다',     section: 'admin',  source: 'ending',          removable: false, placeholder: '마침 이미지(항상 맨 끝)' }
];

/* ---------- 특송(옵션, D26) — 성가대가 필요할 때만 삽입하는 슬롯 세트 ----------
   상시 노출 아님. 삽입 시 곡명 그린 + 가사 밴드 2슬롯을 성가대 곡 뒤에 추가. */
const SPECIAL_SONG_SLOTS = [
  { id: 'special-name',  type: 'green', title: '특송 곡명',   section: 'choir', source: 'choir_name',  removable: true },
  { id: 'special-songs', type: 'band',  title: '특송 가사',   section: 'choir', source: 'choir_songs', removable: true }
];

/* ---------- 헬퍼 ---------- */
const Template = {
  layouts: LAYOUTS,
  slots: () => TEMPLATE,

  // 그 해 N번째 주일 계산 — 썸네일 파일 "시애틀시온장로교회 - N" 자동 매핑 (D21)
  // sundayDate: 'YYYY-MM-DD'(해당 주 일요일). 반환: 1~53
  // ⚠️ UTC로 계산 — 로컬 시간대면 서머타임 전환(봄 -1h)이 주 계산에 off-by-one을 만든다
  sundayIndexOfYear(sundayDate) {
    const [y, m, d] = sundayDate.split('-').map(Number);
    const target = Date.UTC(y, m - 1, d);
    const jan1Day = new Date(Date.UTC(y, 0, 1)).getUTCDay(); // 그 해 첫 일요일
    const firstSun = Date.UTC(y, 0, 1 + ((7 - jan1Day) % 7));
    return Math.round((target - firstSun) / (7 * 86400000)) + 1;
  },

  // N번째 주일의 날짜 (sundayIndexOfYear의 역함수) — 썸네일 라벨용
  sundayDate(year, n) {
    const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    const first = Date.UTC(year, 0, 1 + ((7 - jan1Day) % 7));
    const d = new Date(first + (n - 1) * 7 * 86400000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + mm + '-' + dd;
  },

  // 주 문서 생성 시 템플릿을 문서 안으로 복사(스냅샷) → 이후 그 주만 편집 (D6·D25)
  // 반환: 주별 순서 인스턴스 배열(각 슬롯에 고정 uid 부여, 원본 불변)
  buildWeekOrder() {
    return TEMPLATE.map((slot, i) => Object.assign({ uid: slot.id + '#' + i }, slot));
  }
};
