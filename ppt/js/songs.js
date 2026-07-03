/* ============================================================
   곡 목록 + 악보 업로드 (찬양팀/성가대 섹션)
   - 업로드: 모바일 탭(촬영·사진첩) / 데스크톱 드래그앤드랍 (지침 7번)
   - 클라이언트 리사이즈 가로 1920px JPEG (지침 9번)
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
          blocks: row.blocks ? row.blocks.blocks : null, // D7: {version, blocks}
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
        blocks: s.blocks ? { version: 1, blocks: s.blocks } : null,
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
    setImages: (id, arr) => { imgCache[id] = arr; },
    getImages: (id) => imgCache[id] || []
  };
})();

const Songs = (function () {
  const $ = (sel) => document.querySelector(sel);
  let currentUploadSongId = null;

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
        const maxW = 1920;
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
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), brightness });
      };
      img.onerror = reject;
      img.src = url;
    });
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

  /* ---------- 곡 목록 렌더 ---------- */

  function render() {
    const role = KZ.role();
    $('#songs-title').textContent = MOCK.roles[role].label + ' — 곡 준비';
    const list = $('#songs-list');
    list.innerHTML = '';

    if (!SongStore.all().length) {
      const empty = document.createElement('p');
      empty.className = 'song-empty';
      empty.textContent = '아직 곡이 없습니다. 아래 "곡 추가"를 눌러 악보 사진을 올려주세요.';
      list.appendChild(empty);
    }

    SongStore.all().forEach(song => {
      const card = document.createElement('div');
      card.className = 'sec-card song-card';

      const head = document.createElement('div');
      head.className = 'sec-head';
      const name = document.createElement('div');
      name.className = 'sec-name';
      name.textContent = song.name || '(곡명 없음)';
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
  }

  /* ---------- 곡 추가 → 파일 선택 → 업로드 → 추출(목) ---------- */

  function addSong() {
    const role = KZ.role();
    let name = prompt(role === 'choir' ? '곡명을 입력하세요 (필수)' : '곡명을 입력하세요 (건너뛰려면 확인)');
    if (name === null) return;
    name = name.trim();
    if (role === 'choir' && !name) { alert('성가대는 곡명이 필요합니다.'); return; }

    const song = {
      id: 's' + Date.now(),
      name, status: 'extracting',
      blocks: null, order: [], images: [], warnDark: false
    };
    SongStore.add(song);
    currentUploadSongId = song.id;
    $('#song-file').value = '';
    $('#song-file').click();
    render();
  }

  async function onFiles(fileList) {
    const song = SongStore.get(currentUploadSongId);
    if (!song) return;
    const files = [...fileList];
    if (!files.length) { SongStore.remove(song.id); render(); return; }

    let results;
    try {
      results = [];
      for (const f of files) results.push(await resizeImage(f));
      SongStore.setImages(song.id, results.map(r => r.dataUrl));
      song.warnDark = results.some(r => r.brightness < 90); // 지침 8번
    } catch (e) {
      alert('이미지를 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
      SongStore.remove(song.id); render(); return;
    }
    render();

    // 서버 모드: 원본을 스토리지에 업로드 (경로 저장)
    if (CONFIG.USE_SERVER) {
      try { song.images = await uploadImages(results.map(r => r.dataUrl)); }
      catch (e) { alert('악보 저장 중 문제가 생겼습니다. 다시 시도해 주세요.'); }
    }

    // ── 목 추출: 1.5초 뒤 가짜 결과 (4단계에서 실제 API로 교체) ──
    setTimeout(async () => {
      song.blocks = JSON.parse(JSON.stringify(MOCK.extractResult.blocks));
      song.status = 'review';
      await SongStore.pushNow(song); // 서버 id 확정 후 화면 갱신 (검수 버튼이 확정 id를 갖도록)
      SongStore.save();
      render();
    }, 1500);
  }

  function init() {
    $('#btn-song-add').addEventListener('click', addSong);
    $('#song-file').addEventListener('change', (e) => onFiles(e.target.files));
    $('#btn-songs-back').addEventListener('click', () => KZ.show('home'));

    const screen = $('#screen-songs');
    screen.addEventListener('dragover', (e) => e.preventDefault());
    screen.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!e.dataTransfer.files.length) return;
      if (!currentUploadSongId || SongStore.get(currentUploadSongId)?.blocks) {
        const song = { id: 's' + Date.now(), name: '', status: 'extracting', blocks: null, order: [], images: [], warnDark: false };
        SongStore.add(song);
        currentUploadSongId = song.id;
      }
      onFiles(e.dataTransfer.files);
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

  return { init, open, render, resizeImage, uploadImages };
})();
