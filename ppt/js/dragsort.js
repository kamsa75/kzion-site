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

    const reposition = (x, y) => {
      let cont = (document.elementFromPoint(x, y) || {}).closest
        ? document.elementFromPoint(x, y).closest(opts.container) : null;
      if (!cont || !scope.contains(cont)) cont = nearestContainer(x, y);
      if (!cont) return;
      const items = list(opts.item, cont).filter(el => el !== dragEl);
      let ref = null;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        if (y < r.top - 2) { ref = el; break; }                                   // 위쪽 행
        if (y <= r.bottom + 2 && x < r.left + r.width / 2) { ref = el; break; }    // 같은 행 왼쪽
      }
      if (ref !== dragEl) cont.insertBefore(dragEl, ref);
    };

    const beginDrag = (item) => {
      dragEl = item;
      item.classList.add('ds-dragging');
      document.body.classList.add('ds-nosel');
      try { item.setPointerCapture(pid); } catch (e) {}
      if (navigator.vibrate) navigator.vibrate(8);
    };

    // 꾹 누른 그 손가락으로 바로 드래그(재렌더 없이 현재 DOM에 흔들+완료 적용 → 터치 안 끊김)
    const enterEditAndDrag = (item) => {
      editGroup = opts.group;
      scope.classList.add('ds-editing');
      showDone(opts);
      if (navigator.vibrate) navigator.vibrate(12);
      beginDrag(item);
    };

    scope.addEventListener('pointerdown', (e) => {
      const item = e.target.closest(opts.item);
      if (!item || !scope.contains(item)) return;
      if (opts.ignore && e.target.closest(opts.ignore)) return;   // 버튼 등에선 드래그 시작 안 함
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      if (e.pointerType === 'mouse') { mode = 'mouse'; }           // 데스크탑: 이동하면 바로 드래그
      else {
        mode = 'touch';
        if (isEditing(opts.group)) beginDrag(item);                // 이미 편집모드 → 바로 잡힘
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
          if (it) beginDrag(it);
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
        dragEl.classList.remove('ds-dragging');
        document.body.classList.remove('ds-nosel');
        try { dragEl.releasePointerCapture(pid); } catch (e) {}
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
