/* ============================================================
   목사님 입력 검사·정리 (D46, 2026-11-01)
   - 구절 표기(어느 말씀?) 읽기·검사, 절 번호 정리, 찬송가 긴 줄 나눔, 찬송가 잡글 찾기
   - 화면(DOM)에 손대지 않는 순수 함수만 — 노드로도 돌려 실제 지난 주 데이터와 비교 검증한다
   - 저장 데이터 모양은 바꾸지 않는다: 구절 표기는 지금처럼 본문 맨 앞 "(마 5:1-12) "로 저장
   ⚠ 이 글을 쇼츠도 읽는다(시스템 지도 5장) — 기준은 쇼츠 쪽 읽는 규칙에 맞춘다
     · 책 이름 목록 = ~/sermon-shorts/data/bible_books.json (66권 이름·약어·별칭) 그대로
     · 머리 표기 = verse_pool.HEAD: (책 장:절-절) — 책은 한글만, 줄표는 '-'만 알아봄
     · 절 번호 = verse_pool.parse: "[25]" 또는 줄 맨 앞 "25 " 만 알아봄(줄 중간 번호는 못 봄)
     · 찬송가 줄 = segment.Matcher: 공백·기호 뺀 8자 미만 줄은 무시 → 8자 아래로 나누지 않는다
   ============================================================ */

const InputCheck = (function () {
  // 66권 [정식 이름, 약어] + 별칭 — bible_books.json과 같아야 한다(바꾸면 쇼츠 쪽도 함께)
  const BOOKS = [["창세기", "창"], ["출애굽기", "출"], ["레위기", "레"], ["민수기", "민"], ["신명기", "신"], ["여호수아", "수"], ["사사기", "삿"], ["룻기", "룻"], ["사무엘상", "삼상"], ["사무엘하", "삼하"], ["열왕기상", "왕상"], ["열왕기하", "왕하"], ["역대상", "대상"], ["역대하", "대하"], ["에스라", "스"], ["느헤미야", "느"], ["에스더", "에"], ["욥기", "욥"], ["시편", "시"], ["잠언", "잠"], ["전도서", "전"], ["아가", "아"], ["이사야", "사"], ["예레미야", "렘"], ["예레미야애가", "애"], ["에스겔", "겔"], ["다니엘", "단"], ["호세아", "호"], ["요엘", "욜"], ["아모스", "암"], ["오바댜", "옵"], ["요나", "욘"], ["미가", "미"], ["나훔", "나"], ["하박국", "합"], ["스바냐", "습"], ["학개", "학"], ["스가랴", "슥"], ["말라기", "말"], ["마태복음", "마"], ["마가복음", "막"], ["누가복음", "눅"], ["요한복음", "요"], ["사도행전", "행"], ["로마서", "롬"], ["고린도전서", "고전"], ["고린도후서", "고후"], ["갈라디아서", "갈"], ["에베소서", "엡"], ["빌립보서", "빌"], ["골로새서", "골"], ["데살로니가전서", "살전"], ["데살로니가후서", "살후"], ["디모데전서", "딤전"], ["디모데후서", "딤후"], ["디도서", "딛"], ["빌레몬서", "몬"], ["히브리서", "히"], ["야고보서", "약"], ["베드로전서", "벧전"], ["베드로후서", "벧후"], ["요한일서", "요일"], ["요한이서", "요이"], ["요한삼서", "요삼"], ["유다서", "유"], ["요한계시록", "계"]];
  const ALIAS = { "애가": "예레미야애가", "요한1서": "요한일서", "요한2서": "요한이서", "요한3서": "요한삼서", "계시록": "요한계시록", "여호수아서": "여호수아", "사무엘상서": "사무엘상", "룻": "룻기", "욥": "욥기", "시": "시편", "잠": "잠언" };
  const BOOK = {};
  BOOKS.forEach(([n, a]) => { BOOK[n] = n; BOOK[a] = n; });
  Object.keys(ALIAS).forEach(k => { BOOK[k] = ALIAS[k]; });

  function bookName(s) { return BOOK[String(s || '').replace(/\s+/g, '')] || null; }

  // 틀린 책 이름 → 고칠 후보 1개(확실할 때만). "마태복"→"마태복음" 처럼 정식 이름의 앞부분이면.
  //   후보가 둘 이상(예: "요한" → 요한복음·요한일서…)이면 짐작하지 않고 null (D41)
  function suggestBook(s) {
    const t = String(s || '').replace(/\s+/g, '');
    if (t.length < 2) return null;
    const hits = BOOKS.map(b => b[0]).filter(n => n.startsWith(t));
    return hits.length === 1 ? hits[0] : null;
  }

  // 표기 모양만 고른다(뜻은 그대로): 여러 가지 줄표·물결 → '-', 전각 콜론 → ':', "5장 1-12절" → "5:1-12"
  function tidyRef(s) {
    return String(s || '')
      .replace(/[‐-―−~～〜－]/g, '-')
      .replace(/[：]/g, ':')
      .replace(/(\d+)\s*장\s*(\d+)/g, '$1:$2')
      .replace(/(\d)\s*절/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 구절 표기 읽기 → { ok, book(쓴 그대로), canon, ch, v1, v2, multi, text(저장용), err, suggest }
  //   모양: 책 장:절 [ -절 | -장:절 ] [, 절[-절] …] [, 번역]
  const REF_RE = /^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+)(?:\s*:\s*(\d+))?)?((?:\s*,\s*\d+(?:\s*-\s*\d+)?)*)(\s*,\s*[가-힣A-Za-z]+)?$/;
  // 구절 여러 개("마 5:3, 눅 6:20")는 책 이름 앞 쉼표에서 나눠 각각 검사 — 첫 구절이 범위(머리 표기 규칙도 첫 구절만 읽음)
  function parseRef(raw) {
    const s = tidyRef(raw);
    if (!s) return { ok: false, empty: true };
    const parts = s.split(/\s*[,;]\s*(?=[가-힣]+\s*\d+\s*:)/);
    if (parts.length > 1) {
      const ps = parts.map(parseOne);
      const bad = ps.find(p => !p.ok);
      if (bad) return bad;
      return Object.assign({}, ps[0], { multi: undefined, text: ps.map(p => p.text).join(', ') });   // 절 수를 알 수 없음 → '번호 없음' 경고 안 함
    }
    return parseOne(s);
  }
  function parseOne(s) {
    const m = s.match(REF_RE);
    if (!m) {
      const head = (s.match(/^[^\d\s]+/) || [''])[0];
      const known = bookName(head);
      return { ok: false, err: known ? '장:절 모양으로 써 주세요 (예: ' + head + ' 3:1-6)' : head ? '책 이름 "' + head + '"을(를) 알 수 없어요' : '구절 표기를 알아볼 수 없어요 (예: 마 5:1-12)',
               badBook: !known && head ? head : '', suggest: !known ? suggestBook(head) : null };
    }
    const bookRaw = m[1].replace(/\s+/g, '');
    const canon = bookName(bookRaw);
    if (!canon) return { ok: false, err: '책 이름 "' + bookRaw + '"을(를) 알 수 없어요', badBook: bookRaw, suggest: suggestBook(bookRaw) };
    const ch = +m[2], v1 = +m[3];
    let v2 = v1, cross = false;
    if (m[5]) cross = true;                       // 장을 넘는 범위(1:30-2:5)
    else if (m[4]) v2 = +m[4];
    if (!cross && v2 < v1) return { ok: false, err: '절 범위가 거꾸로예요 (' + v1 + '-' + v2 + ')' };
    // 저장용: 쇼츠 머리 규칙(책=한글만)에 맞게 — 숫자 든 별칭(요한1서)만 정식 이름으로
    const book = /^[가-힣]+$/.test(bookRaw) ? bookRaw : canon;
    const text = (book + ' ' + s.slice(m[1].length)).replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':').replace(/\s+/g, ' ').trim();
    return { ok: true, book, canon, ch, v1, v2, cross, multi: cross || v2 > v1 || !!(m[6] || '').trim(), text };
  }

  // 책 이름 부분만 바꾼다(제안 버튼) — 나머지 글자는 그대로
  //   구절 여러 개면 그 책 이름이 있는 자리(맨 앞 또는 쉼표 뒤, 바로 뒤에 숫자)만
  function replaceBook(raw, from, to) {
    const name = [...String(from)].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    return String(raw || '').replace(new RegExp('(^\\s*|[,;]\\s*)' + name + '(?=\\s*\\d)'), '$1' + to);
  }

  // 본문 맨 앞 구절 표기 "[마 5:1-12] " / "(마 5:1-12) " 떼기 — PPT passagePages와 같은 기준(괄호 안에 숫자 아닌 글자가 있어야 표기)
  //   head = 원래 글자 그대로(뒤 공백 포함) — 본문만 고칠 때 표기를 한 글자도 안 바꾸고 되붙이기 위해
  function splitHead(text) {
    const t = String(text || '');
    const m = t.match(/^\s*(?:\[([^\]\n]+)\]|\(([^)\n]+)\))[ \t]*\n?/);
    const inner = m && (m[1] || m[2]);
    if (inner && /\D/.test(inner) && /[가-힣]/.test(inner)) return { head: m[0], ref: inner.trim(), body: t.slice(m[0].length) };
    return { head: '', ref: '', body: t };
  }
  function joinHead(ref, body) {
    const r = String(ref || '').trim();
    return r ? '(' + r + ') ' + String(body || '').replace(/^\s+/, '') : String(body || '');
  }

  // ── 절 번호 ──
  // 쇼츠가 알아보는 절 번호 개수: "[25]" + 줄 맨 앞 "25 "(뒤가 한글·따옴표) — verse_pool.parse와 같은 기준
  function shortsVerseCount(body) {
    const t = String(body || '');
    const a = (t.match(/\[\d+\]/g) || []).length;
    const b = (t.match(/(?:^|\n)\s*\d+\s+(?=[가-힣"'“])/g) || []).length;
    return a + b;
  }
  // 줄 중간까지 포함한 '번호처럼 보이는 숫자' 위치들 (대괄호 안 숫자는 제외)
  function numTokens(body) {
    const t = String(body || ''), out = [];
    const re = /(^|\s)(\d{1,3})(?=\s+[가-힣"'“‘])/g;
    let m;
    while ((m = re.exec(t))) out.push({ at: m.index + m[1].length, n: +m[2], len: m[2].length });
    return out;
  }
  // 줄 중간 절 번호를 줄 맨 앞으로(절마다 줄바꿈) — 번호가 하나씩 차례로 이어질 때만(25→26→27). 아니면 null(짐작 안 함, D41)
  //   · 본문이 번호로 시작해야 함 · 표기 범위가 있으면 그 안의 번호만 · 2개 이상 · 쇼츠가 이미 2개 이상 알아보면 손대지 않음
  //   반환 { text, count, from, to }
  function fixInlineVerseNums(body, ref) {
    const t = String(body || '');
    if (shortsVerseCount(t) >= 2) return null;
    const toks = numTokens(t);
    if (toks.length < 2) return null;
    const lead = t.search(/\S/);
    if (toks[0].at !== lead) return null;
    const r = ref && ref.ok ? ref : null;
    if (r && !r.cross && (toks[0].n < r.v1 || toks[0].n > r.v2)) return null;
    const pick = [toks[0]];
    let want = toks[0].n + 1;
    for (let i = 1; i < toks.length; i++) {
      if (r && !r.cross && want > r.v2) break;
      if (toks[i].n === want) { pick.push(toks[i]); want++; }
    }
    if (pick.length < 2) return null;
    // 절마다 줄을 바꾼다(번호는 줄 맨 앞) — "[25]"로 감싸면 짧은 구절 카드(bandPages)에 대괄호가 그대로 보여서 안 됨.
    //   줄바꿈은 PPT 두 카드(passagePages·bandPages) 모두 공백으로 접어 슬라이드가 똑같고, 쇼츠는 줄 맨 앞 번호를 절로 읽는다
    let out = '', last = 0;
    pick.forEach((p, i) => { out += (i ? t.slice(last, p.at).replace(/\s+$/, '') + '\n' : t.slice(last, p.at)); last = p.at; });
    out += t.slice(last);
    return { text: out, count: pick.length, from: pick[0].n, to: pick[pick.length - 1].n };
  }
  // 절 번호 상태: 'ok' | 'none'(번호 없음) | 'inline'(줄 중간에만) | 'unknown'(판단할 범위 없음)
  //   multi = 여러 절짜리 말씀인지(한 절짜리는 번호가 필요 없음)
  function verseState(body, multi) {
    const t = String(body || '').trim();
    if (!t || multi === false) return 'ok';
    if (shortsVerseCount(t) >= 2) return 'ok';
    if (numTokens(t).length >= 2) return 'inline';
    return multi === true ? 'none' : 'unknown';
  }

  // ── 찬송가 ──
  // 웹에서 딸려 온 잡글(자막에 그대로 나가면 안 되는 줄) — 모양으로 확실한 것만
  const JUNK_RE = /https?:\/\/|www\.|\.(com|net|org|kr|co)\b|©|저작권|copyright|출처\s*[:：]|무단|퍼가|새찬송가\s*\d+\s*장|통일찬송가|^\s*찬송가\s*\d+\s*장|^\s*\d+\s*장\s*$/i;
  function isJunkLine(line) { return JUNK_RE.test(String(line || '')); }

  const SHORTS_MIN = 8;   // 쇼츠 찬양 구간 찾기가 무시하는 길이(공백·기호 뺀 글자 수) — 이보다 짧게는 나누지 않는다
  const normLen = (s) => String(s || '').replace(/[^가-힣A-Za-z0-9]/g, '').length;

  // 한 줄이 자막 폭(maxW)보다 넓으면 띄어쓰기 자리에서 반으로 나눈다(넓이가 가장 고르게) — 재귀
  //   measure(text) → 넓이(어떤 단위든 maxW와 같은 단위). 글자는 하나도 바꾸지 않는다.
  function splitLongLine(line, measure, maxW) {
    const s = String(line || '').replace(/\s+/g, ' ').trim();
    if (!s || measure(s) <= maxW) return [s];
    const words = s.split(' ');
    if (words.length < 2) return [s];
    const total = measure(s);
    let best = -1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      if (normLen(a) < SHORTS_MIN || normLen(b) < SHORTS_MIN) continue;
      const d = Math.abs(measure(a) - total / 2);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    if (best < 0) return [s];
    return splitLongLine(words.slice(0, best).join(' '), measure, maxW)
      .concat(splitLongLine(words.slice(best).join(' '), measure, maxW));
  }
  // 붙여넣은 찬송가 글 전체 → 긴 줄만 나눈 글 + 나눈 줄 수. 빈 줄·이름표 줄(1절·후렴…)은 그대로
  function splitHymnText(text, measure, maxW, isLabel) {
    let n = 0;
    const out = String(text || '').split('\n').map(line => {
      if (!line.trim() || (isLabel && isLabel(line))) return line;
      const parts = splitLongLine(line, measure, maxW);
      if (parts.length > 1) n++;
      return parts.join('\n');
    });
    return { text: out.join('\n'), count: n };
  }

  return { bookName, suggestBook, tidyRef, parseRef, replaceBook, splitHead, joinHead,
           shortsVerseCount, fixInlineVerseNums, verseState, isJunkLine, splitLongLine, splitHymnText, BOOKS };
})();

if (typeof module !== 'undefined') module.exports = InputCheck;
