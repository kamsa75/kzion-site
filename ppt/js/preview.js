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

    case 'band': { // 크로마 밴드형
      el.className = 'slide slide--band';
      const band = document.createElement('div');
      band.className = 'sl-band';
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

    case 'dark': { // 다크 전체화면형 — 프리미엄 배경(성전광) + 골드 캡션/아멘
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
    // 상한에서 시작해 축소하며 상자를 꽉 채움 — 사도신경·성경 본문 모두 여백 최소화
    var size = (slide && slide.classList.contains('is-dash')) ? 9.2 : 12;
    b.style.fontSize = size + 'cqh';
    var guard = 0;
    while (b.scrollHeight > b.clientHeight + 1 && size > 1.4 && guard < 80) {
      size -= 0.2;
      b.style.fontSize = size + 'cqh';
      guard++;
    }
  });
}

/* ============================================================
   성경 본문 → 다크 슬라이드 페이지 배열 (미리보기·PPT 공용, 단일 소스).
   절 번호([n] 또는 'n ')를 인식해 절 단위로 페이지 분할, 없으면 글자수로 분할.
   각 페이지는 fit:true(가운데·자동축소)로 잘림 없이 한 화면에 맞춤.
   ============================================================ */
var PASSAGE_CHARS = 200;   // 다크 1장 목표 글자수
var PASSAGE_MAXV = 5;      // 1장 최대 절 수
function passagePages(text, ref) {
  text = (text || '').trim();
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
    return pages.map(function (vs) { return { layout: 'dark', caption: ref, verses: vs, fit: true }; });
  }
  // 절 번호 없으면 글자수(단어 경계)로 페이지 분할
  var plain = text.replace(/\s+/g, ' ').trim(), words = plain.split(' '), chunks = [], c = '';
  for (var j = 0; j < words.length; j++) {
    var w = words[j];
    if (c && (c.length + 1 + w.length) > PASSAGE_CHARS) { chunks.push(c); c = ''; }
    c += (c ? ' ' : '') + w;
  }
  if (c) chunks.push(c);
  return chunks.map(function (b) { return { layout: 'dark', caption: ref, body: b, fit: true }; });
}

/* ============================================================
   함께 읽는 구절 → 크로마 밴드 슬라이드 페이지 배열 (미리보기·PPT 공용).
   줄바꿈이 있으면 그 줄 단위, 없으면 자동 줄나눔 → 2줄씩 한 페이지.
   ============================================================ */
function bandPages(text) {
  var t = (text || '').trim();
  if (!t) return [];
  var lines;
  if (/\n/.test(t)) {
    lines = t.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  } else {
    // 한 줄 목표 글자수(D11: 짧은 소절 2개 병합 ~ 24자)로 단어 경계 줄나눔
    var TARGET = 24, words = t.replace(/\s+/g, ' ').split(' ');
    lines = []; var cur = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (cur && (cur.length + 1 + w.length) > TARGET) { lines.push(cur); cur = ''; }
      cur += (cur ? ' ' : '') + w;
    }
    if (cur) lines.push(cur);
  }
  var pages = [];
  for (var j = 0; j < lines.length; j += 2) pages.push({ layout: 'band', lyrics: lines.slice(j, j + 2) });
  return pages;
}
