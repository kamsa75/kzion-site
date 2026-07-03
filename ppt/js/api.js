/* ============================================================
   서버 API 클라이언트 — Edge Function `api` 호출 래퍼 (D14)
   모든 요청: POST { action, token, ...payload }
   ============================================================ */

const API = (function () {
  const TOKEN_KEY = 'kzppt_token';

  async function call(action, payload = {}) {
    const res = await fetch(CONFIG.FUNCTIONS_URL + '/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, token: localStorage.getItem(TOKEN_KEY) || undefined, ...payload })
    });
    let data;
    try { data = await res.json(); } catch (e) { data = { error: '서버 응답을 읽지 못했습니다' }; }
    if (!res.ok) {
      const err = new Error(data.error || '서버 오류 (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    call,
    setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
    clearToken: () => localStorage.removeItem(TOKEN_KEY),
    hasToken: () => !!localStorage.getItem(TOKEN_KEY)
  };
})();
