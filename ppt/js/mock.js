/* ============================================================
   목(mock) 데이터 — 1~2단계 개발 전용
   ⚠️ 여기의 PIN은 개발용 가짜 값이다. 실서비스에서는 PIN 검증을
   반드시 Supabase Edge Function에서 수행하고 이 파일의 검증 로직은
   제거한다 (CLAUDE.md 보안 규칙 9, 확정 결정 D8).
   ============================================================ */

const MOCK = {

  // 개발용 가짜 PIN → 역할
  pins: { '1111': 'pastor', '2222': 'praise', '3333': 'choir', '9999': 'admin' },

  roles: {
    pastor: { label: '목사님' },
    praise: { label: '찬양팀' },
    choir:  { label: '성가대' },
    admin:  { label: '관리자(본부장)' }
  },

  // 이번 주 문서의 3섹션 상태 (예시)
  sections: [
    {
      id: 'pastor', name: '목사님 섹션', owner: 'pastor', status: 'progress',
      items: ['설교 제목·본문 구절', '성경 본문 붙여넣기', '함께 읽는 구절', '기도 담당자명', '예배 중 찬송가 악보 업로드']
    },
    {
      id: 'praise', name: '찬양팀 섹션', owner: 'praise', status: 'done',
      items: ['악보 업로드 2곡', '가사 검수 완료', '부르는 순서 지정 완료']
    },
    {
      id: 'choir', name: '성가대 섹션', owner: 'choir', status: 'empty',
      items: ['곡명 입력', '악보 업로드', '가사 검수', '부르는 순서 지정']
    }
  ],

  statusLabel: { empty: '대기', progress: '작성 중', done: '완료' },

  // 디자인 미리보기 데모 슬라이드 (지침 17번 레이아웃 5종)
  sampleSlides: [
    {
      layout: 'green',
      label: '그린 자막형 — 순서명',
      note: '초록 부분은 방송에서 영상으로 대체됩니다(크로마키). 흰 글씨만 영상 위에 얹힙니다.',
      text: '예배의 부름'
    },
    {
      layout: 'green',
      label: '그린 자막형 — 설교 제목',
      note: '설교 제목·본문 구절 (순서표 14번)',
      text: '집착과 갈망',
      sub: '창세기 30:1–24'
    },
    {
      layout: 'band',
      label: '크로마 밴드형 — 찬양 가사',
      note: '하단 검정 밴드에 가사 2줄 (순서표 5·10·16번)',
      lyrics: ['아버지 사랑 내가 노래해', '아버지 은혜 내가 노래해']
    },
    {
      layout: 'dark',
      label: '다크 전체화면형 — 성경 장문',
      note: '절 번호는 골드 (순서표 3·15번)',
      caption: '창세기 30:1–2',
      verses: [
        { num: '1', text: '라헬이 자기가 야곱에게서 아들을 낳지 못함을 보고 그의 언니를 시기하여' },
        { num: '2', text: '야곱이 라헬에게 성을 내어 이르되 그대를 임신하지 못하게 하시는 이는 하나님이시니라' }
      ]
    },
    {
      layout: 'score',
      label: '악보 통짜형',
      note: '업로드한 악보 원본이 화면 전체에 채워집니다 (순서표 7·12·17번). 아래는 자리표시용.',
      placeholder: '악보 이미지 (업로드 시 표시)'
    },
    {
      layout: 'image',
      label: '이미지형 — 타이틀/엔딩',
      note: '기제작 타이틀·엔딩 이미지가 들어갑니다 (순서표 1·19번). 아래는 자리표시용.',
      placeholder: '주일예배 타이틀 이미지'
    }
  ]
};
