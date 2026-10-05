#!/usr/bin/env python3
"""설교 페이지 데이터 내보내기 → data/sermons/<날짜>.json (이 저장소에만 쓴다. 원본 폴더는 읽기만)

실행:  python3 scripts/export-sermons.py
       python3 scripts/export-sermons.py --preview --out <폴더>   (미리보기 전용, 커밋 금지)
"""
import argparse, datetime as dt, json, os, re, subprocess, sys, urllib.request, urllib.error
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORK = Path.home() / "sermon-shorts" / "work"
BOOKS = Path.home() / "sermon-shorts" / "data" / "bible_books.json"
FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"
REEL_DELAY = dt.timedelta(hours=4)


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


_public = {}
def is_public(vid):
    """유튜브에서 누구나 볼 수 있는 영상인지(oEmbed 200). 네트워크 오류는 '아님'으로 — 다음 회차에 다시."""
    if vid not in _public:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                _public[vid] = r.status == 200
        except Exception:
            _public[vid] = False
    return _public[vid]


def book_table():
    try:
        d = load(BOOKS)
    except Exception:
        return {}
    t = {}
    for b in d.get("books", []):
        t[b["name"]] = b["name"]; t[b["abbr"]] = b["name"]
    for k, v in (d.get("alias") or {}).items():
        t[k] = v
    return t


REF_RE = re.compile(r"^\s*([가-힣0-9]+)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$")
def scripture(ref, books):
    """'창 36:1-43' → 표시 '창세기 36:1-43', 검색 문구 '창세기 36장 1-43절'. 형식이 다르면 받은 그대로."""
    ref = (ref or "").strip()
    m = REF_RE.match(ref)
    if not m or m.group(1) not in books:
        return {"ref": ref, "book": "", "phrase": ""}
    book, ch, v1, v2 = books[m.group(1)], m.group(2), m.group(3), m.group(4)
    unit = "편" if book == "시편" else "장"
    verses = f"{v1}-{v2}절" if v2 else f"{v1}절"
    return {"ref": f"{book} {ch}:{v1}" + (f"-{v2}" if v2 else ""), "book": book,
            "phrase": f"{book} {ch}{unit} {verses}"}


TITLE_RE = re.compile(r"^\s*\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\s*(.+?)\s*\(([^)]+)\)\s*([가-힣]{2,4}\s*목사)\s*$")


def crop_panels(src, out_dir, prefix, count=3):
    """릴스 키프레임(4장면 가로 이어붙임)에서 2~4장면 그림 부분만 잘라 저장. 이미 있으면 건너뜀."""
    names = [f"{prefix}-{k}.jpg" for k in range(2, 2 + count)]
    if all((out_dir / n).exists() for n in names):
        return names
    wh = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(src)],
                        capture_output=True, text=True, check=True).stdout.strip().split(",")
    W, H = int(wh[0]), int(wh[1])
    pw, cw, y, ch = W / 4, round(W * 0.2466), round(H * 0.1167), round(H * 0.4708)
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, n in enumerate(names, start=1):
        x = round(i * pw + W * 0.0018)
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-vf", f"crop={cw}:{ch}:{x}:{y}", "-q:v", "4",
                        str(out_dir / n)], check=True)
    return names


def short_frame(src, dst):
    """공개 쇼츠 영상에서 제목이 보이는 한 장면(6초)을 썸네일로. 이미 있으면 건너뜀."""
    if dst.exists():
        return True
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "6", "-i", str(src), "-frames:v", "1",
                        "-vf", "scale=540:-1", "-q:v", "4", str(dst)])
    return r.returncode == 0


def export(vid_dir, books, preview, img_root, now):
    d = WORK / vid_dir
    week, clips, meta = load(d / "week.json"), load(d / "clips.json"), load(d / "select_meta.json")
    date = week["weekId"]
    pastor = week.get("pastor") or {}
    m = TITLE_RE.match(week.get("video_title") or "")
    title = m.group(1) if m else (pastor.get("title") or "").strip()
    preacher = (week.get("preacher") or (m.group(3) if m else "") or "").replace(" ", " ")
    sc = scripture(pastor.get("ref") or (m.group(2) if m else ""), books)
    if not title or not date:
        return None

    out_img = img_root / date
    shorts = []
    for c in clips:
        cid, up = c.get("id"), c.get("uploaded")
        if c.get("deleted") or not up or not is_public(up):
            continue
        thumb = f"short-{up}.jpg"
        has = short_frame(d / "review" / f"{cid}.mp4", out_img / thumb)
        shorts.append({"id": up, "title": c.get("title", "").strip(), "description": c.get("description", "").strip(),
                       "start": int(c.get("start", 0)), "end": int(c.get("end", 0)),
                       "topics": [h.lstrip("#") for h in c.get("hashtags", [])], "thumb": thumb if has else ""})

    reels = []
    anim_p = d / "anim_reels.json"
    if anim_p.exists():
        for r in load(anim_p).get("reels", []):
            st = r.get("status")
            posted_ok = st == "posted" and r.get("posted_at") and \
                dt.datetime.fromisoformat(r["posted_at"]) + REEL_DELAY <= now
            if not (posted_ok or (preview and st in ("approved", "posted"))):
                continue
            sc0 = (r.get("scenes") or [{}])[0]
            kf = d / "anim" / f"{vid_dir}_anim{r['n']}_keyframes.jpg"
            imgs = crop_panels(kf, out_img, f"reel{r['n']}") if kf.exists() else []
            scenes = []
            for k, s in enumerate((r.get("scenes") or [])[1:]):
                scenes.append({"big": s.get("big", "").strip(), "small": s.get("small", "").strip(),
                               "image": imgs[k] if k < len(imgs) else ""})
            item = {"n": r["n"], "format": r.get("format"), "color": r.get("color") or "amber",
                    "instagram": r.get("instagram_url") or "",
                    "highlight": (r.get("highlight") or "").strip(),
                    "question": sc0.get("big", "").strip(), "hint": sc0.get("small", "").strip(), "scenes": scenes,
                    "topics": [h.lstrip("#") for h in r.get("hashtags", [])]}
            fmt = r.get("format")
            if fmt == "A":
                item["items"] = r.get("items", []); item["threshold"] = r.get("threshold", 0)
            elif fmt == "E":                                   # 말풀이(2026-10-05): 단어 + 속뜻 2~3줄, 질문 속 단어를 강조
                item["word"] = (r.get("word") or "").strip(); item["meanings"] = [m.strip() for m in r.get("meanings", []) if m.strip()]
                item["highlight"] = item["word"]
            elif fmt == "F":                                   # 숫자 훅(2026-10-05): 열 명 중 k 명(문장은 쇼츠가 목록에서 채운 scenes[0].big)
                item["statK"] = int(r.get("stat_k") or 0)
            else:                                              # C 고르기 3장 · D 둘 중 하나(2장) · B 는 빈 목록
                item["options"] = [o.replace("\n", " ") for o in r.get("options", [])]
            if preview and not posted_ok:
                item["previewOnly"] = True
            reels.append(item)

    if not shorts and not reels:
        return None
    topics = []
    for t in [t for s in shorts for t in s["topics"]] + [t for r in reels for t in r["topics"]]:
        if t and t not in topics:
            topics.append(t)
    return {"date": date, "videoId": vid_dir, "title": title, "preacher": preacher,
            "scripture": sc["ref"], "book": sc["book"], "scripturePhrase": sc["phrase"],
            "coreQuestion": (meta.get("core_question") or "").strip(),
            "topics": topics[:8], "shorts": shorts, "reels": reels, "passages": []}


CARDS = Path.home() / "sermon-shorts" / "work" / "verse_cards" / "queue.json"


def export_cards(preview, root):
    """말씀 카드(폰 배경화면, 쇼츠 CONCEPT_LOCK v4.27) → data/sermons/cards.json + sermon/wallpaper/<이름>.jpg(원본)·-s.jpg(작은 그림).
    공개 조건(10-05 개정 — 홈페이지 먼저): 게시 시각(at)이 지난 카드(대기·게시됨·놓침 모두). 인스타 설명란이 홈페이지를 안내하므로
    홈페이지에 먼저 뜨고 그 뒤 인스타·페이스북에 올라간다(쇼츠 쪽 verse_card.tick 이 이 봇을 먼저 돌리고 떴는지 확인한 뒤 게시).
    미리보기는 시각 전 대기 카드도. 원본 폴더는 읽기만."""
    if not CARDS.exists():
        return []
    out_img = root / "sermon" / "wallpaper"
    cards = []
    now = dt.datetime.now(dt.timezone.utc)
    for it in load(CARDS):
        try: due = dt.datetime.fromisoformat(it["at"]) <= now
        except (KeyError, ValueError): due = False
        st = it.get("status")
        if not (st == "posted" or (st in ("ready", "missed") and due) or (preview and st == "ready")):
            continue
        src = Path(it.get("files", {}).get("wallpaper", ""))
        if not src.exists():
            continue
        m = re.match(r"^\s*([가-힣]+)\s+(\d+):(\d+)(?:-(\d+))?\s*$", it["ref"])
        slug = f"{it['date']}-{m.group(2)}-{m.group(3)}" if m else it["date"]
        full, small = out_img / f"{slug}.jpg", out_img / f"{slug}-s.jpg"
        out_img.mkdir(parents=True, exist_ok=True)
        if not full.exists():
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-vf", "scale=1170:-2", "-q:v", "4", str(full)], check=True)
        if not small.exists():
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-vf", "scale=360:-2", "-q:v", "5", str(small)], check=True)
        verse = " ".join(l.replace("{", "").replace("}", "") for l in it.get("lines", []))
        unit = "편" if m and m.group(1) == "시편" else "장"
        phrase = f"{m.group(1)} {m.group(2)}{unit} {m.group(3)}" + (f"-{m.group(4)}" if m and m.group(4) else "") + "절" if m else it["ref"]
        c = {"slug": slug, "date": it["date"], "ref": it["ref"], "phrase": phrase, "verse": verse, "sermon": it.get("sermon_week") or "",
             "image": f"wallpaper/{slug}.jpg", "thumb": f"wallpaper/{slug}-s.jpg",
             "book": m.group(1) if m else "", "themes": [x for x in it.get("themes") or [] if isinstance(x, str)]}   # 배경화면 태그(주제 1~2개 + 성경 책)
        if preview and it.get("status") != "posted":
            c["previewOnly"] = True
        cards.append(c)
    return sorted(cards, key=lambda c: c["date"], reverse=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true", help="게시 전 릴스도 포함(미리보기 전용)")
    ap.add_argument("--out", default=str(REPO), help="결과를 쓸 사이트 폴더(기본: 이 저장소)")
    a = ap.parse_args()
    root = Path(a.out)
    data_dir, img_root = root / "data" / "sermons", root / "sermon"
    data_dir.mkdir(parents=True, exist_ok=True)
    books, now = book_table(), dt.datetime.now(dt.timezone.utc)
    keep = set()
    for vid_dir in sorted(os.listdir(WORK)):
        p = WORK / vid_dir
        if not (p / "week.json").exists() or not (p / "clips.json").exists() or not (p / "select_meta.json").exists():
            continue
        try:
            doc = export(vid_dir, books, a.preview, img_root, now)
        except Exception as e:
            print(f"건너뜀 {vid_dir}: {e}", file=sys.stderr)
            continue
        if not doc:
            continue
        f = data_dir / f"{doc['date']}.json"
        text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
        if not f.exists() or f.read_text(encoding="utf-8") != text:
            f.write_text(text, encoding="utf-8")
            print("갱신:", f.name)
        keep.add(f.name)
    cards = export_cards(a.preview, root)                       # 말씀 카드(폰 배경화면)
    cf = data_dir / "cards.json"; ctext = json.dumps(cards, ensure_ascii=False, indent=2) + "\n"
    if not cf.exists() or cf.read_text(encoding="utf-8") != ctext:
        cf.write_text(ctext, encoding="utf-8"); print("갱신: cards.json")
    keep.add("cards.json")
    for f in data_dir.glob("*.json"):
        if f.name not in keep:
            f.unlink(); print("제외(공개 조건 미충족):", f.name)


if __name__ == "__main__":
    main()
