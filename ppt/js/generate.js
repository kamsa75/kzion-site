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

  let items = [];   // [{ label, slide, missing, phase }]
  let weekId = '';

  // 슬롯 → 예배 순서 단계 (미리보기 그룹핑용, D). 슬롯 id 기준
  const PHASE = {
    thumbnail: '여는 순서', call: '여는 순서', creed: '여는 순서', 'praise-all': '여는 순서',
    'live-1': '여는 순서', 'praise-songs': '여는 순서', 'live-2': '여는 순서', 'pray-together': '여는 순서',
    hymn: '찬양과 기도', prayer: '찬양과 기도', 'choir-name': '찬양과 기도', 'choir-songs': '찬양과 기도',
    'live-3': '찬양과 기도', offering: '찬양과 기도', 'offering-img': '찬양과 기도', 'live-4': '찬양과 기도',
    news: '말씀', sermon: '말씀', passage: '말씀', reading: '말씀',
    'live-5': '마침', 'closing-img': '마침', benediction: '마침', ending: '마침'
  };

  /* ---------- 데이터 정규화 (서버/목 양쪽 스키마 흡수) ---------- */
  function getRole(s) { return s.role; }
  function getBlocks(s) { return Array.isArray(s.blocks) ? s.blocks : ((s.blocks && s.blocks.blocks) || []); }
  function getOrder(s) { return s.order || s.ord || []; }

  // breaks 기준 2줄 슬라이드 묶기 (review.js blockSlides와 동일)
  // breaks로 1차 묶고, 밴드=2줄이라 3줄+는 2줄씩 자동 분할 (가사 유실·밴드 넘침 방지, 2026-07-06)
  function blockSlides(block) {
    const n = (block.lines || []).length;
    if (!n) return [];
    const breaks = block.breaks || [];
    const raw = [[0]];
    for (let i = 1; i < n; i++) {
      if (breaks[i - 1]) raw.push([i]);
      else raw[raw.length - 1].push(i);
    }
    const out = [];
    raw.forEach(g => { for (let i = 0; i < g.length; i += 2) out.push(g.slice(i, i + 2)); });
    return out;
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

  // 세트/콘티 편곡(arrange) → 밴드 슬라이드 (D28: 세트 화면이 PPT 순서의 원천)
  // ×N 규칙(D29): 1페이지 블록=1장(자막에 "(×N)" 표기·홀드) / 여러 페이지 블록=페이지 복제
  function bandFromArrange(song) {
    const blocks = getBlocks(song);
    const byId = {}; blocks.forEach(b => { byId[b.id] = b; });
    const out = [];
    (song.arrange || []).forEach(pass => (pass.items || []).forEach(it => {
      if (it.gap || it.memo != null) return;         // 간주·메모는 PPT 슬라이드 없음
      const b = byId[it.block]; if (!b) return;
      const times = it.times || 1;
      const pages = blockSlides(b).map(g => g.map(i => (b.lines[i] || {}).text || ''));
      if (pages.length <= 1) {
        const lyr = (pages[0] || []).slice();
        if (times > 1 && lyr.length) lyr[lyr.length - 1] = lyr[lyr.length - 1] + ' (×' + times + ')';
        out.push({ layout: 'band', lyrics: lyr });
      } else {
        for (let r = 0; r < times; r++) pages.forEach(p => out.push({ layout: 'band', lyrics: p }));
      }
    }));
    return out;
  }

  function songBandSlides(s) {
    return (Array.isArray(s.arrange) && s.arrange.length)
      ? bandFromArrange(s)                                  // 세트 화면 편곡 우선 (D28)
      : bandFromBlocks(getBlocks(s), getOrder(s));          // 폴백: 옛 부르는 순서/블록
  }

  /* ---------- 성경 긴 본문 자동 분할 — preview.js passagePages()와 단일 소스(잘림 방지·미리보기=PPT) ---------- */
  function splitPassage(text, ref) {
    return (typeof passagePages === 'function') ? passagePages(text, ref) : [];
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

      case 'fixed': {
        if (slot.type === 'green_blank') return [{ label: slot.title, slide: { layout: 'green_blank' } }];
        if (slot.type === 'dark') { // 사도신경 등 고정 텍스트 — settings.creed_text (B)
          const body = slot.id === 'creed' ? (ctx.settings.creed_text || '').trim() : '';
          if (!body) return [{ label: slot.title, slide: { layout: 'dark', caption: slot.title, body: slot.placeholder || '' }, missing: true }];
          // 줄바꿈 그대로 유지 + 한 페이지 맞춤(fit) + 대시 캡션(dash) — 사도신경
          return [{ label: slot.title, slide: { layout: 'dark', caption: slot.title, body: body, fit: true, dash: true } }];
        }
        // 다함께 찬양 부제(곡명) = settings.praise_all_sub (B)
        const sub = slot.id === 'praise-all' ? (ctx.settings.praise_all_sub || '') : (slot.sub || '');
        return [{ label: slot.title, slide: { layout: 'green', text: slot.title, sub } }];
      }

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
        const title = ((p.hymn || {}).title || '').trim();
        const out = [];
        if (title) out.push({ label: '찬송가 제목', slide: { layout: 'green', text: title } }); // 예: 438장 내 영혼이 은총 입어
        if (!blocks.length) {
          if (out.length) return out; // 제목만 있고 가사 없음
          return [{ label: '찬송가 가사', slide: { layout: 'band', lyrics: ['(찬송가 가사 미입력)'] }, missing: true }];
        }
        bandFromBlocks(blocks, null).forEach((sl, i) => out.push({ label: '찬송가 ' + (i + 1), slide: sl }));
        return out;
      }
      case 'passage_long': {
        const out = [];
        (p.passages || []).forEach(pg => splitPassage(pg, p.ref).forEach(sl => out.push({ label: '성경 본문', slide: sl })));
        if (!out.length) return [{ label: '성경 본문', slide: { layout: 'dark', caption: p.ref || '', body: '(성경 본문 미입력)' }, missing: true }];
        return out;
      }
      case 'reading_short': {
        const arr = (p.readings || []).filter(x => (x || '').trim());
        const out = [];
        arr.forEach(r => (typeof bandPages === 'function' ? bandPages(r) : []).forEach(sl => out.push({ label: '함께 읽는 구절', slide: sl })));
        return out;
      }
      case 'praise_songs': {
        const songs = ctx.songs.filter(s => getRole(s) === 'praise');
        const out = [];
        songs.forEach(s => songBandSlides(s).forEach(sl => out.push({ label: s.name || '찬양팀 곡', slide: sl })));
        if (!out.length) return [{ label: '찬양팀 곡 가사', slide: { layout: 'band', lyrics: ['(찬양팀 곡 없음)'] }, missing: true }];
        return out;
      }
      case 'choir_name': {
        // 곡명 + 가사를 곡마다 함께 처리(특송 등 다곡 대응). choir_songs 슬롯은 건너뜀
        const songs = ctx.songs.filter(s => getRole(s) === 'choir');
        if (!songs.length) return [{ label: '성가대 곡명', slide: { layout: 'green', text: '(성가대 곡 없음)' }, missing: true }];
        const out = [];
        songs.forEach(s => {
          out.push({ label: '성가대 곡명', slide: { layout: 'green', text: s.name || '(곡명 미입력)' }, missing: !s.name });
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

  async function loadSettings() {
    try { await SettingsStore.load(); return { creed_text: SettingsStore.get('creed_text'), praise_all_sub: SettingsStore.get('praise_all_sub') }; }
    catch (e) { return {}; }
  }

  async function loadCtx() {
    const assets = await loadAssets();
    const settings = await loadSettings();
    if (CONFIG.USE_SERVER) {
      const w = await API.call('getWeek');
      return { weekId: w.weekId, pastor: (w.pastor && w.pastor.data) || {}, songs: w.songs || [], assets, settings };
    }
    let pastor = {}, praise = [], choir = [];
    try { pastor = JSON.parse(localStorage.getItem('kzppt_pastor') || '{}'); } catch (e) {}
    try { praise = JSON.parse(localStorage.getItem('kzppt_songs_praise') || '[]'); } catch (e) {}
    try { choir = JSON.parse(localStorage.getItem('kzppt_songs_choir') || '[]'); } catch (e) {}
    const songs = praise.map(s => Object.assign({ role: 'praise' }, s)).concat(choir.map(s => Object.assign({ role: 'choir' }, s)));
    return { weekId: thisSundayISO(), pastor, songs, assets, settings };
  }

  function build(ctx) {
    ctx.assets = ctx.assets || { thumbs: {}, offering: [], closing: [], ending: null };
    ctx.settings = ctx.settings || {};
    ctx.sundayIndex = Template.sundayIndexOfYear(ctx.weekId);
    const out = [];
    Template.slots().forEach(slot => expandSlot(slot, ctx).forEach(it => { it.phase = PHASE[slot.id] || '그 외'; out.push(it); }));
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

    // 순서대로 이어지는 같은 단계끼리 묶기 (D)
    const groups = [];
    let cur = null;
    items.forEach((it, idx) => {
      it._idx = idx;
      if (!cur || cur.phase !== it.phase) { cur = { phase: it.phase || '그 외', items: [] }; groups.push(cur); }
      cur.items.push(it);
    });

    groups.forEach(g => {
      const sec = document.createElement('section');
      sec.className = 'gen-phase';
      const miss = g.items.filter(i => i.missing).length;
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'gen-phase-head';
      head.innerHTML = '<span class="gp-fold">▾</span><span class="gp-name">' + g.phase + '</span>'
        + '<span class="gp-meta">' + g.items.length + '장'
        + (miss ? ' · <span class="gp-miss">채울 것 ' + miss + '</span>' : ' <span class="gp-ok">준비됨 ✓</span>') + '</span>';
      const grid = document.createElement('div');
      grid.className = 'gen-grid';
      g.items.forEach(it => {
        const cell = document.createElement('div');
        cell.className = 'gen-cell' + (it.missing ? ' gen-missing' : '');
        const label = document.createElement('div');
        label.className = 'gen-cell-label';
        label.textContent = (it._idx + 1) + '. ' + it.label;
        cell.appendChild(label);
        cell.appendChild(renderSlide(it.slide));
        cell.addEventListener('click', () => openLightbox(it._idx));
        grid.appendChild(cell);
      });
      head.addEventListener('click', () => sec.classList.toggle('folded'));
      sec.append(head, grid);
      list.appendChild(sec);
    });
    requestAnimationFrame(() => fitDarkSlides(list)); // 사도신경 등 한 페이지 맞춤
  }

  // 클릭한 슬라이드를 크게 보기 + 좌우 이동 (D)
  function openLightbox(startIdx) {
    let idx = startIdx;
    const ov = document.createElement('div');
    ov.className = 'gen-lightbox';
    const inner = document.createElement('div');
    inner.className = 'glb-inner';
    const cap = document.createElement('div'); cap.className = 'glb-cap';
    const slideWrap = document.createElement('div'); slideWrap.className = 'glb-slide';
    const prev = document.createElement('button'); prev.className = 'glb-nav glb-prev'; prev.textContent = '‹';
    const next = document.createElement('button'); next.className = 'glb-nav glb-next'; next.textContent = '›';
    const close = document.createElement('button'); close.className = 'glb-close'; close.textContent = '✕';

    function show(i) {
      idx = (i + items.length) % items.length;
      cap.textContent = (idx + 1) + ' / ' + items.length + ' · ' + items[idx].label;
      slideWrap.innerHTML = '';
      slideWrap.appendChild(renderSlide(items[idx].slide));
      requestAnimationFrame(() => fitDarkSlides(slideWrap));
    }
    function destroy() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) {
      if (e.key === 'Escape') destroy();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
    }
    prev.addEventListener('click', e => { e.stopPropagation(); show(idx - 1); });
    next.addEventListener('click', e => { e.stopPropagation(); show(idx + 1); });
    close.addEventListener('click', destroy);
    ov.addEventListener('click', destroy);
    inner.addEventListener('click', e => e.stopPropagation());
    inner.append(close, cap, slideWrap, prev, next);
    ov.appendChild(inner);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
    show(idx);
  }

  /* ---------- 다크 배경 (PptxGenJS는 배경 그레이디언트 미지원 → 이미지로).
       preview.js의 darkSlideBg()와 '동일 이미지'를 공유 → 미리보기 = PPT 보장 ---------- */
  function darkBg() { return (typeof darkSlideBg === 'function') ? darkSlideBg() : ''; }

  /* ---------- 성경 구절 카드 (미리보기 .vcard와 동일 디자인) ----------
     흰 라운드 카드 + 블루 구절칩(짧은 알약, 절반 걸침) + 골드 절번호 + 진한 글씨.
     배경 그린 = 라이브 영상(키잉). full=true면 화면 거의 가득(긴 본문), false면 하단 카드(짧은 구절). */
  const CARD = { ink: '17233F', num: 'B0801F', chip: '1E3A6B' };
  function emWidth(str) { // 대략 글자 폭(em) — 칩 알약 폭 추정용(한글=1.0, 공백=0.35, 그 외≈0.55)
    var w = 0; for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); w += (c >= 0xAC00 && c <= 0xD7A3) ? 1.0 : (c === 0x20 ? 0.35 : 0.55); } return w;
  }
  function addVerseCard(pptx, s, ref, runs, full) {
    s.background = { color: C.green };
    const X = 0.53, W = 12.27;
    const cardY = full ? 0.72 : 5.0, cardH = full ? 6.33 : 2.05;
    // 흰 카드 + 그림자
    s.addShape(pptx.ShapeType.roundRect, { x: X, y: cardY, w: W, h: cardH, rectRadius: 0.16, fill: { color: 'FFFFFF' }, line: { type: 'none' }, shadow: { type: 'outer', color: '000000', opacity: 0.30, blur: 9, offset: 5, angle: 90 } });
    // 본문(칩 아래 여백 확보)
    const padTop = full ? 0.62 : 0.5, padX = 0.42, padBot = full ? 0.5 : 0.3;
    s.addText(runs, { x: X + padX, y: cardY + padTop, w: W - padX * 2, h: cardH - padTop - padBot, align: 'left', valign: 'top', fontFace: FONT, fontSize: full ? 30 : 27, bold: true, color: CARD.ink, lineSpacingMultiple: 1.5, fit: 'shrink' });
    // 구절칩(파란 알약, 카드 윗선에 절반 걸침)
    if (ref) {
      const chipFs = 22, chipH = 0.52, chipW = emWidth(ref) * chipFs / 72 + 0.42;
      const chipX = X + 0.32, chipY = cardY - 0.26;
      s.addShape(pptx.ShapeType.roundRect, { x: chipX, y: chipY, w: chipW, h: chipH, rectRadius: 0.26, fill: { color: CARD.chip }, line: { type: 'none' }, shadow: { type: 'outer', color: '000000', opacity: 0.25, blur: 4, offset: 2, angle: 90 } });
      s.addText(ref, { x: chipX, y: chipY, w: chipW, h: chipH, align: 'center', valign: 'middle', fontFace: FONT, fontSize: chipFs, bold: true, color: 'FFFFFF' });
    }
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
        if (sl.scripture) { // 함께 읽는 구절 = 하단 흰 카드(자연 줄바꿈으로 폭 채움)
          const chunk = sl.text || (sl.lyrics || []).join(' ');
          const runs = (typeof scriptureRuns === 'function' ? scriptureRuns(chunk) : [{ t: chunk, gold: false }])
            .map(r => ({ text: r.t, options: { color: r.gold ? CARD.num : CARD.ink } }));
          addVerseCard(pptx, s, sl.ref, runs, false);
          break;
        }
        // 찬송가 등 = 기존 크로마 밴드(초록 + 검정 밴드 + 흰 가사)
        s.background = { color: C.green };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.0, w: 13.33, h: 1.5, fill: { color: C.band } });
        s.addText((sl.lyrics || []).join('\n'), { x: 0.5, y: 6.0, w: 12.33, h: 1.5, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 30, bold: true, color: C.white, lineSpacingMultiple: 1.15, fit: 'shrink' });
        break;
      }
      case 'dark': {
        if (sl.fit && !sl.dash) { // 성경 긴 본문 = 큰 흰 카드(짧은 구절과 통일)
          let runs;
          if (sl.verses) {
            runs = [];
            sl.verses.forEach((v, i) => {
              runs.push({ text: v.num + ' ', options: { color: CARD.num } });
              runs.push({ text: v.text + (i < sl.verses.length - 1 ? '  ' : ''), options: { color: CARD.ink } });
            });
          } else runs = [{ text: sl.body || '', options: { color: CARD.ink } }];
          addVerseCard(pptx, s, sl.caption, runs, true);
          break;
        }
        const bg = darkBg();
        s.background = bg ? { data: bg } : { color: C.dark };
        if (sl.caption) {
          if (sl.dash) {
            // 사도신경: 가운데 골드 캡션 + 양옆 골드 대시(얇은 선)
            const capY = 0.85, lineY = capY + 0.30, half = (sl.caption.length * 0.34);
            s.addText(sl.caption, { x: 0.8, y: capY, w: 11.73, h: 0.7, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 26, bold: true, color: C.gold, charSpacing: 6 });
            s.addShape(pptx.ShapeType.line, { x: 6.665 - half - 0.75, y: lineY, w: 0.6, h: 0, line: { color: C.gold, width: 1.5, transparency: 28 } });
            s.addShape(pptx.ShapeType.line, { x: 6.665 + half + 0.15, y: lineY, w: 0.6, h: 0, line: { color: C.gold, width: 1.5, transparency: 28 } });
          } else if (sl.fit) {
            // 성경 본문: 가운데 골드 캡션(참조 구절) — 본문 위쪽 정렬과 안 겹치게 상단
            s.addText(sl.caption, { x: 0.8, y: 0.05, w: 11.73, h: 0.42, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 18, bold: true, color: C.gold, charSpacing: 3 });
          } else {
            s.addText(sl.caption, { x: 0.8, y: 0.45, w: 11.73, h: 0.7, align: 'left', fontFace: FONT, fontSize: 22, bold: true, color: C.gold, charSpacing: 2 });
          }
        }
        let body;
        if (sl.verses) {
          body = [];
          sl.verses.forEach((v, i) => {
            body.push({ text: v.num + ' ', options: { color: C.gold, fontSize: 22, bold: true } });
            body.push({ text: v.text + (i < sl.verses.length - 1 ? '   ' : ''), options: { color: C.warm } });
          });
        } else {
          // 마지막 줄 "아멘."이면 골드로 분리 (사도신경)
          const m = String(sl.body || '').match(/^([\s\S]*?)\n\s*(아멘[.。]?)\s*$/);
          if (m) {
            body = [
              { text: m[1] + '\n\n', options: { color: C.warm } },
              { text: m[2].replace(/。/, '.'), options: { color: C.gold } }
            ];
          } else body = [{ text: sl.body || '', options: { color: C.warm } }];
        }
        const dopts = { x: 0.7, y: 1.3, w: 11.93, h: 5.7, align: 'left', valign: 'top', fontFace: FONT, fontSize: 30, bold: true, color: C.warm, lineSpacingMultiple: 1.5, shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 4, offset: 2, angle: 90 } };
        if (sl.fit) { // 축소로 잘림 방지. 사도신경=가운데·크게, 성경 본문=왼쪽·꽉 차게(여백 최소)
          dopts.fit = 'shrink'; dopts.valign = 'middle'; dopts.lineSpacingMultiple = 1.4;
          if (sl.dash) { dopts.align = 'center'; dopts.x = 0.6; dopts.w = 12.13; dopts.y = 1.55; dopts.h = 5.6; dopts.fontSize = 56; }
          // 성경 본문: 상·하 여백 0.52in(≈50px@720) + 위쪽 정렬 + 글자 6cqh(≈32pt)
          else { dopts.align = 'left'; dopts.valign = 'top'; dopts.x = 0.6; dopts.w = 12.13; dopts.y = 0.52; dopts.h = 6.46; dopts.fontSize = 32; }
        }
        s.addText(body, dopts);
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
