/* ============================================================
   리더용 세트 찬양 순서 화면 (D28~D32) — Phase 3
   - 그 주 전체 곡을 한눈에: 곡 카드 스택 + 곡 ⠿ 드래그(=PPT/곡 순서)
   - 곡별 편곡 = 회차(pass) 배열 + 블록 칩(실제 페이지 썸네일)  ← Phase 3-2
     · 데이터: song.arrange = [ {items:[{block, times}]}, ... ]  (회차 = 배열 한 줄, D29)
     · 담기 팔레트로 활성 회차에 블록 담기 / 칩 ✕ = 빼기 / +회차 = 새 줄
   - ×N 스테퍼·간주·메모·카톡 내보내기는 이후 단계(3-3~3-5)
   - 이 화면이 최종 PPT 페이지 순서의 원천 (D28)
   ============================================================ */

const SetOrder = (function () {
  const $ = (sel) => document.querySelector(sel);

  // 곡별 '지금 담는 회차' 인덱스 (렌더 사이 유지, 저장 안 함)
  const activePass = {};

  /* ---------- 블록/슬라이드 계산 ---------- */

  function byId(song) {
    const m = {};
    (song.blocks || []).forEach(b => { m[b.id] = b; });
    return m;
  }

  // 블록의 슬라이드(페이지) 그룹 수 — review.blockSlides와 동일 규칙(breaks 기준 2줄 묶음)
  function blockSlideCount(block) {
    const lines = block.lines || [];
    if (!lines.length) return 0;
    const breaks = block.breaks || [];
    let groups = 1;
    for (let i = 1; i < lines.length; i++) if (breaks[i - 1]) groups++;
    return groups;
  }

  // 블록을 페이지 그룹(각 그룹 = 줄 텍스트 배열)으로 — 썸네일용
  function blockPages(block) {
    const lines = block.lines || [];
    const breaks = block.breaks || [];
    const groups = [[]];
    lines.forEach((ln, i) => {
      if (i > 0 && breaks[i - 1]) groups.push([]);
      groups[groups.length - 1].push(ln.text);
    });
    return groups.filter(g => g.length);
  }

  // ×N 페이지 규칙(D29): 1페이지 블록 → 1장(한 장 띄워두고 반복) / 여러 페이지 → 실제 복제(pages×N)
  function itemSlideCount(block, times) {
    const pages = blockSlideCount(block);
    if (pages <= 1) return pages;          // 0 or 1
    return pages * (times || 1);
  }

  // 곡의 페이지 수: arrange 있으면 그 기준(회차·×N 반영), 없으면 order, 없으면 블록 전체
  function songSlideCount(song) {
    const m = byId(song);
    if (Array.isArray(song.arrange) && song.arrange.length) {
      let n = 0;
      song.arrange.forEach(p => (p.items || []).forEach(it => {
        if (m[it.block]) n += itemSlideCount(m[it.block], it.times);
      }));
      return n;
    }
    const blocks = song.blocks || [];
    if (!blocks.length) return 0;
    if ((song.order || []).length) {
      return song.order.reduce((n, bid) => n + (m[bid] ? blockSlideCount(m[bid]) : 0), 0);
    }
    return blocks.reduce((n, b) => n + blockSlideCount(b), 0);
  }

  function totalSlides() {
    return SongStore.all().reduce((n, s) => n + songSlideCount(s), 0);
  }

  /* ---------- 편곡(arrange) 상태 ---------- */

  // AI 추천 부르는 순서: 절 → 후렴 반복 (review.suggestOrder와 동일 휴리스틱)
  function suggest(song) {
    const chorus = (song.blocks || []).find(b => b.type === 'chorus');
    const verses = (song.blocks || []).filter(b => b !== chorus);
    const order = [];
    verses.forEach(v => { order.push(v.id); if (chorus) order.push(chorus.id); });
    if (!order.length && song.blocks && song.blocks[0]) order.push(song.blocks[0].id);
    return order;
  }

  // arrange가 없으면 order(부르는 순서)·추천에서 1회차로 자동 이관(seed)
  function ensureArrange(song) {
    if (Array.isArray(song.arrange)) return song.arrange;
    const src = (song.order || []).length ? song.order : suggest(song);
    const items = src.map(bid => ({ block: bid, times: 1 }));
    song.arrange = items.length ? [{ items }] : [];
    return song.arrange;
  }

  function activeIndex(song) {
    const arr = song.arrange || [];
    let i = activePass[song.id];
    if (i == null || i >= arr.length) i = Math.max(0, arr.length - 1);
    return i;
  }

  function syncStatus(song) {
    const has = (song.arrange || []).some(p => (p.items || []).some(it => !it.memo && (it.gap || it.block)));
    song.status = has ? 'ordered' : 'review';
  }

  /* ---------- 카톡용 순서 텍스트 (D31) — 표기 표준 V1/V2/C/PreC ---------- */

  function tokenMap(song) {
    const map = {};
    let v = 0;
    (song.blocks || []).forEach(b => {
      const label = b.label || '';
      if (/프리|pre-?\s*chorus|prechorus/i.test(label)) map[b.id] = 'PreC';
      else if (b.type === 'chorus') map[b.id] = 'C';
      else if (b.type === 'bridge') map[b.id] = 'B';
      else { v++; map[b.id] = 'V' + v; }
    });
    return map;
  }

  function buildKakao() {
    const songs = SongStore.all();
    const lines = ['🎵 이번 주 찬양 순서'];
    songs.forEach((s, i) => {
      const tm = tokenMap(s);
      lines.push('');
      lines.push((i + 1) + '. ' + (s.name || '제목 미정') + (s.key ? ' (' + s.key + ')' : ''));
      const arr = ensureArrange(s);
      const passStrs = arr.map(p => {
        const toks = [], memos = [];
        (p.items || []).forEach(it => {
          if (it.memo != null) { if (it.memo) memos.push(it.memo); }
          else if (it.gap) toks.push('(간주)');
          else { const t = tm[it.block]; if (t) toks.push(t + ((it.times || 1) > 1 ? '×' + it.times : '')); }
        });
        let str = toks.join('+');
        if (memos.length) str += (str ? ' ' : '') + memos.join(' ');
        return str;
      }).filter(Boolean);
      if (passStrs.length) lines.push(passStrs.join(' / '));
    });
    return lines.join('\n');
  }

  /* ---------- 썸네일(작은 페이지 미리보기) ---------- */

  function miniThumb(lines) {
    const t = document.createElement('div');
    t.className = 'so-thumb';
    const green = document.createElement('div');
    green.className = 'so-thumb-green';
    const band = document.createElement('div');
    band.className = 'so-thumb-band';
    (lines || []).slice(0, 2).forEach(tx => {
      const d = document.createElement('div');
      d.className = 'so-thumb-line';
      d.textContent = tx;
      band.appendChild(d);
    });
    t.append(green, band);
    return t;
  }

  // 썸네일 가사가 폭을 넘으면 글자만 줄여 전체가 보이게(잘림 없이)
  function fitThumbs(root) {
    root.querySelectorAll('.so-thumb-line').forEach(l => {
      if (!l.clientWidth) return;
      let size = 8;
      l.style.fontSize = size + 'px';
      while (l.scrollWidth > l.clientWidth && size > 4.5) {
        size -= 0.5;
        l.style.fontSize = size + 'px';
      }
    });
  }

  /* ---------- 곡 순서 변경 = PPT 순서 (D28) — ▲▼ 버튼 (모바일 확실) ---------- */

  function moveSong(i, dir) {
    const ids = SongStore.all().map(s => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    SongStore.reorder(ids);       // 곡 순서 = PPT 순서 (D28)
    render();
  }

  /* ---------- 편곡 에디터 (회차 + 칩 + 담기 팔레트) ---------- */

  function renderArrange(song, card) {
    const m = byId(song);
    const arr = ensureArrange(song);
    const active = activeIndex(song);

    const body = document.createElement('div');
    body.className = 'so-body';

    if (!(song.blocks || []).length) {
      const empty = document.createElement('div');
      empty.className = 'so-summary so-summary-empty';
      empty.textContent = '가사 없음 — "곡 목록"에서 먼저 추출/붙여넣기';
      card.appendChild(empty);
      return;
    }

    // 회차 줄들
    arr.forEach((pass, pi) => {
      const row = document.createElement('div');
      row.className = 'so-pass' + (pi === active ? ' active' : '');
      row.addEventListener('click', (e) => {
        if (e.target.closest('.so-chip-x')) return;   // ✕는 별도 처리
        activePass[song.id] = pi;
        render();
      });

      const n = document.createElement('span');
      n.className = 'so-pass-n';
      n.textContent = (pi + 1) + '회차';
      row.appendChild(n);

      const chips = document.createElement('div');
      chips.className = 'so-chips';

      if (!(pass.items || []).length) {
        const e = document.createElement('span');
        e.className = 'so-pass-empty';
        e.textContent = '여기에 담아주세요';
        chips.appendChild(e);
      }

      const removeItem = (ii) => {
        pass.items.splice(ii, 1);
        if (!pass.items.length && arr.length > 1) {
          arr.splice(pi, 1);
          if (activePass[song.id] >= arr.length) activePass[song.id] = arr.length - 1;
        }
        syncStatus(song);
        SongStore.save();
        render();
      };

      (pass.items || []).forEach((it, ii) => {
        // 간주 마커 (D30) — 가사 없는 넘김/홀드, PPT엔 슬라이드 없음
        if (it.gap) {
          const chip = document.createElement('div');
          chip.className = 'so-chip gap';
          const g = document.createElement('div');
          g.className = 'so-gap';
          g.textContent = '🎵 간주';
          chip.appendChild(g);
          const x = document.createElement('button');
          x.className = 'so-chip-x'; x.type = 'button'; x.textContent = '✕'; x.title = '간주 빼기';
          x.addEventListener('click', (ev) => { ev.stopPropagation(); removeItem(ii); });
          chip.appendChild(x);
          chips.appendChild(chip);
          return;
        }

        // ✎메모 (D30) — 팀 지시(3번째 목소리만·즉흥멘트·키 등). PPT엔 안 뜨고 카톡에만.
        if (it.memo != null) {
          const chip = document.createElement('div');
          chip.className = 'so-chip memo';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'so-memo-input';
          inp.value = it.memo;
          inp.placeholder = '팀 지시 (카톡에만)';
          if (it.memo === '') setTimeout(() => inp.focus(), 0);
          inp.addEventListener('click', (ev) => ev.stopPropagation());
          inp.addEventListener('input', () => { it.memo = inp.value; });
          inp.addEventListener('blur', () => {
            it.memo = inp.value.trim();
            if (it.memo === '') { removeItem(ii); return; }
            SongStore.save();
          });
          chip.appendChild(inp);
          const x = document.createElement('button');
          x.className = 'so-chip-x'; x.type = 'button'; x.textContent = '✕'; x.title = '메모 빼기';
          x.addEventListener('click', (ev) => { ev.stopPropagation(); removeItem(ii); });
          chip.appendChild(x);
          chips.appendChild(chip);
          return;
        }

        const b = m[it.block];
        if (!b) return;
        const times = it.times || 1;
        const pages = blockPages(b);
        const multi = pages.length > 1;

        const chip = document.createElement('div');
        chip.className = 'so-chip';

        const thumbs = document.createElement('div');
        thumbs.className = 'so-thumbs';
        // ×N 렌더 규칙(D29): 여러 페이지 → 실제 복제해 나열 / 1페이지 → 한 장(홀드)
        const reps = multi ? times : 1;
        for (let r = 0; r < reps; r++) pages.forEach(gp => thumbs.appendChild(miniThumb(gp)));
        chip.appendChild(thumbs);

        const cap = document.createElement('div');
        cap.className = 'so-chip-cap';
        cap.textContent = b.label + (times > 1 ? ' ×' + times : '');
        chip.appendChild(cap);

        // ×N 스테퍼 (−/+)
        const step = document.createElement('div');
        step.className = 'so-step';
        const minus = document.createElement('button');
        minus.type = 'button'; minus.className = 'so-step-btn'; minus.textContent = '−';
        minus.disabled = times <= 1;
        minus.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if ((it.times || 1) > 1) { it.times = (it.times || 1) - 1; SongStore.save(); render(); }
        });
        const num = document.createElement('span');
        num.className = 'so-step-n';
        num.textContent = '×' + times;
        const plus = document.createElement('button');
        plus.type = 'button'; plus.className = 'so-step-btn'; plus.textContent = '+';
        plus.addEventListener('click', (ev) => {
          ev.stopPropagation();
          it.times = (it.times || 1) + 1; SongStore.save(); render();
        });
        step.append(minus, num, plus);
        chip.appendChild(step);

        const x = document.createElement('button');
        x.className = 'so-chip-x';
        x.type = 'button';
        x.textContent = '✕';
        x.title = b.label + ' 빼기';
        x.addEventListener('click', (ev) => { ev.stopPropagation(); removeItem(ii); });
        chip.appendChild(x);

        chips.appendChild(chip);
      });

      row.appendChild(chips);
      body.appendChild(row);
    });

    // 담기 팔레트
    const pal = document.createElement('div');
    pal.className = 'so-palette';
    const plabel = document.createElement('span');
    plabel.className = 'so-palette-label';
    plabel.textContent = (active + 1) + '회차에 담기';
    pal.appendChild(plabel);

    (song.blocks || []).forEach(b => {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'so-add' + (b.type === 'chorus' ? ' chorus' : '');
      add.textContent = '+ ' + b.label;
      add.addEventListener('click', () => {
        if (!arr.length) { arr.push({ items: [] }); activePass[song.id] = 0; }
        const idx = activeIndex(song);
        arr[idx].items.push({ block: b.id, times: 1 });
        syncStatus(song);
        SongStore.save();
        render();
      });
      pal.appendChild(add);
    });

    // 간주 (D30) — 가사 없는 마커, 활성 회차에 담김
    const addGap = document.createElement('button');
    addGap.type = 'button';
    addGap.className = 'so-add gap';
    addGap.textContent = '+ 간주';
    addGap.title = '가사 없이 넘기는 자리 (PPT 슬라이드 없음)';
    addGap.addEventListener('click', () => {
      if (!arr.length) { arr.push({ items: [] }); activePass[song.id] = 0; }
      arr[activeIndex(song)].items.push({ gap: true });
      SongStore.save();
      render();
    });
    pal.appendChild(addGap);

    // ✎메모 (D30) — 카톡에만 나오는 팀 지시
    const addMemo = document.createElement('button');
    addMemo.type = 'button';
    addMemo.className = 'so-add memo';
    addMemo.textContent = '+ ✎메모';
    addMemo.title = '팀 지시 (PPT엔 안 뜨고 카톡에만)';
    addMemo.addEventListener('click', () => {
      if (!arr.length) { arr.push({ items: [] }); activePass[song.id] = 0; }
      arr[activeIndex(song)].items.push({ memo: '' });
      SongStore.save();
      render();
    });
    pal.appendChild(addMemo);

    const addPass = document.createElement('button');
    addPass.type = 'button';
    addPass.className = 'so-add-pass';
    addPass.textContent = '+ 회차';
    addPass.title = '새 회차(줄) 추가';
    addPass.addEventListener('click', () => {
      arr.push({ items: [] });
      activePass[song.id] = arr.length - 1;
      SongStore.save();
      render();
    });
    pal.appendChild(addPass);

    body.appendChild(pal);
    card.appendChild(body);
  }

  /* ---------- 렌더 ---------- */

  function render() {
    const list = $('#setorder-list');
    list.innerHTML = '';
    const songs = SongStore.all();
    $('#setorder-total').textContent = '총 ' + totalSlides() + '장';

    if (!songs.length) {
      const p = document.createElement('p');
      p.className = 'song-empty';
      p.textContent = '아직 곡이 없습니다. "곡 목록"에서 곡을 먼저 추가하세요.';
      list.appendChild(p);
      return;
    }

    songs.forEach((song, i) => {
      const card = document.createElement('div');
      card.className = 'so-card';
      card.dataset.id = song.id;

      const head = document.createElement('div');
      head.className = 'so-head';
      // ▲▼ 곡 순서 이동 (모바일에서 확실 — 드래그 대체)
      const mv = document.createElement('div');
      mv.className = 'so-move';
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'so-move-btn'; up.textContent = '▲'; up.title = '위로';
      up.disabled = (i === 0);
      up.addEventListener('click', () => moveSong(i, -1));
      const down = document.createElement('button');
      down.type = 'button'; down.className = 'so-move-btn'; down.textContent = '▼'; down.title = '아래로';
      down.disabled = (i === songs.length - 1);
      down.addEventListener('click', () => moveSong(i, +1));
      mv.append(up, down);
      const num = document.createElement('span');
      num.className = 'so-num';
      num.textContent = (i + 1) + '.';
      const title = document.createElement('span');
      title.className = 'so-title';
      title.textContent = song.name || '제목 미정';
      const key = document.createElement('input');
      key.className = 'so-key';
      key.type = 'text';
      key.placeholder = '키';
      key.value = song.key || '';
      key.addEventListener('input', () => { song.key = key.value.trim(); SongStore.save(); });
      const cnt = document.createElement('span');
      cnt.className = 'so-count';
      cnt.textContent = songSlideCount(song) + '장';
      head.append(mv, num, title, key, cnt);
      card.appendChild(head);

      renderArrange(song, card);

      list.appendChild(card);
    });

    fitThumbs(list);
  }

  /* ---------- 진입/이벤트 ---------- */

  function open() {
    render();
    KZ.show('setorder');
  }

  function init() {
    const back = $('#btn-setorder-back');
    if (back) back.addEventListener('click', () => { Songs.render(); KZ.show('songs'); });
    const entry = $('#btn-open-setorder');
    if (entry) entry.addEventListener('click', () => open());

    // 카톡 순서 패널 (D31)
    const kbtn = $('#btn-kakao');
    if (kbtn) kbtn.addEventListener('click', () => {
      $('#kakao-text').value = buildKakao();
      $('#kakao-panel').hidden = false;
    });
    const kclose = $('#btn-kakao-close');
    if (kclose) kclose.addEventListener('click', () => { $('#kakao-panel').hidden = true; });
    const kcopy = $('#btn-kakao-copy');
    if (kcopy) kcopy.addEventListener('click', async () => {
      const ta = $('#kakao-text');
      try {
        await navigator.clipboard.writeText(ta.value);
      } catch (e) {
        ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
      }
      const old = kcopy.textContent;
      kcopy.textContent = '복사됨 ✓';
      setTimeout(() => { kcopy.textContent = old; }, 1500);
    });
  }

  return { init, open, render };
})();
