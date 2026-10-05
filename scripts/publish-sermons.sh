#!/bin/bash
# 말씀 페이지 자동 갱신 — 본부장님 Mac에서 매시간(launchd: net.kzion.sermon-pages)
# 별도 사본(~/kzion-site-bot)에서만 동작한다. 구글 드라이브의 작업 폴더는 건드리지 않는다.
# 바뀐 것이 있을 때만 data/sermons · sermon/ · sitemap.xml · index.html(홈 '말씀' 영역만) 을 main에 커밋·푸시(CLAUDE.md 규칙 13).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
BOT="$HOME/kzion-site-bot"
REPO_URL="https://github.com/kamsa75/kzion-site.git"
LOCK="$BOT.lock"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 겹쳐 실행 방지
if ! mkdir "$LOCK" 2>/dev/null; then log "이미 실행 중 — 건너뜀"; exit 0; fi
trap 'rmdir "$LOCK"' EXIT

[ -d "$BOT/.git" ] || git clone -q "$REPO_URL" "$BOT" || { log "복제 실패"; exit 1; }
cd "$BOT" || exit 1
git checkout -q main && git fetch -q origin && git reset -q --hard origin/main || { log "최신 main 받기 실패"; exit 1; }

python3 scripts/export-sermons.py || { log "내보내기 실패"; exit 1; }
node scripts/build-sermons.mjs >/dev/null || { log "페이지 생성 실패"; exit 1; }

# 허용된 경로 밖이 바뀌었으면 멈춘다(안전장치)
other=$(git status --porcelain | awk '{print $2}' | grep -v -E '^(data/sermons/|sermon/|sitemap\.xml$|index\.html$)' || true)
if [ -n "$other" ]; then log "허용되지 않은 변경 — 커밋 안 함: $other"; git reset -q --hard origin/main; git clean -qfd; exit 1; fi
# 홈은 표시(<!-- 말씀:시작 --> ~ <!-- 말씀:끝 -->) 사이와 sermon.css/js 버전 숫자만 바뀌어야 한다
if ! git diff --quiet -- index.html; then
  if ! python3 - <<'PY'
import re, subprocess
new = open('index.html', encoding='utf-8').read()
old = subprocess.run(['git', 'show', 'HEAD:index.html'], capture_output=True).stdout.decode('utf-8')
def strip(t):
    t = re.sub(r'<!-- 말씀:시작.*?<!-- 말씀:끝 -->', '', t, flags=re.S)
    return re.sub(r'(css/sermon\.css|js/sermon\.js)\?v=\w+', r'\1', t)
raise SystemExit(0 if strip(new) == strip(old) else 1)
PY
  then log "홈의 말씀 영역 밖이 바뀜 — 커밋 안 함"; git reset -q --hard origin/main; git clean -qfd; exit 1; fi
fi
if [ -z "$(git status --porcelain -- data/sermons sermon sitemap.xml index.html)" ]; then log "변경 없음"; exit 0; fi

git add -A -- data/sermons sermon sitemap.xml index.html
git -c user.name="kzion-sermon-bot" -c user.email="kamsa75@users.noreply.github.com" \
  commit -q -m "chore: 말씀 페이지 자동 갱신 [skip ci]"
for i in 1 2 3; do
  if git push -q origin HEAD:main; then log "갱신 푸시: $(git log -1 --format=%h)"; exit 0; fi
  log "푸시 실패 — 최신을 받아 다시 시도($i)"; git pull -q --rebase origin main || { git rebase --abort; break; }
done
log "푸시 포기 — 다음 회차에 다시"; exit 1
