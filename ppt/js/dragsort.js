/* ============================================================
   공용 드래그 정렬 (2026-07-06) — 편곡 칩·관리자 썸네일 등 어디서나 재사용
   - 데스크탑: 아이템을 바로 잡아 끌기(마우스, 스크롤과 안 헷갈림)
   - 모바일: 아이템을 꾹 눌러 '흔들 편집 모드' 진입(스크롤 잠금) → 끌어 정렬 → [완료]
   - 여러 컨테이너 지원(파트 넘나들며 이동). 드롭 시 consumer의 commit()이 DOM 순서→데이터 반영.
   재렌더로 DOM이 새로 그려져도, 화면 그릴 때마다 bind()를 다시 부르면 됨.
   ============================================================ */

const DragSort = (function () {
  const list = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  let editGroup = null;     // 모바일 흔들-편집 중인 그룹 id (재렌더에도 유지)
  let justDragged = 0;      // 드래그 직후 click(미리보기) 억제용 타임스탬프

  function isEditing(group) { return editGroup != null && editGroup === group; }
  function suppressClick() { return Date.now() - justDragged < 250; }

  // scope: 컨테이너들을 감싼 상위 요소. opts = {
  //   container, item, ignore, group, commit(), rerender(), longPress(ms)
  // }
  function bind(scope, opts) {
    if (!scope || scope._dsBound === opts) return;   // 같은 opts로 중복 바인딩 방지
    const LP = opts.longPress || 350;

    // 편집 모드 상태 반영(흔들 + 완료 버튼)
    if (isEditing(opts.group)) { scope.classList.add('ds-editing'); showDone(opts); }
    else { scope.classList.remove('ds-editing'); hideDone(opts.group); }

    let dragEl = null, pid = null, sx = 0, sy = 0, pressTimer = null, mode = null;
    let offX = 0, offY = 0, ph = null;   // 손가락-박스 간격, 빈 자리(플레이스홀더)

    const nearestContainer = (x, y) => {
      let best = null, bd = Infinity;
      list(opts.container, scope).forEach(c => {
        const r = c.getBoundingClientRect();
        const cx = Math.max(r.left, Math.min(x, r.right));
        const cy = Math.max(r.top, Math.min(y, r.bottom));
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) { bd = d; best = c; }
      });
      return best;
    };

    // 드래그 중인 박스를 손가락 위치로 이동 + 빈 자리(플레이스홀더)를 드롭 위치로
    const reposition = (x, y) => {
      dragEl.style.left = (x - offX) + 'px';
      dragEl.style.top = (y - offY) + 'px';
      const under = document.elementFromPoint(x, y);   // dragEl은 pointer-events:none → 아래 요소 잡힘
      let cont = under && under.closest ? under.closest(opts.container) : null;
      if (!cont || !scope.contains(cont)) cont = nearestContainer(x, y);
      if (!cont) return;
      const items = list(opts.item, cont).filter(el => el !== dragEl);
      let ref = null;
      for (const el of items) {
        if (el === ph) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top - 2) { ref = el; break; }                                   // 위쪽 행
        if (y <= r.bottom + 2 && x < r.left + r.width / 2) { ref = el; break; }    // 같은 행 왼쪽
      }
      cont.insertBefore(ph, ref);   // 빈 자리만 이동(박스는 손가락 따라 떠 있음)
    };

    // 박스를 '들어서' 손가락을 따라오게 하고, 원래 자리에 빈 자리(placeholder)를 둠
    const beginDrag = (item, gx, gy) => {
      dragEl = item;
      const r = item.getBoundingClientRect();
      offX = gx - r.left; offY = gy - r.top;
      ph = document.createElement('div');
      ph.className = 'ds-ph';
      ph.style.width = r.width + 'px'; ph.style.height = r.height + 'px';
      item.parentNode.insertBefore(ph, item.nextSibling);   // 원래 자리에 빈 칸
      item.classList.add('ds-dragging');
      item.style.width = r.width + 'px'; item.style.height = r.height + 'px';
      item.style.left = r.left + 'px'; item.style.top = r.top + 'px';
      document.body.classList.add('ds-nosel');
      try { scope.setPointerCapture(pid); } catch (e) {}
      if (navigator.vibrate) navigator.vibrate(8);
    };

    // 꾹 누른 그 손가락으로 바로 드래그(재렌더 없이 현재 DOM에 흔들+완료 적용 → 터치 안 끊김)
    const enterEditAndDrag = (item) => {
      editGroup = opts.group;
      scope.classList.add('ds-editing');
      showDone(opts);
      if (navigator.vibrate) navigator.vibrate(12);
      beginDrag(item, sx, sy);
    };

    scope.addEventListener('pointerdown', (e) => {
      const item = e.target.closest(opts.item);
      if (!item || !scope.contains(item)) return;
      if (opts.ignore && e.target.closest(opts.ignore)) return;   // 버튼 등에선 드래그 시작 안 함
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      if (e.pointerType === 'mouse') { mode = 'mouse'; }           // 데스크탑: 이동하면 바로 드래그
      else {
        mode = 'touch';
        if (isEditing(opts.group)) beginDrag(item, sx, sy);        // 이미 편집모드 → 바로 잡힘
        else pressTimer = setTimeout(() => { pressTimer = null; enterEditAndDrag(item); }, LP);  // 꾹 눌러 편집모드
      }
    });

    scope.addEventListener('pointermove', (e) => {
      if (pid == null) return;
      if (!dragEl) {
        const far = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (mode === 'mouse' && far > 6) {
          const item = e.target.closest(opts.item) || document.elementFromPoint(sx, sy);
          const it = item && item.closest ? item.closest(opts.item) : null;
          if (it) beginDrag(it, e.clientX, e.clientY);
        } else if (mode === 'touch' && pressTimer && far > 10) {   // 꾹 누르기 전에 움직이면 = 스크롤
          clearTimeout(pressTimer); pressTimer = null;
        }
        return;
      }
      e.preventDefault();
      reposition(e.clientX, e.clientY);
    });

    const finish = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (dragEl) {
        if (ph && ph.parentNode) { ph.parentNode.insertBefore(dragEl, ph); ph.parentNode.removeChild(ph); }
        ph = null;
        dragEl.classList.remove('ds-dragging');
        dragEl.style.width = dragEl.style.height = dragEl.style.left = dragEl.style.top = '';
        document.body.classList.remove('ds-nosel');
        try { scope.releasePointerCapture(pid); } catch (e) {}
        dragEl = null; justDragged = Date.now();
        opts.commit();     // DOM 순서 → 데이터 반영 + 저장 + 렌더
      }
      pid = null; mode = null;
    };
    scope.addEventListener('pointerup', finish);
    scope.addEventListener('pointercancel', finish);
    scope.addEventListener('touchmove', (e) => { if (dragEl) e.preventDefault(); }, { passive: false });   // 끌 때만 스크롤 잠금(빈 곳은 스크롤 허용)

    scope._dsBound = opts;
    scope._dsOpts = opts;
  }

  /* ---- 완료 버튼(모바일 편집모드) ---- */
  function showDone(opts) {
    if (document.getElementById('ds-done')) return;
    const b = document.createElement('button');
    b.id = 'ds-done'; b.type = 'button'; b.className = 'ds-done'; b.textContent = '✓ 완료';
    b.addEventListener('click', () => { editGroup = null; b.remove(); opts.rerender(); });
    document.body.appendChild(b);
  }
  function hideDone(group) {
    if (editGroup == null || editGroup !== group) {
      const b = document.getElementById('ds-done'); if (b && editGroup == null) b.remove();
    }
  }

  return { bind, isEditing, suppressClick };
})();
