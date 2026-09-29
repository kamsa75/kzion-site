#!/usr/bin/env python3
"""설교 페이지 데이터 내보내기 — 쇼츠 파이프라인 작업 폴더를 '읽기만' 해서 data/sermons/<날짜>.json 을 만든다.

지키는 것 (검색노출 설계 5장 — 쇼츠 파이프라인 보호)
  · ~/sermon-shorts 의 코드·설정은 import 하지 않는다(run.py import 금지). work/ 의 JSON·영상을 읽기만 한다
  · work/ 안에는 아무것도 쓰지 않는다. 결과는 이 저장소(data/, sermon/<날짜>/ 그림)에만 쓴다
  · 읽다가 깨진 파일을 만나면 그 설교만 건너뛴다(다음 회차에 다시)

공개 공식 (매번 같은 규칙으로 자동 판단)
  · 쇼츠: 유튜브에서 '공개'된 것만(oEmbed 200). 삭제·비공개는 빠진다
  · 애니 릴스: 인스타·페이스북 게시(status=posted) 후 4시간이 지난 것만
  · 둘 중 하나라도 있는 설교만 페이지를 만든다(제목·영상뿐인 얇은 페이지는 만들지 않음)
  · 설교 대목 글은 교정 확인 전이라 아직 내보내지 않는다(설계 T4·T6)
  · 성경 책 이름은 표(bible_books.json)에 있는 표기만 정식 이름으로 바꾼다. 없으면 받은 그대로(추측 금지)

실행:  python3 scripts/export-sermons.py            → data/sermons/ 갱신
       python3 scripts/export-sermons.py --preview  → 게시 전 릴스도 포함해 --out 폴더로(미리보기 전용, 커밋 금지)
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
            if r.get("format") == "A":
                item["items"] = r.get("items", []); item["threshold"] = r.get("threshold", 0)
            else:
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
    for f in data_dir.glob("*.json"):
        if f.name not in keep:
            f.unlink(); print("제외(공개 조건 미충족):", f.name)


if __name__ == "__main__":
    main()
