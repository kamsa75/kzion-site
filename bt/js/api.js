/* ============================================================
   주보 API 클라이언트 — Edge Function `bt` 호출 래퍼
   PPT의 api.js와 같은 패턴. 토큰은 PPT와 공유(같은 sessions).
   ★ 로그인(login) 자체는 기존 api 함수가 발급 → 여기선 bt만 호출.
   ============================================================ */

const BT_API = (function () {
  // PPT와 동일 키 — 한쪽에서 로그인하면 다른 쪽도 그대로 입장(목사님 편의)
  const TOKEN_KEY = 'kzppt_token';

  async function post(fnName, action, payload = {}) {
    const res = await fetch(BT_CONFIG.FUNCTIONS_URL + '/' + fnName, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        token: localStorage.getItem(TOKEN_KEY) || undefined,
        ...payload,
      }),
    });
    let data;
    try { data = await res.json(); } catch (e) { data = { error: '서버 응답을 읽지 못했습니다' }; }
    if (!res.ok) {
      const err = new Error(data.error || '서버 오류 (' + res.status + ')');
      err.status = res.status;
      err.conflict = !!data.conflict;
      err.serverUpdatedAt = data.serverUpdatedAt;
      throw err;
    }
    return data;
  }

  return {
    // 주보 서버 호출
    call: (action, payload) => post('bt', action, payload),
    // 로그인·로그아웃은 기존 api 함수 (PIN 검증·세션 발급이 거기 있음)
    login: (pin) => post('api', 'login', { pin }),
    logout: () => post('api', 'logout').catch(() => {}),
    setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
    clearToken: () => localStorage.removeItem(TOKEN_KEY),
    hasToken: () => !!localStorage.getItem(TOKEN_KEY),
  };
})();
