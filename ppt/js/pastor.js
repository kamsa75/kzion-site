/* ============================================================
   목사님 입력 화면 (지침 28번)
   - 매주 입력: 설교 제목 / 본문 구절 / 성경 본문(여러 페이지) /
     함께 읽는 구절(여러 페이지) / 기도 담당자 + 찬송가 악보 업로드
   - 성경 본문 = 다크 전체화면형(짙은 배경), 함께 읽는 구절 = 크로마 밴드형
   - 각 페이지 아래 실제 슬라이드 미리보기, "+ 페이지 추가"로 칸 증가
   - 자동 저장 (지침 3번)
   ============================================================ */

const Pastor = (function () {
  const $ = (sel) => document.querySelector(sel);
  const KEY = 'kzppt_pastor';

  // passages는 페이지(슬라이드)별 문자열 배열
  // readings는 칸 목록(D44): { t:'short'|'long', text } | { t:'img', paths:[저장 경로] } — 옛 문자열은 normReadingItem이 short로 승격
  // hymn = 예배 중 찬송가 가사(붙여넣기 → 절/후렴 블록). 절 순서대로 자동 배치 (D19)
  let data = { title: '', ref: '', passages: [''], readings: [{ t: 'short', text: '' }], prayer: '', hymn: { raw: '', title: '', blocks: [] } };
  let hymnPaths = [];
  let thumbUrls = [];
  let readingUrls = {};   // 이미지 칸 표시용: 저장 경로 → 서명 URL(서버) / dataURL(목·방금 올린 것)
  let noteTimer = null;
  let pushTimer = null;

  // 옛 단일 문자열 스키마 → 배열로 변환 (하위 호환). ⚠ 여기 없는 키는 저장 시 조용히 사라진다(savePastor가 data 통째 교체)
  function normalize(d) {
    const h = d.hymn || {};
    const out = {
      title: d.title || '', ref: d.ref || '', prayer: d.prayer || '',
      passages: Array.isArray(d.passages) ? d.passages : (d.passage ? [d.passage] : ['']),
      readings: (Array.isArray(d.readings) ? d.readings : (d.reading ? [d.reading] : [])).map(normReadingItem),
      hymn: { raw: h.raw || '', title: h.title || '', blocks: Array.isArray(h.blocks) ? h.blocks : [], order: Array.isArray(h.order) ? h.order : [] },
      done: !!d.done   // 담당자가 '완료'로 표시했는지 (D: 명시적 완료 버튼)
    };
    if (!out.passages.length) out.passages = [''];
    if (!out.readings.length) out.readings = [{ t: 'short', text: '' }];
    return out;
  }

  function savedNote() {
    const note = $('#pastor-saved');
    note.textContent = '✓ 저장됨';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.textContent = ''; }, 1500);
  }

  function save() {
    if (CONFIG.USE_SERVER) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(async () => {
        try { await API.call('savePastor', { data }); savedNote(); }
        catch (e) { $('#pastor-saved').textContent = '⚠ 저장 실패 — 네트워크 확인'; }
      }, 600);
    } else {
      // 목 모드: 사진 dataURL이 들어가면 localStorage 5MB를 넘을 수 있음(개발용 한계) — 실패를 조용히 삼키지 않고 표시
      try { localStorage.setItem(KEY, JSON.stringify(data)); savedNote(); }
      catch (e) { $('#pastor-saved').textContent = '⚠ 저장 실패 — 연습 모드 용량 초과'; }
    }
  }

  // 즉시 저장(디바운스 없음) + 성공 여부 반환 — 이미지 칸 상태 표시용(D44: "✓ 저장됨"은 서버 저장까지 끝났을 때만)
  async function saveNow() {
    if (!CONFIG.USE_SERVER) { save(); return true; }
    clearTimeout(pushTimer);
    try { await API.call('savePastor', { data }); savedNote(); return true; }
    catch (e) { $('#pastor-saved').textContent = '⚠ 저장 실패 — 네트워크 확인'; return false; }
  }

  async function saveImages() {
    if (CONFIG.USE_SERVER) {
      try { await API.call('savePastor', { hymnImages: hymnPaths }); savedNote(); }
      catch (e) { $('#pastor-saved').textContent = '⚠ 저장 실패 — 네트워크 확인'; }
    }
  }

  /* ---------- 상단 고정 미리보기(설교 제목·기도) ---------- */

  function previewBox(el, slide) {
    el.innerHTML = '';
    if (slide) el.appendChild(renderSlide(slide));
  }

  function renderFixedPreviews() {
    previewBox($('#pv-sermon'),
      (data.title || data.ref) ? { layout: 'green', text: data.title, sub: data.ref } : null);
    previewBox($('#pv-prayer'),
      data.prayer.trim() ? { layout: 'green', text: '기도 : ' + data.prayer.trim() } : null); // D13
    previewBox($('#pv-hymn-title'),   // 찬송가 제목 슬라이드(그린 자막형) — 제목 입력 즉시 미리보기
      (data.hymn.title || '').trim() ? { layout: 'green', text: (data.hymn.title || '').trim() } : null);
  }

  /* ---------- 성경 본문(다크) 다중 페이지 ---------- */

  function renderPassages() {
    const list = $('#passage-list');
    list.innerHTML = '';
    data.passages.forEach((text, i) => {
      const block = document.createElement('div');
      block.className = 'page-block';

      const ta = document.createElement('textarea');
      ta.rows = 6;
      ta.value = text;
      ta.placeholder = i === 0
        ? '예: [삼상 1:1-3] 1 에브라임 산지 라마다임소빔에… — 맨 앞 [ ] 안은 구절 칩, 나머지는 카드 본문으로 들어갑니다.'
        : '이어지는 본문…';
      ta.addEventListener('input', () => {
        data.passages[i] = ta.value;
        drawPassagePreview(prev, ta.value);
        save();
      });
      block.appendChild(ta);

      const prev = document.createElement('div');
      prev.className = 'field-preview';
      drawPassagePreview(prev, text);
      block.appendChild(prev);

      if (data.passages.length > 1) block.appendChild(removeBtn(() => {
        data.passages.splice(i, 1); renderPassages(); save();
      }, i + 1 + '페이지 삭제'));

      list.appendChild(block);
    });
  }

  function drawPassagePreview(el, text) {
    el.innerHTML = '';
    const t = (text || '').trim();
    if (!t) return;
    // 실제 PPT와 동일하게 자동 분할(잘림 방지) — 각 페이지는 가운데 정렬
    const pages = passagePages(t); // 구절칩은 본문 선두 [삼상 1:1-3]에서 (pf-ref는 설교 슬라이드 전용)
    pages.forEach((sl) => {
      const wrap = document.createElement('div');
      wrap.className = 'pv-page';
      wrap.appendChild(renderSlide(sl));
      el.appendChild(wrap);
    });
    requestAnimationFrame(() => fitDarkSlides(el));
    if (pages.length > 1) {
      const n = document.createElement('div');
      n.className = 'pv-note';
      n.textContent = '길이가 길어 자동으로 ' + pages.length + '장으로 나뉩니다 — 슬라이드 모두 잘림 없이 생성됩니다.';
      el.appendChild(n);
    }
  }

  /* ---------- 함께 읽는 구절 — 칸 3종(짧은 구절/긴 구절/이미지)이 섞이는 목록 (D44) ----------
     · 칸 순서 = PPT 순서. ↑↓로 이동(폰에서 긴 칸 드래그는 실패가 잦아 버튼).
     · 짧은↔긴 전환은 글을 유지한 채 표시 방식만 바꿈. 길이로 자동 판정하지 않는다(D41).
     · 이미지 칸 = 사진 여러 장(한 묶음). 칸 안에서는 드래그 정렬(악보 페이지와 동일, D15).
     · 사진은 서버 업로드 성공 후에만 목록에 들어가고, 저장까지 끝나야 "✓ 저장됨" (조용히 빠지지 않음) */

  const uidOf = new WeakMap();   // 칸 객체 → 런타임 id (저장 안 됨 — 업로드 중 순서가 바뀌어도 그 칸을 찾기 위해)
  let uidSeq = 0;
  function uid(it) { if (!uidOf.has(it)) uidOf.set(it, ++uidSeq); return uidOf.get(it); }

  function renderReadings() {
    const list = $('#reading-list');
    list.innerHTML = '';
    const n = data.readings.length;
    data.readings.forEach((it, i) => {
      const block = document.createElement('div');
      block.className = 'page-block rd-block';
      block.dataset.uid = uid(it);

      // 머리줄: 종류(짧은↔긴 전환 / 사진) + ↑↓ + 삭제
      const head = document.createElement('div');
      head.className = 'rd-head';
      if (it.t === 'img') {
        const k = document.createElement('span'); k.className = 'rd-kind'; k.textContent = '🖼 사진';
        head.appendChild(k);
      } else {
        const seg = document.createElement('div'); seg.className = 'rd-seg';
        [['short', '짧은 구절'], ['long', '긴 구절']].forEach(([t, name]) => {
          const b = document.createElement('button'); b.type = 'button';
          b.className = 'rd-seg-btn' + (it.t === t ? ' on' : ''); b.textContent = name;
          b.addEventListener('click', () => { if (it.t === t) return; it.t = t; renderReadings(); save(); });
          seg.appendChild(b);
        });
        head.appendChild(seg);
      }
      const tools = document.createElement('div'); tools.className = 'rd-tools';
      const mk = (txt, title, dis, fn) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost rd-tool';
        b.textContent = txt; b.title = title; b.disabled = !!dis; b.addEventListener('click', fn); return b;
      };
      tools.appendChild(mk('↑', '위로', i === 0, () => { swapReading(i, i - 1); }));
      tools.appendChild(mk('↓', '아래로', i === n - 1, () => { swapReading(i, i + 1); }));
      tools.appendChild(mk('✕', '이 칸 삭제', false, () => {
        if (it.t === 'img' && it.paths.length && !confirm('사진 ' + it.paths.length + '장이 든 칸을 삭제할까요?')) return;
        data.readings.splice(i, 1);
        if (!data.readings.length) data.readings.push({ t: 'short', text: '' });
        renderReadings(); save();
      }));
      head.appendChild(tools);
      block.appendChild(head);

      if (it.t === 'img') renderImgItem(block, it);
      else renderTextItem(block, it);
      list.appendChild(block);
    });
  }

  function swapReading(a, b) {
    const arr = data.readings;
    if (b < 0 || b >= arr.length) return;
    [arr[a], arr[b]] = [arr[b], arr[a]];
    renderReadings(); save();
  }

  function renderTextItem(block, it) {
    const ta = document.createElement('textarea');
    ta.rows = it.t === 'long' ? 6 : 4;
    ta.value = it.text;
    ta.placeholder = it.t === 'long'
      ? '긴 구절 — 성경 본문과 같은 큰 카드. 맨 앞 [삼상 1:1-3]은 구절 칩, 길면 자동으로 여러 장'
      : '함께 읽을 구절 — 하단 카드, 길면 자동으로 2줄씩 나뉩니다';
    ta.addEventListener('input', () => {
      it.text = ta.value;
      drawReadingPreview(prev, it);
      save();
    });
    block.appendChild(ta);
    const prev = document.createElement('div');
    prev.className = 'field-preview';
    drawReadingPreview(prev, it);
    block.appendChild(prev);
  }

  // 이미지 칸: 실제 슬라이드(다크·비율 유지)로 작은 미리보기 = 드래그 셀. 장별 삭제 + 사진 추가 + 상태줄
  function renderImgItem(block, it) {
    const strip = document.createElement('div');
    strip.className = 'page-strip rd-strip';
    it.paths.forEach((path, pi) => {
      const cell = document.createElement('div');
      cell.className = 'page-cell rd-cell';
      cell._path = path;
      const src = readingUrls[path];
      cell.appendChild(renderSlide(src ? { layout: 'score', dark: true, src } : { layout: 'score', dark: true, placeholder: '불러오는 중…' }));
      const num = document.createElement('span'); num.className = 'page-num'; num.textContent = pi + 1;
      const del = document.createElement('button'); del.type = 'button'; del.className = 'thumb-del'; del.textContent = '✕'; del.title = '이 사진 삭제';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        it.paths.splice(pi, 1); renderReadings();
        setImgStatus(it, '저장 중…');
        setImgStatus(it, (await saveNow()) ? savedText(it) : '⚠ 저장 실패 — 탭해서 다시 저장');
      });
      cell.append(num, del);
      strip.appendChild(cell);
    });
    const add = document.createElement('button'); add.type = 'button'; add.className = 'page-add rd-add';
    add.textContent = it.paths.length ? '＋ 사진\n추가' : '📷 사진\n올리기';
    add.addEventListener('click', () => pickReadingFiles(it));
    strip.appendChild(add);
    block.appendChild(strip);

    const st = document.createElement('div'); st.className = 'rd-status';
    st.textContent = savedText(it);
    if (it.paths.length) st.classList.add('ok');
    block.appendChild(st);

    if (it.paths.length > 1) {
      const hint = document.createElement('p'); hint.className = 'page-hint';
      hint.textContent = '순서 바꾸기: 데스크톱은 바로 끌기 / 폰은 꾹 눌러 끌기';
      block.appendChild(hint);
      DragSort.bind(block, {
        container: '.rd-strip', item: '.rd-cell', ignore: 'button', group: 'rd-img-' + uid(it),
        commit: async () => {
          it.paths = [].map.call(block.querySelectorAll('.rd-cell'), c => c._path);
          renderReadings();
          setImgStatus(it, (await saveNow()) ? savedText(it) : '⚠ 저장 실패 — 탭해서 다시 저장');
        },
        rerender: renderReadings
      });
    }
  }

  // 저장 완료 문구(사진 있음/없음)
  function savedText(it) {
    return it.paths.length
      ? '✓ 사진 ' + it.paths.length + '장 저장됨'
      : '사진을 올리면 이 자리에 1장씩 슬라이드로 들어갑니다 (세로 사진은 양옆이 어둡게)';
  }

  // 칸 상태줄 갱신(재렌더 뒤에도 uid로 찾음). 실패 문구면 탭하면 다시 저장
  function setImgStatus(it, text) {
    const block = $('#reading-list .rd-block[data-uid="' + uid(it) + '"]');
    const st = block && block.querySelector('.rd-status');
    if (!st) return;
    st.textContent = text;
    const fail = /⚠/.test(text);
    st.classList.toggle('ok', /✓/.test(text));
    st.classList.toggle('fail', fail);
    st.onclick = fail ? async () => { setImgStatus(it, '저장 중…'); setImgStatus(it, (await saveNow()) ? savedText(it) : '⚠ 저장 실패 — 탭해서 다시 저장'); } : null;
  }

  let pickTarget = null;   // 파일 선택창이 열린 칸
  function pickReadingFiles(it) {
    pickTarget = it;
    const inp = $('#reading-file'); inp.value = ''; inp.click();
  }

  // 사진 올리기: 1장씩 축소(긴 변 1920) → 업로드 성공 → 목록 추가 → 전부 끝나면 저장 → ✓
  async function onReadingFiles(it, fileList) {
    const files = [...fileList]; if (!files.length || !it) return;
    let done = 0, failed = 0;
    setImgStatus(it, '올리는 중 0/' + files.length + '…');
    for (const f of files) {
      try {
        const r = await Songs.resizeImage(f, { maxEdge: 1920, quality: 0.85 });
        const path = CONFIG.USE_SERVER ? (await Songs.uploadImages([r.dataUrl]))[0] : r.dataUrl;
        readingUrls[path] = r.dataUrl;
        it.paths.push(path); done++;
        renderReadings();
        setImgStatus(it, '올리는 중 ' + done + '/' + files.length + '…');
      } catch (e) { failed++; }
    }
    if (failed) alert('사진 ' + failed + '장을 올리지 못했습니다 — 네트워크를 확인하고 다시 올려주세요.');
    if (!done) { renderReadings(); return; }
    setImgStatus(it, '저장 중…');
    const ok = await saveNow();
    setImgStatus(it, ok ? savedText(it) : '⚠ 저장 실패 — 탭해서 다시 저장');
  }

  // 텍스트 칸 미리보기: 짧은=하단 카드(2줄씩) / 긴=성경 본문과 같은 큰 카드(자동 분할)
  function drawReadingPreview(el, it) {
    if (it.t === 'long') return drawPassagePreview(el, it.text);
    return drawShortPreview(el, it.text);
  }

  function drawShortPreview(el, text) {
    el.innerHTML = '';
    // 실제 PPT와 동일하게 자동으로 2줄씩 밴드 페이지 분할
    const pages = bandPages(text);
    if (!pages.length) return;
    pages.forEach((sl) => {
      const wrap = document.createElement('div');
      wrap.className = 'pv-page';
      wrap.appendChild(renderSlide(sl));
      el.appendChild(wrap);
    });
    requestAnimationFrame(() => fitVCard(el));
    if (pages.length > 1) {
      const n = document.createElement('div');
      n.className = 'pv-note';
      n.textContent = '자동으로 ' + pages.length + '장(2줄씩)으로 나뉩니다 — 잘림 없이 생성됩니다.';
      el.appendChild(n);
    }
  }

  /* ---------- 예배 중 찬송가 가사(붙여넣기 → 절/후렴 밴드) — D19 ---------- */

  // breaks 기준으로 줄을 슬라이드 그룹(2줄)으로 묶음 (review.js blockSlides와 동일 규칙)
  function blockSlides(block) {
    const n = (block.lines || []).length;
    if (!n) return [];
    const breaks = block.breaks || [];
    // breaks 전부 true(1줄씩; 추출 오류·구데이터)면 무시하고 2줄씩 재페어링(수동 혼합 나눔은 존중)
    const allSplit = n > 1 && breaks.slice(0, n - 1).every(Boolean);
    const raw = [[0]];
    for (let i = 1; i < n; i++) {
      if (!allSplit && breaks[i - 1]) raw.push([i]);
      else raw[raw.length - 1].push(i);
    }
    const groups = [];
    raw.forEach(g => { for (let i = 0; i < g.length; i += 2) groups.push(g.slice(i, i + 2)); });
    return groups;
  }

  // 찬양팀/성가대와 동일한 밴드 필름 썸네일(그린 + 검정 밴드 2줄) — 가로 스트립
  function filmThumb(lines) {
    const t = document.createElement('div'); t.className = 'film-thumb';
    const green = document.createElement('div'); green.className = 'film-green';
    const band = document.createElement('div'); band.className = 'film-band';
    (lines || []).slice(0, 2).forEach(tx => {
      const d = document.createElement('div'); d.className = 'film-line'; d.textContent = tx;
      band.appendChild(d);
    });
    t.append(green, band);
    return t;
  }
  function fitFilm(root) {
    root.querySelectorAll('.film-line').forEach(l => {
      if (!l.clientWidth) return;
      l.style.fontSize = '';                                   // CSS 규격(6.3cqh)으로 되돌린 뒤 측정
      let size = parseFloat(getComputedStyle(l).fontSize) || 11;
      const min = size * 0.55;
      while (l.scrollWidth > l.clientWidth && size > min) { size -= 0.5; l.style.fontSize = size + 'px'; }
    });
  }

  // 기본 부르는 순서 = 붙여넣은 블록 순서 그대로.
  // 후렴을 절마다 자동 삽입하지 않는다 — 반복은 아래 '+ 후렴' 버튼으로 직접 담을 때만.
  function hymnDefaultOrder(blocks) {
    return blocks.map(b => b.id);
  }

  // 라벨을 눌러 편집(후렴/절) — 라벨에 '후렴/렴/chorus'면 chorus로 (#4)
  function editHymnLabel(block, labelEl) {
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'block-label-input'; input.value = block.label || '';
    labelEl.replaceWith(input); input.focus(); input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) { block.label = v; block.type = /후렴|렴|chorus/i.test(v) ? 'chorus' : /브릿지|bridge/i.test(v) ? 'bridge' : 'verse'; }
      save(); renderHymnPreview();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  function renderHymnPreview() {
    const el = $('#hymn-preview');
    el.innerHTML = '';
    const title = (data.hymn.title || '').trim();
    const blocks = data.hymn.blocks || [];
    const byId = {}; blocks.forEach(b => { byId[b.id] = b; });
    if (!blocks.length) return;

    if (blocks.length) {
    // order 정리: 존재하는 블록만, 비면 기본순서(후렴 반복)
    data.hymn.order = (data.hymn.order || []).filter(id => byId[id]);
    if (!data.hymn.order.length) data.hymn.order = hymnDefaultOrder(blocks);

    // ── 부르는 순서 (드래그 조절·빼기·추가·기본순서) ──
    const arr = document.createElement('div'); arr.className = 'hymn-arrange';
    const at = document.createElement('div'); at.className = 'hymn-arrange-title';
    at.textContent = '부르는 순서 (칩을 끌어 순서 변경 · ✕ 빼기)';
    arr.appendChild(at);
    const chips = document.createElement('div'); chips.className = 'hymn-chips';
    data.hymn.order.forEach((id, i) => {
      const b = byId[id]; if (!b) return;
      const chip = document.createElement('div'); chip.className = 'hymn-chip' + (b.type === 'chorus' ? ' is-chorus' : '');
      chip._bid = id;
      const t = document.createElement('span'); t.className = 'hymn-chip-t'; t.textContent = b.label; chip.appendChild(t);
      const x = document.createElement('button'); x.type = 'button'; x.className = 'hymn-chip-x'; x.textContent = '✕';
      x.addEventListener('click', (e) => { e.stopPropagation(); data.hymn.order.splice(i, 1); save(); renderHymnPreview(); });
      chip.appendChild(x);
      chips.appendChild(chip);
    });
    arr.appendChild(chips);
    const pal = document.createElement('div'); pal.className = 'hymn-pal';
    blocks.forEach(b => {
      const add = document.createElement('button'); add.type = 'button'; add.className = 'hymn-pal-btn';
      add.textContent = '+ ' + b.label;
      add.addEventListener('click', () => { data.hymn.order.push(b.id); save(); renderHymnPreview(); });
      pal.appendChild(add);
    });
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'hymn-pal-btn hymn-reset';
    reset.textContent = '↻ 붙여넣은 순서대로';
    reset.addEventListener('click', () => { data.hymn.order = hymnDefaultOrder(blocks); save(); renderHymnPreview(); });
    pal.appendChild(reset);
    arr.appendChild(pal);
    el.appendChild(arr);

    if (typeof DragSort !== 'undefined') {
      DragSort.bind(el, {
        container: '.hymn-chips', item: '.hymn-chip', ignore: 'button', group: 'hymn-order',
        commit: () => { data.hymn.order = [].map.call(chips.querySelectorAll('.hymn-chip'), c => c._bid); save(); },
        rerender: renderHymnPreview
      });
    }
    } // if (blocks.length)

    // ── 제목 + 부르는 순서대로 슬라이드를 하나의 연속 필름스트립으로 (setorder 화면과 동일한 2열 wrapping) ──
    const strip = document.createElement('div'); strip.className = 'ofilm so-film';
    let count = 0;
    const addGroup = (node, capText, block) => {
      const group = document.createElement('div'); group.className = 'ofilm-group';
      const thumbs = document.createElement('div'); thumbs.className = 'ofilm-thumbs';
      thumbs.appendChild(node); group.appendChild(thumbs);
      const cap = document.createElement(block ? 'button' : 'div');
      cap.className = 'ofilm-cap' + (block ? ' ofilm-cap-btn' : '');
      cap.textContent = capText;
      if (block) { cap.type = 'button'; cap.title = '눌러서 라벨(절/후렴) 바꾸기'; cap.addEventListener('click', () => editHymnLabel(block, cap)); }
      group.appendChild(cap);
      strip.appendChild(group);
    };
    // 제목 슬라이드는 순서표에서 별도로 생성 → 여기 가사 필름스트립엔 가사만(2줄씩)
    data.hymn.order.forEach(id => {
      const block = byId[id]; if (!block) return;
      const gs = blockSlides(block);
      gs.forEach((g, gi) => {
        addGroup(filmThumb(g.map(i => block.lines[i].text)), block.label + (gs.length > 1 ? ' (' + (gi + 1) + ')' : ''), block);
        count++;
      });
    });
    el.appendChild(strip);

    if (count) {
      const sum = document.createElement('div'); sum.className = 'pv-note';
      sum.textContent = '= 찬송가 슬라이드 ' + count + '장';
      el.appendChild(sum);
    }
    requestAnimationFrame(() => fitFilm(el));
  }

  // 추출 결과(JSON) → data.hymn.blocks (songs.applyExtract와 동일 스키마)
  function applyHymnExtract(r) {
    data.hymn.blocks = (r.blocks || []).map((b, i) => ({
      id: b.id || ('h' + (i + 1)),
      type: b.type || 'verse',
      label: b.label || ('' + (i + 1)),
      lines: (b.lines || []).map(l => ({ text: l.text || '', low: l.low || [] })),
      breaks: []
    }));
    data.hymn.blocks.forEach(b => { b.breaks = Songs.twoLineBreaks(b.lines.length); }); // 항상 2줄씩(AI가 한 줄씩 줘도 강제)
    if (r.title && !data.hymn.title) data.hymn.title = String(r.title).trim(); // 수동 입력 제목 우선
    $('#hymn-name').value = data.hymn.title || '';
    // 붙여넣기가 준 등장 순서(같은 절을 여러 번 넣었으면 그 반복까지) 우선, 없으면 블록 순서 그대로
    data.hymn.order = (Array.isArray(r.order) && r.order.length)
      ? r.order.slice()
      : hymnDefaultOrder(data.hymn.blocks);
  }

  // 절 번호 표기 정리(D38): "(1) 가사"·"[1] 가사"·"1. 가사"·"1) 가사"를 → 빈 줄 + "1절" 라벨 줄 + 가사로 변환.
  //   숫자는 자막에 안 나오고, 절 경계·라벨(1절·2절)로만 쓰임. 숫자만 있는 줄("1.")도 라벨 줄로.
  function stripHymnVerseNums(text) {
    return String(text || '').split('\n').map(line => {
      const m = line.match(/^\s*(?:\((\d{1,2})\)|\[(\d{1,2})\]|(\d{1,2})\s*[.．)])\s*(.*)$/);
      if (!m) return line;
      const n = m[1] || m[2] || m[3], rest = (m[4] || '').trim();
      return rest ? ('\n' + n + '절\n' + rest) : ('\n' + n + '절');
    }).join('\n');
  }

  async function parseHymn() {
    const text = $('#hymn-input').value.trim();
    data.hymn.raw = text;
    if (!text) { data.hymn.blocks = []; renderHymnPreview(); save(); return; }
    const btn = $('#btn-hymn-parse');
    btn.disabled = true; btn.textContent = '생성 중…';
    try {
      // 붙여넣기는 로컬 규칙 분할(AI 미사용) → 저작권 거부 없음. 빈 줄=블록, 첫 줄 라벨(후렴 등) 인식.
      applyHymnExtract(Songs.pasteToBlocks(stripHymnVerseNums(text)));
      if (!(data.hymn.blocks || []).length) {
        alert('가사를 나누지 못했어요. 절 사이를 빈 줄로 띄우고 다시 눌러 주세요.');
        return;
      }
      renderHymnPreview();
      save();
    } catch (e) {
      alert('가사를 정리하지 못했습니다: ' + (e.message || '') + '\n다시 시도해 주세요.');
    } finally {
      btn.disabled = false; btn.textContent = '슬라이드 생성하기';
    }
  }

  function removeBtn(fn, label) {
    const b = document.createElement('button');
    b.className = 'btn btn-ghost page-remove';
    b.textContent = '✕ ' + label;
    b.addEventListener('click', fn);
    return b;
  }

  /* ---------- 악보 업로드 ---------- */

  function renderThumbs() {
    const box = $('#pastor-thumbs');
    box.innerHTML = '';
    thumbUrls.forEach((src, i) => {
      const item = document.createElement('div');
      item.className = 'pscore-item';
      const cap = document.createElement('div');
      cap.className = 'pscore-cap';
      cap.textContent = '악보 ' + (i + 1) + ' — 슬라이드 미리보기';
      const frame = document.createElement('div');
      frame.className = 'pscore-frame';
      // 실제 PPT와 동일한 악보 통짜 슬라이드(흰 배경·비율유지 contain — 잘리지 않음, 지침 14번·CSS 공용)
      const sl = renderSlide({ layout: 'score', src });
      const del = document.createElement('button');
      del.className = 'thumb-del';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        thumbUrls.splice(i, 1); hymnPaths.splice(i, 1); renderThumbs(); saveImages();
      });
      frame.append(sl, del);
      item.append(cap, frame);
      box.appendChild(item);
    });
  }

  async function onFiles(fileList) {
    for (const f of [...fileList]) {
      try {
        const r = await Songs.resizeImage(f);
        if (CONFIG.USE_SERVER) { const paths = await Songs.uploadImages([r.dataUrl]); hymnPaths.push(paths[0]); }
        thumbUrls.push(r.dataUrl);
      } catch (e) { alert('이미지를 올리지 못했습니다: ' + f.name); }
    }
    renderThumbs();
    saveImages();
  }

  /* ---------- 진입/이벤트 ---------- */

  function renderAll() {
    $('#pf-title').value = data.title || '';
    $('#pf-ref').value = data.ref || '';
    $('#pf-prayer').value = data.prayer || '';
    renderFixedPreviews();
    renderPassages();
    renderReadings();
    $('#hymn-name').value = data.hymn.title || '';
    $('#hymn-input').value = data.hymn.raw || '';
    renderHymnPreview();
    renderThumbs();
    renderDone();
  }

  function renderDone() {
    const btn = $('#btn-pastor-done'); if (!btn) return;
    btn.textContent = data.done ? '✅ 완료됨 — 눌러서 취소' : '✅ 이번 주 준비 완료';
    btn.classList.toggle('is-done', !!data.done);
  }

  async function open() {
    if (CONFIG.USE_SERVER) {
      try {
        const w = await API.call('getWeek');
        data = normalize((w.pastor && w.pastor.data) || {});
        hymnPaths = (w.pastor && w.pastor.hymn_images) || [];
        thumbUrls = [];
        if (hymnPaths.length) {
          try { const r = await API.call('imageUrls', { paths: hymnPaths }); thumbUrls = r.urls || []; }
          catch (e) {}
        }
        // 설교 사진(이미지 칸) 표시용 서명 URL — 실패해도 화면은 뜨고 셀에 '불러오는 중…'만 남음(D44)
        readingUrls = {};
        const imgPaths = [];
        data.readings.forEach(it => { if (it.t === 'img') it.paths.forEach(p => imgPaths.push(p)); });
        if (imgPaths.length) {
          try { const r = await API.call('imageUrls', { paths: imgPaths }); imgPaths.forEach((p, i) => { if (r.urls && r.urls[i]) readingUrls[p] = r.urls[i]; }); }
          catch (e) {}
        }
      } catch (e) {
        alert('서버에서 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
        return;
      }
    } else {
      try { data = normalize(JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { data = normalize({}); }
      readingUrls = {};   // 목 모드: 경로 자체가 dataURL
      data.readings.forEach(it => { if (it.t === 'img') it.paths.forEach(p => { readingUrls[p] = p; }); });
    }
    bindOnce();
    renderAll();
    KZ.show('pastor');
  }

  function bindSimple(id, key) {
    $(id).addEventListener('input', () => { data[key] = $(id).value; renderFixedPreviews(); save(); });
  }

  let bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    bindSimple('#pf-title', 'title');
    bindSimple('#pf-ref', 'ref');
    bindSimple('#pf-prayer', 'prayer');
    // ref는 성경 본문 캡션에도 쓰이므로 본문 미리보기도 갱신
    $('#pf-ref').addEventListener('input', () => renderPassages());
    $('#btn-pastor-done').addEventListener('click', () => { data.done = !data.done; renderDone(); save(); });
    $('#btn-add-passage').addEventListener('click', () => { data.passages.push(''); renderPassages(); save(); });
    // 함께 읽는 구절 칸 추가 3종 (D44). 사진 칸은 만들자마자 파일 선택창(같은 탭 제스처 안에서 열어야 iOS가 허용)
    $('#btn-add-reading-short').addEventListener('click', () => { data.readings.push({ t: 'short', text: '' }); renderReadings(); save(); });
    $('#btn-add-reading-long').addEventListener('click', () => { data.readings.push({ t: 'long', text: '' }); renderReadings(); save(); });
    $('#btn-add-reading-img').addEventListener('click', () => {
      const it = { t: 'img', paths: [] };
      data.readings.push(it); renderReadings(); save();
      pickReadingFiles(it);
    });
    $('#reading-file').addEventListener('change', (e) => { const it = pickTarget; pickTarget = null; onReadingFiles(it, e.target.files); });
    // 찬송가 제목(몇 장·제목) — 입력 즉시 저장·미리보기 갱신(제목 슬라이드)
    $('#hymn-name').addEventListener('input', () => { data.hymn.title = $('#hymn-name').value; renderFixedPreviews(); renderHymnPreview(); save(); });
    // 찬송가: 입력은 자동 저장(raw만), 블록은 "정리하기"를 눌러야 갱신 (API 호출 아끼기)
    $('#hymn-input').addEventListener('input', () => { data.hymn.raw = $('#hymn-input').value; save(); });
    $('#btn-hymn-parse').addEventListener('click', parseHymn);
    $('#btn-pastor-back').addEventListener('click', () => KZ.show('home'));
    $('#btn-pastor-upload').addEventListener('click', () => { $('#pastor-file').value = ''; $('#pastor-file').click(); });
    $('#pastor-file').addEventListener('change', (e) => onFiles(e.target.files));
  }

  return { open };
})();
