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
  // 가사를 '텍스트로 통째 편집' 중인 곡 id (절 이동·추가·순서 자유 편집)
  const textEditIds = new Set();
  // 편집한 콘티 텍스트 저장(기기 로컬 — 다시 열어도 유지). 큐를 여기서만 관리(D30 갱신)
  const CONTI_KEY = 'kzppt_conti_text';

  /* ---------- 블록/슬라이드 계산 ---------- */

  function byId(song) {
    const m = {};
    (song.blocks || []).forEach(b => { m[b.id] = b; });
    return m;
  }

  // 블록 → 슬라이드 그룹(줄 인덱스 배열들). breaks로 1차 묶고, 밴드=2줄이라 3줄+는 2줄씩 자동 분할
  // (사용자가 여러 줄을 한 슬라이드로 묶어도 가사를 잃지 않도록 — 2026-07-06 버그픽스)
  function blockSlideGroups(block) {
    const lines = block.lines || [];
    const n = lines.length;
    const breaks = block.breaks || [];
    // breaks가 전부 true(모든 줄 분리=1줄씩; 추출 기본값 오류·구데이터)면 무시하고 2줄씩 재페어링(수동 혼합 나눔은 존중)
    const allSplit = n > 1 && breaks.slice(0, n - 1).every(Boolean);
    const raw = [[]];
    lines.forEach((_, i) => {
      if (i > 0 && !allSplit && breaks[i - 1]) raw.push([]);
      raw[raw.length - 1].push(i);
    });
    const out = [];
    raw.forEach(g => { for (let i = 0; i < g.length; i += 2) out.push(g.slice(i, i + 2)); });
    return out.filter(g => g.length);
  }

  function blockSlideCount(block) {
    return (block.lines || []).length ? blockSlideGroups(block).length : 0;
  }

  // 블록을 페이지 그룹(각 그룹 = 줄 텍스트 배열, 각 ≤2줄)으로 — 썸네일·미리보기용
  function blockPages(block) {
    return blockSlideGroups(block).map(g => g.map(i => (block.lines[i] || {}).text || ''));
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
      passStrs.forEach(ps => lines.push(ps));   // 파트(회차)마다 줄바꿈 → 추가된 파트가 한눈에 구분
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
      item.appendChild(bandSlideNode(lines, 'full'));   // 필름스트립과 동일 렌더(공용)
      const cap = document.createElement('div');
      cap.className = 'pv-cap';
      cap.textContent = (i + 1) + '쪽';
      body.appendChild(item);
    });
    modal.hidden = false;
    fitBand(body);   // 모달도 한 줄로 폭 맞춤(필름스트립과 동일)
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
      chips.dataset.part = pi;                 // 드래그 정렬: 이 컨테이너 = 몇 번째 파트

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
        chip.title = '탭하면 미리보기 · 꾹 눌러 순서 이동';
        chip._item = it;                         // 드래그 정렬: 이 칩의 데이터
        chip.addEventListener('click', () => { if (DragSort.suppressClick()) return; openPreview(b); });

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

    // 드래그로 칩 순서 정렬(파트 넘나들기) — 데스크탑 바로끌기 / 모바일 꾹눌러-흔들-완료
    DragSort.bind(body, {
      container: '.so-chips', item: '.so-chip', ignore: 'button', group: 'arr-' + song.id,
      commit: () => commitArrange(song, body),
      rerender: render
    });
  }

  // 드래그 후 DOM 순서 → arrange 데이터로 반영(파트별 재구성)
  function commitArrange(song, body) {
    const arr = song.arrange || [];
    body.querySelectorAll('.so-chips').forEach(cont => {
      const pi = parseInt(cont.dataset.part, 10);
      if (!arr[pi]) return;
      arr[pi].items = Array.from(cont.querySelectorAll('.so-chip')).map(ch => ch._item).filter(Boolean);
    });
    for (let i = arr.length - 1; i >= 0; i--) if (!(arr[i].items || []).length && arr.length > 1) arr.splice(i, 1);
    syncStatus(song); SongStore.save(); render();
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
    // 곡 정보: 제목 + 키 (펼침에 항상 — 빈 곡도 여기서 제목 입력·수정)
    const info = document.createElement('div');
    info.className = 'so-info';

    const f1 = document.createElement('div'); f1.className = 'so-field';
    const tl = document.createElement('span'); tl.className = 'so-field-lbl'; tl.textContent = '제목';
    const ti = document.createElement('input');
    ti.className = 'so-title-input'; ti.type = 'text'; ti.placeholder = '곡 제목';
    ti.value = song.name || '';
    ti.addEventListener('input', () => {
      song.name = ti.value.trim(); SongStore.save();
      const h = card.querySelector('.so-title'); if (h) h.textContent = song.name || '제목 미정';
    });
    // 포커스 아웃 시 지난 곡 불러오기 제안 (붙여넣기 흐름은 이 세트 화면으로 들어옴 — D37)
    ti.addEventListener('change', () => { SongStore.maybeReuse(song, render); });
    f1.append(tl, ti);

    const f2 = document.createElement('div'); f2.className = 'so-field';
    const kl = document.createElement('span'); kl.className = 'so-field-lbl'; kl.textContent = '키';
    const key = document.createElement('input');
    key.className = 'so-key'; key.type = 'text'; key.placeholder = '예: G';
    key.value = song.key || '';
    key.addEventListener('input', () => { song.key = key.value.trim(); SongStore.save(); });
    f2.append(kl, key);

    info.append(f1, f2);
    card.appendChild(info);
    const rb = SongStore.reuseBanner(song, render); if (rb) card.appendChild(rb);   // 지난 곡 불러오기 배너 (D37)

    if ((song.blocks || []).length) {
      renderArrange(song, card);     // 편곡 (담기·파트·×N)
      renderFilmstrip(song, card);   // 이대로 PPT 미리보기 (필름스트립)
    }
    renderGasaZone(song, card);      // 가사 확인·편집 + 원본 악보 (블록 없으면 붙여넣기 박스)
  }

  /* ---------- 이대로 PPT 미리보기 (필름스트립) ---------- */

  // arrange → 슬라이드 시퀀스 (generate.bandFromArrange와 동일 규칙, D29)
  function songSlides(song) {
    const m = byId(song);
    const out = [];
    ensureArrange(song).forEach(pass => (pass.items || []).forEach(it => {
      if (it.gap || it.memo != null) return;
      const b = m[it.block]; if (!b) return;
      const times = it.times || 1;
      const pages = blockPages(b);
      if (pages.length <= 1) {
        const lyr = (pages[0] || []).slice();
        if (times > 1 && lyr.length) lyr[lyr.length - 1] = lyr[lyr.length - 1] + ' (×' + times + ')';
        out.push({ lyrics: lyr, cap: b.label + (times > 1 ? ' ×' + times : '') });
      } else {
        for (let r = 0; r < times; r++) pages.forEach(p => out.push({ lyrics: p, cap: b.label + (times > 1 ? ' ×' + (r + 1) : '') }));
      }
    }));
    return out;
  }

  // ★ 크로마 밴드 슬라이드 미리보기 — 필름스트립·탭 모달 공용(항상 일치). 여기 하나만 고치면 둘 다 반영.
  //   각 가사줄 = 한 줄(프로젝터는 넓어 안 넘침) → 폭을 넘으면 글자만 줄여 한 줄로.
  function bandSlideNode(lines, variant) {
    const t = document.createElement('div'); t.className = 'bandslide ' + (variant || 'thumb');
    const g = document.createElement('div'); g.className = 'bandslide-green';
    const band = document.createElement('div'); band.className = 'bandslide-band';
    (lines || []).forEach(tx => { const d = document.createElement('div'); d.className = 'bandslide-line'; d.textContent = tx; band.appendChild(d); });
    t.append(g, band); return t;
  }
  function fitBand(root) {
    root.querySelectorAll('.bandslide-line').forEach(l => {
      if (!l.clientWidth) return;
      let s = parseFloat(getComputedStyle(l).fontSize) || 11;
      const min = s * 0.5;
      l.style.fontSize = s + 'px';
      while (l.scrollWidth > l.clientWidth && s > min) { s -= 0.5; l.style.fontSize = s + 'px'; }
    });
  }
  function filmThumb(lines) { return bandSlideNode(lines, 'thumb'); }   // 필름스트립용(공용 렌더 재사용)

  function renderFilmstrip(song, card) {
    const slides = songSlides(song);
    if (!slides.length) return;
    const zone = document.createElement('div'); zone.className = 'so-zone';
    const zt = document.createElement('div'); zt.className = 'so-zt';
    zt.innerHTML = '<span class="so-zk"></span>이대로 PPT 미리보기 <small>' + slides.length + '장 · 편곡·×N 반영</small>';
    zone.appendChild(zt);
    const strip = document.createElement('div'); strip.className = 'ofilm so-film';
    slides.forEach((sl, i) => {
      const group = document.createElement('div'); group.className = 'ofilm-group';
      const thumbs = document.createElement('div'); thumbs.className = 'ofilm-thumbs';
      thumbs.appendChild(filmThumb(sl.lyrics));
      group.appendChild(thumbs);
      const cap = document.createElement('div'); cap.className = 'ofilm-cap'; cap.textContent = (i + 1) + '. ' + sl.cap;
      group.appendChild(cap);
      strip.appendChild(group);
    });
    zone.appendChild(strip);
    card.appendChild(zone);
  }

  /* ---------- 가사 확인·편집 + 원본 악보 (검수 기능 흡수, 2026-07-05) ---------- */

  function fitLines(root) {
    root.querySelectorAll('.line-text').forEach(t => {
      if (!t.clientWidth) return;
      let size = 16; t.style.fontSize = size + 'px';
      while (t.scrollWidth > t.clientWidth && size > 11.5) { size -= 0.5; t.style.fontSize = size + 'px'; }
    });
  }

  function overflowWarn(block) {
    const groups = [[0]];
    for (let i = 1; i < block.lines.length; i++) {
      if (block.breaks[i - 1]) groups.push([i]); else groups[groups.length - 1].push(i);
    }
    return groups.some(g => g.length > 2);
  }

  function lineNode(song, block, li) {
    const line = block.lines[li];
    const row = document.createElement('div'); row.className = 'line-row';
    // 충돌 리로드 후: 다른 사람이 바꾼 가사 줄 노란 하이라이트 (#3, A→C)
    if (window.Conflict && Conflict.lineChanged(song.id, block.id || block.label, line.text)) row.classList.add('line-changed');
    const textEl = document.createElement('div'); textEl.className = 'line-text';
    line.text.split(' ').forEach((w, wi) => {              // 저신뢰 단어 노란 하이라이트(원본 대조)
      if (wi > 0) textEl.appendChild(document.createTextNode(' '));
      if ((line.low || []).includes(wi)) { const mk = document.createElement('mark'); mk.textContent = w; textEl.appendChild(mk); }
      else textEl.appendChild(document.createTextNode(w));
    });
    row.appendChild(textEl);
    textEl.addEventListener('click', () => {
      const input = document.createElement('input'); input.type = 'text'; input.className = 'line-input'; input.value = line.text;
      row.replaceChild(input, textEl); input.focus();
      const commit = () => { line.text = input.value.trim(); line.low = []; SongStore.save(); render(); };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const pos = input.selectionStart;
          const before = input.value.slice(0, pos).trim(), after = input.value.slice(pos).trim();
          if (before && after) {
            block.lines.splice(li, 1, { text: before, low: [] }, { text: after, low: [] });
            block.breaks.splice(li, 0, false);
            input.removeEventListener('blur', commit); SongStore.save(); render();
          } else input.blur();
        }
        if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0 && li > 0) {
          e.preventDefault();
          const prev = block.lines[li - 1];
          prev.text = (prev.text + ' ' + input.value.trim()).trim(); prev.low = [];
          block.lines.splice(li, 1); block.breaks.splice(li - 1, 1);
          input.removeEventListener('blur', commit); SongStore.save(); render();
        }
      });
    });
    return row;
  }

  // 밴드=2줄이라 3줄째로 합치기는 막음. gi 양쪽 그룹 크기 합이 2 이하일 때만 합치기 허용
  function groupSizeLeft(block, gi) { let n = 1; for (let i = gi - 1; i >= 0; i--) { if (block.breaks[i]) break; n++; } return n; }
  function groupSizeRight(block, gi) { let n = 1; for (let i = gi + 1; i < block.lines.length - 1; i++) { if (block.breaks[i]) break; n++; } return n; }

  function dividerNode(song, block, gi) {
    const cut = !!block.breaks[gi];
    const div = document.createElement('button'); div.type = 'button'; div.className = 'divider' + (cut ? ' cut' : '');
    div.setAttribute('aria-label', cut ? '여기서 나뉨 — 눌러서 합치기' : '눌러서 여기서 나누기');
    div.innerHTML = '<span class="div-mark">✂</span>';   // 항상 가위(회색=나누기 가능 / 골드=나뉨)
    div.addEventListener('click', () => {
      if (cut) {
        if (groupSizeLeft(block, gi) + groupSizeRight(block, gi) > 2) {
          alert('크로마 밴드는 한 슬라이드에 2줄까지예요 — 더 합칠 수 없습니다.'); return;
        }
        block.breaks[gi] = false;
      } else {
        block.breaks[gi] = true;
      }
      SongStore.save(); render();
    });
    return div;
  }

  function editBlockLabel(song, block, labelEl) {
    const input = document.createElement('input'); input.type = 'text'; input.className = 'block-label-input'; input.value = block.label || '';
    labelEl.replaceWith(input); input.focus(); input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) { block.label = v; block.type = /후렴|렴|chorus/i.test(v) ? 'chorus' : /브릿지|bridge/i.test(v) ? 'bridge' : 'verse'; }
      SongStore.save(); render();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  // 원본 악보 (탭하면 확대·핀치 줌) — 서명 URL, 캐시. 붙여넣기 곡은 이미지 없음
  async function renderScore(song, zone) {
    let imgs = SongStore.getImages(song.id);
    if (!imgs.length && CONFIG.USE_SERVER && (song.images || []).length) {
      const loading = document.createElement('div'); loading.className = 'so-score-loading'; loading.textContent = '원본 악보 불러오는 중…';
      zone.appendChild(loading);
      try { const r = await API.call('imageUrls', { paths: song.images }); imgs = r.urls || []; SongStore.setImages(song.id, imgs); }
      catch (e) { imgs = []; }
      loading.remove();
    }
    if (!imgs.length) return;
    const wrap = document.createElement('div'); wrap.className = 'so-score';
    const cap = document.createElement('div'); cap.className = 'so-score-cap'; cap.textContent = '🎼 원본 악보 — 탭하면 크게 · 핀치 줌';
    wrap.appendChild(cap);
    imgs.forEach(src => {
      const img = document.createElement('img'); img.className = 'so-score-img'; img.src = src; img.alt = '원본 악보';
      img.addEventListener('click', () => openScoreZoom(src));
      wrap.appendChild(img);
    });
    // 악보는 가사 아래(맨 끝)에 배치 — 가사 먼저 확인, 필요시 원본 대조
    zone.appendChild(wrap);
  }

  function openScoreZoom(src) {
    const modal = $('#score-modal'); if (!modal) return;
    const body = $('#score-modal-body'); body.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'zoom-wrap';
    const img = document.createElement('img'); img.src = src; img.alt = '원본 악보';
    wrap.appendChild(img); body.appendChild(wrap);
    modal.hidden = false;
    attachPinchZoom(wrap, img);
  }

  // 핀치 줌 + 팬 + 더블탭 리셋 (review.js와 동일)
  function attachPinchZoom(wrap, img) {
    let scale = 1, tx = 0, ty = 0, start = null, lastTap = 0;
    const pointers = new Map();
    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    wrap.addEventListener('pointerdown', (e) => {
      wrap.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { scale = 1; tx = 0; ty = 0; apply(); }
        lastTap = now; start = { x: e.clientX, y: e.clientY, tx, ty };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]; start = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      }
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && start && scale > 1) { tx = start.tx + (e.clientX - start.x); ty = start.ty + (e.clientY - start.y); apply(); }
      else if (pointers.size === 2 && start && start.dist) {
        const [a, b] = [...pointers.values()];
        scale = Math.min(6, Math.max(1, start.scale * Math.hypot(a.x - b.x, a.y - b.y) / start.dist));
        if (scale === 1) { tx = 0; ty = 0; } apply();
      }
    });
    const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) start = null; };
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
  }

  // 블록 → 편집용 텍스트(각 절: 첫 줄=이름, 아래 가사, 절 사이 빈 줄)
  function blocksToText(blocks) {
    return (blocks || []).map(b =>
      [b.label || '절'].concat((b.lines || []).map(l => l.text || '')).join('\n')
    ).join('\n\n');
  }
  // 편집 텍스트 → 블록(결정적 파싱: 빈 줄=절 구분, 첫 줄=라벨). AI 재해석 없음 — 입력한 구조 그대로
  function textToBlocks(text) {
    const chunks = String(text || '').split(/\n\s*\n+/).map(c => c.trim()).filter(Boolean);
    const out = [];
    chunks.forEach((chunk, ci) => {
      const rows = chunk.split('\n').map(r => r.trim()).filter(Boolean);
      if (rows.length < 2) return;                    // 라벨 + 최소 1줄 가사 필요
      const label = rows[0], body = rows.slice(1);
      const type = /후렴|렴|chorus|^c$/i.test(label) ? 'chorus' : /브릿지|bridge/i.test(label) ? 'bridge' : 'verse';
      out.push({ id: 'b' + (ci + 1), type, label, lines: body.map(t => ({ text: t, low: [] })), breaks: Songs.twoLineBreaks(body.length) });
    });
    return out;
  }

  function renderGasaZone(song, card) {
    const zone = document.createElement('div'); zone.className = 'so-zone';
    const zt = document.createElement('div'); zt.className = 'so-zt';
    zt.innerHTML = '<span class="so-zk"></span>가사 확인·편집 <small><mark>노란 단어</mark>는 악보와 대조 · 줄 눌러 수정 · 줄 사이 <b class="cut-hint">✂</b> 눌러 나눔/합침(밴드 2줄)</small>';
    zone.appendChild(zt);

    if (!(song.blocks || []).length) {
      // 붙여넣기 우회로 (검수 화면 흡수) — 가사 붙여넣고 정리하면 절/후렴 분할
      const tip = document.createElement('p'); tip.className = 'review-tip';
      tip.innerHTML = '가사를 붙여넣고 “슬라이드 생성하기”를 누르면 절/후렴으로 나눠 드립니다. <b>절 사이를 빈 줄로 띄우면 더 정확</b>.';
      zone.appendChild(tip);
      const ta = document.createElement('textarea'); ta.className = 'choir-ta'; ta.rows = 6;
      ta.placeholder = '여기에 가사를 붙여넣으세요…';
      ta.value = song.raw || '';                                   // 입력 보존(재렌더에도 유지)
      ta.addEventListener('input', () => { song.raw = ta.value; });
      zone.appendChild(ta);
      const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-wide'; btn.style.marginTop = '10px';
      btn.textContent = '슬라이드 생성하기';
      btn.addEventListener('click', async () => {
        const text = ta.value.trim(); if (!text) return;
        song.raw = text;
        btn.disabled = true; btn.textContent = '생성 중…';
        try {
          // 붙여넣기는 로컬 규칙 분할(AI 미사용) → 저작권 거부 없음
          Songs.applyExtract(song, Songs.pasteToBlocks(text));
          if (!(song.blocks || []).length) {                       // 결과가 비면 입력 보존 + 안내(사라짐 방지)
            btn.disabled = false; btn.textContent = '슬라이드 생성하기';
            alert('가사를 나누지 못했어요. 절 사이를 빈 줄로 띄우고 다시 시도해 주세요.');
            return;
          }
          song.arrange = null; song.raw = '';
          SongStore.save(); SongStore.pushNow(song); render();
        } catch (e) {
          btn.disabled = false; btn.textContent = '슬라이드 생성하기';
          alert('정리에 실패했습니다: ' + (e.message || '') + '\n입력한 가사는 그대로 남아 있습니다.');
        }
      });
      zone.appendChild(btn);
      card.appendChild(zone); return;
    }
    // 기존/추출 데이터도 항상 2줄 이하로 정리(가위 자동 삽입) → 편집화면=PPT 1:1
    let normed = false;
    song.blocks.forEach(b => { if (Songs.normalizeBreaks(b)) normed = true; });
    if (normed) SongStore.save();

    // 텍스트 통째 편집 모드 — 절 이동·추가·삭제·순서를 자유롭게(결정적 파싱, AI 재해석 없음)
    if (textEditIds.has(song.id)) {
      const tip = document.createElement('p'); tip.className = 'review-tip';
      tip.innerHTML = '각 절의 <b>첫 줄 = 이름</b>(1절·후렴 등), 그 아래가 가사. <b>절 사이는 빈 줄</b>로 띄우세요. 줄을 다른 절로 옮기거나 절을 추가·삭제·순서변경할 수 있어요.';
      zone.appendChild(tip);
      const ta = document.createElement('textarea'); ta.className = 'choir-ta'; ta.rows = 12;
      ta.value = blocksToText(song.blocks);
      zone.appendChild(ta);
      const row = document.createElement('div'); row.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
      const apply = document.createElement('button'); apply.className = 'btn btn-primary'; apply.style.flex = '1'; apply.textContent = '적용';
      apply.addEventListener('click', () => {
        const nb = textToBlocks(ta.value);
        if (!nb.length) { alert('내용이 없어요. 각 절의 첫 줄에 이름, 그 아래 가사를 넣고 절 사이를 빈 줄로 띄워 주세요.'); return; }
        const oldCount = (song.blocks || []).length;
        song.blocks = nb;
        if (nb.length !== oldCount) song.arrange = null;   // 절 수가 바뀌면 편곡(회차·×N)이 옛 절을 참조 → 재시드
        textEditIds.delete(song.id);
        SongStore.save(); SongStore.pushNow(song); render();
      });
      const cancel = document.createElement('button'); cancel.className = 'btn btn-outline'; cancel.textContent = '취소';
      cancel.addEventListener('click', () => { textEditIds.delete(song.id); render(); });
      row.append(apply, cancel);
      zone.appendChild(row);
      card.appendChild(zone);
      renderScore(song, zone);   // 원본 악보를 참고하며 편집(맨 아래)
      return;
    }

    // '가사 확인·편집' 헤더 오른쪽 끝에 '텍스트로 통째 편집' 진입 버튼
    const teBtn = document.createElement('button');
    teBtn.className = 'btn btn-outline te-open-btn';
    teBtn.textContent = '✎ 통째로 고치기';
    teBtn.title = 'AI가 절을 잘못 나눴을 때 — 전체를 텍스트로 한 번에(줄을 다른 절로 이동·절 추가/삭제/순서변경)';
    teBtn.addEventListener('click', () => { textEditIds.add(song.id); render(); });
    zt.appendChild(teBtn);

    song.blocks.forEach(block => {
      const bc = document.createElement('div'); bc.className = 'block-card';
      const label = document.createElement('button'); label.type = 'button'; label.className = 'block-label';
      label.textContent = block.label; label.title = '눌러서 이름 바꾸기 (1절·후렴 등)';
      label.addEventListener('click', () => editBlockLabel(song, block, label));
      bc.appendChild(label);
      block.lines.forEach((_, li) => {
        bc.appendChild(lineNode(song, block, li));
        if (li < block.lines.length - 1) bc.appendChild(dividerNode(song, block, li));
      });
      zone.appendChild(bc);
    });
    card.appendChild(zone);
    renderScore(song, zone);   // 원본 악보(맨 아래)
  }

  /* ---------- 렌더 ---------- */

  function render() {
    const scrollY = window.scrollY;   // 편집(담기·×N·토글) 시 화면이 위로 튀지 않게 위치 보존
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

    fitVisible();     // 화면이 보일 때만 유효(폭 측정). open/openSong에선 show 후 재호출
    window.scrollTo(0, scrollY);   // 스크롤 위치 복원(담기 등 편집 후 튐 방지)
  }

  // 가사·필름스트립 폭 맞춤(잘림 방지) — 화면이 표시된 뒤라야 폭을 잼
  function fitVisible() {
    const list = $('#setorder-list');
    if (!list) return;
    fitThumbs(list); fitLines(list); fitBand(list);
  }

  /* ---------- 진입/이벤트 ---------- */

  function open() {
    // 처음 들어오면 첫 곡을 펼쳐서 보여줌(빈 화면 방지)
    const songs = SongStore.all();
    if (!expandedIds.size && songs.length) expandedIds.add(songs[0].id);
    render();
    KZ.show('setorder');
    fitVisible();   // 화면 표시 후 폭 맞춤(숨김 상태 render에선 못 잼)
  }

  // 특정 곡을 펼친 채로 진입 (곡 목록 "편집하기" 드릴인) — 검수 화면 흡수
  function openSong(id) {
    expandedIds.add(id);
    render();
    KZ.show('setorder');
    fitVisible();
    const card = document.querySelector('#setorder-list .so-card[data-id="' + id + '"]');
    if (card) card.scrollIntoView({ block: 'start' });
  }

  // 서버 저장으로 곡 id가 임시→확정으로 바뀌면 펼침 상태를 옮겨 유지(즉시 이동+백그라운드 저장 대응)
  function remapExpanded(oldId, newId) {
    if (expandedIds.has(oldId)) { expandedIds.delete(oldId); expandedIds.add(newId); }
    render();
    fitVisible();
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

    // 원본 악보 확대 모달 닫기
    const scClose = $('#btn-score-close');
    if (scClose) scClose.addEventListener('click', () => { $('#score-modal').hidden = true; });
    const scModal = $('#score-modal');
    if (scModal) scModal.addEventListener('click', (e) => { if (e.target === scModal) scModal.hidden = true; });
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

  return { init, open, openSong, remapExpanded, render };
})();
