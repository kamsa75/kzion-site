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
      band.appendChild(ly);
      if (slide.caption) {
        const cap = document.createElement('div');
        cap.className = 'sl-cap';
        cap.textContent = slide.caption;
        band.appendChild(cap);
      }
      el.appendChild(band);
      break;
    }

    case 'dark': { // 다크 전체화면형
      el.className = 'slide slide--dark';
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
        body.textContent = slide.body;
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
