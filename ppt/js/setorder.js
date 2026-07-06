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

  // 곡별 '지금 담는 파트' 인덱스 (렌더 사이 유지, 저장 안 함)
  const activePass = {};
  // 펼친 곡 id (아코디언 — 펼치면 편곡·필름스트립·가사·원본이 한 카드에)
  const expandedIds = new Set();
  // 편집한 콘티 텍스트 저장(기기 로컬 — 다시 열어도 유지). 큐를 여기서만 관리(D30 갱신)
  const CONTI_KEY = 'kzppt_conti_text';

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
      // 블록만 자동 생성 — 간주·멘트 등 다이내믹 큐는 리더가 이 텍스트에 직접 타이핑(D30 갱신)
      const passStrs = arr.map(p => {
        const toks = [];
        (p.items || []).forEach(it => {
          if (it.gap || it.memo != null) return;
          const t = tm[it.block];
          if (t) toks.push(t + ((it.times || 1) > 1 ? '×' + it.times : ''));
        });
        return toks.join('+');
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

  /* ---------- 블록 페이지 미리보기 (칩 탭) — 실제 슬라이드처럼 전체 가사 ---------- */

  function openPreview(block) {
    const modal = $('#preview-modal');
    const body = $('#preview-body');
    if (!modal || !body) return;
    $('#preview-title').textContent = (block.label || '블록') + ' · ' + blockSlideCount(block) + '쪽';
    body.innerHTML = '';
    blockPages(block).forEach((lines, i) => {
      const item = document.createElement('div');
      item.className = 'pv-item';
      const slide = document.createElement('div');
      slide.className = 'pv-slide';
      const green = document.createElement('div');
      green.className = 'pv-green';
      const band = document.createElement('div');
      band.className = 'pv-band';
      lines.forEach(tx => {
        const d = document.createElement('div');
        d.className = 'pv-line';
        d.textContent = tx;   // 실제 가사 전체 (자르지 않음)
        band.appendChild(d);
      });
      slide.append(green, band);
      const cap = document.createElement('div');
      cap.className = 'pv-cap';
      cap.textContent = (i + 1) + '쪽';
      item.append(slide, cap);
      body.appendChild(item);
    });
    modal.hidden = false;
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
      n.textContent = (pi + 1) + '파트';
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
        // 간주·메모는 세트 화면에서 제거(콘티 텍스트창에서 입력) — 옛 데이터 있으면 무시
        if (it.gap || it.memo != null) return;

        const b = m[it.block];
        if (!b) return;
        const times = it.times || 1;
        const pageN = blockSlideCount(b);

        // A안: 컴팩트 칩(라벨·쪽수·×N·스테퍼). 탭 = 실제 페이지 미리보기
        const chip = document.createElement('div');
        chip.className = 'so-chip' + (b.type === 'chorus' ? ' chorus' : '');
        chip.title = '탭하면 실제 페이지 미리보기';
        chip.addEventListener('click', () => openPreview(b));

        const lab = document.createElement('div');
        lab.className = 'so-chip-lab';
        lab.textContent = b.label;
        chip.appendChild(lab);

        const pg = document.createElement('div');
        pg.className = 'so-chip-pg';
        pg.textContent = pageN + '쪽';
        if (times > 1) {
          const xn = document.createElement('span');
          xn.className = 'so-xn';
          xn.textContent = ' ×' + times;
          pg.appendChild(xn);
        }
        chip.appendChild(pg);

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
    plabel.textContent = (active + 1) + '파트에 담기';
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

    // 간주·메모는 세트 화면에서 제거 — 다이내믹 큐는 콘티 텍스트창에서 직접 입력 (2026-07-05)

    const addPass = document.createElement('button');
    addPass.type = 'button';
    addPass.className = 'so-add-pass';
    addPass.textContent = '+ 파트';
    addPass.title = '새 파트 추가';
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

  /* ---------- 접힘 요약 / 펼침 ---------- */

  function renderSummary(song, card) {
    const arr = ensureArrange(song);
    const m = byId(song);
    const sum = document.createElement('div');
    sum.className = 'so-sum';
    let any = false;
    arr.forEach(pass => (pass.items || []).forEach(it => {
      if (it.gap || it.memo != null) return;
      const b = m[it.block]; if (!b) return;
      any = true;
      const chip = document.createElement('span');
      chip.className = 'so-sum-chip' + (b.type === 'chorus' ? ' c' : '');
      const t = document.createElement('b'); t.textContent = b.label;
      const s = document.createElement('small');
      s.textContent = ' ' + blockSlideCount(b) + '쪽' + ((it.times || 1) > 1 ? ' ×' + it.times : '');
      chip.append(t, s);
      sum.appendChild(chip);
    }));
    if (!any) {
      sum.className = 'so-summary so-summary-empty';
      sum.textContent = (song.blocks && song.blocks.length)
        ? '편곡 미정 — 펼쳐서 담기'
        : '가사 없음 — "곡 목록"에서 먼저 추출/붙여넣기';
    }
    card.appendChild(sum);
  }

  function renderExpanded(song, card) {
    // 키 입력 (펼침에만 — B안). 콘티 텍스트의 "(G)" 표기는 유지
    const info = document.createElement('div');
    info.className = 'so-info';
    const kl = document.createElement('span'); kl.className = 'so-info-lbl'; kl.textContent = '키';
    const key = document.createElement('input');
    key.className = 'so-key'; key.type = 'text'; key.placeholder = '예: G';
    key.value = song.key || '';
    key.addEventListener('input', () => { song.key = key.value.trim(); SongStore.save(); });
    info.append(kl, key);
    card.appendChild(info);

    renderArrange(song, card);   // 편곡 (담기·파트·×N)
    // Step 2·3(다음 단계): 필름스트립 미리보기 · 가사 편집 · 원본 악보
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
      const expanded = expandedIds.has(song.id);
      const card = document.createElement('div');
      card.className = 'so-card' + (expanded ? ' open' : '');
      card.dataset.id = song.id;

      const head = document.createElement('div');
      head.className = 'so-head';
      // ▲▼ 곡 순서 이동 (모바일에서 확실 — 드래그 대체)
      const mv = document.createElement('div');
      mv.className = 'so-move';
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'so-move-btn'; up.textContent = '▲'; up.title = '위로';
      up.disabled = (i === 0);
      up.addEventListener('click', (e) => { e.stopPropagation(); moveSong(i, -1); });
      const down = document.createElement('button');
      down.type = 'button'; down.className = 'so-move-btn'; down.textContent = '▼'; down.title = '아래로';
      down.disabled = (i === songs.length - 1);
      down.addEventListener('click', (e) => { e.stopPropagation(); moveSong(i, +1); });
      mv.append(up, down);
      const num = document.createElement('span');
      num.className = 'so-num';
      num.textContent = (i + 1) + '.';
      const title = document.createElement('span');
      title.className = 'so-title';
      title.textContent = song.name || '제목 미정';
      const cnt = document.createElement('span');
      cnt.className = 'so-count';
      cnt.textContent = songSlideCount(song) + '장';
      const tog = document.createElement('span');
      tog.className = 'so-toggle';
      tog.textContent = expanded ? '접기 ▴' : '펼치기 ▾';
      head.append(mv, num, title, cnt, tog);
      // 헤더(▲▼ 제외) 클릭 = 펼침/접힘
      head.addEventListener('click', () => {
        if (expanded) expandedIds.delete(song.id); else expandedIds.add(song.id);
        render();
      });
      card.appendChild(head);

      if (expanded) {
        renderExpanded(song, card);   // 키·편곡·(다음 단계: 필름스트립·가사·원본)
      } else {
        renderSummary(song, card);    // 접힘 = 편곡 요약 칩
      }

      list.appendChild(card);
    });

    fitThumbs(list);
  }

  /* ---------- 진입/이벤트 ---------- */

  function open() {
    // 처음 들어오면 첫 곡을 펼쳐서 보여줌(빈 화면 방지)
    const songs = SongStore.all();
    if (!expandedIds.size && songs.length) expandedIds.add(songs[0].id);
    render();
    KZ.show('setorder');
  }

  function init() {
    const back = $('#btn-setorder-back');
    if (back) back.addEventListener('click', () => { Songs.render(); KZ.show('songs'); });
    const entry = $('#btn-open-setorder');
    if (entry) entry.addEventListener('click', () => open());

    // 콘티 순서 텍스트 패널 (D31) — 편집분 저장(다시 열어도 유지) + 블록에서 다시 생성
    const kbtn = $('#btn-kakao');
    if (kbtn) kbtn.addEventListener('click', () => {
      const saved = localStorage.getItem(CONTI_KEY);
      $('#kakao-text').value = (saved != null) ? saved : buildKakao();
      $('#kakao-panel').hidden = false;
    });
    const kta = $('#kakao-text');
    if (kta) kta.addEventListener('input', () => { localStorage.setItem(CONTI_KEY, kta.value); });
    const kregen = $('#btn-kakao-regen');
    if (kregen) kregen.addEventListener('click', () => {
      if (!confirm('곡 순서·반복에서 콘티를 다시 만들까요? 직접 적어둔 간주·멘트는 지워집니다.')) return;
      const text = buildKakao();
      $('#kakao-text').value = text;
      localStorage.setItem(CONTI_KEY, text);
    });
    const kclose = $('#btn-kakao-close');
    if (kclose) kclose.addEventListener('click', () => { $('#kakao-panel').hidden = true; });

    // 페이지 미리보기 모달 닫기 (배경/닫기 버튼)
    const pvClose = $('#btn-preview-close');
    if (pvClose) pvClose.addEventListener('click', () => { $('#preview-modal').hidden = true; });
    const pvModal = $('#preview-modal');
    if (pvModal) pvModal.addEventListener('click', (e) => { if (e.target === pvModal) pvModal.hidden = true; });
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
