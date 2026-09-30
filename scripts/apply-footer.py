#!/usr/bin/env python3
"""모든 공개 페이지의 푸터를 scripts/footer.html 하나로 맞춘다(말씀 페이지는 build-sermons.mjs가 같은 파일을 읽음).
실행: python3 scripts/apply-footer.py   — 푸터 문구를 바꿀 땐 footer.html만 고치고 이 스크립트와 말씀 빌드를 다시 돌린다."""
import re
from pathlib import Path
R = Path(__file__).resolve().parent.parent
FOOT = (R / "scripts" / "footer.html").read_text(encoding="utf-8").strip()
CSS = '<link rel="stylesheet" href="css/footer.css?v=20260929a">'
for name in ["index.html", "worship.html", "staff.html", "pastor.html", "404.html", "travel.html"]:
    p = R / name
    s = p.read_text(encoding="utf-8")
    s2, n = re.subn(r'<footer class="site-footer[^"]*">.*?</footer>', lambda m: FOOT, s, count=1, flags=re.S)
    assert n == 1, name
    s2 = re.sub(r'<link rel="stylesheet" href="css/footer\.css[^"]*">\n', "", s2)
    anchor = re.search(r'<link rel="stylesheet" href="css/style\.css[^"]*">\n', s2) or \
             re.search(r'<link rel="stylesheet" as="style" crossorigin href="https://cdn\.jsdelivr\.net/gh/orioncactus/pretendard[^"]*">\n', s2)
    s2 = s2[:anchor.end()] + CSS + "\n" + s2[anchor.end():]
    if s2 != s:
        p.write_text(s2, encoding="utf-8"); print("푸터 맞춤:", name)
