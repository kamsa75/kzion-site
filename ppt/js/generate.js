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
  const FONT_BLACK = 'Pretendard Black';   // 성경 본문 카드 전용(방송 PC 설치됨) — 더 두꺼운 웨이트

  let items = [];   // [{ label, slide, missing, phase }]
  let weekId = '';
  let lastWeek = null;   // 마지막 loadCtx의 getWeek 원본 — 다운로드 시점 버전 기록용(#PPT 신선도)

  // 다운로드 성공 시 이 기기의 '받은 버전'을 기록 → 상단바 점 갱신
  function noteDownloaded(wkId, weekRaw) {
    if (window.PptFresh) PptFresh.markDownloaded(wkId, PptFresh.versionOf(weekRaw || {}));
  }

  // 슬롯 → 예배 순서 단계 (미리보기 그룹핑용, D). 슬롯 id 기준
  const PHASE = {
    thumbnail: '여는 순서', call: '여는 순서', creed: '여는 순서', 'praise-all': '여는 순서',
    'live-1': '여는 순서', 'praise-songs': '여는 순서', 'live-2': '여는 순서', 'pray-together': '여는 순서',
    'bless-live-1': '여는 순서', blessing: '여는 순서', 'bless-live-2': '여는 순서',
    hymn: '찬양과 기도', 'prayer-live-1': '찬양과 기도', prayer: '찬양과 기도', 'prayer-live-2': '찬양과 기도',
    'choir-name': '찬양과 기도', 'choir-songs': '찬양과 기도',
    'live-3': '찬양과 기도', offering: '찬양과 기도', 'offering-img': '찬양과 기도', 'live-4': '찬양과 기도',
    news: '말씀', 'news-live': '말씀', sermon: '말씀', passage: '말씀', reading: '말씀',
    'live-5': '마침', 'closing-img': '마침', benediction: '마침', ending: '마침'
  };

  /* ---------- 데이터 정규화 (서버/목 양쪽 스키마 흡수) ---------- */
  function getRole(s) { return s.role; }
  function getBlocks(s) { return Array.isArray(s.blocks) ? s.blocks : ((s.blocks && s.blocks.blocks) || []); }
  function getOrder(s) { return s.order || s.ord || []; }
  // 특송 필드도 서버 원본(snake_case) / 클라 목데이터(camelCase) 양쪽에서 읽는다
  //   — getWeek 원본행은 song_type/song_performer, 목데이터는 songType/performer (B1 회귀 수정)
  function getSongType(s) { return s.songType || s.song_type || 'choir'; }
  function getPerformer(s) { return s.performer || s.song_performer || ''; }

  // breaks 기준 2줄 슬라이드 묶기 (review.js blockSlides와 동일)
  // breaks로 1차 묶고, 밴드=2줄이라 3줄+는 2줄씩 자동 분할 (가사 유실·밴드 넘침 방지, 2026-07-06)
  function blockSlides(block) {
    const n = (block.lines || []).length;
    if (!n) return [];
    const breaks = block.breaks || [];
    // breaks가 전부 true(=모든 줄 분리=1줄씩; 추출 기본값 오류·구데이터)면 무시하고 2줄씩 재페어링(수동 혼합 나눔은 존중)
    const allSplit = n > 1 && breaks.slice(0, n - 1).every(Boolean);
    const raw = [[0]];
    for (let i = 1; i < n; i++) {
      if (!allSplit && breaks[i - 1]) raw.push([i]);
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
        bandFromBlocks(blocks, (p.hymn || {}).order).forEach((sl, i) => out.push({ label: '찬송가 ' + (i + 1), slide: sl })); // 부르는 순서(기본=붙여넣은 그대로)
        return out;
      }
      case 'passage_long': {
        const out = [];
        (p.passages || []).forEach(pg => splitPassage(pg).forEach(sl => out.push({ label: '성경 본문', slide: sl }))); // 칩=본문 선두 [ ]에서
        if (!out.length) return [{ label: '성경 본문', slide: { layout: 'dark', caption: '', body: '(성경 본문 미입력)' }, missing: true }];
        return out;
      }
      case 'reading_short': {
        const arr = (p.readings || []).filter(x => (x || '').trim());
        if (!arr.length) return [];   // 짧은 구절 없으면 그린스크린도 생략(고아 방지, D36)
        // 각 구절 앞마다 라이브 그린 1장(구절 단위 — 한 구절이 카드 여러 장으로 나뉘어도 그린은 앞에 1장, D38)
        const out = [];
        arr.forEach(r => {
          const pages = (typeof bandPages === 'function' ? bandPages(r) : []);
          if (!pages.length) return;   // 내용 못 만든 구절은 그린도 안 넣음(고아 방지)
          out.push({ label: '빈 그린스크린(라이브)', slide: { layout: 'green_blank' } });
          pages.forEach(sl => out.push({ label: '함께 읽는 구절', slide: sl }));
        });
        return out;
      }
      case 'blessing': {
        // 다음 세대를 향한 축복(고정, 합심기도 뒤) — 제목 그린 자막 1장 + 가사 크로마 밴드(2줄씩). 가사=settings.blessing_lyrics(관리자 문구 관리, A/B)
        const out = [{ label: slot.title, slide: { layout: 'green', text: slot.title } }];
        const raw = (ctx.settings.blessing_lyrics || '').trim();
        if (!raw) { out.push({ label: slot.title + ' 가사', slide: { layout: 'band', lyrics: ['(축복송 가사 미입력)'] }, missing: true }); return out; }
        raw.split(/\n\s*\n/).forEach((blk, i) => {   // 빈 줄 = 슬라이드 구분, 각 블록 2줄
          const lines = blk.split('\n').map(x => x.trim()).filter(Boolean);
          if (lines.length) out.push({ label: slot.title + ' 가사 ' + (i + 1), slide: { layout: 'band', lyrics: lines } });
        });
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
        // 곡마다: 성가대=곡명 그린(+시온 성가대) / 특송='특송 : 이름' 그린. 가사는 둘 다 그린 흰글씨 2줄(밴드 없음, D26 개편)
        const songs = ctx.songs.filter(s => getRole(s) === 'choir');
        if (!songs.length) return [{ label: '성가대 곡명', slide: { layout: 'green', text: '(성가대 곡 없음)' }, missing: true }];
        const out = [];
        songs.forEach(s => {
          const special = (getSongType(s) === 'special');
          if (special) {
            // 특송 = 곡명(크게) + '특송 · 이름/팀'(작게) — 성가대와 평행 구조
            const perf = getPerformer(s);
            const who = perf ? ('특송 · ' + perf) : '특송';
            out.push({ label: '특송', slide: { layout: 'green', text: s.name || '(곡 제목 미입력)', sub: who }, missing: !s.name || !perf });
          } else {
            out.push({ label: '성가대 곡명', slide: { layout: 'green', text: s.name || '(곡명 미입력)', sub: '시온 성가대' }, missing: !s.name });
          }
          // 가사 = 그린 흰글씨 2줄(밴드 없음) — band 레이아웃 + noBand 플래그
          bandFromBlocks(getBlocks(s), getOrder(s)).forEach(sl => {
            sl.noBand = true;
            out.push({ label: (s.name || (special ? '특송' : '성가대 곡')) + ' 가사', slide: sl });
          });
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
    try { await SettingsStore.load(); return { creed_text: SettingsStore.get('creed_text'), praise_all_sub: SettingsStore.get('praise_all_sub'), blessing_lyrics: SettingsStore.get('blessing_lyrics') }; }
    catch (e) { return {}; }
  }

  async function loadCtx() {
    const assets = await loadAssets();
    const settings = await loadSettings();
    if (CONFIG.USE_SERVER) {
      const w = await API.call('getWeek');
      return { weekId: w.weekId, pastor: (w.pastor && w.pastor.data) || {}, songs: w.songs || [], assets, settings, _week: w };
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
        '<br><span class="gen-warn-sub">필요하다면, 채운 뒤 다시 생성하세요.</span>';
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
  // ★ PPT 텍스트 박스(인치)에 실제로 들어가는 최대 폰트(pt)를 DOM 측정으로 계산.
  //   PptxGenJS의 fit:'shrink'는 뷰어 autofit에 의존해 파워포인트에서 원본 크기로 넘치는 사고가 있음 →
  //   명시적 fontSize로 넣어 '미리보기=다운로드' 어떤 뷰어에서도 일치 보장. (1in=100px 측정 → pt=px*0.72)
  function fitTextPt(text, wIn, hIn, lineHeight, startPt) {
    try {
      if (typeof document === 'undefined' || !document.body) return null;
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;width:' + (wIn * 100) + 'px;'
        + 'font-family:Pretendard,"Apple SD Gothic Neo",sans-serif;font-weight:800;line-height:' + lineHeight + ';'
        + 'white-space:pre-wrap;word-break:keep-all;';
      d.textContent = text || '';
      document.body.appendChild(d);
      var boxPx = hIn * 100, px = (startPt || 40) / 0.72, guard = 0;
      d.style.fontSize = px + 'px';
      while (d.scrollHeight > boxPx && px > 8 && guard < 400) { px -= 1; d.style.fontSize = px + 'px'; guard++; }
      document.body.removeChild(d);
      return px * 0.72;   // px(100px=1in) → pt(72pt=1in)
    } catch (e) { return null; }
  }
  // 미리보기의 실제 자동맞춤(fitDarkSlides)을 그대로 실행해 '화면과 똑같은' 폰트(pt)를 얻는다.
  //   1333px 폭 슬라이드(=13.33in, 100px/in) → pt = px*0.72. selector: 사도신경 '.sl-body'.
  function previewFitPt(sl, selector) {
    try {
      if (typeof document === 'undefined' || !document.body || typeof renderSlide !== 'function' || typeof fitDarkSlides !== 'function') return null;
      var host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1333px;pointer-events:none;';
      var node = renderSlide(sl);
      host.appendChild(node); document.body.appendChild(host);
      fitDarkSlides(host);
      var el = node.querySelector(selector);
      var px = el ? parseFloat(getComputedStyle(el).fontSize) : 0;
      document.body.removeChild(host);
      return px ? px * 0.72 : null;
    } catch (e) { return null; }
  }
  function addVerseCard(pptx, s, ref, runs, full) {
    s.background = { color: C.green };
    const X = 0.35, W = 12.63;   // 흰 카드 폭 확대(좌우 여백 축소)
    const cardY = full ? 0.72 : 4.85, cardH = full ? 6.33 : 2.2;   // 짧은 카드: 본부장님 실측 textH 1.4"(=2.2-0.5-0.3)
    // 흰 카드 + 그림자
    s.addShape(pptx.ShapeType.roundRect, { x: X, y: cardY, w: W, h: cardH, rectRadius: 0.16, fill: { color: 'FFFFFF' }, line: { type: 'none' }, shadow: { type: 'outer', color: '000000', opacity: 0.30, blur: 9, offset: 5, angle: 90 } });
    // 본문 폰트를 카드 박스에 확실히 들어가게 계산(긴·짧은 공통, 넉넉한 안전여백: 폭 95%·높이 90% → PP 렌더 차이 흡수)
    const padTop = full ? 0.62 : 0.5, padX = 0.275, padBot = full ? 0.5 : 0.3;   // 짧은 카드 textW 12.08"(=12.63-0.55)
    const textW = W - padX * 2, textH = cardH - padTop - padBot;
    const plainTxt = runs.map(r => r.text).join('');
    // 긴 본문=넉넉 안전여백(폭95%·높이90%), 짧은 구절=실측 폰트 29(bandPages 2줄과 일치, 미리보기와 동일 줄바꿈)
    // 본문 33pt 고정(최소 33pt·Pretendard Black·줄간격 1.2, 2026-07-12 본부장님 확정).
    //   분할(passagePages·bandPages)이 33pt 기준으로 카드에 맞게 나눠주므로 정상 케이스는 33pt 그대로.
    //   극단적으로 넘칠 때만 fitTextPt/fit:shrink가 안전장치로 살짝 축소(사실상 안 걸림).
    const measured = (typeof fitTextPt === 'function')
      ? (full ? fitTextPt(plainTxt, textW * 0.95, textH * 0.9, 1.3, 34)
              : fitTextPt(plainTxt, textW, textH, 1.3, 34))
      : 34;
    const bodyFs = measured ? Math.max(10, measured) : 34;
    s.addText(runs, { x: X + padX, y: cardY + padTop, w: textW, h: textH, align: 'left', valign: 'top', fontFace: FONT_BLACK, fontSize: bodyFs, bold: true, color: CARD.ink, lineSpacingMultiple: 1.3, margin: 0, fit: 'shrink' });
    // 구절칩(파란 알약, 카드 윗선에 절반 걸침) — 33pt로 키우고 알약도 확대
    if (ref) {
      const chipFs = 34, chipH = 0.74, chipW = emWidth(ref) * chipFs / 72 + 0.5;
      const chipX = X + 0.32, chipY = cardY - chipH / 2;
      s.addShape(pptx.ShapeType.roundRect, { x: chipX, y: chipY, w: chipW, h: chipH, rectRadius: 0.36, fill: { color: CARD.chip }, line: { type: 'none' }, shadow: { type: 'outer', color: '000000', opacity: 0.25, blur: 4, offset: 2, angle: 90 } });
      s.addText(ref, { x: chipX, y: chipY, w: chipW, h: chipH, align: 'center', valign: 'middle', fontFace: FONT_BLACK, fontSize: chipFs, bold: true, color: 'FFFFFF' });
    }
  }

  /* ---------- PPTX 생성 (PptxGenJS) ---------- */
  function addSlide(pptx, sl) {
    const s = pptx.addSlide();
    switch (sl.layout) {
      case 'green': {
        s.background = { color: C.green };
        // 미리보기(CSS)와 동일하게 바닥 기준 배치 — 큰글씨 바닥 6.525"(=13cqh), 작은글씨 바닥 7.275"(=3cqh).
        //   기존엔 큰글씨가 위(bottom 6.0")에 떠서 작은글씨와 간격이 벌어져 보였음 → 큰글씨를 아래로 내림 (D36-b)
        // 미리보기(CSS) 실측에 맞춤 — 큰글씨 바닥 ~6.52", 작은글씨 top ~6.59"(간격 촘촘 ~0.08").
        //   기존엔 큰글씨가 위(바닥 6.0")에 떠서 간격이 벌어져 보였음 → 큰글씨를 아래로 내리고 작은글씨를 바로 밑에 붙임 (D36-b)
        if (sl.text) s.addText(sl.text, { x: 0.5, y: sl.sub ? 4.525 : 4.7, w: 12.33, h: 2.0, align: 'center', valign: 'bottom', margin: 0, fontFace: FONT, fontSize: 48, bold: true, color: C.white, shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 3, offset: 2, angle: 90 } });
        if (sl.sub) s.addText(sl.sub, { x: 0.5, y: 6.59, w: 12.33, h: 0.8, align: 'center', valign: 'top', margin: 0, fontFace: FONT, fontSize: 32, bold: true, color: C.white, shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 3, offset: 2, angle: 90 } });
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
        // 크로마 밴드형(초록 + 흰 가사). 밴드는 90% 불투명(살짝 아래 비침). noBand=성가대/특송은 밴드 없이 그린 자막
        s.background = { color: C.green };
        if (!sl.noBand) {
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.0, w: 13.33, h: 1.5, fill: { color: C.band, transparency: 10 } });
        }
        // 성가대/특송(noBand)은 밴드가 없어 바닥에 붙으므로 위로 올려 하단 여백 확보(다른 슬라이드와 균형). 찬양팀 밴드는 y=6.0 유지
        const lyOpts = { x: 0.5, y: sl.noBand ? 5.8 : 6.0, w: 12.33, h: 1.5, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 34, bold: true, color: C.white, lineSpacingMultiple: 1.15, fit: 'shrink' };
        if (sl.noBand) lyOpts.shadow = { type: 'outer', color: '000000', opacity: 0.5, blur: 4, offset: 2, angle: 90 }; // 밴드 없으면 그림자로 가독성
        s.addText((sl.lyrics || []).join('\n'), lyOpts);
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
          addVerseCard(pptx, s, sl.caption, runs, true);   // 폰트는 addVerseCard가 박스에 맞춰 계산
          break;
        }
        // 배경: 솔리드 네이비 + 네이비 그라디언트를 '전면 이미지'로(불투명) → 어떤 뷰어에서도 확실히 덮음(썸네일 비침 방지)
        s.background = { color: C.dark };
        const bg = darkBg();
        if (bg) s.addImage({ data: bg, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'cover', w: 13.33, h: 7.5 } });
        if (sl.caption) {
          if (sl.dash) {
            // 사도신경: 가운데 골드 캡션(32pt) + 양옆 골드 대시
            //   ⚠ 대시는 '얇은 사각형'으로 그림. 높이 0 선(addShape line, h:0)은 PowerPoint
            //   'unreadable content' 경고를 유발하므로 폐기(유효한 OOXML 도형만 사용).
            const capY = 0.26, lineY = capY + 0.30, half = (sl.caption.length * 0.42); // 32pt 기준 반너비
            s.addText(sl.caption, { x: 0.8, y: capY, w: 11.73, h: 0.6, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 32, bold: true, color: C.gold, charSpacing: 6 });
            const dW = 0.6, dH = 0.024; // 가로 막대(높이 0.024in ≈ 선 두께)
            s.addShape(pptx.ShapeType.rect, { x: 6.665 - half - 0.75, y: lineY - dH / 2, w: dW, h: dH, fill: { color: C.gold, transparency: 28 }, line: { type: 'none' } });
            s.addShape(pptx.ShapeType.rect, { x: 6.665 + half + 0.15, y: lineY - dH / 2, w: dW, h: dH, fill: { color: C.gold, transparency: 28 }, line: { type: 'none' } });
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
        const dopts = { x: 0.7, y: 1.3, w: 11.93, h: 5.7, align: 'left', valign: 'top', fontFace: FONT, fontSize: 30, bold: true, color: C.warm, lineSpacingMultiple: 1.5, margin: 0, shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 4, offset: 2, angle: 90 } };
        if (sl.fit) { // 축소로 잘림 방지. 사도신경=가운데·크게, 성경 본문=왼쪽·꽉 차게(여백 최소)
          dopts.fit = 'shrink'; dopts.valign = 'middle'; dopts.lineSpacingMultiple = 1.4;
          if (sl.dash) { // 사도신경 — 박스(top:13cqh/bottom:5.5cqh)에 맞춘 계산 폰트(뷰어·타이밍 무관, 잘림 없음)
            const plainCreed = body.map(r => r.text).join('');
            const cfs = fitTextPt(plainCreed, 13.0, 6.11, 1.25, 56);   // 폰트는 6.11 기준으로 계산, 박스는 6.6으로 여유 → PP 렌더 차이 흡수
            dopts.align = 'center'; dopts.x = 0.05; dopts.w = 13.23; dopts.y = 0.6; dopts.h = 6.6;   // 박스 높이 6.6·위치 약간 위로
            dopts.lineSpacingMultiple = 1.25;   // 줄간격 좁게(보기 좋게)
            dopts.fontSize = cfs ? Math.max(12, Math.min(32, cfs * 0.96)) : 32;   // 흰 본문 32pt 상한(길면 축소) — 골드 캡션과 크기 통일
          }
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
      noteDownloaded(weekId, lastWeek);   // 미리보기 화면에서 받은 것도 '받음'으로 기록
    } catch (e) {
      alert('PPTX 생성 중 문제가 생겼습니다: ' + (e.message || ''));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // 상단바 "⬇ 최신 PPT 받기" — 미리보기 화면을 거치지 않고 최신 데이터로 바로 생성·다운로드.
  // 생성 화면 상태(items/weekId)에 의존하지 않도록 매번 새로 loadCtx→build 한다(독립 실행).
  async function quickDownload(btn) {
    if (typeof PptxGenJS === 'undefined') { alert('PPTX 라이브러리를 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.'); return; }
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }
    try {
      const ctx = await loadCtx();
      const list = build(ctx);
      await buildPptx(list).writeFile({ fileName: '주일예배_' + ctx.weekId + '.pptx' });
      noteDownloaded(ctx.weekId, ctx._week);   // 방금 받은 최신 버전을 '받음'으로 기록
    } catch (e) {
      alert('최신 PPT 생성 중 문제가 생겼습니다: ' + (e.message || ''));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
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
    lastWeek = ctx._week || null;   // 이 화면에서 '받기' 시 이 시점 버전으로 기록(items도 이 시점 기준)
    items = build(ctx);
    renderPreview();
  }

  function init() {
    $('#btn-gen-back').addEventListener('click', () => KZ.show('home'));
    $('#btn-gen-download').addEventListener('click', download);
  }

  return { init, open, build, buildPptx, quickDownload };
})();
