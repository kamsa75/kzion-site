// 말씀 페이지 생성 — data/sermons/*.json → sermon/<날짜>/index.html, sermon/index.html, sitemap.xml
//
// 원칙 (검색노출 설계 v1)
//  · 글은 전부 HTML에 들어간다. 브라우저 JS는 보여주는 방식(탭·넘김·이야기 재생)만 바꾼다
//  · 긴 스크롤 금지: 여러 장면·영상은 한 칸 안에서 넘기고, 칸 높이는 탭을 바꿔도 같다
//  · 검색 키워드는 템플릿이 '항상' 같은 자리에 넣는다 — 교회 이름, "시애틀에 있는 한인교회",
//    주일예배 설교, 성경 책·장 이름(예: 시편 73편 설교), 설교 주제어, 영어 이름
//    ("시애틀 한인교회"를 이름처럼 쓰지 않는다 — 교회 이름으로 오해됨. 문장으로만)
//  · 데이터에 없는 말은 만들지 않는다(추측 금지). 빈 값이면 그 줄을 생략
//  · 푸터는 scripts/footer.html 하나를 모든 페이지가 같이 쓴다
//
// 실행: node scripts/build-sermons.mjs [데이터·출력 폴더(기본: 저장소 루트)]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] || new URL('..', import.meta.url).pathname;
const FOOTER = readFileSync(new URL('./footer.html', import.meta.url), 'utf8').trim();
const SITE = 'https://kzion.net';
const V = '20260929d';

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

// 소그룹 성경공부 교재 '부르심' — 과 제목과 목사님 원문 속 질문(글자 그대로)
const LESSONS = [
  ['제자로 부르심', '왜 예수님은 하고 많은 배 중에서 하필이면 베드로의 배에 올라타셨을까요?'],
  ['자기부인과 십자가', '당신은 주님의 제자가 되기 위해 무엇을 포기했습니까?'],
  ['성령과 제자', '당신은 예수님을 믿을 때에 성령을 받으셨습니까?'],
  ['제자의 자세', '어떻게 해야 내게 주어진 십자가가 나에게 기쁨이 될 수 있을까요?'],
  ['제자들의 모임', '예수님이 부활하시고 승천하시면서 제자들에게 분부하신 것은 무엇입니까?'],
  ['사명', '당신은 지금 사명을 따라 살고 있습니까?'],
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const koDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일`; };
const mdDate = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}월 ${dd}일`; };
const dotDate = (d) => d.replace(/-/g, '.');
const clock = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
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
const bar = (n, label) => n < 2 ? '' : `
          <div class="cz-bar">
            <button class="cz-arrow prev" type="button" aria-label="이전 ${label}">${CHEV('M15 5l-7 7 7 7')}</button>
            <div class="cz-dots">${Array.from({ length: n }, (_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
            <button class="cz-arrow next" type="button" aria-label="다음 ${label}">${CHEV('M9 5l7 7-7 7')}</button>
          </div>`;

// ---------- 릴스 퀴즈 칸 (질문 → 이야기처럼 넘어가는 결과) ----------
// base: 이 칸이 놓이는 페이지에서 그림·영상 파일까지의 경로, goHref: 마지막 장의 '설교 듣기' 링크
function reelPanel(r, d, { base, goHref, id }) {
  const p = PALETTE[r.color] || PALETTE.amber;
  const n = r.format === 'A' ? r.items.length : 0;
  const ask = r.format === 'A'
    ? `<ul class="qz-note">
                ${r.items.map((t, i) => `<li><label><input type="checkbox" name="${id}-${i}"><span class="box" aria-hidden="true"></span><span class="qz-it">${esc(t)}</span></label></li>`).join('\n                ')}
              </ul>
              <div class="qz-meter" data-t="${r.threshold}" data-n="${n}">
                <span class="qm-track"><i></i><b style="left:${(r.threshold / n * 100).toFixed(1)}%"></b></span>
                <span class="qm-txt"><em>0</em> / ${n}</span>
              </div>
              <button class="btn qz-next" type="button">결과 보기 ${ARROW}</button>`
    : `<div class="qz-cards">
                ${r.options.map((t, i) => `<button class="qz-card" type="button"><span class="qc-l">${'ABCDE'[i]}</span><span class="qc-t">${esc(t)}</span></button>`).join('\n                ')}
              </div>`;
  const scenes = r.scenes.map((s) => `
              <div class="qs-s">
                ${s.image ? `<img class="qs-art" src="${base}${esc(s.image)}" alt="" width="540" height="452" loading="lazy">` : ''}
                <div class="qs-txt">
                  <h3>${mark(s.big, r.highlight)}</h3>
                  ${s.small ? `<p>${esc(s.small)}</p>` : ''}
                </div>
              </div>`).join('');
  const end = `
              <div class="qs-s qs-end">
                <div class="qe-txt">
                  <h3>이 질문의 답은 설교에 있어요.</h3>
                  <div class="qs-acts">
                    <a class="btn qs-go" href="${goHref}">설교 듣기 ${ARROW}</a>
                    <button class="qs-btn qs-again" type="button"><span>다시 풀기</span></button>
                  </div>
                </div>
                <a class="qe-sermon" href="${goHref}">
                  <span class="qe-thumb"><img src="${thumb(d.videoId)}" alt="${esc(d.title)} 설교 영상"><span class="qe-play">${PLAY}</span></span>
                  <span class="qe-k">${mdDate(d.date)} 주일 설교</span>
                  <span class="qe-title">${esc(d.title)}</span>
                  <span class="qe-ref">${esc(scriptureLabel(d))} 설교 · ${esc(d.preacher)}</span>
                </a>
              </div>`;
  return `
        <div class="st-p qz" role="tabpanel" id="${id}" data-format="${r.format}" style="--q-bg:${p.bg};--q-ink:${p.ink};--q-mute:${p.mute}">
          <div class="qz-view qz-ask">
            <div class="qz-q">
              <p class="st-kicker">질문으로 만나는 설교</p>
              <h2>${esc(r.question)}</h2>
              <p class="qz-sub">${r.format === 'A' ? `${r.threshold}개 이상이면, 끝까지 보세요` : '하나를 골라 보세요'}</p>
              ${r.format !== 'A' && r.hint ? `<p class="qz-hint">${esc(r.hint)}</p>` : ''}
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
            <button class="qs-zone next" type="button" aria-label="다음 장면"></button>
          </div>
        </div>`;
}

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
                <a class="sh-more" href="https://youtu.be/${esc(d.videoId)}?t=${c.start}" target="_blank" rel="noopener">설교에서 이어 듣기 · ${clock(c.start)}부터</a>
              </div>
            </div>`).join('');
  return `
        <div class="st-p sh-p cz" role="tabpanel">
          <div class="cz-track">${slides}
          </div>${bar(n, '영상')}
        </div>`;
}

function tabsBox(label, tabs, panels, extraClass = '') {
  return `<div class="st-box${extraClass}" data-tabs>
    ${tabs.length > 1 ? `<div class="st-tabs" role="tablist" aria-label="${esc(label)}">
      ${tabs.map((t, i) => `<button role="tab" type="button" aria-selected="${i ? 'false' : 'true'}">${esc(t)}</button>`).join('\n      ')}
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

function sermonPage(d, prev, next) {
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
    <p class="sm-kicker">주일 설교 · <time datetime="${d.date}">${koDate(d.date)}</time></p>
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
    <p class="sw-links"><a href="https://www.youtube.com/watch?v=${esc(d.videoId)}" target="_blank" rel="noopener">유튜브에서 보기</a><a href="../">지난 설교 모두 보기</a></p>
  </div>
</section>
${visit(up)}
${prev || next ? `
<nav class="sm-pager" aria-label="다른 설교">
  <div class="wrap">
    ${prev ? `<a href="../${prev.date}/"><span>이전 설교 · ${dotDate(prev.date)}</span>${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="nx" href="../${next.date}/"><span>다음 설교 · ${dotDate(next.date)}</span>${esc(next.title)}</a>` : '<span></span>'}
  </div>
</nav>` : ''}
</main>
` + footer(up);
}

// ---------- 말씀 모음 페이지 ----------
function indexPage(all) {
  const url = `${SITE}/sermon/`, up = '../';
  const latest = all[all.length - 1], rest = all.slice(0, -1).reverse();
  const title = `말씀 — 주일 설교와 성경공부 교재 | ${CH.suffix}`;
  const desc = `${CH.tag} 주일예배 설교 영상과 1분 말씀, 질문으로 만나는 설교, 소그룹 성경공부 교재 「부르심」. 담임 ${CH.pastor}.`;
  const list = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '말씀', url, inLanguage: 'ko', publisher: CHURCH_LD,
    mainEntity: { '@type': 'ItemList', itemListElement: all.slice().reverse().map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${url}${d.date}/`, name: d.title })) } };

  // 질문으로 만나는 설교 — 퀴즈와 그 설교를 한 묶음으로. 설교마다 묶음 하나, 같은 자리에 겹쳐 두고 하나만 보인다
  // (가장 최근 묶음이 처음 보임. '모든 질문' 카드를 누르면 그 묶음·질문으로 바뀜). 최근 12개 질문까지만 이 페이지에 싣는다
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
            </div>${bar(pages.length, '목록')}
          </div>` : '';
  const sermonsPanel = `
      <div class="st-p ix-p" role="tabpanel">
        <div class="ix-grid">
          <a class="ix-latest" href="${latest.date}/">
            <span class="ix-thumb"><img src="${thumb(latest.videoId)}" alt="${esc(latest.title)} 설교 영상" loading="lazy"><span class="ix-badge">이번 주 말씀</span></span>
            <span class="ix-date">${koDate(latest.date)} 주일예배</span>
            <span class="ix-title">${esc(latest.title)}</span>
            <span class="ix-ref">${esc(scriptureLabel(latest))} 설교 · ${esc(latest.preacher)}</span>
            ${latest.coreQuestion ? `<span class="ix-q">${esc(latest.coreQuestion)}</span>` : ''}
          </a>${listHtml}
        </div>
      </div>`;

  // 모든 질문 — 질문 카드, 한 칸에서 넘김(최근 12개), 누르면 그 설교에서 풀기
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
        <p class="sx-h">질문으로 만나는 설교 · ${allQ.length}개</p>
        <div class="cz-track">${qPages.map((pg) => `
          <div class="cz-slide qx-page">${pg.map(qcard).join('')}</div>`).join('')}
        </div>${bar(qPages.length, '질문')}
      </div>` : '';

  const bookPanel = `
      <div class="st-p ix-p" role="tabpanel">
        <div class="bk">
          <img class="bk-cover" src="${up}images/calling05-793x1024.jpg" alt="소그룹 성경공부 교재 부르심 표지" loading="lazy">
          <div class="bk-body">
            <h2>소그룹 성경공부 교재, 부르심</h2>
            <p class="bk-sub">${CH.pastor} · 평신도 리더들을 위한 소그룹 성경공부 · 6과</p>
            <ol class="bk-lessons">
              ${LESSONS.map(([t, q], i) => `<li><span class="ls-n">${i + 1}과 · ${t}</span><span class="ls-q">${esc(q)}</span></li>`).join('\n              ')}
            </ol>
            <p class="bk-dl"><a href="${up}files/%EB%B6%80%EB%A5%B4%EC%8B%AC_3.0.epub" download="부르심.epub">eBook 내려받기 (ePub)</a> · Apple Books, ReadEra 등 전자책 앱에서 열람</p>
          </div>
        </div>
      </div>`;

  const tabs = ['주일 설교', ...(allQ.length ? ['모든 질문'] : []), '성경공부 교재'];
  const panels = [sermonsPanel, ...(allQ.length ? [questionsPanel] : []), bookPanel];
  return head({ title, desc, url, image: thumb(latest.videoId), type: 'website', up, ld: [list] }) + nav(up) + `
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
${visit(up)}
</main>
` + footer(up);
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
all.forEach((d, i) => {
  mkdirSync(join(outDir, d.date), { recursive: true });
  writeFileSync(join(outDir, d.date, 'index.html'), sermonPage(d, all[i - 1], all[i + 1]));
  console.log('만듦: sermon/' + d.date + '/');
});
if (all.length) {
  writeFileSync(join(outDir, 'index.html'), indexPage(all));
  console.log('만듦: sermon/ (말씀 모음)');
}
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap(all));
console.log('만듦: sitemap.xml');
