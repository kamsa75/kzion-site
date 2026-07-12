/* ============================================================
   슬라이드 미리보기 렌더러 — 레이아웃 5종 (지침 17번)
   모든 검수·미리보기·관리자 화면이 이 컴포넌트를 재사용한다.
   슬라이드 색·폰트는 ppt.css 의 --sl-* 토큰만 사용 (지침 16·20번).
   ============================================================ */

function renderSlide(slide) {
  const el = document.createElement('div');

  switch (slide.layout) {

    case 'green': { // 그린 자막형
      el.className = 'slide slide--green';
      const t = document.createElement('div');
      t.className = 'sl-text';
      t.textContent = slide.text || '';
      el.appendChild(t);
      if (slide.sub) {
        const s = document.createElement('div');
        s.className = 'sl-sub';
        s.textContent = slide.sub;
        el.appendChild(s);
      }
      break;
    }

    case 'green_blank': { // 빈 그린스크린 — 라이브/전환 (D20). 실제 방송은 순수 그린, 여기선 편집자 식별용 흐린 라벨만
      el.className = 'slide slide--green-blank';
      const hint = document.createElement('div');
      hint.className = 'sl-live';
      hint.textContent = '라이브 (빈 그린스크린)';
      el.appendChild(hint);
      break;
    }

    case 'band': { // 크로마 밴드형 / 성경 구절 카드
      el.className = 'slide slide--band'; // 배경 그린 = 라이브 영상(키잉)
      if (slide.scripture) { // 함께 읽는 구절 = 하단 흰 카드 + 블루 구절칩 + 골드 절번호(자연 줄바꿈)
        const card = document.createElement('div'); card.className = 'vcard';
        if (slide.ref) { const chip = document.createElement('div'); chip.className = 'vcard-chip'; chip.textContent = slide.ref; card.appendChild(chip); }
        const box = document.createElement('div'); box.className = 'vcard-box';
        const para = document.createElement('div'); para.className = 'vcard-para';
        const txt = slide.text || (slide.lyrics || []).join(' '); // 고정 크기 + 카드 폭 자연 줄바꿈으로 채움
        scriptureRuns(txt).forEach(r => {
          if (r.gold) { const sp = document.createElement('span'); sp.className = 'sl-vnum'; sp.textContent = r.t; para.appendChild(sp); }
          else para.appendChild(document.createTextNode(r.t));
        });
        box.appendChild(para);
        card.appendChild(box);
        el.appendChild(card);
        break;
      }
      const band = document.createElement('div');
      band.className = 'sl-band' + (slide.noBand ? ' sl-band--plain' : ''); // noBand=성가대/특송(밴드 없이 그린 자막)
      const ly = document.createElement('div');
      ly.className = 'sl-lyrics';
      (slide.lyrics || []).slice(0, 2).forEach((line, i) => { // 2줄 고정 (지침 18번)
        if (i > 0) ly.appendChild(document.createElement('br'));
        ly.appendChild(document.createTextNode(line));
      });
      band.appendChild(ly); // 곡명·절 캡션 없음 — 밴드에는 가사만 (D9)
      el.appendChild(band);
      break;
    }

    case 'dark': { // 다크 전체화면형(사도신경) / 성경 긴 본문 = 큰 흰 카드
      if (slide.fit && !slide.dash) { // 성경 긴 본문 = 짧은 구절과 통일된 카드(크게)
        el.className = 'slide slide--band'; // 그린 배경(라이브)
        const card = document.createElement('div'); card.className = 'vcard is-full';
        if (slide.caption) { const chip = document.createElement('div'); chip.className = 'vcard-chip'; chip.textContent = slide.caption; card.appendChild(chip); }
        const box = document.createElement('div'); box.className = 'vcard-box';
        const vb = document.createElement('div'); vb.className = 'vcard-body';
        if (slide.verses) {
          slide.verses.forEach(v => {
            const num = document.createElement('span'); num.className = 'sl-vnum'; num.textContent = v.num;
            vb.appendChild(num); vb.appendChild(document.createTextNode(v.text + ' '));
          });
        } else if (slide.body) { vb.textContent = slide.body; }
        box.appendChild(vb); card.appendChild(box); el.appendChild(card);
        break;
      }
      el.className = 'slide slide--dark' + (slide.fit ? ' is-fit' : '') + (slide.dash ? ' is-dash' : '');
      const bg = darkSlideBg();
      if (bg) { el.style.backgroundImage = 'url(' + bg + ')'; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; }
      if (slide.caption) {
        const cap = document.createElement('div');
        cap.className = 'sl-cap';
        cap.textContent = slide.caption;
        el.appendChild(cap);
      }
      const body = document.createElement('div');
      body.className = 'sl-body';
      // 내용은 단일 래퍼(sl-body-in)에 담아 인라인 흐름 유지 → is-fit 세로중앙(flex)이 span/텍스트를 줄로 쪼개지 않음(미리보기=PPT)
      const inner = document.createElement('div');
      inner.className = 'sl-body-in';
      if (slide.verses) {
        slide.verses.forEach(v => {
          const num = document.createElement('span');
          num.className = 'sl-vnum';
          num.textContent = v.num;
          inner.appendChild(num);
          inner.appendChild(document.createTextNode(v.text + ' '));
        });
      } else if (slide.body) {
        // 마지막 줄이 "아멘."이면 골드로 분리 (사도신경 등)
        const m = String(slide.body).match(/^([\s\S]*?)\n\s*(아멘[.。]?)\s*$/);
        if (m) {
          inner.appendChild(document.createTextNode(m[1]));
          const am = document.createElement('span');
          am.className = 'sl-amen';
          am.textContent = m[2].replace(/。/, '.');
          inner.appendChild(am);
        } else {
          inner.textContent = slide.body;
        }
      }
      body.appendChild(inner);
      el.appendChild(body);
      break;
    }

    case 'score': { // 악보 통짜형
      el.className = 'slide slide--score';
      if (slide.src) {
        if (slide.is43) el.classList.add('is-43'); // 4:3 원본은 흰 배경 중앙 (지침 14번)
        const img = document.createElement('img');
        img.src = slide.src;
        img.alt = '악보';
        el.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'sl-ph';
        ph.textContent = slide.placeholder || '악보 이미지';
        el.appendChild(ph);
      }
      break;
    }

    case 'image': { // 이미지형
      el.className = 'slide slide--image';
      if (slide.src) {
        const img = document.createElement('img');
        img.src = slide.src;
        img.alt = slide.label || '슬라이드 이미지';
        el.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'sl-ph';
        ph.textContent = slide.placeholder || '이미지';
        el.appendChild(ph);
      }
      break;
    }
  }

  return el;
}

/* ============================================================
   다크 전체화면형 배경 — '골드 성전광'(네이비 + 상단 글로우 + 비네트).
   미리보기(preview.js)와 실제 PPT(generate.js)가 이 함수 하나로 같은
   이미지를 쓴다 → "미리보기 ≠ PPT" 어긋남 원천 차단. 결과는 캐시(1회 생성).
   ============================================================ */
var _darkBgCache;
function darkSlideBg() {
  if (_darkBgCache !== undefined) return _darkBgCache;
  try {
    var W = 1280, H = 720, TAU = Math.PI * 2;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    // 베이스: 위쪽에서 퍼지는 네이비 방사형
    var g = x.createRadialGradient(W * 0.5, -H * 0.15, 80, W * 0.5, H * 0.42, W * 0.92);
    g.addColorStop(0, '#34416c'); g.addColorStop(0.45, '#182036'); g.addColorStop(1, '#0a0e14');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    function blob(cx, cy, r, col) {
      var rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    }
    // 글로우(더하기 합성): 상단 골드 성전광 + 좌하 블루 + 우하 골드 + 중상 청백
    x.globalCompositeOperation = 'lighter';
    blob(W * 0.50, H * 0.02, W * 0.60, 'rgba(201,166,107,0.20)');
    blob(W * 0.14, H * 0.60, W * 0.44, 'rgba(96,132,210,0.20)');
    blob(W * 0.86, H * 0.56, W * 0.46, 'rgba(201,166,107,0.13)');
    blob(W * 0.63, H * 0.18, W * 0.26, 'rgba(150,180,255,0.16)');
    x.globalCompositeOperation = 'source-over';
    // 비네트(가장자리 어둡게)
    var v = x.createRadialGradient(W * 0.5, H * 0.46, H * 0.28, W * 0.5, H * 0.52, H * 0.98);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.7, 'rgba(0,0,0,0.12)'); v.addColorStop(1, 'rgba(0,0,0,0.58)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    // 미세 그레인(밴딩 방지 — JPEG 계단현상 완화)
    try {
      var n = document.createElement('canvas'); n.width = n.height = 200;
      var nx = n.getContext('2d'), id = nx.createImageData(200, 200), d = id.data;
      for (var i = 0; i < d.length; i += 4) { var gg = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = gg; d[i + 3] = 255; }
      nx.putImageData(id, 0, 0);
      x.globalAlpha = 0.03; x.globalCompositeOperation = 'overlay';
      for (var yy = 0; yy < H; yy += 200) for (var xx = 0; xx < W; xx += 200) x.drawImage(n, xx, yy);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    } catch (e) {}
    _darkBgCache = c.toDataURL('image/jpeg', 0.82);
  } catch (e) { _darkBgCache = ''; }
  return _darkBgCache;
}

// 다크 '한 페이지 맞춤' 슬라이드(사도신경·성경 본문): 본문이 넘치지 않게 글자 크기 자동 축소.
// 요소가 화면에 붙은 뒤(측정 가능해진 뒤) 호출해야 함.
function fitDarkSlides(root) {
  (root || document).querySelectorAll('.slide--dark.is-fit .sl-body').forEach(function (b) {
    if (!b.clientHeight) return;
    var slide = b.closest('.slide--dark');
    // 사도신경(is-dash)=본문 32pt 상한(=5.93cqh, 다운로드와 동일). 길면 아래 while로 축소
    var size = (slide && slide.classList.contains('is-dash')) ? 5.93 : 6;
    b.style.fontSize = size + 'cqh';
    var guard = 0;
    while (b.scrollHeight > b.clientHeight + 1 && size > 1.4 && guard < 80) {
      size -= 0.2;
      b.style.fontSize = size + 'cqh';
      guard++;
    }
  });
  // 성경 구절 카드(짧은/긴)도 함께 맞춤 — 기존 fitDarkSlides 호출부에서 자동 처리
  fitVCard(root); fitVCardFull(root);
}

// 긴 성경 본문 카드(is-full): 본문이 카드 박스를 넘으면 글자를 줄여 한 장에 맞춤.
function fitVCardFull(root) {
  (root || document).querySelectorAll('.vcard.is-full .vcard-body').forEach(function (b) {
    var box = b.parentElement; if (!box || !box.clientHeight) return;
    var s = parseFloat(getComputedStyle(b).fontSize) || 24, min = s * 0.5, guard = 0;
    b.style.fontSize = s + 'px';
    while (b.scrollHeight > box.clientHeight + 1 && s > min && guard < 100) { s -= 0.5; b.style.fontSize = s + 'px'; guard++; }
  });
}

/* ============================================================
   성경 본문 → 다크 슬라이드 페이지 배열 (미리보기·PPT 공용, 단일 소스).
   절 번호([n] 또는 'n ')를 인식해 절 단위로 페이지 분할, 없으면 글자수로 분할.
   각 페이지는 fit:true(가운데·자동축소)로 잘림 없이 한 화면에 맞춤.
   ============================================================ */
var PASSAGE_CHARS = 230;   // 긴 본문 카드 1장 목표 글자수 (33pt/6.11cqh·줄간격1.3에 맞춤 — 2026-07-12)
var PASSAGE_MAXV = 8;      // 1장 최대 절 수 (33pt에 맞게 12→8)
function passagePages(text, ref) {
  text = (text || '').trim();
  if (!text) return [];
  // 선두 [삼상 1:1-3] 또는 (삼상 1:1-3) (숫자 아닌 = 구절 표기) → 구절칩, 본문에서 괄호째 제거
  var cap = (ref || '').trim();
  var mref = text.match(/^\s*(?:\[([^\]]+)\]|\(([^)]+)\))\s*/);
  var mcap = mref && (mref[1] || mref[2]);
  if (mcap && /\D/.test(mcap)) { cap = mcap.trim(); text = text.slice(mref[0].length).trim(); }
  if (!text) return [];
  // 절 번호 파싱: [17] / 17  (숫자 뒤 공백 있는 것만 — "1)" 각주 마커는 제외)
  var s = text.replace(/\[(\d+)\]/g, ' $1 ').replace(/\s+/g, ' ').trim();
  var verses = [], re = /(\d{1,3})\s+(.*?)(?=(?:\s\d{1,3}\s)|$)/g, m;
  while ((m = re.exec(s))) { var tx = m[2].trim(); if (tx) verses.push({ num: m[1], text: tx }); }
  if (verses.length >= 2) {
    var pages = [], cur = [], len = 0;
    for (var i = 0; i < verses.length; i++) {
      var v = verses[i], vlen = v.text.length + 3;
      if (cur.length && (len + vlen > PASSAGE_CHARS || cur.length >= PASSAGE_MAXV)) { pages.push(cur); cur = []; len = 0; }
      cur.push(v); len += vlen;
    }
    if (cur.length) pages.push(cur);
    return pages.map(function (vs) { return { layout: 'dark', caption: cap, verses: vs, fit: true }; });
  }
  // 절 번호 없으면 글자수(단어 경계)로 페이지 분할
  var plain = text.replace(/\s+/g, ' ').trim(), words = plain.split(' '), chunks = [], c = '';
  for (var j = 0; j < words.length; j++) {
    var w = words[j];
    if (c && (c.length + 1 + w.length) > PASSAGE_CHARS) { chunks.push(c); c = ''; }
    c += (c ? ' ' : '') + w;
  }
  if (c) chunks.push(c);
  return chunks.map(function (b) { return { layout: 'dark', caption: cap, body: b, fit: true }; });
}

/* ============================================================
   함께 읽는 구절 → 흰 카드 페이지 배열 (미리보기·PPT 공용).
   글자 크기는 고정, 카드 폭에 맞춰 '자연 줄바꿈'으로 채움(좌우 여백 대칭).
   한 페이지 = 카드 2줄 분량(~52자)씩 묶음. (#2 선두 [참조] 자동 제거)
   ============================================================ */
function bandEm(s) { var w = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); w += (c >= 0xAC00 && c <= 0xD7A3) ? 1 : (c === 0x20 ? 0.35 : 0.55); } return w; }
// 카드 한 줄 용량(em) — 실제 로드된 폰트(Pretendard 등)로 직접 측정(폰트 무관 자동 보정).
// 카드 한 줄 폭 = 84cqw, 글자 = 5.4cqh → 16:9에서 한 줄 = 폰트높이의 27.65배.
function bandLineCap() {
  var cap = 27.65;
  try {
    if (typeof document !== 'undefined' && document.body) {
      var probe = '가나다라마바사아자차', d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-weight:800;font-family:Pretendard,"Apple SD Gothic Neo",-apple-system,sans-serif;font-size:100px;';
      d.textContent = probe; document.body.appendChild(d);
      var emPx = d.getBoundingClientRect().width / probe.length / 100; // 한글 1자 폭(em)
      document.body.removeChild(d);
      if (emPx > 0.4) cap = 27.65 / emPx;
    }
  } catch (e) {}
  return cap;
}
function bandPages(text, ref) {
  var t = (text || '').trim();
  if (!t) return [];
  // 선두 [느헤미야 1:3] 또는 (느헤미야 1:3) → 구절칩 참조로, 본문에서 괄호째 제거 (#2)
  var chipRef = (ref || '').trim();
  var mref = t.match(/^\s*(?:\[([^\]]+)\]|\(([^)]+)\))\s*/);
  if (mref) { if (!chipRef) chipRef = (mref[1] || mref[2] || '').trim(); t = t.slice(mref[0].length).trim(); }
  if (!t) return [];
  t = t.replace(/\s+/g, ' ');
  // 실제 흰 카드 구조로 DOM 측정해 '2줄까지' 최대한 채움 → 카드 실제 줄바꿈과 100% 일치(추정 오차 제거)
  var chunks = bandChunk2Lines(t.split(' '));
  // scripture:true → 흰 카드 + 블루 구절칩 + 골드 절번호. text = 자연 줄바꿈으로 채울 본문
  return chunks.map(function (chunk) { return { layout: 'band', scripture: true, ref: chipRef, text: chunk }; });
}

// vcard-para에 절번호(골드)까지 실제와 동일하게 렌더 (측정 정확도)
function setVcardParaRuns(para, txt) {
  para.textContent = '';
  scriptureRuns(txt).forEach(function (r) {
    if (r.gold) { var sp = document.createElement('span'); sp.className = 'sl-vnum'; sp.textContent = r.t; para.appendChild(sp); }
    else para.appendChild(document.createTextNode(r.t));
  });
}

// 절 번호 토큰인가? "1" "[1]" "12" "1." "1)" 등 (짧은 구절 절 번호가 페이지 끝에 홀로 남지 않게)
function isVerseNum(w) { return /^\[?\d{1,3}\]?[.)]?$/.test(w); }

// 실제 .slide--band > .vcard > .vcard-box > .vcard-para 를 화면 밖에 만들어, 각 페이지에 '2줄까지' 단어를 담는다.
// 폰트·CSS가 그대로 적용되므로 미리보기·PPT의 카드 줄바꿈과 정확히 일치. (비율은 크기 무관 → 고정폭 프로브로 측정)
function bandChunk2Lines(words) {
  if (typeof document === 'undefined' || !document.body) return bandChunk2LinesEm(words);
  var host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;pointer-events:none;';
  var slide = document.createElement('div'); slide.className = 'slide slide--band';
  var card = document.createElement('div'); card.className = 'vcard';
  var box = document.createElement('div'); box.className = 'vcard-box';
  var para = document.createElement('div'); para.className = 'vcard-para';
  box.appendChild(para); card.appendChild(box); slide.appendChild(card); host.appendChild(slide);
  document.body.appendChild(host);
  var lh = parseFloat(getComputedStyle(para).lineHeight) || 20;
  var twoLineMax = lh * 2.5;   // 2줄 ≈ 2*lh, 3줄 ≈ 3*lh → 그 사이 값이 '2줄 이하' 경계
  function fits(str) { setVcardParaRuns(para, str); return para.scrollHeight < twoLineMax; }
  var pages = [], i = 0, n = words.length, guard = 0;
  while (i < n && guard++ < 1000) {
    var chosen = i;                                  // 페이지당 최소 1단어(초장문 단어 보호)
    for (var j = i; j < n; j++) {
      if (fits(words.slice(i, j + 1).join(' '))) chosen = j; else break;
    }
    // 절 번호가 페이지 끝에 홀로 남지 않게 → 번호(들)를 다음 페이지 첫머리로(뒤 구절과 함께).
    // 다음 페이지는 그 번호부터 다시 2줄로 채워지므로 넘침 없음.
    var e = chosen;
    while (e > i && isVerseNum(words[e])) e--;
    if (!isVerseNum(words[e])) chosen = e;           // 페이지에 본문이 남을 때만(전부 번호면 그대로 둠)
    pages.push(words.slice(i, chosen + 1).join(' '));
    i = chosen + 1;
  }
  document.body.removeChild(host);
  return pages.length ? pages : [words.join(' ')];
}

// 폴백(헤드리스 등 DOM 없음): 기존 em 추정
function bandChunk2LinesEm(words) {
  var cap = bandLineCap(), pages = [], cur = '', lineEm = 0, lines = 1;
  for (var i = 0; i < words.length; i++) {
    var w = words[i], we = bandEm(w), withW = cur ? lineEm + 0.35 + we : we;
    if (cur && withW > cap) {
      if (lines >= 2) { pages.push(cur); cur = ''; lines = 1; }
      else { lines = 2; }
      withW = we;
    }
    cur += (cur ? ' ' : '') + w; lineEm = withW;
  }
  if (cur) pages.push(cur);
  return pages;
}

// 밴드/본문에서 절 번호(숫자+공백, 줄 시작 또는 공백 뒤)를 골드로 분리. [{t, gold}]
function scriptureRuns(line) {
  var out = [], re = /(?:^|\s)(\d{1,3})(?=\s)/g, last = 0, m;
  while ((m = re.exec(line))) {
    var numIdx = m.index + (m[0].length - m[1].length);
    if (numIdx > last) out.push({ t: line.slice(last, numIdx), gold: false });
    out.push({ t: m[1], gold: true });
    last = numIdx + m[1].length;
  }
  if (last < line.length) out.push({ t: line.slice(last), gold: false });
  return out.length ? out : [{ t: line, gold: false }];
}

// 성경 구절 카드(짧은 구절)의 2줄이 카드 폭을 넘으면 두 줄을 '같은 크기'로 축소.
function fitVCard(root) {
  (root || document).querySelectorAll('.slide--band .vcard-box').forEach(function (box) {
    var lines = box.querySelectorAll('.vcard-line');
    if (!lines.length || !box.clientWidth) return;
    var s = parseFloat(getComputedStyle(lines[0]).fontSize) || 20, min = s * 0.55, guard = 0;
    function overflow() { for (var i = 0; i < lines.length; i++) if (lines[i].scrollWidth > lines[i].clientWidth + 1) return true; return false; }
    lines.forEach(function (l) { l.style.fontSize = s + 'px'; });
    while (overflow() && s > min && guard < 80) { s -= 0.5; lines.forEach(function (l) { l.style.fontSize = s + 'px'; }); guard++; }
  });
}

// 크로마 밴드 가사가 밴드(검정 띠) 높이를 넘으면 글자를 줄여 2줄이 안 잘리게 함.
// 요소가 화면에 붙은 뒤 호출.
function fitBandLyrics(root) {
  (root || document).querySelectorAll('.slide--band .sl-lyrics').forEach(function (ly) {
    var band = ly.parentElement; if (!band || !band.clientHeight) return;
    var s = parseFloat(getComputedStyle(ly).fontSize) || 12, guard = 0;
    ly.style.fontSize = s + 'px';
    while (ly.scrollHeight > band.clientHeight + 1 && s > 6 && guard < 80) { s -= 0.5; ly.style.fontSize = s + 'px'; guard++; }
  });
}
