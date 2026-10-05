/* ============================================================
   검수 화면 3탭: 가사 줄 목록 / 슬라이드 미리보기 / 원본(핀치 줌) — 지침 10번
   - 분할선 클릭 토글, 줄 내 엔터로 줄 분리, 넘침(3줄+) 경고 — 지침 19번
   - 저신뢰 단어 노란 하이라이트 — 지침 12-4번
   - 분할선은 블록 경계를 넘지 못함(블록 사이는 항상 새 슬라이드) — 지침 19번
   - 순서 지정: 블록 클릭 = 추가, 반복 클릭 = 복제 (지침 15번, 블록 ID 참조 배열 D5)
   ============================================================ */

const Review = (function () {
  const $ = (sel) => document.querySelector(sel);
  let songId = null;

  const song = () => SongStore.get(songId);

  /* ================= 탭 전환 ================= */

  function switchTab(name) {
    document.querySelectorAll('#review-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    ['lyrics', 'original'].forEach(n => { $('#tab-' + n).hidden = (n !== name); });
    if (name === 'original') renderOriginalTab();
  }

  /* ================= 탭 1: 가사 줄 목록 ================= */

  function lineNode(block, li) {
    const line = block.lines[li];
    const row = document.createElement('div');
    row.className = 'line-row';

    const textEl = document.createElement('div');
    textEl.className = 'line-text';
    // 저신뢰 단어 하이라이트 (지침 12-4)
    line.text.split(' ').forEach((w, wi) => {
      if (wi > 0) textEl.appendChild(document.createTextNode(' '));
      if ((line.low || []).includes(wi)) {
        const m = document.createElement('mark');
        m.textContent = w;
        textEl.appendChild(m);
      } else {
        textEl.appendChild(document.createTextNode(w));
      }
    });
    row.appendChild(textEl);

    // 탭하면 입력창으로 전환 (오타 수정 — 지침 19)
    textEl.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'line-input';
      input.value = line.text;
      row.replaceChild(input, textEl);
      input.focus();

      const commit = () => {
        const v = input.value;
        const nl = v.indexOf('\n');
        line.text = v.trim();
        line.low = [];            // 수정한 줄은 하이라이트 해제
        SongStore.save();
        renderLyricsTab();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // 커서 위치에서 줄 분리 (지침 19)
          const pos = input.selectionStart;
          const before = input.value.slice(0, pos).trim();
          const after = input.value.slice(pos).trim();
          if (before && after) {
            block.lines.splice(li, 1,
              { text: before, low: [] },
              { text: after, low: [] });
            block.breaks.splice(li, 0, false); // 새 줄 사이 경계(분할 없음) 추가
            input.removeEventListener('blur', commit);
            SongStore.save();
            renderLyricsTab();
          } else {
            input.blur();
          }
        }
        // 줄 맨 앞에서 지우기 → 윗줄과 합치기 (지침 19 보완)
        if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0 && li > 0) {
          e.preventDefault();
          const prev = block.lines[li - 1];
          prev.text = (prev.text + ' ' + input.value.trim()).trim();
          prev.low = [];
          block.lines.splice(li, 1);
          block.breaks.splice(li - 1, 1);
          input.removeEventListener('blur', commit);
          SongStore.save();
          renderLyricsTab();
        }
      });
    });
    return row;
  }

  function dividerNode(block, gi) {
    // gi = 줄 i 와 i+1 사이. 상태형 토글선 (지침 19): 진한 선=슬라이드 나뉨 / 연한 점선=같은 슬라이드.
    // 텍스트 버튼 폐기(읽기 피로 제거) — 선을 눌러 뒤집기, 기호(✂)만 은은히.
    const cut = !!block.breaks[gi];
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'divider' + (cut ? ' cut' : '');
    div.setAttribute('aria-label', cut
      ? '여기서 슬라이드가 나뉩니다 — 눌러서 한 슬라이드로 합치기'
      : '같은 슬라이드입니다 — 눌러서 여기서 나누기');
    div.innerHTML = '<span class="div-mark">' + (cut ? '✂' : '') + '</span>';
    div.addEventListener('click', () => {
      block.breaks[gi] = !block.breaks[gi];
      SongStore.save();
      renderLyricsTab();
    });
    return div;
  }

  // 절 이름(라벨) 바로 바꾸기 — AI 오분류 교정 (절 편집 C의 일부)
  function editBlockLabel(block, labelEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'block-label-input';
    input.value = block.label || '';
    labelEl.replaceWith(input);
    input.focus(); input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) {
        block.label = v;
        block.type = /후렴|렴|chorus/i.test(v) ? 'chorus'
          : /브릿지|bridge/i.test(v) ? 'bridge' : 'verse';
      }
      SongStore.save();
      renderLyricsTab();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  // 가독형 슬라이드 썸네일(필름스트립용): 그린 위 + 밴드에 가사 2줄(폭 맞춰 자동 축소)
  function filmThumb(lines) {
    const t = document.createElement('div');
    t.className = 'film-thumb';
    const green = document.createElement('div');
    green.className = 'film-green';
    const band = document.createElement('div');
    band.className = 'film-band';
    (lines || []).slice(0, 2).forEach(tx => {
      const d = document.createElement('div');
      d.className = 'film-line';
      d.textContent = tx;
      band.appendChild(d);
    });
    t.append(green, band);
    return t;
  }

  // 썸네일 가사가 폭을 넘으면 글자만 줄여 전체가 보이게 (잘림 없이)
  function fitFilm(root) {
    root.querySelectorAll('.film-line').forEach(l => {
      if (!l.clientWidth) return;
      l.style.fontSize = '';                                   // CSS 규격(6.3cqh)으로 되돌린 뒤 측정
      let size = parseFloat(getComputedStyle(l).fontSize) || 11;
      const min = size * 0.55;
      while (l.scrollWidth > l.clientWidth && size > min) {
        size -= 0.5;
        l.style.fontSize = size + 'px';
      }
    });
  }

  function blockSlides(block) {
    // breaks 기준으로 줄을 슬라이드 그룹으로 묶음
    const groups = [[0]];
    for (let i = 1; i < block.lines.length; i++) {
      if (block.breaks[i - 1]) groups.push([i]);
      else groups[groups.length - 1].push(i);
    }
    return groups;
  }

  // 긴 가사 줄은 글자를 줄여 한 줄에 맞춤 (줄바꿈 방지)
  function fitLines(root) {
    root.querySelectorAll('.line-text').forEach(t => {
      if (!t.clientWidth) return;
      let size = 16;
      t.style.fontSize = size + 'px';
      while (t.scrollWidth > t.clientWidth && size > 11.5) {
        size -= 0.5;
        t.style.fontSize = size + 'px';
      }
    });
  }

  function renderLyricsTab() {
    const el = $('#tab-lyrics');
    el.innerHTML = '';
    const s = song();
    if (!s) return;

    // 추출 실패 → 직접 입력/붙여넣기 우회로 (지침 12-7)
    if (s.extractError || !s.blocks || !s.blocks.length) {
      const box = document.createElement('div');
      box.className = 'manual-box';
      box.innerHTML = '<p class="review-badge">' +
        (s.extractError ? '가사를 자동으로 읽지 못했어요: ' + s.extractError : '아직 가사가 없습니다.') +
        '</p><p class="review-tip">아래에 가사를 붙여넣거나 직접 입력한 뒤 “슬라이드 생성하기”를 누르면 절/후렴으로 나눠 드립니다. <b>절 사이를 빈 줄로 띄우면 더 정확히 나뉘어요.</b></p>';
      const ta = document.createElement('textarea');
      ta.className = 'manual-ta';
      ta.rows = 8;
      ta.placeholder = '여기에 가사를 붙여넣으세요…';
      box.appendChild(ta);
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-wide';
      btn.textContent = '슬라이드 생성하기';
      btn.style.marginTop = '10px';
      btn.addEventListener('click', async () => {
        const text = ta.value.trim();
        if (!text) return;
        btn.disabled = true; btn.textContent = '생성 중…';
        try {
          // 붙여넣기는 로컬 규칙 분할(AI 미사용) → 저작권 거부 없음
          Songs.applyExtract(s, Songs.pasteToBlocks(text));
          if (!(s.blocks || []).length) {
            btn.disabled = false; btn.textContent = '슬라이드 생성하기';
            alert('가사를 나누지 못했어요. 절 사이를 빈 줄로 띄우고 다시 시도해 주세요.');
            return;
          }
          SongStore.save(); SongStore.pushNow(s);
          renderLyricsTab(); fitLines($('#tab-lyrics'));
        } catch (e) {
          btn.disabled = false; btn.textContent = '슬라이드 생성하기';
          alert('정리에 실패했습니다: ' + (e.message || ''));
        }
      });
      box.appendChild(btn);
      el.appendChild(box);
      renderOrderBar(); // 블록 없음 → 바 숨김 처리
      return;
    }

    // 사진 잘림 감지 배지 (지침 12-5) — 질문형 + 원클릭 해제
    if (s.crop) {
      const badge = document.createElement('div');
      badge.className = 'review-badge crop-badge';
      const span = document.createElement('span');
      span.textContent = '✂️ 악보가 잘렸을 수 있어요 — 다음 페이지가 있나요? 있으면 “페이지 추가”로 올려주세요.';
      const x = document.createElement('button');
      x.className = 'badge-x';
      x.textContent = '괜찮아요 ✕';
      x.addEventListener('click', () => { s.crop = false; SongStore.save(); SongStore.pushNow(s); renderLyricsTab(); });
      badge.append(span, x);
      el.appendChild(badge);
    }

    // 저신뢰 비율 → 흐릿한 인쇄 배지 (지침 12-6, 기준 10%)
    let words = 0, lows = 0;
    s.blocks.forEach(b => b.lines.forEach(l => { words += l.text.split(' ').length; lows += (l.low || []).length; }));
    if (words && lows / words > 0.10) {
      const badge = document.createElement('div');
      badge.className = 'review-badge';
      badge.textContent = '⚠️ 원본 인쇄가 흐린 것 같아요 — 노란 표시가 많습니다. "원본" 탭과 대조하며 꼼꼼히 검수해 주세요.';
      el.appendChild(badge);
    }

    const tip = document.createElement('p');
    tip.className = 'review-tip';
    tip.innerHTML = '<span class="tip-line"><mark>노란 표시</mark>는 잘못 읽혔을 수 있는 단어입니다.</span>'
      + '<span class="tip-line">"원본" 탭의 악보 사진과 대조해 주세요.</span>'
      + '<span class="tip-line tip-sub">줄 사이 선을 누르면 슬라이드 나눔/합침 · 줄을 누르면 수정(엔터=줄 나누기, 맨앞 ⌫=윗줄과 합치기) · 절 이름은 눌러서 변경</span>';
    el.appendChild(tip);

    s.blocks.forEach(block => {
      const card = document.createElement('div');
      card.className = 'block-card';
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'block-label';
      label.textContent = block.label;
      label.title = '눌러서 절 이름 바꾸기 (1절 · 후렴 등)';
      label.addEventListener('click', () => editBlockLabel(block, label));
      card.appendChild(label);

      const over = blockSlides(block).some(g => g.length > 2);
      if (over) {
        const warn = document.createElement('div');
        warn.className = 'block-warn';
        warn.textContent = '한 슬라이드에 3줄 이상이 들어갑니다 — 화면에서 넘칠 수 있어요. 줄 사이를 눌러 나눠주세요.';
        card.appendChild(warn);
      }

      block.lines.forEach((_, li) => {
        card.appendChild(lineNode(block, li));
        if (li < block.lines.length - 1) card.appendChild(dividerNode(block, li));
      });

      el.appendChild(card);
    });

    // 언제든 붙여넣기로 갈아탈 수 있는 상시 입구 (지침 12-7)
    const paste = document.createElement('button');
    paste.className = 'btn btn-ghost paste-again';
    paste.textContent = '📋 추출 결과 대신 가사 붙여넣기로 다시 입력';
    paste.addEventListener('click', () => {
      if (!confirm('지금 가사를 비우고 붙여넣기로 다시 입력할까요?')) return;
      s.blocks = []; s.extractError = null; s.order = [];
      SongStore.save();
      renderLyricsTab();
    });
    el.appendChild(paste);

    fitLines(el);
    renderOrderBar(); // 블록·분할 변경이 슬라이드 수/버튼에 반영되도록
  }

  /* ================= 탭 2: 원본 (핀치 줌) ================= */

  async function renderOriginalTab() {
    const el = $('#tab-original');
    el.innerHTML = '';
    let imgs = SongStore.getImages(songId); // 세션 내 캐시 (업로드 직후)
    const s = song();

    // 서버 모드: 캐시가 없으면 저장된 경로로 서명 URL 발급 (1시간)
    if (!imgs.length && CONFIG.USE_SERVER && s && (s.images || []).length) {
      const p = document.createElement('p');
      p.className = 'review-tip';
      p.textContent = '악보를 불러오는 중…';
      el.appendChild(p);
      try {
        const r = await API.call('imageUrls', { paths: s.images });
        imgs = r.urls || [];
        SongStore.setImages(songId, imgs);
      } catch (e) { imgs = []; }
      el.innerHTML = '';
    }

    if (!imgs.length) {
      const p = document.createElement('p');
      p.className = 'review-tip';
      p.textContent = '저장된 원본 이미지가 없습니다.';
      el.appendChild(p);
      return;
    }
    imgs.forEach(src => {
      const wrap = document.createElement('div');
      wrap.className = 'zoom-wrap';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '악보 원본';
      wrap.appendChild(img);
      el.appendChild(wrap);
      attachPinchZoom(wrap, img);
    });
  }

  // 핀치 줌 + 팬 + 더블탭 리셋 (지침 10번 — 터치 대응)
  function attachPinchZoom(wrap, img) {
    let scale = 1, tx = 0, ty = 0;
    let start = null, lastTap = 0;
    const pointers = new Map();

    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };

    wrap.addEventListener('pointerdown', (e) => {
      wrap.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { scale = 1; tx = 0; ty = 0; apply(); }
        lastTap = now;
        start = { x: e.clientX, y: e.clientY, tx, ty };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        start = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      }
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && start && scale > 1) {
        tx = start.tx + (e.clientX - start.x);
        ty = start.ty + (e.clientY - start.y);
        apply();
      } else if (pointers.size === 2 && start && start.dist) {
        const [a, b] = [...pointers.values()];
        scale = Math.min(6, Math.max(1, start.scale * Math.hypot(a.x - b.x, a.y - b.y) / start.dist));
        if (scale === 1) { tx = 0; ty = 0; }
        apply();
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) start = null;
    };
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
  }

  /* ============ 부르는 순서 — 검수 화면 하단 고정 바 (지침 15번, D5) ============
     별도 화면 없이 가사를 보면서 그 자리에서 지정. 누르는 즉시 자동 저장. */

  function renderOrderBar() {
    const s = song();
    const bar = $('#order-bar');
    if (!s || !(s.blocks || []).length) { bar.hidden = true; return; }
    bar.hidden = false;

    // 위: 담기 버튼 (누르는 도구)
    const add = $('#obar-add');
    add.innerHTML = '';
    const lbl = document.createElement('span');
    lbl.className = 'obar-label';
    lbl.textContent = '담기';
    add.appendChild(lbl);
    s.blocks.forEach(b => {
      const c = document.createElement('button');
      c.className = 'obar-add-chip' + (b.type === 'chorus' ? ' chorus' : '');
      c.textContent = '+ ' + b.label;
      c.addEventListener('click', () => {
        s.order.push(b.id);              // 참조 배열 — 반복 클릭 = 반복 (D5)
        s.status = 'ordered';
        SongStore.save();
        renderOrderBar();
      });
      add.appendChild(c);
    });

    // 아래: 담긴 순서 = 슬라이드 필름스트립 (이대로 PPT가 됨)
    const seq = $('#obar-seq');
    seq.innerHTML = '';

    if (!s.order.length) {
      // 기본 순서(붙여넣은 그대로) — 비파괴(버튼으로 적용). 빈 상태로 시작하지 않게 (⭐ 최대 절감)
      const suggest = suggestOrder(s);
      if (suggest.length) {
        const apply = document.createElement('button');
        apply.className = 'obar-suggest';
        apply.innerHTML = '↻ 붙여넣은 순서대로 담기 <em>('
          + suggest.map(id => { const b = s.blocks.find(x => x.id === id); return b ? b.label : '?'; }).join(' → ')
          + ')</em>';
        apply.addEventListener('click', () => {
          s.order = suggest.slice();
          s.status = 'ordered';
          SongStore.save();
          renderOrderBar();
        });
        seq.appendChild(apply);
      }
      const hint = document.createElement('span');
      hint.className = 'obar-hint';
      hint.textContent = '또는 위 “담기” 버튼을 부르는 순서대로 누르세요 · 자동 저장';
      seq.appendChild(hint);
      return;
    }

    let count = 0;
    s.order.forEach(bid => { const b = s.blocks.find(x => x.id === bid); if (b) count += blockSlides(b).length; });
    const head = document.createElement('div');
    head.className = 'ofilm-head';
    head.innerHTML = '<span class="ofilm-title">이대로 PPT가 됩니다 · ' + count + '장</span>'
      + '<span class="ofilm-sub">칩 ✕ = 빼기</span>';
    seq.appendChild(head);

    const strip = document.createElement('div');
    strip.className = 'ofilm';
    s.order.forEach((bid, i) => {
      const b = s.blocks.find(x => x.id === bid);
      const group = document.createElement('div');
      group.className = 'ofilm-group';
      const thumbs = document.createElement('div');
      thumbs.className = 'ofilm-thumbs';
      if (b) blockSlides(b).forEach(g => thumbs.appendChild(filmThumb(g.map(idx => b.lines[idx].text))));
      group.appendChild(thumbs);
      const x = document.createElement('button');
      x.className = 'ofilm-x';
      x.textContent = '✕';
      x.title = (b ? b.label : '') + ' 빼기';
      x.addEventListener('click', () => {
        s.order.splice(i, 1);
        if (!s.order.length) s.status = 'review';
        SongStore.save();
        renderOrderBar();
      });
      group.appendChild(x);
      const cap = document.createElement('div');
      cap.className = 'ofilm-cap';
      cap.textContent = (i + 1) + '. ' + (b ? b.label : '?');
      group.appendChild(cap);
      strip.appendChild(group);
    });
    seq.appendChild(strip);
    fitFilm(strip);
  }

  // 기본 부르는 순서 = 입력한(붙여넣은) 블록 순서 그대로.
  // 후렴 자동 반복 삽입 금지 — 반복은 사람이 직접 담을 때만 생긴다.
  function suggestOrder(s) {
    return (s.blocks || []).map(b => b.id);
  }

  /* ================= 진입/이벤트 ================= */

  function open(id) {
    songId = id;
    const s = song();
    $('#review-title').textContent = (s.name || '곡') + ' 검수';
    renderLyricsTab();
    switchTab('lyrics');
    KZ.show('review');
    fitLines($('#tab-lyrics')); // 화면 표시 후 실행 — hidden 상태에서는 폭을 잴 수 없음
    renderOrderBar();
  }

  function init() {
    document.querySelectorAll('#review-tabs .tab').forEach(t =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('#btn-review-back').addEventListener('click', () => { Songs.render(); KZ.show('songs'); });
  }

  return { init, open };
})();
