// 상태 점검 — 밖에서 보이는 것만 확인한다(읽기 전용, 로그인·키 없음).
// 하나라도 실패하면 exit 1 → GitHub가 저장소 주인에게 실패 메일을 보낸다.
// 일시적인 접속 실패로 잘못된 알림이 가지 않게 항목마다 3번까지 다시 시도한다.
const SITE = 'https://kzion.net';
const FUNCTIONS = 'https://kwezbhanfxludoafmmem.supabase.co/functions/v1'; // ppt/js/config.js 와 같은 공개 주소
const SERMON_MAX_AGE_DAYS = 10;   // 최신 설교가 이보다 오래됐으면 설교 봇·재생목록 등록을 확인

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  return { status: res.status, text: await res.text() };
}

// 페이지가 열리고 제목이 맞는지
const page = (path, title) => async () => {
  const r = await get(SITE + path + '?_=' + Date.now());
  if (r.status !== 200) throw new Error('응답 ' + r.status);
  if (!r.text.includes('<title>' + title)) throw new Error('제목이 다릅니다(기대: ' + title + ')');
};

// 내부 문서가 다시 열리지 않는지 (보안 규칙 11)
const blocked = (path) => async () => {
  const r = await get(SITE + path + '?_=' + Date.now());
  if (r.status !== 404) throw new Error('응답 ' + r.status + ' — 내부 문서가 공개되고 있습니다');
};

// 서버 함수가 살아 있는지 — 토큰 없이 부르면 401 "다시 로그인" 이 정상
const fn = (name) => async () => {
  const r = await get(FUNCTIONS + '/' + name, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'healthcheck' }),
  });
  if (r.status !== 401) throw new Error('응답 ' + r.status + ' (기대: 401)');
};

async function sermon() {
  const r = await get(SITE + '/sermon.json?_=' + Date.now());
  if (r.status !== 200) throw new Error('응답 ' + r.status);
  const d = JSON.parse(r.text);
  if (!d.id || !d.title) throw new Error('id·title 이 비어 있습니다');
  const days = (Date.now() - new Date(d.updated).getTime()) / 86400000;
  if (!(days <= SERMON_MAX_AGE_DAYS)) throw new Error('마지막 갱신 ' + Math.floor(days) + '일 전 — ' + d.title);
}

const CHECKS = [
  ['홈페이지', page('/', '시애틀 시온장로교회')],
  ['예배안내', page('/worship.html', '예배안내')],
  ['PPT 허브 화면', page('/ppt/', '주일예배 준비실')],
  ['주보 화면', page('/bt/', '주보 만들기')],
  ['말씀 모음', page('/sermon/', '말씀')],
  ['최신 설교(sermon.json)', sermon],
  ['PPT 서버 함수(api)', fn('api')],
  ['주보 서버 함수(bt)', fn('bt')],
  ['내부 문서 차단(CLAUDE.md)', blocked('/CLAUDE.md')],
  ['내부 문서 차단(supabase)', blocked('/supabase/schema.sql')],
];

const failed = [];
for (const [name, run] of CHECKS) {
  let err;
  for (let i = 0; i < 3; i++) {
    try { await run(); err = null; break; } catch (e) { err = e; await sleep(i < 2 ? 15000 : 0); }
  }
  console.log((err ? '✗ ' : '✓ ') + name + (err ? ' — ' + err.message : ''));
  if (err) failed.push(name);
}

if (failed.length) {
  console.error('\n점검 실패 ' + failed.length + '건: ' + failed.join(', '));
  process.exit(1);
}
console.log('\n모두 정상');
