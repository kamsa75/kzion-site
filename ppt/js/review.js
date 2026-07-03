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
    ['lyrics', 'slides', 'original'].forEach(n => { $('#tab-' + n).hidden = (n !== name); });
    if (name === 'slides') renderSlidesTab();
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
      });
    });
    return row;
  }

  function dividerNode(block, gi) {
    // gi = 줄 i 와 i+1 사이. 클릭으로 슬라이드 분할 토글 (지침 19)
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'divider' + (block.breaks[gi] ? ' cut' : '');
    div.innerHTML = block.breaks[gi]
      ? '<span>— 여기서 슬라이드 나뉨 —</span>'
      : '<span>┄</span>';
    div.addEventListener('click', () => {
      block.breaks[gi] = !block.breaks[gi];
      SongStore.save();
      renderLyricsTab();
    });
    return div;
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

  function renderLyricsTab() {
    const el = $('#tab-lyrics');
    el.innerHTML = '';
    const s = song();
    if (!s || !s.blocks) return;

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
    tip.innerHTML = '노란 표시는 AI가 확신하지 못한 단어입니다 — "원본" 탭과 대조해 주세요. 줄을 누르면 수정, 줄 사이 <b>┄</b> 를 누르면 슬라이드가 나뉩니다.';
    el.appendChild(tip);

    s.blocks.forEach(block => {
      const card = document.createElement('div');
      card.className = 'block-card';
      const label = document.createElement('div');
      label.className = 'block-label';
      label.textContent = block.label + (block.type === 'chorus' && block.label !== '후렴' ? ' (후렴)' : '');
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
  }

  /* ================= 탭 2: 슬라이드 미리보기 ================= */

  function slidesOf(s) {
    // 순서 지정 전: 블록 순서대로 전체 슬라이드 (검수용)
    const out = [];
    s.blocks.forEach(block => {
      blockSlides(block).forEach(g => {
        out.push({ label: block.label, lyrics: g.map(i => block.lines[i].text) });
      });
    });
    return out;
  }

  function renderSlidesTab() {
    const el = $('#tab-slides');
    el.innerHTML = '';
    const s = song();
    slidesOf(s).forEach((sl, i) => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const label = document.createElement('div');
      label.className = 'pv-label';
      label.textContent = (i + 1) + '. ' + sl.label;
      item.appendChild(label);
      item.appendChild(renderSlide({ layout: 'band', lyrics: sl.lyrics }));
      el.appendChild(item);
    });
  }

  /* ================= 탭 3: 원본 (핀치 줌) ================= */

  function renderOriginalTab() {
    const el = $('#tab-original');
    el.innerHTML = '';
    const imgs = SongStore.getImages(songId);
    if (!imgs.length) {
      const p = document.createElement('p');
      p.className = 'review-tip';
      p.textContent = '원본 이미지가 없습니다. (목 단계에서는 새로고침하면 이미지가 사라집니다 — 3단계 서버 저장 후 유지됩니다)';
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

  /* ================= 순서 지정 (지침 15번, D5) ================= */

  function renderOrder() {
    const s = song();
    const blocksEl = $('#order-blocks');
    blocksEl.innerHTML = '';
    s.blocks.forEach(b => {
      const chip = document.createElement('button');
      chip.className = 'order-chip' + (b.type === 'chorus' ? ' chorus' : '');
      chip.innerHTML = `<b>${b.label}</b><span>${b.lines[0].text.slice(0, 14)}…</span>`;
      chip.addEventListener('click', () => {
        s.order.push(b.id);          // 참조 배열 — 복제 클릭 허용 (D5)
        SongStore.save();
        renderOrder();
      });
      blocksEl.appendChild(chip);
    });

    const seqEl = $('#order-seq');
    seqEl.innerHTML = '';
    if (!s.order.length) {
      seqEl.innerHTML = '<p class="review-tip">아직 비어 있습니다. 위 블록을 부르는 순서대로 눌러주세요. (예: 1절 → 후렴 → 2절 → 후렴)</p>';
    }
    s.order.forEach((bid, i) => {
      const b = s.blocks.find(x => x.id === bid);
      const item = document.createElement('div');
      item.className = 'order-item';
      item.innerHTML = `<span class="order-num">${i + 1}</span><span class="order-name">${b ? b.label : '?'}</span>`;
      const del = document.createElement('button');
      del.className = 'btn btn-ghost';
      del.textContent = '빼기';
      del.addEventListener('click', () => { s.order.splice(i, 1); SongStore.save(); renderOrder(); });
      item.appendChild(del);
      seqEl.appendChild(item);
    });

    // 총 슬라이드 수 표시
    let count = 0;
    s.order.forEach(bid => {
      const b = s.blocks.find(x => x.id === bid);
      if (b) count += blockSlides(b).length;
    });
    $('#order-count').textContent = s.order.length ? `→ 슬라이드 총 ${count}장이 생성됩니다.` : '';
  }

  /* ================= 진입/이벤트 ================= */

  function open(id) {
    songId = id;
    const s = song();
    $('#review-title').textContent = (s.name || '곡') + ' 검수';
    renderLyricsTab();
    switchTab('lyrics');
    KZ.show('review');
  }

  function init() {
    document.querySelectorAll('#review-tabs .tab').forEach(t =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('#btn-review-back').addEventListener('click', () => { Songs.render(); KZ.show('songs'); });
    $('#btn-review-order').addEventListener('click', () => { renderOrder(); KZ.show('order'); });
    $('#btn-order-back').addEventListener('click', () => KZ.show('review'));
    $('#btn-order-done').addEventListener('click', () => {
      const s = song();
      if (!s.order.length) { alert('순서가 비어 있습니다. 블록을 눌러 순서를 만들어주세요.'); return; }
      s.status = 'ordered';
      SongStore.save();
      Songs.render();
      KZ.show('songs');
    });
  }

  return { init, open };
})();
