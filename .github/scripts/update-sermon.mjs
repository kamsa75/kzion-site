// 유튜브 '주일예배' 재생목록에서 가장 최근 설교를 찾아 sermon.json 에 기록.
// GitHub Actions(ubuntu-latest, Node 20)에서 서버측으로 실행되므로 프록시/CORS가 필요 없음.
import { writeFileSync, readFileSync } from 'node:fs';

const PLAYLIST = 'PLPzvxbIUN0KXbeQey49_OLQ-T7VKMXSmc'; // '주일예배' 재생목록
const KEY = process.env.YOUTUBE_API_KEY;

if (!KEY) {
  console.error('환경변수 YOUTUBE_API_KEY 가 없습니다. 저장소 Secrets 에 추가하세요.');
  process.exit(1);
}

// 재생목록의 모든 항목을 페이지네이션으로 수집
let items = [];
let pageToken = '';
for (let i = 0; i < 10; i++) {
  const url = 'https://www.googleapis.com/youtube/v3/playlistItems'
    + '?part=snippet,contentDetails&maxResults=50&playlistId=' + PLAYLIST
    + (pageToken ? '&pageToken=' + pageToken : '') + '&key=' + KEY;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('YouTube API 오류', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  items = items.concat(data.items || []);
  if (!data.nextPageToken) break;
  pageToken = data.nextPageToken;
}

// 실제 영상 게시일이 있는 항목만, 최신순 정렬
const valid = items.filter((it) => it.contentDetails && it.contentDetails.videoPublishedAt && it.contentDetails.videoId);
if (!valid.length) {
  console.error('재생목록에서 유효한 영상을 찾지 못했습니다.');
  process.exit(1);
}
valid.sort((a, b) => new Date(b.contentDetails.videoPublishedAt) - new Date(a.contentDetails.videoPublishedAt));
const top = valid[0];

const id = top.contentDetails.videoId;
const title = (top.snippet.title || '').replace(/^\d{4}[.\-]\d{2}[.\-]\d{2}\s*/, '').trim();

// 변경이 없으면 파일을 건드리지 않아 불필요한 커밋 방지
let prev = {};
try { prev = JSON.parse(readFileSync('sermon.json', 'utf8')); } catch (e) {}
if (prev.id === id && prev.title === title) {
  console.log('변경 없음:', id, title);
  process.exit(0);
}

const out = { id, title, updated: new Date().toISOString() };
writeFileSync('sermon.json', JSON.stringify(out, null, 2) + '\n');
console.log('갱신:', out);
