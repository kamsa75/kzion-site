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
      el.className = 'slide slide--dark' + (slide.fit ? ' is-fit' : '');
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
      if (slide.verses) {
        slide.verses.forEach(v => {
          const num = document.createElement('span');
          num.className = 'sl-vnum';
          num.textContent = v.num;
          body.appendChild(num);
          body.appendChild(document.createTextNode(v.text + ' '));
        });
      } else if (slide.body) {
        // 마지막 줄이 "아멘."이면 골드로 분리 (사도신경 등)
        const m = String(slide.body).match(/^([\s\S]*?)\n\s*(아멘[.。]?)\s*$/);
        if (m) {
          body.appendChild(document.createTextNode(m[1]));
          const am = document.createElement('span');
          am.className = 'sl-amen';
          am.textContent = m[2].replace(/。/, '.');
          body.appendChild(am);
        } else {
          body.textContent = slide.body;
        }
      }
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

// 다크 '한 페이지 맞춤' 슬라이드(사도신경 등): 본문이 넘치지 않게 글자 크기 자동 축소.
// 요소가 화면에 붙은 뒤(측정 가능해진 뒤) 호출해야 함.
function fitDarkSlides(root) {
  (root || document).querySelectorAll('.slide--dark.is-fit .sl-body').forEach(function (b) {
    if (!b.clientHeight) return;
    var size = 9.2;
    b.style.fontSize = size + 'cqh';
    var guard = 0;
    while (b.scrollHeight > b.clientHeight + 1 && size > 1.4 && guard < 80) {
      size -= 0.2;
      b.style.fontSize = size + 'cqh';
      guard++;
    }
  });
}
