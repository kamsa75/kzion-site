/* ============================================================
   목사님 입력 화면 (지침 28번)
   - 매주 입력 5개 + 예배 중 찬송가 악보 업로드(여러 장)
   - 자동 저장 (지침 3번): USE_SERVER=true면 Supabase, false면 localStorage
   - 각 항목 아래 실제 슬라이드 모양 실시간 미리보기
   ============================================================ */

const Pastor = (function () {
  const $ = (sel) => document.querySelector(sel);
  const KEY = 'kzppt_pastor';

  let data = { title: '', ref: '', passage: '', reading: '', prayer: '' };
  let hymnPaths = [];   // 서버 storage 경로
  let thumbUrls = [];   // 화면 표시용 (dataURL 또는 서명 URL)
  let noteTimer = null;
  let pushTimer = null;

  function loadLocal() {
    try { Object.assign(data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
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

  /* ---------- 미리보기 ---------- */

  function previewBox(el, slide, note) {
    el.innerHTML = '';
    if (!slide) return;
    el.appendChild(renderSlide(slide));
    if (note) {
      const p = document.createElement('div');
      p.className = 'pv-note';
      p.textContent = note;
      el.appendChild(p);
    }
  }

  function renderPreviews() {
    previewBox($('#pv-sermon'),
      (data.title || data.ref) ? { layout: 'green', text: data.title, sub: data.ref } : null);

    previewBox($('#pv-passage'),
      data.passage.trim() ? {
        layout: 'dark', caption: data.ref,
        body: data.passage.trim().replace(/\s+/g, ' ').slice(0, 100) + (data.passage.trim().length > 100 ? ' …' : '')
      } : null,
      data.passage.trim().length > 100 ? '실제 생성 시 여러 장으로 자동 나뉩니다. (절 번호 골드 표시는 생성 단계에서)' : null);

    const readingLines = data.reading.trim().split('\n').filter(Boolean);
    previewBox($('#pv-reading'),
      readingLines.length ? { layout: 'band', lyrics: readingLines.slice(0, 2) } : null);

    // 기도 (순서표 8번) — "기도 : 이름" 한 줄, 동일 크기 (D13)
    previewBox($('#pv-prayer'),
      data.prayer.trim() ? { layout: 'green', text: '기도 : ' + data.prayer.trim() } : null);
  }

  /* ---------- 악보 업로드 ---------- */

  function renderThumbs() {
    const box = $('#pastor-thumbs');
    box.innerHTML = '';
    thumbUrls.forEach((src, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '찬송가 악보 ' + (i + 1);
      const del = document.createElement('button');
      del.className = 'thumb-del';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        thumbUrls.splice(i, 1);
        hymnPaths.splice(i, 1);
        renderThumbs();
        saveImages();
      });
      wrap.append(img, del);
      box.appendChild(wrap);
    });
  }

  async function onFiles(fileList) {
    for (const f of [...fileList]) {
      try {
        const r = await Songs.resizeImage(f); // 리사이즈 재사용 (지침 9번)
        if (CONFIG.USE_SERVER) {
          const paths = await Songs.uploadImages([r.dataUrl]);
          hymnPaths.push(paths[0]);
        }
        thumbUrls.push(r.dataUrl);
      } catch (e) { alert('이미지를 올리지 못했습니다: ' + f.name); }
    }
    renderThumbs();
    saveImages();
  }

  /* ---------- 진입/이벤트 ---------- */

  function bindField(id, key) {
    const el = $(id);
    el.addEventListener('input', () => {
      data[key] = el.value;
      save();
      renderPreviews();
    });
  }

  async function open() {
    if (CONFIG.USE_SERVER) {
      try {
        const w = await API.call('getWeek');
        data = Object.assign({ title: '', ref: '', passage: '', reading: '', prayer: '' }, (w.pastor && w.pastor.data) || {});
        hymnPaths = (w.pastor && w.pastor.hymn_images) || [];
        thumbUrls = [];
        if (hymnPaths.length) {
          try {
            const r = await API.call('imageUrls', { paths: hymnPaths });
            thumbUrls = r.urls || [];
          } catch (e) {}
        }
      } catch (e) {
        alert('서버에서 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
        return;
      }
    } else {
      loadLocal();
    }

    bindOnce();
    ['#pf-title', '#pf-ref', '#pf-passage', '#pf-reading', '#pf-prayer'].forEach((id, i) => {
      const keys = ['title', 'ref', 'passage', 'reading', 'prayer'];
      $(id).value = data[keys[i]] || '';
    });
    renderPreviews();
    renderThumbs();
    KZ.show('pastor');
  }

  let bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    bindField('#pf-title', 'title');
    bindField('#pf-ref', 'ref');
    bindField('#pf-passage', 'passage');
    bindField('#pf-reading', 'reading');
    bindField('#pf-prayer', 'prayer');
    $('#btn-pastor-back').addEventListener('click', () => KZ.show('home'));
    $('#btn-pastor-upload').addEventListener('click', () => { $('#pastor-file').value = ''; $('#pastor-file').click(); });
    $('#pastor-file').addEventListener('change', (e) => onFiles(e.target.files));
  }

  return { open };
})();
