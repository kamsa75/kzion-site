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
    if (!text) return;
    song.raw = text;
    btn.disabled = true; const old = btn.textContent; btn.textContent = '정리 중…';
    try {
      const r = CONFIG.USE_SERVER ? await API.call('extractText', { text }) : mockSplit(text);
      Songs.applyExtract(song, r);            // song.blocks 채움 (동일 스키마)
      SongStore.save(); SongStore.pushNow(song);
      renderEditor(song, editorEl);
    } catch (e) {
      alert('정리에 실패했습니다: ' + (e.message || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = (song.blocks && song.blocks.length) ? '✨ 다시 정리하기' : old;
    }
  }

  /* ---------- 블록 편집 (찬양팀 검수와 동일 클래스·동작) ---------- */

  function blockSlides(block) {
    const groups = [[0]];
    for (let i = 1; i < block.lines.length; i++) {
      if (block.breaks[i - 1]) groups.push([i]);
      else groups[groups.length - 1].push(i);
    }
    return groups;
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

  function dividerNode(song, block, gi, editorEl) {
    const cut = !!block.breaks[gi];
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'divider' + (cut ? ' cut' : '');
    div.setAttribute('aria-label', cut ? '눌러서 한 슬라이드로 합치기' : '눌러서 여기서 나누기');
    div.innerHTML = '<span class="div-mark">' + (cut ? '✂' : '') + '</span>';
    div.addEventListener('click', () => { block.breaks[gi] = !block.breaks[gi]; SongStore.save(); renderEditor(song, editorEl); });
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

    const hint = document.createElement('p');
    hint.className = 'review-tip';
    hint.innerHTML = '<span class="tip-line tip-sub">줄 사이 선을 누르면 슬라이드 나눔/합침 · 줄을 눌러 수정</span>';
    el.appendChild(hint);

    // 곡명 그린 자막 미리보기 (한 줄)
    const title = document.createElement('div');
    title.className = 'choir-title-slide';
    title.textContent = song.name || '(곡 제목을 입력하세요)';
    if (!song.name) title.classList.add('empty');
    el.appendChild(title);

    song.blocks.forEach(block => {
      const bcard = document.createElement('div');
      bcard.className = 'block-card';
      const label = document.createElement('button');
      label.type = 'button'; label.className = 'block-label'; label.textContent = block.label;
      label.title = '눌러서 이름 바꾸기';
      label.addEventListener('click', () => editLabel(song, block, label, el));
      bcard.appendChild(label);

      const over = blockSlides(block).some(g => g.length > 2);
      if (over) {
        const warn = document.createElement('div');
        warn.className = 'block-warn';
        warn.textContent = '3줄 이상 묶였습니다 — 자동으로 2줄씩 나눠 슬라이드가 만들어집니다(가사 안 잃음).';
        bcard.appendChild(warn);
      }

      block.lines.forEach((_, li) => {
        bcard.appendChild(lineRow(song, block, li, el));
        if (li < block.lines.length - 1) bcard.appendChild(dividerNode(song, block, li, el));
      });
      el.appendChild(bcard);
    });
    fitLines(el);
  }

  /* ---------- 곡 카드 ---------- */

  function renderCard(song, idx, total) {
    const card = document.createElement('div');
    card.className = 'choir-song';
    card.dataset.id = song.id;

    const head = document.createElement('div');
    head.className = 'choir-song-head';
    const n = document.createElement('span');
    n.className = 'choir-song-n';
    n.textContent = '곡 ' + (idx + 1);
    head.appendChild(n);

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

    // 곡 제목
    const tl = document.createElement('div'); tl.className = 'choir-lbl'; tl.textContent = '곡 제목';
    card.appendChild(tl);
    const ti = document.createElement('input');
    ti.className = 'choir-title-input'; ti.type = 'text'; ti.value = song.name || '';
    ti.placeholder = '곡 제목을 입력하세요';
    card.appendChild(ti);

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
    btn.textContent = song.blocks && song.blocks.length ? '✨ 다시 정리하기' : '✨ 정리하기';
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

    // 제목 입력 → 저장 + 곡명 자막 미리보기 갱신
    ti.addEventListener('input', () => {
      song.name = ti.value.trim();
      SongStore.save();
      const t = editor.querySelector('.choir-title-slide');
      if (t) { t.textContent = song.name || '(곡 제목을 입력하세요)'; t.classList.toggle('empty', !song.name); }
    });
    ta.addEventListener('input', () => { song.raw = ta.value; });
    btn.addEventListener('click', () => tidy(song, ta, editor, btn));

    renderEditor(song, editor);
    return card;
  }

  /* ---------- 렌더/진입 ---------- */

  function choirSongs() {
    return SongStore.all().filter(s => !s.role || s.role === 'choir');
  }

  function render() {
    const list = $('#choir-list');
    list.innerHTML = '';
    let songs = choirSongs();
    if (!songs.length) {            // 기본 1곡 열려있게
      const s = newSong(); s.role = 'choir'; SongStore.add(s);
      songs = choirSongs();
    }
    songs.forEach((s, i) => list.appendChild(renderCard(s, i, songs.length)));
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
  }

  return { init, open, render };
})();
