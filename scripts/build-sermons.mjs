// 말씀 페이지 생성 — data/sermons/*.json → sermon/<날짜>/index.html, sermon/index.html, sitemap.xml
// 글은 전부 HTML에 넣고, JS는 보여주는 방식(탭·넘김·재생)만 바꾼다. 푸터는 scripts/footer.html 공용.
// 실행: node scripts/build-sermons.mjs [출력 폴더(기본: 저장소 루트)]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] || new URL('..', import.meta.url).pathname;
const FOOTER = readFileSync(new URL('./footer.html', import.meta.url), 'utf8').trim();
const SITE = 'https://kzion.net';
const V = '20261008c';

const CH = {
  name: '시애틀 시온장로교회',
  en: 'Korean Zion Presbyterian Church',
  tag: '시애틀 시온장로교회는 시애틀에 있는 한인교회입니다.',
  suffix: '시애틀 시온장로교회 · 시애틀에 있는 한인교회',
  street: '17920 Meridian Ave N', city: 'Shoreline', state: 'WA', zip: '98133',
  pastor: '이영래 목사',
};
const ADDRESS = `${CH.street}, ${CH.city}, ${CH.state} ${CH.zip}`;

const PALETTE = {            // 릴스 색 (쇼츠 파이프라인 팔레트와 같은 값)
  amber:  { bg: '#F0C24A', ink: '#1C1814', mute: '#604A1E' },
  cobalt: { bg: '#343C78', ink: '#FFFFFF', mute: '#C4C8E6' },
  sky:    { bg: '#9EDCF2', ink: '#162230', mute: '#34546E' },
  sienna: { bg: '#964A2C', ink: '#FFFFFF', mute: '#F0CEB4' },
  mint:   { bg: '#DCEFEB', ink: '#182824', mute: '#506E66' },
  teal:   { bg: '#1E5C58', ink: '#FFFFFF', mute: '#B4D6CE' },
};

// 소그룹 성경공부 교재 '부르심' — 과 제목·입구 질문(q)과 맛보기(본문 표기·'성경 속으로' 질문 3개·나눔 1개·그 과의 질문 수)
// 질문은 목사님 원문 글자 그대로(띄어쓰기 한 곳만 교정). 성경 번역문은 저작권 때문에 싣지 않고 장절 표기만 쓴다.
const LESSONS = [
  { t: '제자로 부르심', q: '왜 예수님은 하고 많은 배 중에서 하필이면 베드로의 배에 올라타셨을까요?',
    ref: ['누가복음 5:1-11', '마가복음 3:13-15'], total: 10,
    qs: ['왜 예수님은 하고 많은 배 중에서 하필이면 베드로의 배에 올라타셨을까요?', '제자가 될 수 있는 자격은 누구로부터 옵니까?', '제자로 부름 받았다는 것은 어떤 의미일까요?'],
    share: '당신이 그리스도인이 된 계기는 무엇입니까? 당신은 어떻게 제자로 부름 받았습니까?' },
  { t: '자기부인과 십자가', q: '당신은 주님의 제자가 되기 위해 무엇을 포기했습니까?',
    ref: ['누가복음 9:18-27', '마태복음 16:13-28'], total: 9,
    qs: ['예수님이 제자들에게 같은 질문을 두 번 나눠서 하십니다. 어떤 질문입니까?', '베드로는 어떻게 ‘예수님이 그리스도인 줄’ 알게 되었나요?', '자기를 부인한다는 말씀은 무슨 의미입니까?'],
    share: '지금 내가 내려놓은 나의 십자가는 무엇입니까?' },
  { t: '성령과 제자', q: '당신은 예수님을 믿을 때에 성령을 받으셨습니까?',
    ref: ['사도행전 6:3-4', '로마서 8:9-11', '갈라디아서 5:16-26'], total: 8,
    qs: ['초대교회가 일곱집사를 선출할 때 기준으로 삼은 조건은 무엇입니까?', '성령세례는 하나님이 주시는 선물입니다. 이 선물은 무엇을 위해 주시는 것일까요?', '당신은 성령의 사람입니까?'],
    share: '당신은 성령충만하십니까?' },
  { t: '제자의 자세', q: '어떻게 해야 내게 주어진 십자가가 나에게 기쁨이 될 수 있을까요?',
    ref: ['시편 119:92', '마태복음 20장', '마태복음 11:28-30'], total: 8,
    qs: ['다윗은 기가 막힌 고난을 수없이 겪었던 사람입니다. 그런데, 그가 그의 고난 중에도 멸망하지 않고 승리할 수 있었던 비결 한 가지를 이야기해 줍니다. 아래 말씀을 읽고 그 비결을 이야기해 봅시다.', '한 데나리온은 무엇을 의미하는 걸까요?', '나는 주님이 메어주신 멍에를 생각할 때 어떤 느낌이 듭니까?'],
    share: '당신이 기대하는 보상은 무엇이고 지금 받고 있는 보상은 무엇입니까?' },
  { t: '제자들의 모임', q: '예수님이 부활하시고 승천하시면서 제자들에게 분부하신 것은 무엇입니까?',
    ref: ['사도행전 1:4-5', '사도행전 1:12-14', '사도행전 2:40-47'], total: 7,
    qs: ['예수님이 부활하시고 승천하시면서 제자들에게 분부하신 것은 무엇입니까?', '예수님의 분부를 받은 제자들은 어떻게 했습니까?', '성도들은 무엇을 따라 교제하고 성만찬을 나누고 기도했습니까? (42절)'],
    share: '지금 여러분에게 제자리는 어디입니까?' },
  { t: '사명', q: '당신은 지금 사명을 따라 살고 있습니까?',
    ref: ['마태복음 28:16-20', '디모데전서 4:16', '마가복음 16:15-20'], total: 8,
    qs: ['이 위대한 명령이 주어진 곳은 어디입니까?', '가라는 명령의 의미는 무엇입니까?', '주님이 이 명령을 하시면서 제자들에게 하신 약속은 무엇입니까?'],
    share: '당신은 지금 사명을 따라 살고 있습니까?' },
];
const EPUB = 'files/%EB%B6%80%EB%A5%B4%EC%8B%AC_3.0.epub';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const koDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일`; };
const mdDate = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}월 ${dd}일`; };
const dotDate = (d) => d.replace(/-/g, '.');
const scriptureLabel = (d) => d.scripturePhrase || d.scripture;
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const jsonld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
// 릴스가 강조한 낱말(예: '자기 효능감')에 표시 — 글자는 그대로, 모양만
const mark = (text, hl) => {
  const t = esc(text); if (!hl) return t;
  const h = esc(hl); const i = t.indexOf(h);
  return i < 0 ? t : `${t.slice(0, i)}<mark>${h}</mark>${t.slice(i + h.length)}`;
};

const ARROW = '<span class="ar" aria-hidden="true">→</span>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const CHEV = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CHURCH_LD = {
  '@type': 'Church', name: CH.name, alternateName: CH.en, url: SITE + '/', description: CH.tag,
  address: { '@type': 'PostalAddress', streetAddress: CH.street, addressLocality: CH.city, addressRegion: CH.state, postalCode: CH.zip, addressCountry: 'US' },
};

// ---------- 공통 틀 ----------
function head({ title, desc, url, image, type = 'article', up, ld }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${type}">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="${CH.name}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(image)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="${up}images/cropped-favicon-270x270.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="${up}css/style.css?v=20260626ao">
<link rel="stylesheet" href="${up}css/footer.css?v=20260929a">
<link rel="stylesheet" href="${up}css/sermon.css?v=${V}">
<script>document.documentElement.className+=' js';</script>
${ld.map(jsonld).join('\n')}
</head>
<body class="sm">
`;
}

function nav(up) {
  return `<nav class="nav">
  <div class="wrap">
    <a href="${up}index.html" class="brand">${CH.name}</a>
    <div class="nav-links">
      <a href="${up}index.html">홈</a>
      <a href="${up}worship.html">예배안내</a>
      <a href="${up}sermon/" aria-current="page">말씀</a>
      <a href="${up}staff.html">섬기는 이들</a>
      <a href="${up}travel.html">시애틀 여행</a>
    </div>
    <button class="nav-toggle" aria-label="메뉴 열기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>
  </div>
</nav>
`;
}

function visit(up) {
  return `
<section class="sm-visit" aria-label="예배 안내">
  <div class="wrap">
    <p><b>이번 주일, 함께 예배해요.</b><span>주일예배 오전 10:45 · 본당 · ${ADDRESS}</span></p>
    <a class="btn btn-gold" href="${up}worship.html">예배 안내 ${ARROW}</a>
  </div>
</section>`;
}

const footer = (up) => `\n${FOOTER}\n\n<script src="${up}js/sermon.js?v=${V}" defer></script>\n</body>\n</html>\n`;

// 눌렀을 때만 영상을 불러오는 틀 (페이지 속도)
const video = (id, label, cls, img) =>
  `<button class="yt ${cls}" type="button" data-yt="${esc(id)}" aria-label="${esc(label)} 재생">
          <img src="${esc(img || thumb(id))}" alt="${esc(label)}" loading="lazy">
          <span class="yt-play">${PLAY}</span>
        </button>`;

// 한 칸 안에서 넘기는 장치(점·화살표) — 1분 영상, 지난 설교 목록, 질문 카드가 같은 부품을 쓴다
// num: 목록(지난 설교·최근 질문)은 점 대신 쪽 번호
const bar = (n, label, num = false) => n < 2 ? '' : `
          <div class="cz-bar">
            <button class="cz-arrow prev" type="button" aria-label="이전 ${label}">${CHEV('M15 5l-7 7 7 7')}</button>
            <div class="cz-dots${num ? ' cz-num' : ''}">${Array.from({ length: n }, (_, i) => num ? `<i${i ? '' : ' class="on"'}>${i + 1}</i>` : `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
            <button class="cz-arrow next" type="button" aria-label="다음 ${label}">${CHEV('M9 5l7 7-7 7')}</button>
          </div>`;

// ---------- 색 대비 검사(2026-10-08) ----------
// 형광펜 띠(크림 75%) 위에 흰 글자가 놓이면 글자 아랫부분이 지워져 보였다(10-04 적갈색 B 퀴즈). 빌드할 때 색마다 계산해
// 띠가 글자와 대비 3 미만이면 띠 대신 핵심 말을 노란 글자로 칠한다(그것도 약하면 밑줄). 사람이 놓쳐도 글자가 묻히지 않게.
const lum = (hex) => { const c = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mixHex = (a, b, t) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * t + parseInt(b.slice(1 + i, 3 + i), 16) * (1 - t)).toString(16).padStart(2, '0')).join('');
const MARK_YEL = '#FFD048';
function markMode(p) {
  if (contrast(p.ink, mixHex('#FBF8F1', p.bg, 0.75)) >= 3) return { cls: '', css: '' };
  if (contrast(MARK_YEL, p.bg) >= 3) return { cls: ' qz-mk-text', css: `;--q-mark:${MARK_YEL}` };
  return { cls: ' qz-mk-line', css: '' };
}
for (const [k, p] of Object.entries(PALETTE)) {      // 글자·보조 글자가 바탕에 묻히는 색이 새로 들어오면 빌드 로그에 경고
  if (contrast(p.ink, p.bg) < 4.5) console.warn(`경고: 릴스 색 ${k} 글자 대비 ${contrast(p.ink, p.bg).toFixed(1)} (4.5 미만)`);
  if (contrast(p.mute, p.bg) < 3) console.warn(`경고: 릴스 색 ${k} 보조 글자 대비 ${contrast(p.mute, p.bg).toFixed(1)} (3 미만)`);
}

// ②장면 개념 이름(‘손실 회피’)은 릴스에서 노랑 띠로 강조된다 — 홈에서도 같게. 작은따옴표 안 말만(모양으로 확정, 추측 아님 — 2026-10-08)
const quoted = (s) => (s.match(/‘([^’]{1,16})’/) || [])[1] || '';

// ---------- 릴스 퀴즈 칸 (질문 → 이야기처럼 넘어가는 결과) ----------
// base: 이 칸이 놓이는 페이지에서 그림·영상 파일까지의 경로, goHref: 마지막 장의 '설교 듣기' 링크
function reelPanel(r, d, { base, goHref, id }) {
  const p = PALETTE[r.color] || PALETTE.amber;
  // 릴스 형식 6가지(쇼츠 애니 ①장면과 같음) — A 체크리스트 / C 고르기 3장 / D 둘 중 하나(2장) / E 말풀이(단어+속뜻) / F 숫자(열 명 중 k 명) / B 한 문장
  // 고를 것이 있는 A·C·D 만 사용자가 눌러야 넘어가고, B·E·F 는 화살표로 바로 넘어감. 모르는 형식·빈 데이터는 B 로
  const kind = r.format === 'A' && r.items?.length ? 'A'
    : r.format === 'C' && r.options?.length ? 'C'
    : r.format === 'D' && r.options?.length === 2 ? 'D'
    : r.format === 'E' && r.word && r.meanings?.length ? 'E'
    : r.format === 'F' && r.statK > 0 ? 'F' : 'B';
  const passive = kind === 'B' || kind === 'E' || kind === 'F';
  const mk = markMode(p);
  // B(한 문장)는 고를 것이 없어 오른쪽이 비었다(10-08 본부장님: 썰렁함) → 이야기 첫 장면 그림을 종이 표지로 + 글자 버튼
  const coverImg = kind === 'B' ? (r.cover || r.scenes[0]?.image) : '';   // ①장면 그림(없는 옛 주는 ②장면 그림)
  const cover = !!coverImg;
  const n = kind === 'A' ? r.items.length : 0;
  const nextBtn = `<div class="qz-go qz-go-c">
                <button class="qz-next" type="button" aria-label="설교가 건네는 답 보기">${CHEV('M5 12h13M13 6l6 6-6 6')}</button>
              </div>`;
  const ask = kind === 'A'
    ? `<ul class="qz-note">
                ${r.items.map((t, i) => `<li><label><input type="checkbox" name="${id}-${i}"><span class="box" aria-hidden="true"></span><span class="qz-it">${esc(t)}</span></label></li>`).join('\n                ')}
              </ul>
              <div class="qz-go">
                <div class="qz-meter" data-t="${r.threshold}" data-n="${n}">
                  <span class="qm-track"><i></i><b style="left:${(r.threshold / n * 100).toFixed(1)}%"></b></span>
                  <span class="qm-txt"><em>0</em> / ${n}</span>
                </div>
                <button class="qz-next" type="button" aria-label="설교가 건네는 답 보기">${CHEV('M5 12h13M13 6l6 6-6 6')}</button>
              </div>`
    : kind === 'C' || kind === 'D' ? `<div class="qz-cards${kind === 'D' ? ' qz-two' : ''}">
                ${r.options.map((t, i) => `<button class="qz-card" type="button"><span class="qc-l">${'ABCDE'[i]}</span><span class="qc-t">${esc(t)}</span></button>`).join(kind === 'D' ? '\n                <span class="qz-vs" aria-hidden="true">vs</span>\n                ' : '\n                ')}
              </div>
              ${nextBtn}`
    : kind === 'E' ? `<div class="qz-word">
                <strong class="qw-w">‘${esc(r.word)}’</strong>
                <ul class="qw-m">
                ${r.meanings.map((t) => `<li>${esc(t)}</li>`).join('\n                ')}
                </ul>
              </div>
              ${nextBtn}`
    : kind === 'F' ? `<div class="qz-ten" role="img" aria-label="열 명 중 ${r.statK}명">
                ${Array.from({ length: 10 }, (_, i) => `<i${i < r.statK ? ' class="on"' : ''} style="--i:${i}"></i>`).join('')}
              </div>
              ${nextBtn}`
    : cover ? `<button class="qz-cover" type="button" aria-label="설교가 건네는 답 보기">
                <span class="qc-paper"><img src="${base}${esc(coverImg)}" alt="" width="540" height="452" loading="lazy"></span>
              </button>`
    : nextBtn;
  const scenes = r.scenes.map((s) => `
              <div class="qs-s">
                ${s.image ? `<img class="qs-art" src="${base}${esc(s.image)}" alt="" width="540" height="452" loading="lazy">` : ''}
                <div class="qs-txt">
                  <h3>${mark(s.big, r.highlight && s.big.includes(r.highlight) ? r.highlight : quoted(s.big))}</h3>
                  ${s.small ? `<p>${esc(s.small)}</p>` : ''}
                </div>
              </div>`).join('');
  const end = `
              <div class="qs-s qs-end">
                <h3 class="qe-h">이 질문의 답은 설교에 있어요.</h3>
                <div class="qe-sermon">
                  <button class="yt qe-yt" type="button" data-yt="${esc(d.videoId)}" aria-label="${esc(d.title)} 설교 영상 재생"><img src="${thumb(d.videoId)}" alt="${esc(d.title)} 설교 영상"><span class="yt-play">${PLAY}</span></button>
                  <a class="qe-body" href="${goHref}">
                    <span class="qe-k">${mdDate(d.date)} 주일 설교</span>
                    <span class="qe-title">${esc(d.title)}</span>
                    <span class="qe-ref">${esc(scriptureLabel(d))} 설교 · ${esc(d.preacher)}</span>
                  </a>
                </div>
              </div>`;
  return `
        <div class="st-p qz${passive ? ' ready qz-b' : ''}${cover ? ' qz-has-cover' : ''}${mk.cls}" role="tabpanel" id="${id}" data-format="${kind}" style="--q-bg:${p.bg};--q-ink:${p.ink};--q-mute:${p.mute}${mk.css}">
          <div class="qz-view qz-ask">
            <div class="qz-q">
              <p class="st-kicker">질문으로 만나는 설교</p>
              <h2>${kind === 'B' || kind === 'E' ? mark(r.question, r.highlight) : esc(r.question)}</h2>
              ${kind === 'A' ? `<p class="qz-sub">${r.threshold}개 이상이면, 끝까지 보세요</p>` : kind === 'C' ? '<p class="qz-sub">하나를 골라 보세요</p>' : kind === 'D' ? '<p class="qz-sub">둘 중 하나만 골라 보세요</p>' : ''}
              ${(kind === 'C' || kind === 'D') && r.hint ? `<p class="qz-hint">${esc(r.hint)}</p>` : ''}
              ${passive && r.hint ? `<p class="qz-lead">${esc(r.hint)}</p>` : ''}
              ${cover ? `<button class="qz-pill" type="button">설교가 건네는 답 보기 ${CHEV('M5 12h13M13 6l6 6-6 6')}</button>` : ''}
            </div>
            <div class="qz-a">
              ${ask}
            </div>
          </div>
          <div class="qz-view qz-story" aria-live="polite">
            <div class="qs-bars">${Array.from({ length: r.scenes.length + 1 }, () => '<i><b></b></i>').join('')}</div>
            <div class="qs-stage">${scenes}${end}
            </div>
            <button class="qs-zone prev" type="button" aria-label="이전 장면"></button>
            <button class="qs-zone next" type="button" aria-label="다음 장면"><span class="qs-arrow" aria-hidden="true">${CHEV('M9 5l7 7-7 7')}</span></button>
          </div>
        </div>`;
}

// ---------- 말씀 카드(폰 배경화면) ----------
// 주제 태그 — 쇼츠 config.yaml verse_card.themes 와 같은 목록·순서(카드마다 1~2개). 성경 책 태그는 출처에서 자동
const WP_THEMES = ['위로', '소망', '믿음', '사랑', '평안', '감사', '용기', '인도하심'];
const WP_TAGS_MIN = 6;   // 카드가 이만큼 쌓여야 태그 칩을 보인다(1~2장일 때 칩 8개는 허전함)
const wpTags = (c) => [...(c.themes || []), ...(c.book ? [c.book] : [])];
// 칩으로 보일 태그: 주제는 1장 이상, 책은 2장 이상(한 장짜리 책 칩이 줄줄이 늘지 않게)
function wpChipTags(cards) {
  if (cards.length < WP_TAGS_MIN) return [];
  const n = (t) => cards.filter((c) => wpTags(c).includes(t)).length;
  const books = [...new Set(cards.map((c) => c.book).filter(Boolean))].filter((b) => n(b) >= 2)
    .sort((a, b) => n(b) - n(a) || a.localeCompare(b, 'ko'));
  return [...WP_THEMES.filter((t) => n(t) > 0), ...books].map((t) => ({ t, n: n(t), book: !WP_THEMES.includes(t) }));
}
let WP_CHIPS = [];   // main 에서 전체 카드로 한 번 계산 — 배경화면 탭 칩과 원본 창의 태그 링크가 같은 목록을 쓴다
// base: 이 칸이 놓이는 페이지에서 sermon/ 폴더까지의 경로, sermonHref: 카드의 설교 페이지 주소를 만드는 함수
const wpCard = (c, base, sermonHref) => `<button class="wpc" type="button" data-wp-img="${base}${esc(c.image)}" data-wp-ref="${esc(c.ref)}" data-wp-verse="${esc(c.verse)}" data-wp-name="시온장로교회-${esc(c.slug)}.jpg" data-wp-tags="${esc(wpTags(c).join(' '))}"${c.sermon && sermonHref(c.sermon) ? ` data-wp-sermon="${sermonHref(c.sermon)}"` : ''}>
                <img src="${base}${esc(c.thumb)}" alt="${esc(c.phrase)} 말씀 배경화면 — ${esc(c.verse)}" width="360" height="779" loading="lazy">
                <span class="wpc-ref">${esc(c.ref)}</span>
              </button>`;

function wpPanel(cards, base, sermonHref) {
  const PER = 3, pages = [];
  for (let i = 0; i < cards.length; i += PER) pages.push(cards.slice(i, i + PER));
  return `
      <div class="st-p ix-p wp-p cz" role="tabpanel" id="wallpaper">
        <p class="sx-h">말씀 배경화면 · <span class="wp-count">${cards.length}</span>장</p>
        <p class="wp-lead">카드를 누르면 휴대폰 배경화면 크기 원본이 열립니다. 사랑하는 이들에게도 나눠 주세요.</p>${WP_CHIPS.length ? `
        <div class="wp-tags" role="group" aria-label="주제로 보기">
          <button type="button" class="wp-tag" data-tag="" aria-pressed="true">전체 <small>${cards.length}</small></button>${WP_CHIPS.map((c, i) => `${c.book && !(WP_CHIPS[i - 1] || {}).book ? '<span class="wp-tags-sep" aria-hidden="true"></span>' : ''}
          <button type="button" class="wp-tag" data-tag="${esc(c.t)}" aria-pressed="false">#${esc(c.t)} <small>${c.n}</small></button>`).join('')}
        </div>` : ''}
        <div class="cz-track">${pages.map((pg) => `
          <div class="cz-slide wp-page">${pg.map((c) => wpCard(c, base, sermonHref)).join('')}</div>`).join('')}
        </div>${bar(pages.length, '배경화면', true)}
      </div>`;
}

const wpDialog = (home = '') => `
<dialog class="wp" id="wp-view" aria-label="말씀 배경화면" data-home="${home}" data-chips="${esc(WP_CHIPS.map((c) => c.t).join(' '))}">
  <div class="wp-in">
    <button class="wp-x" type="button" aria-label="닫기">×</button>
    <img class="wp-img" src="" alt="">
    <div class="wp-side">
      <p class="wp-ref"></p>
      <p class="wp-verse"></p>
      <p class="wp-taglinks"></p>
      <p class="wp-how wp-ios">사진을 길게 누른 뒤 <b>‘사진 앱에 저장’</b>을 누르세요. 사진 앱에서 공유 → 배경화면으로 지정.</p>
      <a class="wp-save" href="" download>배경화면 저장</a>
      <a class="wp-go" href="">이 말씀이 나온 설교 듣기 ${ARROW}</a>
    </div>
  </div>
</dialog>`;

// ---------- 1분 영상(쇼츠) 칸 ----------
function shortsPanel(d) {
  const n = d.shorts.length;
  const slides = d.shorts.map((c, i) => `
            <div class="cz-slide sh">
              ${video(c.id, c.title, 'yt-tall', c.thumb)}
              <div class="sh-txt">
                <p class="st-kicker">1분 영상${n > 1 ? ` · ${i + 1}/${n}` : ''}</p>
                <h2>${esc(c.title)}</h2>
                <p>${esc(c.description)}</p>
                <a class="sh-more" href="#watch" data-start="${c.start}">설교에서 이어 듣기</a>
              </div>
            </div>`).join('');
  return `
        <div class="st-p sh-p cz" id="shorts" role="tabpanel">
          <div class="cz-track">${slides}
          </div>${bar(n, '영상')}
        </div>`;
}

function tabsBox(label, tabs, panels, extraClass = '') {
  return `<div class="st-box${extraClass}" data-tabs>
    ${tabs.length > 1 ? `<div class="st-tabs" role="tablist" aria-label="${esc(label)}">
      ${tabs.map((t, i) => { const [l, s] = Array.isArray(t) ? t : [t]; return `<button role="tab" type="button" aria-selected="${i ? 'false' : 'true'}"${s ? ` aria-label="${esc(l)}"` : ''}>${s ? `<span class="t-l">${esc(l)}</span><span class="t-s" aria-hidden="true">${esc(s)}</span>` : esc(l)}</button>`; }).join('\n      ')}
    </div>` : ''}
    <div class="st-frame">${panels.join('')}
    </div>
  </div>`;
}

function sermonLD(d, url) {
  const v = {
    '@context': 'https://schema.org', '@type': 'VideoObject',
    name: `${d.title} (${d.scripture}) ${d.preacher} — ${CH.name}`,
    description: [d.coreQuestion, `${CH.name} ${koDate(d.date)} 주일예배 설교.`, CH.tag].filter(Boolean).join(' '),
    thumbnailUrl: [thumb(d.videoId)],
    uploadDate: d.date + 'T12:00:00-07:00',
    embedUrl: `https://www.youtube.com/embed/${d.videoId}`,
    contentUrl: `https://www.youtube.com/watch?v=${d.videoId}`,
    inLanguage: 'ko', url, keywords: ['시애틀 한인교회', '주일예배 설교', d.scripturePhrase, ...d.topics].filter(Boolean).join(', '),
    publisher: CHURCH_LD,
  };
  if (d.shorts.length) v.hasPart = d.shorts.map((c) => ({
    '@type': 'Clip', name: c.title, startOffset: c.start, endOffset: c.end,
    url: `https://www.youtube.com/watch?v=${d.videoId}&t=${c.start}` }));
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: '말씀', item: SITE + '/sermon/' },
    { '@type': 'ListItem', position: 3, name: d.title, item: url }] };
  return [v, crumbs];
}

function sermonPage(d, prev, next, cards = []) {
  const url = `${SITE}/sermon/${d.date}/`, up = '../../';
  const sl = scriptureLabel(d);
  const title = `${d.title} — ${sl} 설교 | ${CH.suffix}`;
  const desc = `${koDate(d.date)} 주일예배 설교 「${d.title}」(${d.scripture}). ${d.coreQuestion} ${CH.tag} ${d.preacher}.`;
  const image = d.shorts[0]?.thumb ? `${url}${d.shorts[0].thumb}` : d.reels[0]?.scenes[0]?.image ? `${url}${d.reels[0].scenes[0].image}` : thumb(d.videoId);
  const tabs = [...d.reels.map((r) => r.question), ...(d.shorts.length ? [`1분 영상 ${d.shorts.length}편`] : [])];
  const panels = [...d.reels.map((r) => reelPanel(r, d, { base: '', goHref: '#watch', id: `q${r.n}` })), ...(d.shorts.length ? [shortsPanel(d)] : [])];
  return head({ title, desc, url, image, up, ld: sermonLD(d, url) }) + nav(up) + `
<main>
<header class="sm-head">
  <div class="wrap">
    <nav class="sm-crumb" aria-label="현재 위치"><a href="${up}index.html">홈</a><span>›</span><a href="../">말씀</a><span>›</span><span>${dotDate(d.date)}</span></nav>
    <p class="sm-tag">${CH.tag}</p>
    <p class="sm-kicker">${d.replay ? `다시 듣는 말씀 · <time datetime="${d.date}">${koDate(d.date)}</time> 설교` : `주일 설교 · <time datetime="${d.date}">${koDate(d.date)}</time>`}</p>
    <h1>${esc(d.title)}</h1>
    <p class="sm-meta">${esc(sl)} 설교 · ${esc(d.preacher)}</p>
    ${d.coreQuestion ? `<p class="sm-q">${esc(d.coreQuestion)}</p>` : ''}
  </div>
</header>
<section class="sm-stage" aria-label="이 설교 먼저 만나기">
  <div class="wrap">
    ${tabsBox('이 설교 먼저 만나기', tabs, panels)}
  </div>
</section>
<section class="sm-watch" id="watch" aria-label="설교 전체 영상">
  <div class="wrap">
    <div class="sw-video">
      ${video(d.videoId, `${d.title} 설교 영상`, 'yt-wide')}
    </div>
    <dl class="sw-info">
      <div><dt>설교</dt><dd>${esc(d.title)}</dd></div>
      <div><dt>본문</dt><dd>${esc(d.scripture)}</dd></div>
      <div><dt>날짜</dt><dd>${koDate(d.date)} 주일예배</dd></div>
      <div><dt>설교자</dt><dd>${esc(d.preacher)} · ${CH.name}</dd></div>
      ${d.topics.length ? `<div><dt>주제</dt><dd>${d.topics.map(esc).join(' · ')}</dd></div>` : ''}
    </dl>
    <p class="sw-links"><a href="../">지난 설교 모두 보기</a></p>
  </div>
</section>
${cards.length ? `
<section class="sm-cards" id="wallpaper" aria-label="이 설교의 말씀 카드">
  <div class="wrap">
    <div class="wk-head"><h2 class="wk-k">이 설교의 말씀 카드</h2><p class="wk-s">휴대폰 배경화면으로 저장하고, 사랑하는 이들에게 나눠 주세요.</p></div>
    <div class="wp-row">${cards.map((c) => wpCard(c, '../', () => '')).join('')}</div>
    <p class="sw-links"><a href="../#wallpaper">말씀 배경화면 모두 보기</a></p>
  </div>
</section>${wpDialog('../')}` : ''}
${visit(up)}
${prev || next ? `
<nav class="sm-pager" aria-label="다른 설교">
  <div class="wrap">
    ${prev ? `<a href="../${prev.date}/"><span>${d.replay ? '다시 듣는 말씀' : '이전 설교'} · ${dotDate(prev.date)}</span>${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="nx" href="../${next.date}/"><span>${d.replay ? '다시 듣는 말씀' : '다음 설교'} · ${dotDate(next.date)}</span>${esc(next.title)}</a>` : '<span></span>'}
  </div>
</nav>` : ''}
</main>
` + footer(up);
}

// ---------- 말씀 모음 페이지 ----------
function indexPage(all, cards = []) {
  const url = `${SITE}/sermon/`, up = '../';
  const replays = all.filter((d) => d.replay).slice().reverse();          // 다시 듣는 말씀(2026-10-08): 옛 설교 중 골라 쇼츠로 만든 것 — 주일 설교 목록과 섞지 않음
  all = all.filter((d) => !d.replay);
  const latest = all[all.length - 1], rest = all.slice(0, -1).reverse();
  const title = `말씀 — 주일 설교와 성경공부 교재 | ${CH.suffix}`;
  const desc = `${CH.tag} 주일예배 설교 영상과 1분 말씀, 질문으로 만나는 설교, 휴대폰 말씀 배경화면, 소그룹 성경공부 교재 「부르심」. 담임 ${CH.pastor}.`;
  const list = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '말씀', url, inLanguage: 'ko', publisher: CHURCH_LD,
    mainEntity: { '@type': 'ItemList', itemListElement: all.slice().reverse().map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${url}${d.date}/`, name: d.title })) } };

  // 질문으로 만나는 설교 — 설교마다 퀴즈 묶음 하나, 같은 자리에 겹쳐 두고 하나만 보인다(최근 12개 질문까지)
  const withQ = all.filter((d) => d.reels.length).slice().reverse();
  const pairs = [];
  let qCount = 0;
  for (const d of withQ) { if (qCount >= 12) break; pairs.push(d); qCount += d.reels.length; }
  const pairUnit = (d, i) => `
      <div class="pr${i ? '' : ' on'}" id="p-${d.date}" data-tabs>
        <div class="pr-top">
          ${d.reels.length > 1 ? `<div class="st-tabs" role="tablist" aria-label="${esc(d.title)} 질문">
            ${d.reels.map((r, k) => `<button role="tab" type="button" aria-selected="${k ? 'false' : 'true'}">${esc(r.question)}</button>`).join('\n            ')}
          </div>` : ''}
        </div>
        <div class="st-frame">${d.reels.map((r) => reelPanel(r, d, { base: `${d.date}/`, goHref: `${d.date}/#watch`, id: `w-${d.date}-${r.n}` })).join('')}
        </div>
      </div>`;
  const weekly = pairs.length ? `
<section class="sm-stage sm-weekly" aria-label="질문으로 만나는 설교">
  <div class="wrap">
    <div class="wk-head"><h2 class="wk-k">질문으로 만나는 설교</h2><p class="wk-s">질문에 답해 보고, 그 답이 담긴 설교를 들어 보세요.</p></div>
    <div class="pr-stack">${pairs.map(pairUnit).join('')}
    </div>
  </div>
</section>` : '';

  // 지난 설교 목록 — 4편씩 한 칸에서 넘김
  const PER = 4, pages = [];
  for (let i = 0; i < rest.length; i += PER) pages.push(rest.slice(i, i + PER));
  const card = (d) => `<a class="sx" href="${d.date}/"><span class="sx-date">${dotDate(d.date)}</span><span class="sx-title">${esc(d.title)}</span><span class="sx-ref">${esc(scriptureLabel(d))}</span></a>`;
  const listHtml = rest.length ? `
          <div class="sx-side cz">
            <p class="sx-h">지난 설교</p>
            <div class="cz-track">${pages.map((pg) => `
              <div class="cz-slide sx-page">${pg.map(card).join('')}</div>`).join('')}
            </div>${bar(pages.length, '목록', true)}
          </div>` : '';
  const sermonsPanel = `
      <div class="st-p ix-p" role="tabpanel">
        <div class="ix-grid">
          <div class="ix-latest">
            <div class="ix-media"><button class="yt ix-yt" type="button" data-yt="${esc(latest.videoId)}" aria-label="${esc(latest.title)} 설교 영상 재생"><img src="${thumb(latest.videoId)}" alt="${esc(latest.title)} 설교 영상" loading="lazy"><span class="yt-play">${PLAY}</span></button><span class="ix-badge">이번 주 말씀</span></div>
            <a class="ix-link" href="${latest.date}/">
              <span class="ix-date">${koDate(latest.date)} 주일예배</span>
              <span class="ix-title">${esc(latest.title)}</span>
              <span class="ix-ref">${esc(scriptureLabel(latest))} 설교 · ${esc(latest.preacher)}</span>
              ${latest.coreQuestion ? `<span class="ix-q">${esc(latest.coreQuestion)}</span>` : ''}
            </a>
          </div>${listHtml}
        </div>
      </div>`;

  // 최근 질문 — 질문 카드, 한 칸에서 넘김(최근 12개), 누르면 위 묶음이 그 질문으로 바뀜
  const allQ = [];
  for (const d of pairs) d.reels.forEach((r, k) => allQ.push({ d, r, k }));
  const qPages = [];
  const QPER = 3;
  for (let i = 0; i < Math.min(allQ.length, 12); i += QPER) qPages.push(allQ.slice(i, i + QPER));
  const qcard = ({ d, r, k }) => { const p = PALETTE[r.color] || PALETTE.amber;
    return `<a class="qx" href="${d.date}/#q${r.n}" data-pair="p-${d.date}" data-q="${k}" style="--q-bg:${p.bg};--q-ink:${p.ink};--q-mute:${p.mute}">
                ${r.scenes[0]?.image ? `<img src="${d.date}/${esc(r.scenes[0].image)}" alt="" loading="lazy">` : ''}
                <span class="qx-q">${esc(r.question)}</span>
                <span class="qx-s">${mdDate(d.date)} · ${esc(d.title)}</span>
              </a>`; };
  const questionsPanel = allQ.length ? `
      <div class="st-p ix-p qx-p cz" role="tabpanel">
        <p class="sx-h">최근 질문 · ${allQ.length}개</p>
        <div class="cz-track">${qPages.map((pg) => `
          <div class="cz-slide qx-page">${pg.map(qcard).join('')}</div>`).join('')}
        </div>${bar(qPages.length, '질문', true)}
      </div>` : '';

  // 다시 듣는 말씀(2026-10-08 본부장님): 옛 설교 중 골라 쇼츠로 만든 것 — 주일 설교와 섞지 않고 탭 상자 아래 독립 선반.
  // 카드는 설교가 아니라 1분 영상 하나하나(고른 이유 = 그 질문이 지금도 통해서). 3장씩 넘김, 폰은 옆으로 밀기. 공개된 1분 영상이 없으면 선반 자체가 없음
  const rpItems = [];
  for (const d of replays) for (const s of d.shorts) rpItems.push({ d, s });
  const RPER = 3, rpPages = [];
  for (let i = 0; i < rpItems.length; i += RPER) rpPages.push(rpItems.slice(i, i + RPER));
  const rpCard = ({ d, s }) => `
          <a class="rc" href="${d.date}/#shorts">
            <span class="rc-media">${s.thumb ? `<img src="${d.date}/${esc(s.thumb)}" alt="" loading="lazy">` : ''}<span class="rc-play" aria-hidden="true">${PLAY}</span></span>
            <span class="rc-q">${esc(s.title)}</span>
            <span class="rc-s">${esc(d.title)} · ${esc(scriptureLabel(d))} · ${d.date.slice(0, 4)}년</span>
          </a>`;
  const replayShelf = rpItems.length ? `
<section class="sm-stage sm-replay" aria-label="다시 듣는 말씀">
  <div class="wrap">
    <div class="wk-head"><h2 class="wk-k">다시 듣는 말씀</h2><p class="wk-s">지난 설교 가운데 지금도 마음에 닿는 말씀을 골라 1분 영상으로 담았습니다.</p></div>
    <div class="cz rc-box">
      <div class="cz-track">${rpPages.map((pg) => `
        <div class="cz-slide rc-page">${pg.map(rpCard).join('')}
        </div>`).join('')}
      </div>${bar(rpPages.length, '다시 듣는 말씀')}
    </div>
  </div>
</section>` : '';

  const bookPanel = `
      <div class="st-p ix-p" role="tabpanel" id="book">
        <div class="bk">
          <img class="bk-cover" src="${up}images/calling05-793x1024.jpg" alt="소그룹 성경공부 교재 부르심 표지" loading="lazy">
          <div class="bk-body">
            <h2>소그룹 성경공부 교재, 부르심</h2>
            <p class="bk-sub">${CH.pastor} · 평신도 리더들을 위한 소그룹 성경공부 · 6과</p>
            <ol class="bk-lessons">
              ${LESSONS.map((l, i) => `<li><button class="ls" type="button" data-lesson="${i + 1}" aria-haspopup="dialog"><span class="ls-n">${i + 1}과 · ${l.t}</span><span class="ls-q">${esc(l.q)}</span><span class="ls-go">맛보기</span></button></li>`).join('\n              ')}
            </ol>
            <p class="bk-dl"><a href="${up}${EPUB}" download="부르심.epub">eBook 내려받기 (ePub)</a> · Apple Books, ReadEra 등 전자책 앱에서 열람</p>
          </div>
        </div>
      </div>`;

  const hasPage = (w) => all.some((d) => d.date === w) ? `${w}/` : '';
  // 폰에선 짧은 이름(오른쪽 탭 잘림 방지) — [긴 이름, 짧은 이름]
  const tabs = [['주일 설교', '설교'], ...(allQ.length ? [['최근 질문', '질문']] : []), ...(cards.length ? [['말씀 배경화면', '배경화면']] : []), ['성경공부 교재', '교재']];
  const panels = [sermonsPanel, ...(allQ.length ? [questionsPanel] : []), ...(cards.length ? [wpPanel(cards, '', hasPage)] : []), bookPanel];
  return head({ title, desc, url, image: thumb(latest.videoId), type: 'website', up, ld: [list, BOOK_LD] }) + nav(up) + `
<main>
<header class="sm-head sm-head-idx">
  <div class="wrap">
    <nav class="sm-crumb" aria-label="현재 위치"><a href="${up}index.html">홈</a><span>›</span><span>말씀</span></nav>
    <p class="sm-tag">${CH.tag}</p>
    <h1>말씀</h1>
    <p class="sm-meta">주일 설교와 질문으로 만나는 설교, 소그룹 성경공부 교재를 나눕니다.</p>
  </div>
</header>
${weekly}
<section class="sm-stage sm-idx" aria-label="말씀">
  <div class="wrap">
    ${tabsBox('말씀', tabs, panels)}
  </div>
</section>
${replayShelf}
${lessonSheets(up)}${cards.length ? wpDialog() : ''}
${visit(up)}
</main>
` + footer(up);
}

// 교재 맛보기 — 과마다 한 장. 글은 HTML에 그대로 두고(검색), 누를 때만 띄운다
const BOOK_LD = {
  '@context': 'https://schema.org', '@type': 'Book', name: '부르심', alternateName: '소그룹 성경공부 교재 부르심',
  author: { '@type': 'Person', name: '이영래' }, publisher: CHURCH_LD, inLanguage: 'ko', bookFormat: 'https://schema.org/EBook',
  genre: '소그룹 성경공부', isAccessibleForFree: true, url: `${SITE}/sermon/#book`,
  hasPart: LESSONS.map((l, i) => ({ '@type': 'Chapter', position: i + 1, name: `${i + 1}과 ${l.t}`, url: `${SITE}/sermon/#lesson-${i + 1}` })),
};
function lessonSheets(up) {
  const N = LESSONS.length;
  const arrow = (d) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${d}"/></svg>`;
  return `<div class="lp-set">${LESSONS.map((l, i) => { const n = i + 1;
    return `
<dialog class="lp" id="lesson-${n}" aria-labelledby="lp-${n}-t">
  <div class="lp-bar">
    <span class="lp-book">부르심 <i>소그룹 성경공부</i></span>
    <span class="lp-pg">
      <button type="button" data-go="${n - 1}" aria-label="이전 과"${n === 1 ? ' disabled' : ''}>${arrow('M10 3 5 8l5 5')}</button>
      <b>${n}</b><span>/ ${N}</span>
      <button type="button" data-go="${n + 1}" aria-label="다음 과"${n === N ? ' disabled' : ''}>${arrow('M6 3l5 5-5 5')}</button>
    </span>
    <button class="lp-x" type="button" aria-label="닫기">${arrow('M3.5 3.5l9 9M12.5 3.5l-9 9')}</button>
  </div>
  <div class="lp-body">
    <header class="lp-head">
      <p class="lp-no">제${n}과</p>
      <h3 id="lp-${n}-t">${esc(l.t)}</h3>
      <p class="lp-ref"><span>본문</span>${l.ref.map((r) => `<em>${esc(r)}</em>`).join('')}</p>
    </header>
    <h4 class="lp-sec">성경 속으로</h4>
    <ol class="lp-qs">
      ${l.qs.map((q) => `<li><p>${esc(q)}</p><span class="lp-lines" aria-hidden="true"></span></li>`).join('\n      ')}
    </ol>
    <div class="lp-share">
      <h4>나눔</h4>
      <p>${esc(l.share)}</p>
    </div>
    <div class="lp-more">
      <img src="${up}images/calling05-793x1024.jpg" alt="" width="66" height="85" loading="lazy">
      <div>
        <p class="lp-count"><span class="lp-ticks" aria-hidden="true">${Array.from({ length: l.total }, (_, k) => `<i${k < l.qs.length ? ' class="on"' : ''}></i>`).join('')}</span>질문 ${l.total}개 가운데 ${l.qs.length}개</p>
        <p class="lp-more-h">맛보기는 여기까지입니다.</p>
        <p class="lp-more-p">제${n}과의 나머지 질문과 나눔은 교재에서 이어집니다. 교재를 내려받아 소그룹에서, 혹은 혼자서 차근차근 풀어 보세요.</p>
        <a class="lp-dl" href="${up}${EPUB}" download="부르심.epub">교재 내려받기<small>무료 · ePub · 6과</small></a>
      </div>
    </div>
  </div>
</dialog>`; }).join('')}
</div>`;
}

// ---------- 홈 화면 '말씀' 영역 ----------
// index.html의 표시 사이(HOME_A~HOME_B)만 이 생성기가 채운다. 나머지 홈은 손으로 고친다.
// 가장 최근 퀴즈가 있는 설교의 질문을 그대로 무대에 올리고, 퀴즈가 아직 없으면 최신 설교 영상을 그 자리 재생 카드로.
const HOME_A = '<!-- 말씀:시작 — scripts/build-sermons.mjs가 채운다. 직접 고치지 말 것 -->';
const HOME_B = '<!-- 말씀:끝 -->';
// 홈 상태 3가지(2026-10-08, 견본 QUIZ_PREVIEW 로 셋 다 확인): (a) 퀴즈가 아직 없음 → 영상 카드만 / (b) 최신 설교에 퀴즈 → 질문 탭 먼저, 영상 탭 마지막
// (c) 새 설교는 나왔는데 퀴즈는 지난 설교 것뿐(주일 오후~첫 릴스 게시 4시간 뒤, 매주 2~3일) → 영상 탭 먼저(열림), 지난 질문 탭은 '지난주' 표시로 뒤에.
//     전에는 (c)에서 제목 줄이 지난 설교 날짜, 영상·최근 설교는 새 설교라 한 칸에 두 주가 섞여 보였다
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function homeWord(all) {
  const latest = all[all.length - 1];
  const q = all.slice().reverse().find((d) => d.reels.length);
  const recent = all.slice().reverse().slice(0, 3);
  const stale = !!q && q.date !== latest.date;
  const ago = stale ? (daysBetween(q.date, latest.date) === 7 ? '지난주' : mdDate(q.date)) : '';
  const fresh = !!q && !stale;                                  // 이번 주 퀴즈가 무대 주인
  const head = (d, lead) => `
    <div class="hw-head">
      <div>
        <p class="hw-k">말씀 · ${mdDate(d.date)} 주일 설교</p>
        <h2 class="hw-h">${fresh ? '질문으로 만나는 설교' : '최근 주일 설교'}</h2>
        <p class="hw-s">${lead}</p>
      </div>
      <a class="hw-all" href="sermon/">말씀 전체 보기 ${ARROW}</a>
    </div>`;
  // 최신 설교 영상 카드 — 그 자리 재생. 첫 화면 '말씀 듣기'가 이 칸(#word-video)을 바로 연다
  const vid = (cls) => `
        <div class="${cls}" id="word-video"${cls.includes('st-p') ? ' role="tabpanel"' : ''}>
          <div class="ix-media">${video(latest.videoId, `${latest.title} 설교 영상`, 'ix-yt')}<span class="ix-badge">최근 설교</span></div>
          <a class="ix-link" href="sermon/${latest.date}/">
            <span class="ix-date">${koDate(latest.date)} 주일예배</span>
            <span class="ix-title">${esc(latest.title)}</span>
            <span class="ix-ref">${esc(scriptureLabel(latest))} 설교 · ${esc(latest.preacher)}</span>
            ${latest.coreQuestion ? `<span class="ix-q">${esc(latest.coreQuestion)}</span>` : ''}
          </a>
        </div>`;
  // 퀴즈가 있으면: 질문 탭들 + 마지막에 '▶ 이번 설교 영상' 탭(처음엔 퀴즈가 열려 있음)
  const qTabs = q ? q.reels.map((r, k) => `<button role="tab" type="button" aria-selected="${fresh && !k ? 'true' : 'false'}">${stale ? `<span class="t-ago">${ago}</span> ` : ''}${esc(r.question)}</button>`) : [];
  const vTab = `<button role="tab" type="button" aria-selected="${stale ? 'true' : 'false'}" class="st-tab-vid"><span aria-hidden="true">▶</span> 이번 설교 영상</button>`;
  const qPanels = q ? q.reels.map((r) => reelPanel(r, q, { base: `sermon/${q.date}/`, goHref: `sermon/${q.date}/#watch`, id: `h-${q.date}-${r.n}` })).join('') : '';
  const stage = q ? `
    <div class="pr on" id="h-${latest.date}" data-tabs>
      <div class="pr-top">
        <div class="st-tabs" role="tablist" aria-label="${stale ? `${esc(latest.title)} 설교 영상과 ${ago} 질문` : `${esc(q.title)} 질문과 설교 영상`}">
          ${(stale ? [vTab, ...qTabs] : [...qTabs, vTab]).join('\n          ')}
        </div>
      </div>
      <div class="st-frame">${stale ? vid('st-p hw-latest') + qPanels : qPanels + vid('st-p hw-latest')}
      </div>
    </div>` : vid('hw-latest');
  const lead = fresh ? `${esc(q.title)} · ${esc(scriptureLabel(q))} — 질문에 답해 보면, 그 답이 담긴 설교가 이어집니다.`
    : `${esc(scriptureLabel(latest))} 설교 · ${esc(latest.preacher)}${stale ? ` — ${ago} 질문도 아래 탭에서 이어 보실 수 있어요.` : ''}`;
  return `${HOME_A}
<section class="hw" id="word" aria-label="말씀">
  <div class="wrap">${head(latest, lead)}
    <div class="pr-stack">${stage}
    </div>
    <div class="hw-foot">
      <p class="hw-lab">최근 주일 설교</p>
      <div class="hw-list">
        ${recent.map((d) => `<a href="sermon/${d.date}/"><span class="hw-d">${dotDate(d.date)}</span><span class="hw-t">${esc(d.title)}</span><span class="hw-r">${esc(scriptureLabel(d))}</span></a>`).join('\n        ')}
      </div>
      <a class="hw-book" href="sermon/#book"><img src="images/calling05-793x1024.jpg" alt="" width="40" height="52" loading="lazy"><span><b>소그룹 성경공부 교재 「부르심」</b>6과 맛보기 ${ARROW}</span></a>
    </div>
  </div>
</section>
${HOME_B}`;
}
function writeHome(all) {
  const f = join(ROOT, 'index.html');
  if (!existsSync(f) || !all.length) return;
  const src = readFileSync(f, 'utf8');
  const i = src.indexOf(HOME_A), j = src.indexOf(HOME_B);
  if (i < 0 || j < i) return;   // 표시가 없는 홈은 건드리지 않는다
  let out = src.slice(0, i) + homeWord(all) + src.slice(j + HOME_B.length);
  out = out.replace(/(css\/sermon\.css|js\/sermon\.js)\?v=[\w]+/g, `$1?v=${V}`);
  if (out !== src) { writeFileSync(f, out); console.log('만듦: index.html (홈 말씀 영역)'); }
}

// ---------- sitemap ----------
function sitemap(all) {
  const fixed = [['', '1.0'], ['worship.html', '0.8'], ['sermon/', '0.9'], ['staff.html', '0.6'], ['pastor.html', '0.6'], ['travel.html', '0.5']];
  const last = all.length ? all[all.length - 1].date : '';
  const rows = [
    ...fixed.map(([p, pr]) => `  <url><loc>${SITE}/${p}</loc>${p === 'sermon/' && last ? `<lastmod>${last}</lastmod>` : ''}<priority>${pr}</priority></url>`),
    ...all.slice().reverse().map((d) => `  <url><loc>${SITE}/sermon/${d.date}/</loc><lastmod>${d.date}</lastmod><priority>0.7</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

// ---------- 퀴즈 견본(2026-10-08) ----------
// 형식(A~F)·색(6)을 새로 넣거나 퀴즈 모양을 바꾸면 배포 전에 모든 조합을 한 화면에서 본다(10-04 B 퀴즈가 실제 주에서 처음 드러난 사고).
// QUIZ_PREVIEW=/tmp/quiz.html node scripts/build-sermons.mjs → 사이트 루트 기준 상대 경로라 사이트 폴더 안(또는 같은 구조의 사본)에 써야 그림·스타일이 보임
if (process.env.QUIZ_PREVIEW) {
  const dd = join(ROOT, 'data', 'sermons');
  const weeks = readdirSync(dd).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(dd, f), 'utf8')));
  const real = {}; let host = weeks[weeks.length - 1];
  for (const w of weeks) for (const r of w.reels || []) { real[r.format] = { r, w }; }
  const imgW = Object.values(real).find((x) => x.r.scenes?.[0]?.image) || { w: host, r: { scenes: [] } };
  const sc = imgW.r.scenes.length ? imgW.r.scenes : [{ big: '견본 장면', small: '' }];
  const S = {                                                     // 실제 데이터가 없는 형식만 견본 글(화면 확인용)
    A: { format: 'A', question: '요즘 이런 적 있나요?', highlight: '', items: ['나는 원래 안 되는 사람', '시도하기 전에 포기함', '환경 탓하며 멈춤', '주변 응원도 안 믿김'], threshold: 2, hint: '' },
    B: { format: 'B', question: '확실히 이기는데 왜 불안할까요?', highlight: '왜 불안할까요', hint: '이미 이긴 싸움인데도 마음은 떨리죠' },
    C: { format: 'C', question: '스트레스 받을 때 나는?', highlight: '', options: ['혼자 참기', '짜증 내기', '누군가 찾기'], hint: '고른 답이 어릴 적 관계 습관과 이어질 수 있어요' },
    D: { format: 'D', question: '둘 중 하나만 고른다면?', highlight: '', options: ['조건이 맞으면 헌신', '조건 없이 먼저 헌신'], hint: '고른 쪽에 지금 내 마음이 보여요' },
    E: { format: 'E', question: '‘헌신’은 무슨 뜻일까요?', highlight: '헌신', word: '헌신', meanings: ['몸과 마음을 바쳐 힘을 다함', '설교에서는: 거래가 아니라 사랑으로 드림'], hint: '' },
    F: { format: 'F', question: '열 명 중 몇 명이 불안을 느낄까요?', highlight: '불안', statK: 7, hint: '(견본 숫자)' },
  };
  const panels = [];
  for (const f of 'ABCDEF') for (const color of Object.keys(PALETTE)) {
    const base = real[f] ? { ...real[f].r } : { ...S[f] };
    const w = real[f] ? real[f].w : imgW.w;
    const r = { ...base, n: 1, color, scenes: base.scenes?.length ? base.scenes : sc };
    panels.push({ f, color, html: reelPanel(r, w, { base: `sermon/${w.date}/`, goHref: '#', id: `pv-${f}-${color}` }).replace('class="st-p qz', 'class="st-p on qz'), real: !!real[f] });
  }
  const strip = (h) => h.replace(HOME_A, '').replace(HOME_B, '');
  const noReels = (d) => ({ ...d, reels: [] });
  const withReels = weeks.filter((d) => d.reels?.length);
  const lastW = withReels[withReels.length - 1] || weeks[weeks.length - 1];
  const nextDate = new Date(Date.parse(lastW.date) + 7 * 86400000).toISOString().slice(0, 10);
  const nextW = { ...noReels(lastW), date: nextDate, title: '(다음 주 설교 제목)', coreQuestion: '(다음 주 핵심 질문)' };
  const homes = [
    ['(a) 퀴즈가 아직 하나도 없을 때', strip(homeWord([noReels(lastW)]))],
    ['(b) 이번 주 설교에 퀴즈가 있을 때 — 평소', strip(homeWord(withReels.length ? withReels : weeks))],
    ['(c) 새 설교는 나왔는데 퀴즈는 지난주 것뿐일 때 — 주일 오후부터 첫 릴스 게시 4시간 뒤까지', strip(homeWord([...withReels, nextW]))],
  ];
  const page = `<!doctype html><html lang="ko" class="js"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>퀴즈 견본</title><link rel="stylesheet" href="css/style.css?v=${V}"><link rel="stylesheet" href="css/home.css?v=${V}"><link rel="stylesheet" href="css/sermon.css?v=${V}">
<style>body{background:#18505A;margin:0}.pv{max-width:1100px;margin:0 auto;padding:28px 20px 40px;color:#fff;font-family:Pretendard,system-ui,sans-serif}
.pv h1{font-size:22px;margin:0 0 4px}.pv p.d{opacity:.75;margin:0 0 18px;font-size:14px}.pv .row{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.pv .row button{-webkit-appearance:none;appearance:none;border:1.5px solid rgba(255,255,255,.35);background:transparent;color:#fff;border-radius:999px;padding:8px 14px;font:inherit;font-size:14px;cursor:pointer}
.pv .row button[aria-pressed=true]{background:#fff;color:#18505A;border-color:#fff}.pv .sw{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.pv .stage{margin-top:16px}.pv .stage .st-p{display:none}.pv .stage .st-p.cur{display:grid}.pv .note{font-size:13px;opacity:.7;margin-top:10px}</style></head><body><div class="pv">
<h1>홈페이지 퀴즈 견본 — 형식 ${'ABCDEF'.length}가지 × 색 ${Object.keys(PALETTE).length}가지</h1><p class="d">형식과 색을 눌러 첫 화면을 보고, 버튼·그림을 누르면 이어지는 장면까지 볼 수 있어요. 실제 데이터가 없는 형식(${'ABCDEF'.split('').filter((f) => !real[f]).join('·') || '없음'})은 견본 글.</p>
<div class="row" id="pf">${'ABCDEF'.split('').map((f, i) => `<button type="button" data-f="${f}" aria-pressed="${f === 'B'}">${f} · ${({ A: '체크리스트', B: '한 문장', C: '셋 중 고르기', D: '둘 중 하나', E: '말풀이', F: '열 명 중' })[f]}</button>`).join('')}</div>
<div class="row" id="pc">${Object.entries(PALETTE).map(([k, p]) => `<button type="button" data-c="${k}" aria-pressed="${k === 'sienna'}"><span class="sw" style="background:${p.bg}"></span>${k}</button>`).join('')}</div>
<div class="stage st-frame">${panels.map((x) => x.html.replace('class="st-p ', `data-pf="${x.f}" data-pc="${x.color}" class="st-p `)).join('')}</div>
<p class="note">견본 페이지는 저장소에 올리지 않는 확인용입니다.</p>
<h1 style="margin-top:36px">홈 '말씀' 영역 — 상태 3가지</h1><p class="d">(a)는 첫 주에만, (b)는 수요일 밤~주일 낮, (c)는 주일 오후~수요일 밤. 날짜·탭 순서·열리는 탭이 맞는지 봅니다.</p>
<div class="row" id="ph">${homes.map((h, i) => `<button type="button" data-h="${i}" aria-pressed="${i === 2}">${h[0].slice(0, 3)}</button>`).join('')}</div>
${homes.map((h, i) => `<div class="hstate" data-h="${i}" ${i === 2 ? '' : 'hidden'}><p class="d" style="margin:10px 0 6px">${h[0]}</p>${h[1]}</div>`).join('')}
</div>
<style>.hstate .hw{border-radius:24px;overflow:hidden}.hstate .hw .wrap{max-width:none}</style>
<script>(function(){var f='B',c='sienna';function sh(){document.querySelectorAll('.stage .st-p').forEach(function(p){p.classList.toggle('cur',p.dataset.pf===f&&p.dataset.pc===c);p.classList.remove('open');});
document.querySelectorAll('#pf button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.f===f)});document.querySelectorAll('#pc button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.c===c)});}
document.getElementById('pf').addEventListener('click',function(e){var b=e.target.closest('button');if(b){f=b.dataset.f;sh();}});
document.getElementById('ph').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;document.querySelectorAll('#ph button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});document.querySelectorAll('.hstate').forEach(function(x){x.hidden=x.dataset.h!==b.dataset.h;});});document.getElementById('pc').addEventListener('click',function(e){var b=e.target.closest('button');if(b){c=b.dataset.c;sh();}});sh();})();</script>
<script src="js/sermon.js?v=${V}" defer></script></body></html>`;
  writeFileSync(process.env.QUIZ_PREVIEW, page); console.log('견본: ' + process.env.QUIZ_PREVIEW); process.exit(0);
}

// ---------- 실행 ----------
const dataDir = join(ROOT, 'data', 'sermons');
const all = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  .map((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))) : [];
const outDir = join(ROOT, 'sermon');
mkdirSync(outDir, { recursive: true });
// 공개 조건에서 빠진 설교의 페이지는 지운다(날짜 이름 폴더만)
for (const f of readdirSync(outDir)) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(f) && statSync(join(outDir, f)).isDirectory() && !all.some((d) => d.date === f)) {
    rmSync(join(outDir, f), { recursive: true }); console.log('지움: sermon/' + f + '/');
  }
}
const cardsF = join(dataDir, 'cards.json');
const cards = existsSync(cardsF) ? JSON.parse(readFileSync(cardsF, 'utf8')) : [];
WP_CHIPS = wpChipTags(cards);
const groups = [all.filter((d) => !d.replay), all.filter((d) => d.replay)];   // 주일 설교 / 다시 듣는 말씀 — 이전·다음 링크는 같은 묶음 안에서만
for (const g of groups) g.forEach((d, i) => {
  mkdirSync(join(outDir, d.date), { recursive: true });
  writeFileSync(join(outDir, d.date, 'index.html'), sermonPage(d, g[i - 1], g[i + 1], cards.filter((c) => c.sermon === d.date)));
  console.log('만듦: sermon/' + d.date + '/' + (d.replay ? ' (다시 듣는 말씀)' : ''));
});
if (all.length) {
  writeFileSync(join(outDir, 'index.html'), indexPage(all, cards));
  console.log('만듦: sermon/ (말씀 모음)');
}
writeHome(all.filter((d) => !d.replay));   // 홈은 주일 설교만(다시 듣는 말씀이 '최신 설교'가 되지 않게)
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap(all));
console.log('만듦: sitemap.xml');
