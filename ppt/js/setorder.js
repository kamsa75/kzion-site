/* ============================================================
   리더용 세트 찬양 순서 화면 (D28~D32) — Phase 3
   - 그 주 전체 곡을 한눈에: 곡 카드 스택 + 곡 ⠿ 드래그(=PPT/곡 순서)
   - 곡별 편곡(회차·×N·간주·메모)·카톡 내보내기는 이후 단계에서 추가
   - 이 화면이 최종 PPT 페이지 순서의 원천 (D28)
   ============================================================ */

const SetOrder = (function () {
  const $ = (sel) => document.querySelector(sel);

  /* ---------- 슬라이드(페이지) 수 계산 ---------- */

  // 블록의 슬라이드 그룹 수 (breaks 기준 2줄 묶음) — review.blockSlides와 동일 규칙
  function blockSlideCount(block) {
    const lines = block.lines || [];
    if (!lines.length) return 0;
    const breaks = block.breaks || [];
    let groups = 1;
    for (let i = 1; i < lines.length; i++) if (breaks[i - 1]) groups++;
    return groups;
  }

  // 곡의 페이지 수: order(부르는 순서)가 있으면 그 기준, 없으면 블록 전체
  function songSlideCount(song) {
    const blocks = song.blocks || [];
    if (!blocks.length) return 0;
    const byId = {};
    blocks.forEach(b => { byId[b.id] = b; });
    if ((song.order || []).length) {
      return song.order.reduce((n, bid) => n + (byId[bid] ? blockSlideCount(byId[bid]) : 0), 0);
    }
    return blocks.reduce((n, b) => n + blockSlideCount(b), 0);
  }

  function totalSlides() {
    return SongStore.all().reduce((n, s) => n + songSlideCount(s), 0);
  }

  /* ---------- 곡 카드 드래그로 순서 변경 (=PPT/곡 순서) ---------- */

  function enableSongDrag(card, grip, list) {
    let pid = null, dragging = false, pressTimer = null, isDown = false, startY = 0;

    const start = () => {
      dragging = true;
      card.classList.add('so-dragging');
      try { card.setPointerCapture(pid); } catch (e) {}
      if (navigator.vibrate) navigator.vibrate(10);
    };

    grip.addEventListener('pointerdown', (e) => {
      isDown = true; pid = e.pointerId; startY = e.clientY;
      if (e.pointerType === 'mouse') start();          // 데스크톱: 바로
      else pressTimer = setTimeout(start, 200);        // 폰: 꾹 눌러
    });

    card.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      if (!dragging) {
        if (e.pointerType !== 'mouse' && Math.abs(e.clientY - startY) > 8) clearTimeout(pressTimer); // 세로 스크롤로 판단
        return;
      }
      const others = [...list.querySelectorAll('.so-card')].filter(c => c !== card);
      let best = null, bestDist = Infinity, after = false;
      for (const c of others) {
        const r = c.getBoundingClientRect();
        const cy = r.top + r.height / 2;
        const d = Math.abs(e.clientY - cy);
        if (d < bestDist) { bestDist = d; best = c; after = e.clientY > cy; }
      }
      if (best) list.insertBefore(card, after ? best.nextSibling : best);
    });

    // iOS: 드래그 중 화면 스크롤 차단
    card.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });

    const finish = () => {
      isDown = false;
      clearTimeout(pressTimer);
      if (dragging) {
        card.classList.remove('so-dragging');
        const ids = [...list.querySelectorAll('.so-card')].map(c => c.dataset.id);
        SongStore.reorder(ids);   // 곡 순서 = PPT 순서 (D28)
        render();
      }
      dragging = false;
    };
    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', finish);
  }

  /* ---------- 렌더 ---------- */

  function render() {
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
      const card = document.createElement('div');
      card.className = 'so-card';
      card.dataset.id = song.id;

      const head = document.createElement('div');
      head.className = 'so-head';
      const grip = document.createElement('span');
      grip.className = 'so-grip';
      grip.textContent = '⠿';
      grip.title = '끌어서 곡 순서 변경';
      const num = document.createElement('span');
      num.className = 'so-num';
      num.textContent = (i + 1) + '.';
      const title = document.createElement('span');
      title.className = 'so-title';
      title.textContent = song.name || '제목 미정';
      const key = document.createElement('input');
      key.className = 'so-key';
      key.type = 'text';
      key.placeholder = '키';
      key.value = song.key || '';
      key.addEventListener('input', () => { song.key = key.value.trim(); SongStore.save(); });
      const cnt = document.createElement('span');
      cnt.className = 'so-count';
      cnt.textContent = songSlideCount(song) + '장';
      head.append(grip, num, title, key, cnt);
      card.appendChild(head);

      // 편곡 요약(다음 단계에서 회차·×N·간주로 확장). 지금은 현재 부르는 순서 요약만.
      const summ = document.createElement('div');
      summ.className = 'so-summary';
      if (song.order && song.order.length) {
        summ.textContent = song.order
          .map(bid => { const b = (song.blocks || []).find(x => x.id === bid); return b ? b.label : '?'; })
          .join(' · ');
      } else if ((song.blocks || []).length) {
        summ.textContent = '편곡 미정 — 곡을 눌러 회차·반복을 짭니다 (다음 단계)';
        summ.classList.add('so-summary-empty');
      } else {
        summ.textContent = '가사 없음 — "곡 목록"에서 먼저 추출/붙여넣기';
        summ.classList.add('so-summary-empty');
      }
      card.appendChild(summ);

      enableSongDrag(card, grip, list);
      list.appendChild(card);
    });
  }

  /* ---------- 진입/이벤트 ---------- */

  function open() {
    render();
    KZ.show('setorder');
  }

  function init() {
    const back = $('#btn-setorder-back');
    if (back) back.addEventListener('click', () => { Songs.render(); KZ.show('songs'); });
    const entry = $('#btn-open-setorder');
    if (entry) entry.addEventListener('click', () => open());
  }

  return { init, open, render };
})();
