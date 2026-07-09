/* ============================================================
   PPT 신선도 표시 — 상단바 "⬇ 받기" 버튼의 작은 점 (관리자·owner)
   - 목적: 다운로드 후 곡·목사님 입력이 바뀌면 "옛 PPT를 방송에 올리는" 사고 방지
   - 3상태:  none  = 이번 주 이 기기에서 아직 안 받음
             stale = 받은 뒤 내용이 바뀜 → 다시 받기 권장
             fresh = 최신(표시 없음)
   - 버전 = 그 주 곡·목사님 입력의 updated_at 중 최신값. weekId별로 다운로드 시점 버전을
            기기(localStorage)에 기록해 비교. 감지는 화면 이동·탭 복귀 때(가벼움).
   - 서버(getWeek)만 재사용 — SQL·Edge Function 변경 없음.
   ============================================================ */

const PptFresh = (function () {
  const KEY = 'kzppt_dl_';          // + weekId → 이 기기가 마지막으로 받은 버전
  let curWeekId = null;
  let curVersion = '0';             // 현재(서버/로드) 데이터 버전
  let notify = function () {};

  // getWeek 원본 → 이 주 데이터 버전(곡·목사님 updated_at 최신값)
  function versionOf(week) {
    let mx = '0';
    ((week && week.songs) || []).forEach(function (s) {
      if (s.updated_at && s.updated_at > mx) mx = s.updated_at;
    });
    const p = week && week.pastor;
    if (p && p.updated_at && p.updated_at > mx) mx = p.updated_at;
    return mx;
  }

  // 이미 불러온 주 데이터로 현재 버전 갱신(네트워크 없이)
  function refreshFromWeek(week) {
    if (!week || !week.weekId) return;
    curWeekId = week.weekId;
    curVersion = versionOf(week);
    notify();
  }

  // 다운로드 성공 시 호출 — 그때의 버전을 이 기기 기준으로 기록
  function markDownloaded(weekId, version) {
    if (!weekId) return;
    try { localStorage.setItem(KEY + weekId, version || '0'); } catch (e) {}
    curWeekId = weekId;
    if (version && version > curVersion) curVersion = version;
    notify();
  }

  function state() {
    if (!curWeekId) return 'fresh';           // 아직 아는 게 없음 → 점 미표시
    let dl = null;
    try { dl = localStorage.getItem(KEY + curWeekId); } catch (e) {}
    if (dl === null) return 'none';           // 이번 주 이 기기에서 아직 안 받음
    if (curVersion && curVersion > dl) return 'stale';  // 받은 뒤 변경됨
    return 'fresh';
  }

  let probing = false;
  async function probe() {                     // 탭 복귀·화면 이동 시 서버에 최신 버전 확인
    if (!CONFIG.USE_SERVER || probing) return;
    probing = true;
    try { refreshFromWeek(await API.call('getWeek')); }
    catch (e) {}
    finally { probing = false; }
  }

  return { versionOf, refreshFromWeek, markDownloaded, state, probe, setNotify: function (fn) { notify = fn; } };
})();
window.PptFresh = PptFresh;
