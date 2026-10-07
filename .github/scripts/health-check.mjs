// 상태 점검 — 밖에서 보이는 것만 확인한다(읽기 전용, 로그인 없음 — 유튜브 확인만 읽기 전용 API 키 YOUTUBE_API_KEY, 저장소 비밀값).
// 하나라도 실패하면 exit 1 → GitHub가 저장소 주인에게 실패 메일을 보낸다.
// 일시적인 접속 실패로 잘못된 알림이 가지 않게 항목마다 3번까지 다시 시도한다.
const SITE = 'https://kzion.net';
const FUNCTIONS = 'https://kwezbhanfxludoafmmem.supabase.co/functions/v1'; // ppt/js/config.js 와 같은 공개 주소
const SERMON_MAX_AGE_DAYS = 10;   // 최신 설교가 이보다 오래됐으면 설교 봇·재생목록 등록을 확인
const YT_CHANNEL = 'UCy4IfDFFaaDszT8R_BDmLOA';   // 교회 유튜브 채널(공개값)
const YT_KEY = process.env.YOUTUBE_API_KEY || '';

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

// 공개된 쇼츠에 안내 댓글이 달렸는지(2026-10-06) — 맥의 15분 작업이 공개를 보고 채널 계정으로 단다.
// 10-05 설정 파일이 섞여 하루 동안 댓글이 빠졌는데 로그에만 남았던 사고 뒤. 공개 1시간~4일 된 3분 이하 영상만 본다.
// 키가 아직 없으면 건너뜀(실패 아님). 사용량: 영상 수 + 2 단위/회(하루 무료 10,000).
async function shortsComment() {
  if (!YT_KEY) { console.log('  (YOUTUBE_API_KEY 없음 — 건너뜀)'); return; }
  const api = async (path) => {
    const r = await get('https://www.googleapis.com/youtube/v3/' + path + '&key=' + YT_KEY);
    const d = JSON.parse(r.text);
    if (r.status !== 200) throw Object.assign(new Error('유튜브 API ' + r.status + ' ' + (d.error?.errors?.[0]?.reason || '')), { reason: d.error?.errors?.[0]?.reason });
    return d;
  };
  const ids = (await api('playlistItems?part=contentDetails&maxResults=20&playlistId=UU' + YT_CHANNEL.slice(2))).items.map((x) => x.contentDetails.videoId);
  const vids = (await api('videos?part=snippet,status,contentDetails&id=' + ids.join(','))).items;
  const secs = (iso) => { const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
  const missing = [];
  for (const v of vids) {
    const hours = (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 3600000;
    if (v.status.privacyStatus !== 'public' || secs(v.contentDetails.duration) > 180 || hours < 1 || hours > 96) continue;
    let mine = false;
    try {
      const c = await api('commentThreads?part=snippet&maxResults=50&order=time&videoId=' + v.id);
      mine = c.items.some((x) => x.snippet.topLevelComment.snippet.authorChannelId?.value === YT_CHANNEL);
    } catch (e) { if (e.reason !== 'commentsDisabled') throw e; }
    if (!mine) missing.push(v.snippet.title);
  }
  if (missing.length) throw new Error('안내 댓글 없음 ' + missing.length + '편 — ' + missing.join(' / ') + ' (맥 published.log 의 "안내 댓글 실패"·"설정 오류" 확인)');
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
  ['쇼츠 안내 댓글', shortsComment],
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
