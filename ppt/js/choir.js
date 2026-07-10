/* ============================================================
   성가대 — 곡 입력 (가사 붙여넣기 전용, 2026-07-05 확정)
   - 악보 업로드 폐기: 곡마다 [곡 제목] + [가사 붙여넣기] → 정리하기(extractText)
   - 정리 후 찬양팀 검수와 동일한 블록 편집 뷰(줄 사이 토글선)를 카드 안에 인라인 표시
   - 부르는 순서(콘티/세트)·원본 이미지 탭 없음 (성가대는 순서대로만)
   - 여러 곡 추가(칸타타·특송) + ▲▼ 순서. 곡명 그린 자막은 한 줄
   - 산출물: 곡마다 곡명 그린 자막 → 가사 크로마 밴드(2줄씩)
   ============================================================ */

const Choir = (function () {
  const $ = (sel) => document.querySelector(sel);

  function newSong() {
    return {
      id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
      name: '', status: 'review', role: 'choir',
      songType: 'choir',   // 'choir'=성가대(곡명+시온 성가대) / 'special'=특송(곡명+특송·이름/팀)
      performer: '',        // 특송 이름/팀 (성가대는 미사용)
      blocks: null, images: [], order: [], raw: ''
    };
  }

  /* ---------- 가사 정리 ---------- */

  // 목(서버 미사용) 분할: 빈 줄=블록 경계, 2줄마다 슬라이드 나눔
  function mockSplit(text) {
    const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const src = paras.length ? paras : [text.trim()];
    const blocks = src.map((p, i) => {
      const lines = p.split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ text: t, low: [] }));
      const breaks = [];
      for (let j = 0; j < lines.length - 1; j++) breaks.push((j + 1) % 2 === 0);
      return { id: 'b' + (i + 1), type: 'verse', label: (i + 1) + '절', lines, breaks };
    });
    return { blocks };
  }

  async function tidy(song, textarea, editorEl, btn) {
    const text = textarea.value.trim();
    if (!text) { alert('먼저 가사를 입력해 주세요.'); return; }
    song.raw = text;
    btn.disabled = true; btn.textContent = '✨ 만드는 중…';
    let usedFallback = false, serverErr = '';
    try {
      let r = null;
      if (CONFIG.USE_SERVER) {
        // AI 추출 — 실패/지연(45초)이면 로컬 기본 분할로라도 만들어 성가대가 막히지 않게
        try {
          r = await Promise.race([
            API.call('extractText', { text }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과')), 45000))
          ]);
        } catch (e) { serverErr = e.message || ''; r = null; }
      } else {
        r = mockSplit(text);
      }
      if (r) Songs.applyExtract(song, r);
      if (!song.blocks || !song.blocks.length) { // AI 결과 없음/실패 → 로컬 기본 분할(빈 줄=블록, 2줄씩)
        Songs.applyExtract(song, mockSplit(text));
        usedFallback = CONFIG.USE_SERVER;
      }
      SongStore.save(); SongStore.pushNow(song);
      renderEditor(song, editorEl);
      if (usedFallback) {
        alert('자동 정리(AI)가 안 돼서 기본 분할로 만들었어요' + (serverErr ? '\n(' + serverErr + ')' : '') +
          '\n절 사이를 빈 줄로 띄우고 다시 누르면 더 정확합니다.');
      }
    } catch (e) {
      alert('만들지 못했습니다: ' + (e.message || '네트워크를 확인해 주세요.'));
    } finally {
      btn.disabled = false;
      btn.textContent = (song.blocks && song.blocks.length) ? '✨ 다시 슬라이드로 만들기' : '✨ 슬라이드로 만들기';
    }
  }

  /* ---------- 블록 편집 (찬양팀 검수와 동일 클래스·동작) ---------- */

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

  // 성가대/특송 = 그린 자막(밴드 없음). 필름 썸네일도 그린에 흰 가사 2줄
  function filmThumb(lines) {
    const t = document.createElement('div'); t.className = 'film-thumb';
    const green = document.createElement('div'); green.className = 'film-green film-green-lyr';
    (lines || []).slice(0, 2).forEach(tx => {
      const d = document.createElement('div'); d.className = 'film-line'; d.textContent = tx;
      green.appendChild(d);
    });
    t.appendChild(green);
    return t;
  }

  // 곡명 그린 자막 미리보기(= 실제 생성될 슬라이드, WYSIWYG)
  //   성가대 = 곡명(크게) + '시온 성가대'(작게)
  //   특송   = 곡명(크게) + '특송 · 이름/팀'(작게)
  function renderTitleSlide(song) {
    // 실제 그린 자막 슬라이드와 100% 동일한 공용 렌더(renderSlide)를 재사용 — 편집 썸네일 = 출력 일치
    const wrap = document.createElement('div');
    wrap.className = 'choir-title-slide';
    const special = (song.songType === 'special');
    const name = song.name || '';
    const sub = special ? ('특송 · ' + (song.performer || '이름/팀 미입력')) : '시온 성가대';
    if (!name) wrap.classList.add('is-empty');
    if (special && name && !song.performer) wrap.classList.add('is-warn');
    wrap.appendChild(renderSlide({ layout: 'green', text: name || '(곡 제목을 입력하세요)', sub: name ? sub : '' }));
    return wrap;
  }

  // 필름 썸네일 가사가 폭을 넘으면 축소(찬양팀 검수와 동일)
  function fitFilm(root) {
    root.querySelectorAll('.film-line').forEach(l => {
      if (!l.clientWidth) return;
      let size = 11;
      l.style.fontSize = size + 'px';
      while (l.scrollWidth > l.clientWidth && size > 6) { size -= 0.5; l.style.fontSize = size + 'px'; }
    });
  }

  function fitLines(root) {
    root.querySelectorAll('.line-text').forEach(t => {
      if (!t.clientWidth) return;
      let size = 16;
      t.style.fontSize = size + 'px';
      while (t.scrollWidth > t.clientWidth && size > 11.5) { size -= 0.5; t.style.fontSize = size + 'px'; }
    });
  }

  function lineRow(song, block, li, editorEl) {
    const line = block.lines[li];
    const row = document.createElement('div');
    row.className = 'line-row';
    // 충돌 리로드 후: 다른 사람이 바꾼 가사 줄 노란 하이라이트 (#3, A→C)
    if (window.Conflict && Conflict.lineChanged(song.id, block.id || block.label, line.text)) row.classList.add('line-changed');
    const textEl = document.createElement('div');
    textEl.className = 'line-text';
    textEl.textContent = line.text;
    row.appendChild(textEl);

    textEl.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'line-input'; input.value = line.text;
      row.replaceChild(input, textEl); input.focus();
      const commit = () => { line.text = input.value.trim(); line.low = []; SongStore.save(); renderEditor(song, editorEl); };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const pos = input.selectionStart;
          const before = input.value.slice(0, pos).trim();
          const after = input.value.slice(pos).trim();
          if (before && after) {
            block.lines.splice(li, 1, { text: before, low: [] }, { text: after, low: [] });
            block.breaks.splice(li, 0, false);
            input.removeEventListener('blur', commit);
            SongStore.save(); renderEditor(song, editorEl);
          } else input.blur();
        }
        if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0 && li > 0) {
          e.preventDefault();
          const prev = block.lines[li - 1];
          prev.text = (prev.text + ' ' + input.value.trim()).trim(); prev.low = [];
          block.lines.splice(li, 1); block.breaks.splice(li - 1, 1);
          input.removeEventListener('blur', commit);
          SongStore.save(); renderEditor(song, editorEl);
        }
      });
    });
    return row;
  }

  // 밴드=2줄이라 3줄째 합치기는 막음(setorder와 동일 규칙 — 함께 유지)
  function groupSizeLeft(block, gi) { let n = 1; for (let i = gi - 1; i >= 0; i--) { if (block.breaks[i]) break; n++; } return n; }
  function groupSizeRight(block, gi) { let n = 1; for (let i = gi + 1; i < block.lines.length - 1; i++) { if (block.breaks[i]) break; n++; } return n; }

  function dividerNode(song, block, gi, editorEl) {
    const cut = !!block.breaks[gi];
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'divider' + (cut ? ' cut' : '');
    div.setAttribute('aria-label', cut ? '여기서 나뉨 — 눌러서 합치기' : '눌러서 여기서 나누기');
    div.innerHTML = '<span class="div-mark">✂</span>';   // 항상 가위(회색=나누기 / 골드=나뉨)
    div.addEventListener('click', () => {
      if (cut) {
        if (groupSizeLeft(block, gi) + groupSizeRight(block, gi) > 2) {
          alert('크로마 밴드는 한 슬라이드에 2줄까지예요 — 더 합칠 수 없습니다.'); return;
        }
        block.breaks[gi] = false;
      } else {
        block.breaks[gi] = true;
      }
      SongStore.save(); renderEditor(song, editorEl);
    });
    return div;
  }

  function editLabel(song, block, labelEl, editorEl) {
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'block-label-input'; input.value = block.label || '';
    labelEl.replaceWith(input); input.focus(); input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) { block.label = v; block.type = /후렴|렴|chorus/i.test(v) ? 'chorus' : /브릿지|bridge/i.test(v) ? 'bridge' : 'verse'; }
      SongStore.save(); renderEditor(song, editorEl);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  function renderEditor(song, el) {
    el.innerHTML = '';
    if (!song.blocks || !song.blocks.length) return;

    // 항상 2줄 이하로 정리(가위 자동 삽입) → 편집화면=PPT 1:1
    let normed = false;
    song.blocks.forEach(b => { if (Songs.normalizeBreaks(b)) normed = true; });
    if (normed) SongStore.save();

    const hint = document.createElement('p');
    hint.className = 'review-tip';
    hint.innerHTML = '<span class="tip-line tip-sub">줄 사이 ✂ 눌러 나눔/합침(밴드 2줄) · 줄을 눌러 수정</span>';
    el.appendChild(hint);

    // 곡명 그린 자막 미리보기 (성가대=곡명+시온 성가대 / 특송=특송 : 이름)
    el.appendChild(renderTitleSlide(song));

    song.blocks.forEach(block => {
      const bcard = document.createElement('div');
      bcard.className = 'block-card';
      const label = document.createElement('button');
      label.type = 'button'; label.className = 'block-label'; label.textContent = block.label;
      label.title = '눌러서 이름 바꾸기';
      label.addEventListener('click', () => editLabel(song, block, label, el));
      bcard.appendChild(label);

      block.lines.forEach((_, li) => {
        bcard.appendChild(lineRow(song, block, li, el));
        if (li < block.lines.length - 1) bcard.appendChild(dividerNode(song, block, li, el));
      });
      // 슬라이드 미리보기 — 찬양팀 검수와 동일한 필름 썸네일(밴드)
      const strip = document.createElement('div');
      strip.className = 'ofilm-thumbs choir-thumbs';
      blockSlides(block).forEach(g => strip.appendChild(filmThumb(g.map(i => block.lines[i].text))));
      bcard.appendChild(strip);
      el.appendChild(bcard);
    });
    fitLines(el); fitFilm(el);
  }

  /* ---------- 곡 카드 ---------- */

  function renderCard(song, idx, total) {
    const special = (song.songType === 'special');
    const card = document.createElement('div');
    card.className = 'choir-song' + (special ? ' is-special' : '');
    card.dataset.id = song.id;

    const head = document.createElement('div');
    head.className = 'choir-song-head';
    const n = document.createElement('span');
    n.className = 'choir-song-n';
    n.textContent = '곡 ' + (idx + 1);
    head.appendChild(n);
    if (special) {   // 한눈에 특송임을 알 수 있는 배지
      const badge = document.createElement('span');
      badge.className = 'choir-badge'; badge.textContent = '✨ 특송';
      head.appendChild(badge);
    }

    if (total > 1) {
      const mv = document.createElement('div');
      mv.className = 'so-move';
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'so-move-btn'; up.textContent = '▲'; up.disabled = idx === 0;
      up.addEventListener('click', () => { SongStore.move(song.id, -1); render(); });
      const down = document.createElement('button');
      down.type = 'button'; down.className = 'so-move-btn'; down.textContent = '▼'; down.disabled = idx === total - 1;
      down.addEventListener('click', () => { SongStore.move(song.id, +1); render(); });
      mv.append(up, down);
      head.appendChild(mv);
    }

    const removeSong = () => {
      if (!confirm('이 곡을 삭제할까요?')) return;
      SongStore.remove(song.id); render();
    };
    const del = document.createElement('button');
    del.className = 'choir-song-x'; del.type = 'button'; del.textContent = '✕'; del.title = '곡 삭제';
    del.addEventListener('click', removeSong);
    head.appendChild(del);
    card.appendChild(head);

    // 마지막 수정 시각 — 동시 편집 시 "누가 방금 만졌나" 감 잡기용 (#3, 시간만)
    if (song.updatedAt) {
      const meta = document.createElement('p');
      meta.className = 'song-meta';
      meta.textContent = '마지막 수정: ' + relTime(song.updatedAt);
      card.appendChild(meta);
    }

    // 타입 선택 (성가대 / 특송) — 곡마다 지정. 기본 성가대
    const typeRow = document.createElement('div');
    typeRow.className = 'choir-type';
    [['choir', '성가대'], ['special', '특송']].forEach(([val, lab]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choir-type-btn' + (special === (val === 'special') ? ' on' : '');
      b.textContent = lab;
      b.addEventListener('click', () => {
        if (song.songType === val) return;
        song.songType = val; SongStore.save(); SongStore.pushNow(song); render();
      });
      typeRow.appendChild(b);
    });
    card.appendChild(typeRow);

    // 곡 제목 (성가대·특송 공통)
    const tl = document.createElement('div'); tl.className = 'choir-lbl';
    tl.textContent = '곡 제목';
    card.appendChild(tl);
    const ti = document.createElement('input');
    ti.className = 'choir-title-input'; ti.type = 'text'; ti.value = song.name || '';
    ti.placeholder = special ? '특송 곡 제목' : '곡 제목을 입력하세요';
    card.appendChild(ti);

    // 특송 이름/팀 (특송일 때만 나타남)
    let pi = null;
    if (special) {
      const pl = document.createElement('div'); pl.className = 'choir-lbl'; pl.textContent = '특송 이름/팀';
      card.appendChild(pl);
      pi = document.createElement('input');
      pi.className = 'choir-title-input'; pi.type = 'text'; pi.value = song.performer || '';
      pi.placeholder = '예: 남성중창단, 김하늘 집사';
      card.appendChild(pi);
    }

    // 가사
    const gl = document.createElement('div'); gl.className = 'choir-lbl'; gl.textContent = '가사';
    card.appendChild(gl);
    const ta = document.createElement('textarea');
    ta.className = 'choir-ta'; ta.rows = 5;
    ta.placeholder = '여기에 가사를 붙여넣으세요…';
    ta.value = song.raw || '';
    card.appendChild(ta);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-wide choir-tidy';
    btn.textContent = song.blocks && song.blocks.length ? '✨ 다시 슬라이드로 만들기' : '✨ 슬라이드로 만들기';
    card.appendChild(btn);

    const editor = document.createElement('div');
    editor.className = 'choir-editor';
    card.appendChild(editor);

    // 카드 하단 삭제(긴 곡에서 상단 ✕가 안 보일 때)
    const delBottom = document.createElement('button');
    delBottom.className = 'btn btn-ghost choir-del-bottom';
    delBottom.type = 'button';
    delBottom.textContent = '🗑 이 곡 삭제';
    delBottom.addEventListener('click', removeSong);
    card.appendChild(delBottom);

    // 제목/이름 입력 → 저장 + 곡명 자막 미리보기 갱신(WYSIWYG)
    const refreshTitle = () => {
      const t = editor.querySelector('.choir-title-slide');
      if (t) t.replaceWith(renderTitleSlide(song));
    };
    ti.addEventListener('input', () => { song.name = ti.value.trim(); SongStore.save(); refreshTitle(); });
    if (pi) pi.addEventListener('input', () => { song.performer = pi.value.trim(); SongStore.save(); refreshTitle(); });
    ta.addEventListener('input', () => { song.raw = ta.value; });
    btn.addEventListener('click', () => tidy(song, ta, editor, btn));

    renderEditor(song, editor);
    return card;
  }

  /* ---------- 렌더/진입 ---------- */

  function choirSongs() {
    return SongStore.all().filter(s => !s.role || s.role === 'choir');
  }

  function renderDone() {
    const btn = $('#btn-choir-done'); if (!btn) return;
    const done = SongStore.isDone();
    btn.textContent = done ? '✅ 완료됨 — 눌러서 취소' : '✅ 이번 주 준비 완료';
    btn.classList.toggle('is-done', done);
  }

  function render() {
    renderDone();
    const list = $('#choir-list');
    list.innerHTML = '';
    let songs = choirSongs();
    if (!songs.length) {            // 기본 1곡 열려있게
      const s = newSong(); s.role = 'choir'; SongStore.add(s);
      songs = choirSongs();
    }
    songs.forEach((s, i) => list.appendChild(renderCard(s, i, songs.length)));
    // 카드가 화면에 붙은 뒤 미리보기 글자 크기 맞춤(필름 썸네일·줄)
    requestAnimationFrame(() => { fitLines(list); fitFilm(list); });
  }

  function add() {
    const s = newSong(); SongStore.add(s);
    render();
    // 새 카드로 스크롤
    const cards = document.querySelectorAll('#choir-list .choir-song');
    if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function open() {
    try { await SongStore.load('choir'); }
    catch (e) { alert('서버에서 데이터를 불러오지 못했습니다.'); return; }
    render();
    KZ.show('choir');
  }

  function init() {
    const back = $('#btn-choir-back');
    if (back) back.addEventListener('click', () => KZ.show('home'));
    const addBtn = $('#btn-choir-add');
    if (addBtn) addBtn.addEventListener('click', add);
    const doneBtn = $('#btn-choir-done');
    if (doneBtn) doneBtn.addEventListener('click', async () => {
      try { await SongStore.setDone(!SongStore.isDone()); renderDone(); }
      catch (e) { alert('완료 상태를 저장하지 못했습니다: ' + (e.message || '') + '\n잠시 후 다시 시도해 주세요.'); }
    });
  }

  return { init, open, render };
})();
