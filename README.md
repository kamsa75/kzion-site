# 시애틀 시온장로교회 — 정적 홈페이지

WordPress에서 옮긴 가볍고 깔끔한 정적 사이트입니다. GitHub Pages에 그대로 올리면 됩니다.

## 폴더 구조
```
kzion-site/
├── index.html        홈
├── worship.html      예배안내
├── staff.html        섬기는 이들
├── pastor.html       담임목사
├── 404.html
├── css/style.css
├── images/           ← 이미지 5개를 여기에 넣으세요
├── files/            ← ePub 파일을 여기에 넣으세요
├── CNAME             도메인 연결용 (kzion.net)
└── robots.txt
```

---

## ✅ 1단계: 이미지·ePub 채우기 (SiteGround 취소 전, 지금!)

사이트는 이미지가 없어도 깨지지 않게 만들었지만(없으면 자동으로 숨김),
아래 파일을 채우면 완전한 모습이 됩니다. **아직 살아있는 kzion.net에서** 아래 주소를
브라우저로 열어 "이미지를 다른 이름으로 저장"한 뒤, **정확히 이 파일명으로** 해당 폴더에 넣으세요.

### images/ 폴더에 넣을 이미지 (4개)

| 저장할 파일명 | 원본 주소 (지금 브라우저로 열어 저장) |
|---|---|
| `images/favicon.png` | https://www.kzion.net/wp-content/uploads/2022/10/cropped-favicon-270x270.png |
| `images/young2.jpg` | https://www.kzion.net/wp-content/uploads/2025/05/young2.jpeg |
| `images/pastor.jpg` | https://www.kzion.net/wp-content/uploads/2025/05/KakaoTalk_Photo_2025-05-01-21-54-20-1-1.jpeg |
| `images/book-cover.jpg` | https://www.kzion.net/wp-content/uploads/2025/04/calling05-793x1024.jpg |

> 확장자가 `.jpeg`여도 저장할 때 이름을 `.jpg`로 맞춰 주세요 (위 표 그대로).

### files/ 폴더에 넣을 ePub (1개)

| 저장할 파일명 | 원본 주소 |
|---|---|
| `files/부르심_3.0.epub` | https://www.kzion.net/wp-content/uploads/2025/04/부르심_3.0.epub |

---

## ✅ 2단계: 로컬에서 확인

`index.html`을 브라우저로 더블클릭해서 열어 보세요. 이미지가 다 보이고 메뉴 이동이
정상이면 준비 완료입니다.

---

## ✅ 3단계: GitHub Pages에 올리기

1. GitHub에서 새 저장소(repository) 생성 (교회용 Organization 권장)
2. 이 폴더의 **모든 파일을 저장소에 업로드** (images/, files/ 안의 파일까지 포함)
3. 저장소 **Settings → Pages** → Source를 `main` 브랜치 `/ (root)`로 지정
4. 같은 화면 **Custom domain**에 `kzion.net` 입력 → 저장 (CNAME 파일이 이미 들어있음)
5. **Enforce HTTPS** 체크

## ✅ 4단계: 도메인 DNS 연결 (도메인 등록처에서)

- `kzion.net` (apex) → **A 레코드 4개**
  - 185.199.108.153
  - 185.199.109.153
  - 185.199.110.153
  - 185.199.111.153
- `www` → **CNAME** → `<GitHub계정 또는 org명>.github.io`

DNS 전파(최대 1~2일)와 HTTPS 인증서 발급을 기다린 뒤, kzion.net이 새 사이트로
정상 접속되는지 확인합니다. **그 확인이 끝난 다음에** SiteGround 호스팅을 취소하세요.

---

## 🔄 나중에 설교 영상 바꾸기

`index.html`에서 아래 부분의 `mpG7pq0nuiw`(유튜브 영상 ID)와 제목만 바꾸면 됩니다.
```html
<iframe src="https://www.youtube.com/embed/영상ID" ...></iframe>
```
유튜브 영상 주소가 `youtube.com/watch?v=ABC123`이면 `ABC123`이 영상 ID입니다.

## 메모
- 헌금 버튼은 교회 PayPal 계정(button id: ZRCRQD95SA2VU)으로 직접 연결되며, 호스팅과 무관하게 그대로 작동합니다.
- "워싱턴주 시애틀 정보" 게시판은 정리(제외)했습니다.
