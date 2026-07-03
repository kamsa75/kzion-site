/* ============================================================
   곡 목록 + 악보 업로드 (찬양팀/성가대 섹션)
   - 업로드: 모바일 탭(촬영·사진첩) / 데스크톱 드래그앤드랍 (지침 7번)
   - 클라이언트 리사이즈 가로 1920px JPEG (지침 9번)
   - 밝기 간이 체크 → 재촬영 안내, 강제 아님 (지침 8번)
   - 추출은 목(mock) 1.5초 지연 — 4단계에서 Edge Function 호출로 교체
   - 저장: localStorage(텍스트만). 이미지는 메모리 보관 — 3단계에서 서버 저장
   ============================================================ */

const SongStore = (function () {
  let role = null;
  let songs = [];            // [{id, name, status, blocks, breaksEdited, order}]
  const images = {};         // songId -> [dataUrl] (메모리 전용)

  function key() { return 'kzppt_songs_' + role; }

  function load(r) {
    role = r;
    try { songs = JSON.parse(localStorage.getItem(key())) || []; }
    catch (e) { songs = []; }
  }
  function save() {
    try { localStorage.setItem(key(), JSON.stringify(songs)); } catch (e) { /* 용량 초과 등 — 목 단계에선 무시 */ }
  }
  return {
    load, save,
    all: () => songs,
    get: (id) => songs.find(s => s.id === id),
    add: (song) => { songs.push(song); save(); },
    remove: (id) => { songs = songs.filter(s => s.id !== id); delete images[id]; save(); },
    move: (id, dir) => { // 곡 순서 이동 (PPT에는 목록 순서대로 들어감)
      const i = songs.findIndex(s => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= songs.length) return;
      [songs[i], songs[j]] = [songs[j], songs[i]];
      save();
    },
    setImages: (id, arr) => { images[id] = arr; },
    getImages: (id) => images[id] || []
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

        // 평균 밝기 (0~255) — 축소 샘플로 계산
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

      // 곡 순서 이동 — 목록 순서 = PPT에 들어가는 순서
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

  /* ---------- 곡 추가 → 파일 선택 → 추출(목) ---------- */

  function addSong() {
    const role = KZ.role();
    // 성가대는 곡명 필수(지침 — 성가대 워크플로우 + 곡명), 찬양팀은 선택
    let name = prompt(role === 'choir' ? '곡명을 입력하세요 (필수)' : '곡명을 입력하세요 (건너뛰려면 확인)');
    if (name === null) return;               // 취소
    name = name.trim();
    if (role === 'choir' && !name) { alert('성가대는 곡명이 필요합니다.'); return; }

    const song = {
      id: 's' + Date.now(),
      name, status: 'extracting',
      blocks: null, order: [], warnDark: false
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

    try {
      const results = [];
      for (const f of files) results.push(await resizeImage(f));
      SongStore.setImages(song.id, results.map(r => r.dataUrl));
      song.warnDark = results.some(r => r.brightness < 90); // 지침 8번 간이 체크
    } catch (e) {
      alert('이미지를 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
      SongStore.remove(song.id); render(); return;
    }
    render();

    // ── 목 추출: 1.5초 뒤 가짜 결과 (4단계에서 실제 API로 교체) ──
    setTimeout(() => {
      song.blocks = JSON.parse(JSON.stringify(MOCK.extractResult.blocks));
      song.status = 'review';
      SongStore.save();
      render();
    }, 1500);
  }

  function init() {
    $('#btn-song-add').addEventListener('click', addSong);
    $('#song-file').addEventListener('change', (e) => onFiles(e.target.files));
    $('#btn-songs-back').addEventListener('click', () => KZ.show('home'));

    // 데스크톱 드래그앤드랍 (지침 7번)
    const screen = $('#screen-songs');
    screen.addEventListener('dragover', (e) => e.preventDefault());
    screen.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!e.dataTransfer.files.length) return;
      if (!currentUploadSongId || SongStore.get(currentUploadSongId)?.blocks) {
        // 드랍으로 바로 곡 생성
        const song = { id: 's' + Date.now(), name: '', status: 'extracting', blocks: null, order: [], warnDark: false };
        SongStore.add(song);
        currentUploadSongId = song.id;
      }
      onFiles(e.dataTransfer.files);
    });
  }

  function open() {
    SongStore.load(KZ.role());
    render();
    KZ.show('songs');
  }

  return { init, open, render, resizeImage };
})();
