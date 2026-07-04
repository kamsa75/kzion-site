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

  // passages/readings는 페이지(슬라이드)별 문자열 배열
  // hymn = 예배 중 찬송가 가사(붙여넣기 → 절/후렴 블록). 절 순서대로 자동 배치 (D19)
  let data = { title: '', ref: '', passages: [''], readings: [''], prayer: '', hymn: { raw: '', title: '', blocks: [] } };
  let hymnPaths = [];
  let thumbUrls = [];
  let noteTimer = null;
  let pushTimer = null;

  // 옛 단일 문자열 스키마 → 배열로 변환 (하위 호환)
  function normalize(d) {
    const h = d.hymn || {};
    const out = {
      title: d.title || '', ref: d.ref || '', prayer: d.prayer || '',
      passages: Array.isArray(d.passages) ? d.passages : (d.passage ? [d.passage] : ['']),
      readings: Array.isArray(d.readings) ? d.readings : (d.reading ? [d.reading] : ['']),
      hymn: { raw: h.raw || '', title: h.title || '', blocks: Array.isArray(h.blocks) ? h.blocks : [] }
    };
    if (!out.passages.length) out.passages = [''];
    if (!out.readings.length) out.readings = [''];
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
      localStorage.setItem(KEY, JSON.stringify(data));
      savedNote();
    }
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
        ? '성경 앱·사이트에서 본문을 복사해 붙여넣으세요. 길면 아래 “페이지 추가”로 나누면 됩니다.'
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
    el.appendChild(renderSlide({ layout: 'dark', caption: data.ref, body: t.replace(/\s+/g, ' ') }));
    // 다크 슬라이드는 넘치면 잘려 보임 → 길면 안내
    if (t.length > 110) {
      const n = document.createElement('div');
      n.className = 'pv-note';
      n.textContent = '내용이 한 화면보다 많아 보이면 “페이지 추가”로 나눠주세요. (절 번호 골드는 생성 때 적용)';
      el.appendChild(n);
    }
  }

  /* ---------- 함께 읽는 구절(밴드) 다중 페이지 ---------- */

  function renderReadings() {
    const list = $('#reading-list');
    list.innerHTML = '';
    data.readings.forEach((text, i) => {
      const block = document.createElement('div');
      block.className = 'page-block';

      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.value = text;
      ta.placeholder = '함께 읽을 짧은 구절 (2줄까지)';
      ta.addEventListener('input', () => {
        data.readings[i] = ta.value;
        drawReadingPreview(prev, ta.value);
        save();
      });
      block.appendChild(ta);

      const prev = document.createElement('div');
      prev.className = 'field-preview';
      drawReadingPreview(prev, text);
      block.appendChild(prev);

      if (data.readings.length > 1) block.appendChild(removeBtn(() => {
        data.readings.splice(i, 1); renderReadings(); save();
      }, i + 1 + '페이지 삭제'));

      list.appendChild(block);
    });
  }

  function drawReadingPreview(el, text) {
    el.innerHTML = '';
    const lines = (text || '').trim().split('\n').filter(Boolean);
    if (!lines.length) return;
    el.appendChild(renderSlide({ layout: 'band', lyrics: lines.slice(0, 2) }));
    if (lines.length > 2) {
      const n = document.createElement('div');
      n.className = 'pv-note';
      n.textContent = '한 슬라이드는 2줄까지예요. 나머지는 “페이지 추가”로 나눠주세요.';
      el.appendChild(n);
    }
  }

  /* ---------- 예배 중 찬송가 가사(붙여넣기 → 절/후렴 밴드) — D19 ---------- */

  // breaks 기준으로 줄을 슬라이드 그룹(2줄)으로 묶음 (review.js blockSlides와 동일 규칙)
  function blockSlides(block) {
    const groups = [[0]];
    for (let i = 1; i < block.lines.length; i++) {
      if (block.breaks[i - 1]) groups.push([i]);
      else groups[groups.length - 1].push(i);
    }
    return groups;
  }

  function renderHymnPreview() {
    const el = $('#hymn-preview');
    el.innerHTML = '';
    const blocks = data.hymn.blocks || [];
    if (!blocks.length) return;

    const tip = document.createElement('p');
    tip.className = 'pv-note';
    tip.textContent = '절 순서대로 자동 배치됩니다. 가사를 고치려면 위 칸에서 수정하고 “가사 정리하기”를 다시 누르세요.';
    el.appendChild(tip);

    let count = 0;
    blocks.forEach(block => {
      const card = document.createElement('div');
      card.className = 'hymn-block';
      const lab = document.createElement('div');
      lab.className = 'hymn-block-label';
      lab.textContent = block.label + (block.type === 'chorus' && block.label !== '후렴' ? ' (후렴)' : '');
      card.appendChild(lab);
      const strip = document.createElement('div');
      strip.className = 'block-slides';
      blockSlides(block).forEach(g => {
        strip.appendChild(renderSlide({ layout: 'band', lyrics: g.map(i => block.lines[i].text) }));
        count++;
      });
      card.appendChild(strip);
      el.appendChild(card);
    });

    const sum = document.createElement('div');
    sum.className = 'pv-note';
    sum.textContent = '= 찬송가 슬라이드 ' + count + '장';
    el.appendChild(sum);
  }

  // 추출 결과(JSON) → data.hymn.blocks (songs.applyExtract와 동일 스키마)
  function applyHymnExtract(r) {
    data.hymn.blocks = (r.blocks || []).map((b, i) => ({
      id: b.id || ('h' + (i + 1)),
      type: b.type || 'verse',
      label: b.label || ('' + (i + 1)),
      lines: (b.lines || []).map(l => ({ text: l.text || '', low: l.low || [] })),
      breaks: b.breaks || []
    }));
    if (r.title) data.hymn.title = String(r.title).trim();
  }

  async function parseHymn() {
    const text = $('#hymn-input').value.trim();
    data.hymn.raw = text;
    if (!text) { data.hymn.blocks = []; renderHymnPreview(); save(); return; }
    const btn = $('#btn-hymn-parse');
    btn.disabled = true; btn.textContent = '정리 중…';
    try {
      const r = CONFIG.USE_SERVER
        ? await API.call('extractText', { text })
        : { blocks: [{ id: 'h1', type: 'verse', label: '1절',
            lines: text.split('\n').filter(Boolean).map(t => ({ text: t, low: [] })),
            breaks: text.split('\n').filter(Boolean).map((_, i) => i % 2 === 1) }] };
      applyHymnExtract(r);
      renderHymnPreview();
      save();
    } catch (e) {
      alert('가사를 정리하지 못했습니다: ' + (e.message || '') + '\n네트워크를 확인하거나 잠시 후 다시 시도해 주세요.');
    } finally {
      btn.disabled = false; btn.textContent = '가사 정리하기';
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
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = src; img.alt = '찬송가 악보 ' + (i + 1);
      const del = document.createElement('button');
      del.className = 'thumb-del';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        thumbUrls.splice(i, 1); hymnPaths.splice(i, 1); renderThumbs(); saveImages();
      });
      wrap.append(img, del);
      box.appendChild(wrap);
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
    $('#hymn-input').value = data.hymn.raw || '';
    renderHymnPreview();
    renderThumbs();
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
      } catch (e) {
        alert('서버에서 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
        return;
      }
    } else {
      try { data = normalize(JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { data = normalize({}); }
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
    $('#btn-add-passage').addEventListener('click', () => { data.passages.push(''); renderPassages(); save(); });
    $('#btn-add-reading').addEventListener('click', () => { data.readings.push(''); renderReadings(); save(); });
    // 찬송가: 입력은 자동 저장(raw만), 블록은 "정리하기"를 눌러야 갱신 (API 호출 아끼기)
    $('#hymn-input').addEventListener('input', () => { data.hymn.raw = $('#hymn-input').value; save(); });
    $('#btn-hymn-parse').addEventListener('click', parseHymn);
    $('#btn-pastor-back').addEventListener('click', () => KZ.show('home'));
    $('#btn-pastor-upload').addEventListener('click', () => { $('#pastor-file').value = ''; $('#pastor-file').click(); });
    $('#pastor-file').addEventListener('change', (e) => onFiles(e.target.files));
  }

  return { open };
})();
