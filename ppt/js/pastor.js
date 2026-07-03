/* ============================================================
   목사님 입력 화면 (지침 28번)
   - 매주 입력 5개: 설교 제목 / 본문 구절 표기 / 성경 본문 / 함께 읽는 구절 / 기도 담당자명
     + 예배 중 찬송가 악보 업로드 1건(여러 장)
   - 입력 즉시 자동 저장 (지침 3번) — 목 단계는 localStorage, 3단계에서 Supabase
   - 각 항목 아래 실제 슬라이드 모양 실시간 미리보기
   ============================================================ */

const Pastor = (function () {
  const $ = (sel) => document.querySelector(sel);
  const KEY = 'kzppt_pastor';

  let data = { title: '', ref: '', passage: '', reading: '', prayer: '' };
  let images = []; // dataURL 배열 — 메모리 전용(3단계에서 서버 저장)
  let saveTimer = null;

  function load() {
    try { Object.assign(data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
    const note = $('#pastor-saved');
    note.textContent = '✓ 저장됨';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { note.textContent = ''; }, 1500);
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
    // 설교 제목 슬라이드 (순서표 14번, 그린 자막형 — D10: 제목+구절만)
    previewBox($('#pv-sermon'),
      (data.title || data.ref) ? { layout: 'green', text: data.title, sub: data.ref } : null);

    // 성경 본문 (순서표 15번, 다크 전체화면형) — 앞부분만 표시
    previewBox($('#pv-passage'),
      data.passage.trim() ? {
        layout: 'dark', caption: data.ref,
        body: data.passage.trim().replace(/\s+/g, ' ').slice(0, 100) + (data.passage.trim().length > 100 ? ' …' : '')
      } : null,
      data.passage.trim().length > 100 ? '실제 생성 시 여러 장으로 자동 나뉩니다. (절 번호 골드 표시는 생성 단계에서)' : null);

    // 함께 읽는 구절 (순서표 16번, 크로마 밴드형)
    const readingLines = data.reading.trim().split('\n').filter(Boolean);
    previewBox($('#pv-reading'),
      readingLines.length ? { layout: 'band', lyrics: readingLines.slice(0, 2) } : null);

    // 기도 (순서표 8번, 그린 자막형) — "기도 : 이름" 한 줄, 동일 크기 (D13)
    previewBox($('#pv-prayer'),
      data.prayer.trim() ? { layout: 'green', text: '기도 : ' + data.prayer.trim() } : null);
  }

  /* ---------- 악보 업로드 ---------- */

  function renderThumbs() {
    const box = $('#pastor-thumbs');
    box.innerHTML = '';
    images.forEach((src, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '찬송가 악보 ' + (i + 1);
      const del = document.createElement('button');
      del.className = 'thumb-del';
      del.textContent = '✕';
      del.addEventListener('click', () => { images.splice(i, 1); renderThumbs(); });
      wrap.append(img, del);
      box.appendChild(wrap);
    });
  }

  async function onFiles(fileList) {
    for (const f of [...fileList]) {
      try {
        const r = await Songs.resizeImage(f); // 리사이즈 재사용 (지침 9번)
        images.push(r.dataUrl);
      } catch (e) { alert('이미지를 읽지 못했습니다: ' + f.name); }
    }
    renderThumbs();
  }

  /* ---------- 진입/이벤트 ---------- */

  function bindField(id, key) {
    const el = $(id);
    el.value = data[key] || '';
    el.addEventListener('input', () => {
      data[key] = el.value;
      save();
      renderPreviews();
    });
  }

  function open() {
    load();
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
