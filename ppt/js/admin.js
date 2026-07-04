/* ============================================================
   관리자 자산 관리 (④-a) — 날짜 썸네일·봉헌송·폐회송·마침 이미지
   - 썸네일: 파일명 끝 번호 = 그 해 N번째 주일로 자동 매핑 (D21)
   - 봉헌송·폐회송: 이미지 세트(순서 有), 마침: 단일 이미지 (D22)
   - 저장: Supabase(Edge Function assets*) / 목 모드는 localStorage
   - 생성기(③)가 AssetStore.dataUrlMap()으로 실제 이미지를 PPT에 삽입
   ============================================================ */

const AssetStore = (function () {
  // srcs[key] = [표시용 src]  (목=dataURL / 서버=서명URL)
  // paths[key] = [storage 경로] (서버 저장용)
  let srcs = {}, paths = {};
  const MOCK_KEY = 'kzppt_assets';

  async function load() {
    srcs = {}; paths = {};
    if (CONFIG.USE_SERVER) {
      const r = await API.call('getAssets');
      (r.assets || []).forEach(a => {
        paths[a.key] = a.paths || [];
        srcs[a.key] = (a.paths || []).map(p => (r.urls || {})[p]).filter(Boolean);
      });
    } else {
      let m = {};
      try { m = JSON.parse(localStorage.getItem(MOCK_KEY) || '{}'); } catch (e) {}
      Object.keys(m).forEach(k => { srcs[k] = m[k]; paths[k] = m[k]; });
    }
  }

  function persistMock() {
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(srcs)); } catch (e) {}
  }

  // dataUrls 배열을 key에 저장(replace). kind = 스토리지 하위 폴더명
  async function set(key, dataUrls, kind) {
    if (CONFIG.USE_SERVER) {
      const newPaths = [];
      for (const d of dataUrls) {
        const u = await API.call('assetUploadUrl', { kind });
        const blob = await (await fetch(d)).blob();
        const put = await fetch(u.url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
        if (!put.ok) throw new Error('업로드 실패');
        newPaths.push(u.path);
      }
      paths[key] = newPaths;
      srcs[key] = dataUrls.slice();
      await API.call('saveAsset', { key, paths: newPaths });
    } else {
      srcs[key] = dataUrls.slice(); paths[key] = dataUrls.slice(); persistMock();
    }
  }

  async function remove(key) {
    delete srcs[key]; delete paths[key];
    if (CONFIG.USE_SERVER) { await API.call('saveAsset', { key, paths: [] }); }
    else persistMock();
  }

  function srcList(key) { return srcs[key] || []; }
  function keys() { return Object.keys(srcs).filter(k => (srcs[k] || []).length); }

  // 서명URL/ dataURL → dataURL (PPT 삽입용)
  function fetchDataUrl(src) {
    return fetch(src).then(r => r.blob()).then(b => new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
    }));
  }

  // 생성기(③)용: { thumbs:{N:dataURL}, offering:[dataURL], closing:[dataURL], ending:dataURL }
  async function dataUrlMap() {
    const out = { thumbs: {}, offering: [], closing: [], ending: null };
    for (const key of Object.keys(srcs)) {
      const arr = srcs[key] || [];
      if (!arr.length) continue;
      const dataUrls = CONFIG.USE_SERVER ? await Promise.all(arr.map(fetchDataUrl)) : arr;
      if (key.indexOf('thumb:') === 0) out.thumbs[key.slice(6)] = dataUrls[0];
      else if (key === 'offering') out.offering = dataUrls;
      else if (key === 'closing') out.closing = dataUrls;
      else if (key === 'ending') out.ending = dataUrls[0];
    }
    return out;
  }

  return { load, set, remove, srcList, keys, dataUrlMap };
})();

const Admin = (function () {
  const $ = (sel) => document.querySelector(sel);
  let pending = null; // 업로드 대기 컨텍스트 { kind, mode:'thumbs'|'set'|'single', key? }

  // 파일명 끝 번호 파싱: "시애틀시온장로교회 - 27.jpg" → 27
  function parseNum(name) {
    const base = name.replace(/\.[^.]+$/, '');
    const m = base.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
  }

  /* ---------- 렌더 ---------- */
  function render() {
    renderThumbs();
    renderSet('offering', '#adm-offering');
    renderSet('closing', '#adm-closing');
    renderSingle('ending', '#adm-ending');
  }

  // 이번 주(다가오는 일요일)의 연도·주 번호
  function thisSundayInfo() {
    const now = new Date(), d = new Date(now);
    d.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { year: d.getFullYear(), n: Template.sundayIndexOfYear(iso) };
  }

  // 커버리지 그리드: 올해 주일을 고정 슬롯으로 — 채워짐/빈칸/빠진 주가 한눈에 (#2)
  function renderThumbs() {
    const box = $('#adm-thumbs');
    box.innerHTML = '';
    const { year, n: curN } = thisSundayInfo();
    const uploaded = AssetStore.keys().filter(k => k.indexOf('thumb:') === 0).map(k => parseInt(k.slice(6), 10));
    const endN = Template.sundaysInYear(year);
    let startN = Math.min(curN, uploaded.length ? Math.min.apply(null, uploaded) : curN);
    if (startN < 1) startN = 1;

    const range = [];
    for (let n = startN; n <= endN; n++) range.push(n);
    const missing = range.filter(n => uploaded.indexOf(n) < 0);

    const sum = document.createElement('div');
    sum.className = 'adm-summary';
    sum.innerHTML = uploaded.length
      ? ('올해 ' + startN + '~' + endN + '주 중 <b>' + (range.length - missing.length) + '개 완료</b>'
        + (missing.length ? ' · 빠진 주: <span class="adm-miss">' + missing.map(n => n + '주').join(', ') + '</span>' : ' · 모두 채워짐 ✓'))
      : '아직 업로드된 썸네일이 없습니다. 파일명 끝 번호(예: … - 27)로 자동 매핑됩니다.';
    box.appendChild(sum);

    const grid = document.createElement('div');
    grid.className = 'adm-cover';
    range.forEach(n => {
      const src = AssetStore.srcList('thumb:' + n)[0];
      const cell = document.createElement('div');
      cell.className = 'cover-cell' + (src ? '' : ' empty') + (n < curN ? ' past' : '');
      if (src) {
        const img = document.createElement('img'); img.src = src; img.alt = n + '주';
        const del = document.createElement('button');
        del.className = 'thumb-del'; del.textContent = '✕';
        del.addEventListener('click', async () => {
          if (!confirm(n + '주(' + Template.sundayDate(year, n) + ') 썸네일을 삭제할까요?')) return;
          await AssetStore.remove('thumb:' + n); render();
        });
        cell.append(img, del);
      } else {
        const e = document.createElement('div'); e.className = 'cover-empty'; e.textContent = '비어있음';
        cell.appendChild(e);
      }
      const cap = document.createElement('div');
      cap.className = 'cover-cap';
      cap.textContent = n + '주 · ' + Template.sundayDate(year, n).slice(5);
      cell.appendChild(cap);
      grid.appendChild(cell);
    });
    box.appendChild(grid);
  }

  function renderSet(key, sel) {
    const box = $(sel);
    box.innerHTML = '';
    const list = AssetStore.srcList(key);
    list.forEach((src, i) => {
      const cell = document.createElement('div');
      cell.className = 'adm-cell';
      const img = document.createElement('img'); img.src = src; img.alt = (i + 1) + '장';
      const num = document.createElement('span'); num.className = 'page-num'; num.textContent = i + 1;
      const del = document.createElement('button');
      del.className = 'thumb-del'; del.textContent = '✕';
      del.addEventListener('click', async () => {
        const dataUrls = await currentDataUrls(key);
        dataUrls.splice(i, 1);
        await AssetStore.set(key, dataUrls, key); render();
      });
      cell.append(img, num, del);
      box.appendChild(cell);
    });
  }

  function renderSingle(key, sel) {
    const box = $(sel);
    box.innerHTML = '';
    const src = AssetStore.srcList(key)[0];
    if (!src) { const p = document.createElement('p'); p.className = 'adm-empty'; p.textContent = '없음'; box.appendChild(p); return; }
    const cell = document.createElement('div');
    cell.className = 'adm-cell adm-cell-wide';
    const img = document.createElement('img'); img.src = src; img.alt = '마침 이미지';
    const del = document.createElement('button');
    del.className = 'thumb-del'; del.textContent = '✕';
    del.addEventListener('click', async () => { await AssetStore.remove(key); render(); });
    cell.append(img, del);
    box.appendChild(cell);
  }

  // 세트(봉헌송/폐회송)에 이미지를 이어붙이려면 기존 dataURL이 필요 → 서버는 다시 받아옴
  async function currentDataUrls(key) {
    const arr = AssetStore.srcList(key);
    if (!CONFIG.USE_SERVER) return arr.slice();
    return await Promise.all(arr.map(s => fetch(s).then(r => r.blob()).then(b => new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
    }))));
  }

  /* ---------- 업로드 처리 ---------- */
  async function onFiles(fileList) {
    const files = [...fileList];
    const ctx = pending; pending = null;
    if (!files.length || !ctx) return;
    setBusy(true);
    try {
      if (ctx.mode === 'thumbs') {
        // 한 장씩 즉시 반영 + 진행 표시 + 한 장 실패해도 계속 (#1)
        const unmatched = [], failed = [];
        let done = 0;
        for (const f of files) {
          const n = parseNum(f.name);
          if (n == null || n < 1 || n > 60) { unmatched.push(f.name); continue; }
          try {
            const r = await Songs.resizeImage(f);
            await AssetStore.set('thumb:' + n, [r.dataUrl], 'thumb');
          } catch (e) { failed.push(f.name); }
          done++; setBusy(true, done + ' / ' + files.length); render();
        }
        if (unmatched.length || failed.length) {
          let msg = '';
          if (unmatched.length) msg += '파일명에서 주일 번호를 못 찾아 건너뜀:\n' + unmatched.join('\n') + '\n(파일명 끝이 "… - 27.jpg"처럼 번호로 끝나야 합니다)\n\n';
          if (failed.length) msg += '업로드 실패(다시 시도해 주세요):\n' + failed.join('\n');
          alert(msg);
        }
      } else if (ctx.mode === 'set') {
        const existing = await currentDataUrls(ctx.key);
        const added = [];
        let done = 0;
        for (const f of files) { added.push((await Songs.resizeImage(f)).dataUrl); done++; setBusy(true, done + ' / ' + files.length); }
        await AssetStore.set(ctx.key, existing.concat(added), ctx.key);
        render();
      } else { // single
        const r = await Songs.resizeImage(files[0]);
        await AssetStore.set(ctx.key, [r.dataUrl], ctx.key);
        render();
      }
    } catch (e) {
      alert('이미지 저장 중 문제가 생겼습니다: ' + (e.message || ''));
    } finally { setBusy(false); }
  }

  function setBusy(b, txt) {
    const note = $('#adm-busy');
    if (note) note.textContent = b ? ('올리는 중… ' + (txt || '')) : '';
  }

  function pick(ctx) {
    pending = ctx;
    const f = $('#adm-file');
    f.multiple = (ctx.mode !== 'single');
    f.value = '';
    f.click();
  }

  /* ---------- 진입 ---------- */
  async function open() {
    KZ.show('admin');
    $('#adm-thumbs').innerHTML = '<p class="adm-empty">불러오는 중…</p>';
    try { await AssetStore.load(); }
    catch (e) { alert('자산을 불러오지 못했습니다. 네트워크를 확인해 주세요.'); KZ.show('home'); return; }
    render();
  }

  function init() {
    $('#btn-adm-back').addEventListener('click', () => KZ.show('home'));
    $('#adm-file').addEventListener('change', e => onFiles(e.target.files));
    $('#btn-adm-thumbs').addEventListener('click', () => pick({ mode: 'thumbs' }));
    $('#btn-adm-offering').addEventListener('click', () => pick({ mode: 'set', key: 'offering' }));
    $('#btn-adm-closing').addEventListener('click', () => pick({ mode: 'set', key: 'closing' }));
    $('#btn-adm-ending').addEventListener('click', () => pick({ mode: 'single', key: 'ending' }));
  }

  return { init, open };
})();
