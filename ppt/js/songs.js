/* ============================================================
   곡 목록 + 악보 업로드 (찬양팀/성가대 섹션)
   - 업로드: 모바일 탭(촬영·사진첩) / 데스크톱 드래그앤드랍 (지침 7번)
   - 클라이언트 리사이즈 가로 2560px JPEG 품질 0.92 (지침 9번, Sonnet5 고해상도 비전 2576px/3.75MP 활용)
   - 밝기 간이 체크 → 재촬영 안내, 강제 아님 (지침 8번)
   - 저장: USE_SERVER=true면 Supabase(Edge Function api) 자동 저장 (지침 3번, D14)
           false면 localStorage(목 모드)
   - 추출은 아직 목(mock) — 4단계에서 실제 Claude API로 교체
   ============================================================ */

const SongStore = (function () {
  let role = null;
  let songs = [];            // [{id, name, status, blocks, order, images, warnDark}]
  const imgCache = {};       // songId -> [dataUrl] 세션 내 표시용 캐시
  let pushTimer = null;

  function key() { return 'kzppt_songs_' + role; }

  async function load(r) {
    role = r;
    if (CONFIG.USE_SERVER) {
      const w = await API.call('getWeek');
      songs = (w.songs || [])
        .sort((a, b) => a.position - b.position)
        .map(row => ({
          id: row.id,
          name: row.name,
          status: row.status,
          blocks: row.blocks ? row.blocks.blocks : null, // D7: {version, blocks, crop}
          crop: row.blocks ? !!row.blocks.crop : false,
          cropReason: row.blocks ? (row.blocks.cropReason || '') : '',
          order: row.ord || [],
          images: row.images || [],   // storage 경로
          warnDark: row.warn_dark
        }));
    } else {
      try { songs = JSON.parse(localStorage.getItem(key())) || []; }
      catch (e) { songs = []; }
    }
  }

  function isServerId(id) { return String(id).length === 36; }

  async function pushOne(s, position) {
    const r = await API.call('saveSong', {
      song: {
        id: isServerId(s.id) ? s.id : undefined,
        name: s.name,
        position,
        status: s.status,
        blocks: s.blocks ? { version: 1, blocks: s.blocks, crop: !!s.crop, cropReason: s.cropReason || '' } : null,
        ord: s.order,
        images: s.images || [],
        warnDark: !!s.warnDark
      }
    });
    if (r.id && r.id !== s.id) {
      imgCache[r.id] = imgCache[s.id];
      delete imgCache[s.id];
      s.id = r.id;
    }
  }

  async function pushAll() {
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      if (s.status === 'extracting') continue;
      try { await pushOne(s, i); }
      catch (e) { /* 네트워크 오류 — 다음 저장에서 재시도 */ }
    }
  }

  function save() {
    if (CONFIG.USE_SERVER) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushAll, 800); // 자동 저장 디바운스
    } else {
      try { localStorage.setItem(key(), JSON.stringify(songs)); } catch (e) {}
    }
  }

  return {
    load, save,
    pushNow: async (s) => { if (CONFIG.USE_SERVER) { try { await pushOne(s, songs.indexOf(s)); } catch (e) {} } },
    all: () => songs,
    get: (id) => songs.find(s => s.id === id),
    add: (song) => { songs.push(song); if (!CONFIG.USE_SERVER) save(); },
    remove: (id) => {
      const s = songs.find(x => x.id === id);
      songs = songs.filter(x => x.id !== id);
      delete imgCache[id];
      if (CONFIG.USE_SERVER && s && isServerId(s.id)) { API.call('deleteSong', { id: s.id }).catch(() => {}); }
      else if (!CONFIG.USE_SERVER) save();
    },
    move: (id, dir) => { // 곡 순서 이동 (목록 순서 = PPT 순서)
      const i = songs.findIndex(s => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= songs.length) return;
      [songs[i], songs[j]] = [songs[j], songs[i]];
      save();
    },
    reorder: (ids) => { // 세트 화면 드래그 결과대로 곡 순서 재배열 (=PPT 순서)
      songs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      save();
    },
    setImages: (id, arr) => { imgCache[id] = arr; },
    getImages: (id) => imgCache[id] || []
  };
})();

const Songs = (function () {
  const $ = (sel) => document.querySelector(sel);
  let appendSongId = null;            // 기존 곡에 페이지 추가 모드 (D15)
  const fetchingThumbs = new Set();   // 썸네일 서명 URL 중복 요청 방지

  const STATUS = {
    extracting: '추출 중…',
    review: '검수 필요',
    ordered: '완료'
  };

  /* ---------- 이미지 리사이즈 (지침 9번) + 밝기 체크 (지침 8번) ---------- */

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxW = 2560;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const s = document.createElement('canvas');
        s.width = 64; s.height = 64;
        s.getContext('2d').drawImage(img, 0, 0, 64, 64);
        const d = s.getContext('2d').getImageData(0, 0, 64, 64).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        const brightness = sum / (d.length / 4);

        URL.revokeObjectURL(url);
        // 원본 긴 변(px) — 해상도 경고용 (D33: 최소 1200px)
        const srcLong = Math.max(img.naturalWidth, img.naturalHeight);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), brightness, srcLong });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /* ---------- PDF 지원 (D33) — pdf.js 지연 로드 후 페이지를 고해상 이미지로 렌더 ---------- */

  function isPdf(f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''); }

  const PDFJS_VER = '3.11.174';
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('PDF 라이브러리를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
    return pdfLibPromise;
  }

  // PDF 파일 → 페이지별 { dataUrl, brightness, srcLong } 배열 (resizeImage와 같은 모양)
  async function renderPdf(file) {
    const lib = await loadPdfLib();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      // 목표 긴 변 ~2200px (약 200DPI). 상한 2560(D33), 스케일 안전상한 4
      let scale = 2200 / Math.max(base.width, base.height);
      scale = Math.min(scale, 2560 / Math.max(base.width, base.height), 4);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // 투명 PDF 대비 흰 배경
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const s = document.createElement('canvas'); s.width = 64; s.height = 64;
      const sc = s.getContext('2d'); sc.drawImage(canvas, 0, 0, 64, 64);
      const d = sc.getImageData(0, 0, 64, 64).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;

      out.push({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        brightness: sum / (d.length / 4),
        srcLong: Math.max(canvas.width, canvas.height)
      });
    }
    return out;
  }

  // 파일 목록 → { dataUrl, brightness, srcLong } 배열 (PDF는 페이지들로 펼침)
  async function filesToPages(files) {
    const results = [];
    for (const f of files) {
      if (isPdf(f)) results.push(...await renderPdf(f));
      else results.push(await resizeImage(f));
    }
    return results;
  }

  // 서명 URL로 서버 스토리지에 업로드 → 경로 반환 (지침 5번)
  async function uploadImages(dataUrls) {
    const paths = [];
    for (const dataUrl of dataUrls) {
      const u = await API.call('uploadUrl');
      const blob = await (await fetch(dataUrl)).blob();
      const put = await fetch(u.url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
      if (!put.ok) throw new Error('업로드 실패');
      paths.push(u.path);
    }
    return paths;
  }

  /* ---------- 페이지(악보 여러 장) 관리 — D15 ---------- */

  // 서버 모드: 저장된 경로의 썸네일 URL이 캐시에 없으면 받아온 뒤 다시 그림
  function ensureThumbs(song) {
    if (!CONFIG.USE_SERVER) return;
    if (!(song.images || []).length) return;
    if (SongStore.getImages(song.id).length >= song.images.length) return;
    if (fetchingThumbs.has(song.id)) return;
    fetchingThumbs.add(song.id);
    API.call('imageUrls', { paths: song.images })
      .then(r => { SongStore.setImages(song.id, r.urls || []); render(); })
      .catch(() => {})
      .finally(() => fetchingThumbs.delete(song.id));
  }

  // 드래그로 페이지 순서 변경 (D15) — 폰: 꾹 누른 뒤 끌기 / 데스크톱: 바로 끌기
  function enableDrag(cell, strip, song) {
    let startX = 0, startY = 0, dragging = false, pressTimer = null, pid = null, isDown = false;

    function startDrag() {
      dragging = true;
      cell.classList.add('dragging');
      try { cell.setPointerCapture(pid); } catch (e) {}
      if (navigator.vibrate) navigator.vibrate(10);
    }

    cell.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;   // ✕(삭제) 등 버튼 클릭은 드래그와 무관
      isDown = true;
      pid = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      if (e.pointerType !== 'mouse') {
        pressTimer = setTimeout(startDrag, 250); // 꾹 누르면 드래그 시작
      }
    });

    cell.addEventListener('pointermove', (e) => {
      if (!isDown) return; // 버튼을 누르지 않은 채 지나가는 호버로는 드래그 금지(✕ 안 눌리던 버그 원인)
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
          if (e.pointerType === 'mouse') startDrag();       // 마우스는 즉시
          else clearTimeout(pressTimer);                    // 터치 이동 = 스크롤로 판단
        }
        return;
      }
      // 포인터에 가장 가까운 셀을 찾아 앞/뒤에 삽입 (줄바꿈 그리드 = 2D 거리)
      const cells = [...strip.querySelectorAll('.page-cell')].filter(c => c !== cell);
      let best = null, bestDist = Infinity, insertAfter = false;
      for (const c of cells) {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (d < bestDist) { bestDist = d; best = c; insertAfter = e.clientX > cx; }
      }
      if (best) {
        if (insertAfter) strip.insertBefore(cell, best.nextSibling);
        else strip.insertBefore(cell, best);
      }
      // + 페이지 추가 버튼은 항상 맨 끝 유지
      strip.appendChild(strip.querySelector('.page-add'));
    });

    // iOS: 드래그 중 화면 스크롤 차단 (touch-action만으로는 부족)
    cell.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });

    const finish = () => {
      isDown = false;
      clearTimeout(pressTimer);
      if (dragging) {
        cell.classList.remove('dragging');
        commitPageOrder(strip, song);
      }
      dragging = false;
    };
    cell.addEventListener('pointerup', finish);
    cell.addEventListener('pointercancel', finish);
  }

  function commitPageOrder(strip, song) {
    const order = [...strip.querySelectorAll('.page-cell')].map(c => Number(c.dataset.idx));
    if ((song.images || []).length === order.length) {
      song.images = order.map(i => song.images[i]);
    }
    const cache = SongStore.getImages(song.id);
    if (cache.length === order.length) {
      SongStore.setImages(song.id, order.map(i => cache[i]));
    }
    SongStore.save();
    render();
  }

  function deletePage(song, i) {
    if (!confirm((i + 1) + '번 페이지를 삭제할까요?')) return;
    song.images.splice(i, 1);
    const cache = SongStore.getImages(song.id);
    if (cache.length > i) cache.splice(i, 1);
    SongStore.save();
    render();
  }

  function pageStrip(song) {
    ensureThumbs(song);
    const strip = document.createElement('div');
    strip.className = 'page-strip';
    const urls = SongStore.getImages(song.id);
    const n = Math.max((song.images || []).length, CONFIG.USE_SERVER ? 0 : urls.length);

    for (let i = 0; i < n; i++) {
      const cell = document.createElement('div');
      cell.className = 'page-cell';
      cell.dataset.idx = i;
      const img = document.createElement('img');
      if (urls[i]) img.src = urls[i];
      img.alt = (i + 1) + '페이지';
      img.draggable = false;
      const num = document.createElement('span');
      num.className = 'page-num';
      num.textContent = i + 1;
      const del = document.createElement('button');
      del.className = 'thumb-del';
      del.textContent = '✕';
      del.addEventListener('click', () => deletePage(song, i));
      cell.append(img, num, del);
      enableDrag(cell, strip, song);
      strip.appendChild(cell);
    }

    // 페이지 추가
    const add = document.createElement('button');
    add.className = 'page-add';
    add.innerHTML = '+<br>페이지<br>추가';
    add.addEventListener('click', () => {
      appendSongId = song.id;
      $('#song-file').value = '';
      $('#song-file').click();
    });
    strip.appendChild(add);

    const wrap = document.createElement('div');
    wrap.appendChild(strip);
    if (n > 1) {
      const hint = document.createElement('p');
      hint.className = 'page-hint';
      hint.textContent = '순서를 바꾸려면 페이지를 꾹 눌러 원하는 자리로 끌어다 놓으세요.';
      wrap.appendChild(hint);
    }
    return wrap;
  }

  // 기존 곡에 페이지 추가 (추출은 다시 돌리지 않음 — 4단계에서 재추출 버튼 예정)
  async function appendFiles(song, fileList) {
    const files = [...fileList];
    if (!files.length) return;
    try {
      const results = await filesToPages(files); // PDF 페이지 포함 (D33)
      const cache = SongStore.getImages(song.id);
      if (CONFIG.USE_SERVER) {
        const paths = await uploadImages(results.map(r => r.dataUrl));
        song.images = (song.images || []).concat(paths);
      }
      SongStore.setImages(song.id, cache.concat(results.map(r => r.dataUrl)));
      SongStore.save();
    } catch (e) {
      alert('페이지를 추가하지 못했습니다. 다시 시도해 주세요.');
    }
    render();
  }

  /* ---------- 곡 목록 렌더 ---------- */

  function render() {
    const role = KZ.role();
    $('#songs-title').textContent = MOCK.roles[role].label + ' — 곡 준비';
    const list = $('#songs-list');
    list.innerHTML = '';

    SongStore.all().forEach(song => {
      const card = document.createElement('div');
      card.className = 'sec-card song-card';

      const head = document.createElement('div');
      head.className = 'sec-head';
      const name = document.createElement('input');
      name.className = 'song-name-input';
      name.type = 'text';
      name.value = song.name || '';
      name.placeholder = role === 'choir' ? '곡명 입력 (필수)' : '곡명 (선택)';
      name.addEventListener('input', () => { song.name = name.value; SongStore.save(); });
      const st = document.createElement('span');
      st.className = 'status ' + (song.status === 'ordered' ? 'status-done' : song.status === 'review' ? 'status-progress' : 'status-empty');
      st.textContent = STATUS[song.status] || song.status;
      head.append(name, st);
      card.appendChild(head);

      if (song.warnDark) {
        const warn = document.createElement('p');
        warn.className = 'song-warn';
        warn.textContent = '📷 사진이 어두운 편이에요. 다시 찍으면 추출이 더 정확해집니다. (그대로 진행해도 됩니다)';
        card.appendChild(warn);
      }

      if (song.warnLowRes) {
        const warn = document.createElement('p');
        warn.className = 'song-warn';
        warn.textContent = '📐 이미지 해상도가 낮아요(긴 변 1200px 미만) — 글자가 뭉개질 수 있습니다. 더 큰 이미지(긴 변 2000px 이상)나 가사 붙여넣기를 권합니다.';
        card.appendChild(warn);
      }

      // 추출 결과를 카드에서 바로 보여줌 — "아무 일도 안 일어난" 느낌 방지
      if (song.extractError) {
        const err = document.createElement('p');
        err.className = 'song-warn';
        err.textContent = '⚠️ 가사를 자동으로 읽지 못했어요 — "검수하기"에서 가사를 직접 붙여넣을 수 있습니다.';
        card.appendChild(err);
      } else if (song.status === 'review' && (song.blocks || []).length) {
        const ok = document.createElement('p');
        ok.className = 'song-ok';
        ok.textContent = '✓ 가사 추출 완료 — "검수하기"를 눌러 확인·수정하세요. ('
          + song.blocks.map(b => b.label).join(' · ') + ')';
        card.appendChild(ok);
      }

      // 악보 페이지 썸네일 + 순서 조정 (D15)
      if ((song.images || []).length || SongStore.getImages(song.id).length) {
        card.appendChild(pageStrip(song));
      }

      const actions = document.createElement('div');
      actions.className = 'sec-actions';

      if (song.status === 'extracting') {
        const sp = document.createElement('span');
        sp.className = 'spinner-note';
        sp.textContent = '가사를 읽고 있어요…';
        actions.appendChild(sp);
      } else {
        const btnReview = document.createElement('button');
        btnReview.className = 'btn btn-primary';
        btnReview.textContent = song.status === 'ordered' ? '검수 다시 열기' : '검수하기';
        btnReview.addEventListener('click', () => Review.open(song.id));
        actions.appendChild(btnReview);

        // 재추출 — 결과가 엉키면 삭제·재업로드 없이 그 자리에서 다시 읽기
        if (CONFIG.USE_SERVER && (song.images || []).length) {
          const btnRe = document.createElement('button');
          btnRe.className = 'btn btn-outline';
          btnRe.textContent = '다시 읽기';
          btnRe.addEventListener('click', () => reExtract(song));
          actions.appendChild(btnRe);
        }
      }

      const idx = SongStore.all().indexOf(song);
      const btnUp = document.createElement('button');
      btnUp.className = 'btn btn-outline btn-move';
      btnUp.textContent = '↑';
      btnUp.disabled = (idx === 0);
      btnUp.addEventListener('click', () => { SongStore.move(song.id, -1); render(); });
      const btnDown = document.createElement('button');
      btnDown.className = 'btn btn-outline btn-move';
      btnDown.textContent = '↓';
      btnDown.disabled = (idx === SongStore.all().length - 1);
      btnDown.addEventListener('click', () => { SongStore.move(song.id, +1); render(); });
      actions.append(btnUp, btnDown);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-outline';
      btnDel.textContent = '삭제';
      btnDel.addEventListener('click', () => {
        if (confirm('"' + (song.name || '곡') + '"을(를) 삭제할까요?')) {
          SongStore.remove(song.id);
          render();
        }
      });
      actions.appendChild(btnDel);

      card.appendChild(actions);
      list.appendChild(card);
    });

    // 기본 3곡 힌트 슬롯: 실제 곡이 3개 미만이면 빈 힌트 카드로 채운다.
    // 힌트는 SongStore에 없는 안내용일 뿐이라 완료 판정과 무관(비워둬도 됨).
    for (let i = SongStore.all().length; i < 3; i++) {
      const hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'song-hint';
      hint.innerHTML =
        '<span class="song-hint-num">곡 ' + (i + 1) + '</span>' +
        '<span class="song-hint-main"><span class="song-hint-plus">+</span> 악보 사진 올리기</span>' +
        '<span class="song-hint-sub">탭해서 곡 추가 · 비워둬도 됩니다</span>';
      hint.addEventListener('click', addSong);
      list.appendChild(hint);
    }
  }

  /* ---------- 곡 추가 → 곧바로 사진 선택창 → 업로드 → 추출 ----------
     팝업(prompt) 없이 버튼 클릭 그대로 파일창을 여는 게 핵심:
     prompt를 끼우면 사용자 제스처가 끊겨 브라우저가 파일창을 막는다.
     여러 장 선택 시: "서로 다른 곡 N개 / 한 곡의 페이지 N장" 선택. */

  let pendingNew = false;

  // "+ 곡 추가" → 가사 붙여넣기(추천) / 악보 이미지 중 선택 (D33: 텍스트 우선 유도)
  function addSong() {
    const ov = document.createElement('div');
    ov.className = 'sheet-overlay';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const t = document.createElement('p');
    t.className = 'sheet-title';
    t.textContent = '곡을 어떻게 추가할까요?';
    const d = document.createElement('p');
    d.className = 'sheet-desc';
    d.textContent = '가사 텍스트가 있으면 붙여넣기가 제일 정확합니다.';
    sheet.append(t, d);

    // 1순위: 가사 붙여넣기 (해상도 무관 + 100% 정확)
    const b1 = document.createElement('button');
    b1.className = 'btn btn-primary btn-wide';
    b1.innerHTML = '📋 가사 붙여넣기 <small>추천 · 가장 빠르고 정확</small>';
    b1.addEventListener('click', () => { ov.remove(); createPasteSong(); });

    // 2순위: 악보 이미지 (또렷한 고해상도일 때)
    const b2 = document.createElement('button');
    b2.className = 'btn btn-outline btn-wide';
    b2.innerHTML = '🖼 악보 이미지·PDF 올리기 <small>또렷하게 · 긴 변 2000px 이상 권장</small>';
    b2.addEventListener('click', () => {
      ov.remove();
      pendingNew = true;
      $('#song-file').value = '';
      $('#song-file').click();   // 버튼 클릭 제스처 그대로 → 사진 선택창 정상 오픈
    });

    const b3 = document.createElement('button');
    b3.className = 'btn btn-ghost btn-wide';
    b3.textContent = '취소';
    b3.addEventListener('click', () => ov.remove());
    sheet.append(b1, b2, b3);
    ov.appendChild(sheet);
    document.body.appendChild(ov);
  }

  // 가사 붙여넣기용 빈 곡 → 곧바로 검수 화면의 붙여넣기 입력으로 이동
  async function createPasteSong() {
    const song = {
      id: 's' + Date.now() + Math.random().toString(36).slice(2, 6),
      name: '', status: 'review',
      blocks: [], order: [], images: [], warnDark: false, extractError: null
    };
    SongStore.add(song);
    await SongStore.pushNow(song); // 서버 id 확정 후에 화면 이동 (id가 중간에 바뀌면 검수 화면이 곡을 놓침)
    render();
    Review.open(song.id);
  }

  // 파일 N장 → 곡 1개 (전 과정: 리사이즈→업로드→추출→저장)
  async function createSong(files) {
    const song = {
      id: 's' + Date.now() + Math.random().toString(36).slice(2, 6),
      name: '', status: 'extracting',
      blocks: null, order: [], images: [], warnDark: false
    };
    SongStore.add(song);
    render();

    let results;
    try {
      results = await filesToPages(files); // PDF는 페이지들로 펼쳐짐 (D33)
      SongStore.setImages(song.id, results.map(r => r.dataUrl));
      song.warnDark = results.some(r => r.brightness < 90); // 지침 8번
      song.warnLowRes = results.some(r => r.srcLong < 1200); // D33 해상도 경고(클라 전용)
    } catch (e) {
      alert((e && e.message) || '파일을 읽지 못했습니다. 다른 이미지/PDF로 다시 시도해 주세요.');
      SongStore.remove(song.id); render(); return;
    }
    render();

    if (CONFIG.USE_SERVER) {
      try { song.images = await uploadImages(results.map(r => r.dataUrl)); }
      catch (e) { alert('악보 저장 중 문제가 생겼습니다. 다시 시도해 주세요.'); SongStore.remove(song.id); render(); return; }
      try {
        const r = await API.call('extract', { paths: song.images });
        applyExtract(song, r);
      } catch (e) {
        song.status = 'review';
        song.blocks = [];
        song.extractError = e.message || '가사를 읽지 못했습니다';
      }
      await SongStore.pushNow(song);
      SongStore.save();
      render();
    } else {
      setTimeout(() => {
        song.blocks = JSON.parse(JSON.stringify(MOCK.extractResult.blocks));
        song.status = 'review';
        SongStore.save();
        render();
      }, 1500);
    }
  }

  // 저장된 악보 이미지로 가사를 다시 추출 (검수한 내용은 새 결과로 대체됨)
  async function reExtract(song) {
    if (song.blocks && song.blocks.length &&
        !confirm('가사를 다시 읽으면 지금 검수한 내용이 새 결과로 바뀝니다. 계속할까요?')) return;
    song.status = 'extracting';
    render();
    try {
      const r = await API.call('extract', { paths: song.images });
      applyExtract(song, r);
      song.order = []; // 블록이 새로 생겼으니 순서도 초기화
    } catch (e) {
      song.status = 'review';
      song.blocks = song.blocks || [];
      song.extractError = e.message || '가사를 읽지 못했습니다';
    }
    await SongStore.pushNow(song);
    SongStore.save();
    render();
  }

  // 새로 고른 파일 처리: 1장이면 바로 곡 1개, 여러 장이면 용도 질문
  function handleNewFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    if (files.length === 1) { createSong(files); return; }
    showMultiChoice(files);
  }

  function showMultiChoice(files) {
    const ov = document.createElement('div');
    ov.className = 'sheet-overlay';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const t = document.createElement('p');
    t.className = 'sheet-title';
    t.textContent = '사진 ' + files.length + '장을 선택했어요';
    const d = document.createElement('p');
    d.className = 'sheet-desc';
    d.textContent = '어떻게 올릴까요?';
    sheet.append(t, d);

    const b1 = document.createElement('button');
    b1.className = 'btn btn-primary btn-wide';
    b1.textContent = '서로 다른 곡 ' + files.length + '개 — 곡마다 가사 추출';
    b1.addEventListener('click', async () => {
      ov.remove();
      for (const f of files) await createSong([f]); // 순차 추출(과금·안정성)
    });
    const b2 = document.createElement('button');
    b2.className = 'btn btn-outline btn-wide';
    b2.textContent = '한 곡의 악보 ' + files.length + '페이지 (성가대 합창보 등)';
    const b3 = document.createElement('button');
    b3.className = 'btn btn-ghost btn-wide';
    b3.textContent = '취소';
    b2.addEventListener('click', () => { ov.remove(); createSong(files); });
    b3.addEventListener('click', () => ov.remove());
    sheet.append(b1, b2, b3);
    ov.appendChild(sheet);
    document.body.appendChild(ov);
  }

  // 추출 결과(JSON) → 곡에 반영. crop 배지 정보 포함 (지침 12-5)
  function applyExtract(song, r) {
    song.blocks = (r.blocks || []).map((b, i) => ({
      id: b.id || ('b' + (i + 1)),
      type: b.type || 'verse',
      label: b.label || ('' + (i + 1)),
      lines: (b.lines || []).map(l => ({ text: l.text || '', low: l.low || [] })),
      breaks: b.breaks || []
    }));
    song.crop = !!r.crop;
    song.cropReason = r.crop_reason || '';
    // 악보에 적힌 곡 제목 자동 입력 (사용자가 이미 입력했으면 유지)
    if (!song.name && r.title) song.name = String(r.title).trim();
    song.extractError = null;
    song.status = 'review';
  }

  function init() {
    $('#btn-song-add').addEventListener('click', addSong);
    $('#song-file').addEventListener('change', (e) => {
      const files = e.target.files;
      if (appendSongId) {                       // 기존 곡에 페이지 추가
        const song = SongStore.get(appendSongId);
        appendSongId = null;
        if (song) { appendFiles(song, files); return; }
      }
      if (pendingNew) {                          // 새 곡 — 파일 고른 경우에만 진행(취소 시 유령 카드 방지)
        pendingNew = false;
        handleNewFiles(files);
      }
    });
    $('#btn-songs-back').addEventListener('click', () => KZ.show('home'));

    const screen = $('#screen-songs');
    screen.addEventListener('dragover', (e) => e.preventDefault());
    screen.addEventListener('drop', (e) => {
      e.preventDefault();
      handleNewFiles(e.dataTransfer.files);
    });
  }

  async function open() {
    try {
      await SongStore.load(KZ.role());
    } catch (e) {
      alert('서버에서 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
      return;
    }
    render();
    KZ.show('songs');
  }

  return { init, open, render, resizeImage, uploadImages, applyExtract, renderPdf, isPdf };
})();
