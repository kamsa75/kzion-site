/* ============================================================
   PPT 생성기 (5단계 핵심 — ③)
   - 템플릿 순서(template.js) + 목사님 입력 + 곡을 조립해 슬라이드 목록 생성
   - 관리자: 이번 주 미리보기(HTML renderSlide 그리드) → PPTX 다운로드 (락 24)
   - 이미지 슬롯(썸네일·봉헌송·폐회송)은 자리표시 — 실제 업로드는 ④에서
   - 성경 긴 본문은 절 번호 경계 + 글자수로 자동 분할 (요청 ⑱)
   - 생성은 브라우저 PptxGenJS(CDN) — 락 2·D2·D18
   ============================================================ */

const Generate = (function () {
  const $ = (sel) => document.querySelector(sel);

  // 슬라이드 색 토큰 — ppt.css --sl-* 와 동일 (지침 16번)
  const C = { green: '70AD47', band: '000000', dark: '14181F', warm: 'F5F2EA', white: 'FFFFFF', gold: 'C9A66B' };
  const FONT = 'Pretendard';

  let items = [];   // [{ label, slide, missing }]
  let weekId = '';

  /* ---------- 데이터 정규화 (서버/목 양쪽 스키마 흡수) ---------- */
  function getRole(s) { return s.role; }
  function getBlocks(s) { return Array.isArray(s.blocks) ? s.blocks : ((s.blocks && s.blocks.blocks) || []); }
  function getOrder(s) { return s.order || s.ord || []; }

  // breaks 기준 2줄 슬라이드 묶기 (review.js blockSlides와 동일)
  function blockSlides(block) {
    const groups = [[0]];
    for (let i = 1; i < (block.lines || []).length; i++) {
      if (block.breaks && block.breaks[i - 1]) groups.push([i]);
      else groups[groups.length - 1].push(i);
    }
    return groups;
  }

  // 곡/찬송가 블록 → 밴드 슬라이드. order(부르는 순서) 있으면 그대로, 없으면 블록 순서
  function bandFromBlocks(blocks, order) {
    const seq = (order && order.length)
      ? order.map(id => blocks.find(b => b.id === id)).filter(Boolean)
      : blocks;
    const out = [];
    seq.forEach(b => blockSlides(b).forEach(g =>
      out.push({ layout: 'band', lyrics: g.map(i => (b.lines[i] || {}).text || '') })));
    return out;
  }

  /* ---------- 성경 긴 본문 자동 분할 (절 번호 경계 + 글자수) ---------- */
  const PASSAGE_CHARS = 200;  // 다크 슬라이드 1장 목표 글자수(프로젝터 실측 후 조정 — 체크리스트)
  const PASSAGE_MAXV = 5;     // 슬라이드당 최대 절 수

  function splitPassage(text, ref) {
    text = (text || '').trim();
    if (!text) return [];
    const verses = [];
    const re = /\[(\d+)\]\s*([^\[]*)/g;
    let m;
    while ((m = re.exec(text))) verses.push({ num: m[1], text: m[2].trim() });

    if (verses.length) {
      const pages = [];
      let cur = [], len = 0;
      for (const v of verses) {
        const vlen = v.text.length + 3;
        if (cur.length && (len + vlen > PASSAGE_CHARS || cur.length >= PASSAGE_MAXV)) { pages.push(cur); cur = []; len = 0; }
        cur.push(v); len += vlen;
      }
      if (cur.length) pages.push(cur);
      return pages.map(vs => ({ layout: 'dark', caption: ref, verses: vs }));
    }
    // 절 번호가 없으면 문장/글자수로 분할 (lookbehind 미사용 — 구형 사파리 대비)
    const sentences = text.match(/[^.!?。]+[.!?。]?/g) || [text];
    const pages = []; let cur = '';
    for (const p of sentences) {
      const t = p.trim(); if (!t) continue;
      if (cur && cur.length + t.length > PASSAGE_CHARS) { pages.push(cur.trim()); cur = ''; }
      cur += (cur ? ' ' : '') + t;
    }
    if (cur.trim()) pages.push(cur.trim());
    return pages.map(b => ({ layout: 'dark', caption: ref, body: b }));
  }

  /* ---------- 슬롯 → 슬라이드 확장 ---------- */
  function expandSlot(slot, ctx) {
    const p = ctx.pastor || {};
    switch (slot.source) {
      case 'thumbnail': {
        const src = (ctx.assets.thumbs || {})[ctx.sundayIndex];
        if (src) return [{ label: '날짜 썸네일 (' + ctx.sundayIndex + '번째 주일)', slide: { layout: 'image', src } }];
        return [{ label: '날짜 썸네일 (' + ctx.sundayIndex + '번째 주일)', slide: { layout: 'image', placeholder: '날짜 썸네일 ' + ctx.sundayIndex + '번 — 업로드 필요(관리자)' }, missing: true }];
      }

      case 'fixed':
        if (slot.type === 'green_blank') return [{ label: slot.title, slide: { layout: 'green_blank' } }];
        if (slot.type === 'dark') // 사도신경 등 고정 텍스트 (본문 미입력)
          return [{ label: slot.title, slide: { layout: 'dark', caption: slot.title, body: slot.placeholder || '' }, missing: true }];
        return [{ label: slot.title, slide: { layout: 'green', text: slot.title, sub: slot.sub || '' } }];

      case 'sermon': {
        const t = (p.title || '').trim(), r = (p.ref || '').trim();
        if (!t && !r) return [{ label: '설교 제목', slide: { layout: 'green', text: '설교 제목', sub: '' }, missing: true }];
        return [{ label: '설교 제목', slide: { layout: 'green', text: t || '(제목 미입력)', sub: r } }];
      }
      case 'prayer': {
        const pr = (p.prayer || '').trim();
        if (!pr) return [{ label: '기도', slide: { layout: 'green', text: '기도', sub: '' }, missing: true }];
        return [{ label: '기도', slide: { layout: 'green', text: '기도 : ' + pr } }]; // D13
      }
      case 'hymn': {
        const blocks = ((p.hymn || {}).blocks) || [];
        if (!blocks.length) return [{ label: '찬송가 가사', slide: { layout: 'band', lyrics: ['(찬송가 가사 미입력)'] }, missing: true }];
        return bandFromBlocks(blocks, null).map((sl, i) => ({ label: '찬송가 ' + (i + 1), slide: sl }));
      }
      case 'passage_long': {
        const out = [];
        (p.passages || []).forEach(pg => splitPassage(pg, p.ref).forEach(sl => out.push({ label: '성경 본문', slide: sl })));
        if (!out.length) return [{ label: '성경 본문', slide: { layout: 'dark', caption: p.ref || '', body: '(성경 본문 미입력)' }, missing: true }];
        return out;
      }
      case 'reading_short': {
        const arr = (p.readings || []).filter(x => (x || '').trim());
        return arr.map(r => ({ label: '함께 읽는 구절', slide: { layout: 'band', lyrics: r.trim().split('\n').filter(Boolean).slice(0, 2) } }));
      }
      case 'praise_songs': {
        const songs = ctx.songs.filter(s => getRole(s) === 'praise');
        const out = [];
        songs.forEach(s => bandFromBlocks(getBlocks(s), getOrder(s)).forEach(sl => out.push({ label: s.name || '찬양팀 곡', slide: sl })));
        if (!out.length) return [{ label: '찬양팀 곡 가사', slide: { layout: 'band', lyrics: ['(찬양팀 곡 없음)'] }, missing: true }];
        return out;
      }
      case 'choir_name': {
        // 곡명 + 가사를 곡마다 함께 처리(특송 등 다곡 대응). choir_songs 슬롯은 건너뜀
        const songs = ctx.songs.filter(s => getRole(s) === 'choir');
        if (!songs.length) return [{ label: '성가대 곡명', slide: { layout: 'green', text: '(성가대 곡 없음)', sub: '시온 성가대' }, missing: true }];
        const out = [];
        songs.forEach(s => {
          out.push({ label: '성가대 곡명', slide: { layout: 'green', text: s.name || '(곡명 미입력)', sub: '시온 성가대' }, missing: !s.name });
          bandFromBlocks(getBlocks(s), getOrder(s)).forEach(sl => out.push({ label: (s.name || '성가대 곡') + ' 가사', slide: sl }));
        });
        return out;
      }
      case 'choir_songs': return []; // choir_name에서 곡명+가사 함께 생성

      case 'offering_images': {
        const imgs = ctx.assets.offering || [];
        if (imgs.length) return imgs.map((src, i) => ({ label: '봉헌송 악보 ' + (i + 1), slide: { layout: 'score', src } }));
        return [{ label: '봉헌송 악보', slide: { layout: 'score', placeholder: '봉헌송 악보 — 업로드 필요(관리자)' }, missing: true }];
      }
      case 'closing_images': {
        const imgs = ctx.assets.closing || [];
        if (imgs.length) return imgs.map((src, i) => ({ label: '폐회송 악보 ' + (i + 1), slide: { layout: 'score', src } }));
        return [{ label: '폐회송 악보', slide: { layout: 'score', placeholder: '폐회송 악보 — 업로드 필요(관리자)' }, missing: true }];
      }
      case 'ending': {
        const src = ctx.assets.ending;
        if (src) return [{ label: '예배를 마쳤습니다', slide: { layout: 'image', src } }];
        return [{ label: '예배를 마쳤습니다', slide: { layout: 'image', placeholder: '마침 이미지 — 업로드 필요(관리자)' }, missing: true }];
      }
      default: return [];
    }
  }

  /* ---------- 이번 주 데이터 로드 ---------- */
  function thisSundayISO() {
    const now = new Date();
    const d = new Date(now); d.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    const mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  async function loadAssets() {
    // 실패해도 자리표시로 진행 (자산 미설정 상태에서도 미리보기 가능)
    try { await AssetStore.load(); return await AssetStore.dataUrlMap(); }
    catch (e) { return { thumbs: {}, offering: [], closing: [], ending: null }; }
  }

  async function loadCtx() {
    const assets = await loadAssets();
    if (CONFIG.USE_SERVER) {
      const w = await API.call('getWeek');
      return { weekId: w.weekId, pastor: (w.pastor && w.pastor.data) || {}, songs: w.songs || [], assets };
    }
    let pastor = {}, praise = [], choir = [];
    try { pastor = JSON.parse(localStorage.getItem('kzppt_pastor') || '{}'); } catch (e) {}
    try { praise = JSON.parse(localStorage.getItem('kzppt_songs_praise') || '[]'); } catch (e) {}
    try { choir = JSON.parse(localStorage.getItem('kzppt_songs_choir') || '[]'); } catch (e) {}
    const songs = praise.map(s => Object.assign({ role: 'praise' }, s)).concat(choir.map(s => Object.assign({ role: 'choir' }, s)));
    return { weekId: thisSundayISO(), pastor, songs, assets };
  }

  function build(ctx) {
    ctx.assets = ctx.assets || { thumbs: {}, offering: [], closing: [], ending: null };
    ctx.sundayIndex = Template.sundayIndexOfYear(ctx.weekId);
    const out = [];
    Template.slots().forEach(slot => expandSlot(slot, ctx).forEach(it => out.push(it)));
    return out;
  }

  /* ---------- 미리보기 렌더 (HTML renderSlide 재사용) ---------- */
  function renderPreview() {
    const warnBox = $('#gen-warn');
    warnBox.innerHTML = '';
    const missing = items.filter(i => i.missing);
    if (missing.length) {
      const b = document.createElement('div');
      b.className = 'gen-warnbox';
      const labels = [...new Set(missing.map(i => i.label.replace(/\s*\(.*\)/, '')))];
      b.innerHTML = '<strong>아직 채워지지 않은 부분:</strong> ' + labels.join(' · ') +
        '<br><span class="gen-warn-sub">회색 자리표시 슬라이드입니다. 이미지 업로드·미입력 항목은 채운 뒤 다시 생성하세요.</span>';
      warnBox.appendChild(b);
    }

    $('#gen-count').textContent = '총 ' + items.length + '장 · ' + weekId + ' 주일예배';

    const list = $('#gen-list');
    list.innerHTML = '';
    items.forEach((it, i) => {
      const item = document.createElement('div');
      item.className = 'preview-item' + (it.missing ? ' gen-missing' : '');
      const label = document.createElement('div');
      label.className = 'pv-label';
      label.textContent = (i + 1) + '. ' + it.label;
      item.appendChild(label);
      item.appendChild(renderSlide(it.slide));
      list.appendChild(item);
    });
  }

  /* ---------- PPTX 생성 (PptxGenJS) ---------- */
  function addSlide(pptx, sl) {
    const s = pptx.addSlide();
    switch (sl.layout) {
      case 'green': {
        s.background = { color: C.green };
        if (sl.text) s.addText(sl.text, { x: 0.5, y: sl.sub ? 3.9 : 4.3, w: 12.33, h: 2.0, align: 'center', valign: 'bottom', fontFace: FONT, fontSize: 44, bold: true, color: C.white, shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 3, offset: 2, angle: 90 } });
        if (sl.sub) s.addText(sl.sub, { x: 0.5, y: 6.35, w: 12.33, h: 0.7, align: 'center', valign: 'top', fontFace: FONT, fontSize: 24, bold: true, color: C.white, shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 3, offset: 2, angle: 90 } });
        break;
      }
      case 'green_blank':
        s.background = { color: C.green }; // 순수 그린 — 라이브/전환 (D20)
        break;
      case 'band': {
        s.background = { color: C.green };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.0, w: 13.33, h: 1.5, fill: { color: C.band } });
        s.addText((sl.lyrics || []).join('\n'), { x: 0.5, y: 6.0, w: 12.33, h: 1.5, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 30, bold: true, color: C.white, lineSpacingMultiple: 1.15 });
        break;
      }
      case 'dark': {
        s.background = { color: C.dark };
        if (sl.caption) s.addText(sl.caption, { x: 0.8, y: 0.45, w: 11.73, h: 0.7, fontFace: FONT, fontSize: 22, bold: true, color: C.gold, charSpacing: 2 });
        let body;
        if (sl.verses) {
          body = [];
          sl.verses.forEach((v, i) => {
            body.push({ text: v.num + ' ', options: { color: C.gold, fontSize: 22, bold: true } });
            body.push({ text: v.text + (i < sl.verses.length - 1 ? '   ' : ''), options: { color: C.warm } });
          });
        } else body = [{ text: sl.body || '', options: { color: C.warm } }];
        s.addText(body, { x: 0.8, y: 1.3, w: 11.73, h: 5.7, align: 'left', valign: 'top', fontFace: FONT, fontSize: 30, bold: true, color: C.warm, lineSpacingMultiple: 1.5 });
        break;
      }
      case 'score': {
        s.background = { color: C.white };
        // 악보는 잘리면 안 됨 → contain(비율 유지, 중앙) (지침 14번)
        if (sl.src) s.addImage({ data: sl.src, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'contain', w: 13.33, h: 7.5 } });
        else s.addText(sl.placeholder || '악보 이미지', { x: 1, y: 3, w: 11.33, h: 1.5, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 24, color: '888888' });
        break;
      }
      case 'image': {
        s.background = { color: C.dark };
        // 타이틀·마침은 전체 채움(cover)
        if (sl.src) s.addImage({ data: sl.src, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'cover', w: 13.33, h: 7.5 } });
        else s.addText(sl.placeholder || '이미지', { x: 1, y: 3, w: 11.33, h: 1.5, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 24, color: '8A8F98' });
        break;
      }
    }
  }

  function buildPptx(list) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in (16:9)
    list.forEach(it => addSlide(pptx, it.slide));
    return pptx;
  }

  async function download() {
    if (typeof PptxGenJS === 'undefined') { alert('PPTX 라이브러리를 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.'); return; }
    const btn = $('#btn-gen-download');
    btn.disabled = true; const orig = btn.textContent; btn.textContent = '생성 중…';
    try {
      await buildPptx(items).writeFile({ fileName: '주일예배_' + weekId + '.pptx' });
    } catch (e) {
      alert('PPTX 생성 중 문제가 생겼습니다: ' + (e.message || ''));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  /* ---------- 진입 ---------- */
  async function open() {
    const list = $('#gen-list');
    list.innerHTML = '<p class="review-tip">이번 주 데이터를 불러오는 중…</p>';
    KZ.show('generate');
    let ctx;
    try { ctx = await loadCtx(); }
    catch (e) { alert('데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.'); KZ.show('home'); return; }
    weekId = ctx.weekId;
    items = build(ctx);
    renderPreview();
  }

  function init() {
    $('#btn-gen-back').addEventListener('click', () => KZ.show('home'));
    $('#btn-gen-download').addEventListener('click', download);
  }

  return { init, open, build, buildPptx };
})();
