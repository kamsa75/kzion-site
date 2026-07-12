// ============================================================
// 주일예배 PPT 허브 — 단일 API Edge Function (D14)
// 모든 DB·스토리지 접근이 이 함수를 경유한다.
// 인증: login으로 발급된 세션 토큰(30일, D3)을 매 요청 body.token으로 검증.
// 배포: Supabase 대시보드 → Edge Functions → 이름 "api" → 이 파일 붙여넣기
//       → 함수 설정에서 "Verify JWT" 끄기 (자체 토큰 인증 사용)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const DEFAULT_MODEL = "claude-haiku-4-5"; // 관리자가 settings 테이블에서 변경 가능 (지침 6번)

// 가사 추출 프롬프트 (지침 12-1~12-7). 이미지/텍스트 공용.
const EXTRACT_SYSTEM =
  "당신은 한국 교회 예배용 악보에서 가사만 정확히 추출하는 도구입니다. " +
  "설명 없이 지정된 JSON 스키마로만 답하세요.";

function extractInstruction(): string {
  return [
    "이 악보(또는 붙여넣은 텍스트)에서 부르는 가사만 추출해 절/후렴 블록으로 재조립하세요.",
    "규칙:",
    "0) 악보 상단에 적힌 곡 제목을 title에 넣으세요. 제목이 안 보이면 빈 문자열.",
    "1) 멜리스마 대시 제거: '드-리니' → '드리니'. 음표 단위로 붙은 음절의 띄어쓰기 복원: '아버지사랑내가노래해' → '아버지 사랑 내가 노래해'.",
    "2) 다절 스택(가장 중요): 한 멜로디 줄 아래 가사가 여러 줄 세로로 쌓여 있으면, 각 세로 위치는 서로 다른 절(또는 반복 회차)입니다. 절을 조립할 때는 모든 멜로디 줄에서 **같은 세로 위치의 가사끼리만** 이어 붙이세요. 위치가 다른 스택 줄을 한 절에 섞으면 절대 안 됩니다. 맨 앞의 '1.' '2.' 번호가 절 번호입니다.",
    "3) 반복 기호를 따라 부르는 순서로 재조립: 도돌이표(:||)는 그 구간을 다시 부르는 것이고, 그 구간에 가사가 2줄 쌓여 있으면 1회차=윗줄, 2회차=아랫줄입니다. 1./2. 엔딩(첫 번째/두 번째 마침)은 회차별로 해당 엔딩만 부릅니다. 'D.C. al Fine'은 곡 처음으로 돌아가 'Fine'에서 끝나는 것입니다. 여러 절이 후렴을 공유하면 절 블록 N개 + 후렴 블록 1개로 나누세요.",
    "3-1) 자기 검증: 조립을 마친 뒤, 악보에 인쇄된 모든 가사 음절이 빠짐없이 정확히 한 번씩(반복 기호에 의한 반복 제외) 어떤 블록에 들어갔는지 확인하세요. 악보에 없는 단어를 지어내거나, 서로 다른 절의 구절을 합쳐 새 문장을 만들면 안 됩니다.",
    "4) 각 블록의 lines는 부르기 좋은 길이로, 기본적으로 짧은 소절 2개를 한 줄로 합친 수준(공백 포함 약 20~28자)으로 나누세요. breaks는 lines 사이마다 슬라이드를 나눌지(true=나눔)를 나타내며 기본은 2줄씩 한 슬라이드가 되도록 채우세요(즉 두 줄마다 true).",
    "5) 판독 원칙(매우 중요): 악보에 인쇄된 글자를 실제로 읽어서만 옮기세요. 음표 아래 한글이 작거나 흐려 또렷이 안 보이면, 문맥상 그럴듯한 예배 가사를 지어내지 말고 보이는 그대로 최선의 글자를 적되 그 단어 인덱스(0부터)를 그 줄의 low 배열에 반드시 넣으세요. 확신이 없으면 확신 있는 척하지 말 것 — 틀린 글자를 자신 있게 적는 것보다 low로 표시하는 편이 낫습니다. 곡 제목이나 자주 쓰는 찬양 관용구로 빈칸을 채우지 마세요. 확실히 읽은 단어만 low에서 빼세요.",
    "6) 사진 잘림 판정(crop): 오선이 이미지 가장자리에서 물리적으로 절단됐거나 종지선(겹세로줄)이 보이지 않을 때만 crop=true. 가사·멜로디 내용으로 추측하지 마세요. 텍스트 입력일 땐 항상 false.",
    "type은 verse/chorus/bridge 중 하나, label은 '1절','후렴' 등 한국어 라벨.",
  ].join("\n");
}

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer" },
    title: { type: "string" },
    crop: { type: "boolean" },
    crop_reason: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["verse", "chorus", "bridge"] },
          label: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                low: { type: "array", items: { type: "integer" } },
              },
              required: ["text", "low"],
            },
          },
          breaks: { type: "array", items: { type: "boolean" } },
        },
        required: ["id", "type", "label", "lines", "breaks"],
      },
    },
  },
  required: ["version", "title", "crop", "crop_reason", "blocks"],
};

async function extractModel(): Promise<string> {
  const { data } = await db.from("settings").select("value").eq("key", "extract_model").maybeSingle();
  return (data && data.value) || DEFAULT_MODEL;
}

async function callClaude(content: unknown[]): Promise<Record<string, unknown>> {
  const model = await extractModel();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 24000, // Sonnet5는 적응형 사고에도 토큰을 쓰므로 긴 곡(다절) JSON이 잘리지 않게 여유 확보
      system: EXTRACT_SYSTEM,
      output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "추출 API 오류 " + res.status);
  }
  if (data.stop_reason === "refusal") throw new Error("추출이 거부되었습니다");
  if (data.stop_reason === "max_tokens")
    throw new Error("가사가 너무 길어 추출이 중간에 잘렸습니다. 페이지를 나눠 올리거나 가사 붙여넣기로 시도해 주세요.");
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
  if (!textBlock) throw new Error("추출 결과가 비어 있습니다");
  return JSON.parse(textBlock.text);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

// 이번 주 예배 일요일 (시애틀 PT 기준 — D4). 오늘이 일요일이면 오늘.
function currentWeekId(): string {
  const pt = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const target = new Date(
    pt.getFullYear(),
    pt.getMonth(),
    pt.getDate() + ((7 - pt.getDay()) % 7),
  );
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
}

async function auth(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const { data } = await db
    .from("sessions")
    .select("role, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.role as string;
}

// 주차 문서가 없으면 생성 (온디맨드 — pg_cron 월요일 생성은 보조)
async function ensureWeek(weekId: string) {
  await db.from("weeks").upsert({ id: weekId }, { onConflict: "id", ignoreDuplicates: true });
  await db.from("pastor_inputs").upsert(
    { week_id: weekId },
    { onConflict: "week_id", ignoreDuplicates: true },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  const action = String(body.action || "");

  // ── 로그인 (토큰 불필요) ──
  if (action === "login") {
    const { data: role, error } = await db.rpc("verify_pin", {
      p: String(body.pin || ""),
    });
    if (error || !role) return json({ error: "PIN이 올바르지 않습니다" }, 401);
    // 만료 세션 청소(가벼운 하우스키핑)
    await db.from("sessions").delete().lt("expires_at", new Date().toISOString());
    const { data: sess, error: e2 } = await db
      .from("sessions")
      .insert({ role })
      .select("token")
      .single();
    if (e2 || !sess) return json({ error: "세션 생성 실패" }, 500);
    return json({ token: sess.token, role });
  }

  // ── 이하 전부 토큰 필요 ──
  const role = await auth(body.token as string | undefined);
  if (!role) return json({ error: "다시 로그인해 주세요" }, 401);
  const weekId = currentWeekId();

  switch (action) {
    case "logout": {
      await db.from("sessions").delete().eq("token", body.token as string);
      return json({ ok: true });
    }

    // 이번 주 문서 로드 (역할별 필요한 것만)
    case "getWeek": {
      await ensureWeek(weekId);
      const out: Record<string, unknown> = { weekId, role };
      if (role === "pastor" || role === "admin" || role === "owner") {
        const { data } = await db
          .from("pastor_inputs")
          .select("data, hymn_images, updated_at")
          .eq("week_id", weekId)
          .maybeSingle();
        out.pastor = data;
      }
      if (role === "praise" || role === "choir") {
        const { data } = await db
          .from("songs")
          .select("*")
          .eq("week_id", weekId)
          .eq("role", role)
          .order("position");
        out.songs = data || [];
      }
      if (role === "admin" || role === "owner") {   // 관리자·본부장 = 전체 곡 열람(PPT 생성)
        const { data } = await db
          .from("songs")
          .select("*")
          .eq("week_id", weekId)
          .order("role")
          .order("position");
        out.songs = data || [];
      }
      // 섹션 완료 플래그(찬양팀·성가대) — 담당자가 '이번 주 준비 완료'를 눌렀는지. 워커는 본인 것만, 관리자·본부장은 전체
      {
        let q = db.from("section_done").select("role, done").eq("week_id", weekId);
        if (role === "praise" || role === "choir") q = q.eq("role", role);
        const { data: dq } = await q;
        const doneOut: Record<string, boolean> = {};
        (dq || []).forEach((r: { role: string; done: boolean }) => { doneOut[r.role] = !!r.done; });
        out.sectionDone = doneOut;
      }
      return json(out);
    }

    // 섹션 '이번 주 준비 완료' 토글 (찬양팀·성가대) — 곡과 별개의 작은 플래그
    case "setDone": {
      if (role !== "praise" && role !== "choir") return json({ error: "권한 없음" }, 403);
      await ensureWeek(weekId);
      const { error } = await db
        .from("section_done")
        .upsert(
          { week_id: weekId, role, done: Boolean(body.done), updated_at: new Date().toISOString() },
          { onConflict: "week_id,role" },
        );
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true });
    }

    // 목사님 섹션 저장 (자동 저장 — 지침 3번). 목사님 본인 + 본부장(owner)
    case "savePastor": {
      if (role !== "pastor" && role !== "owner") return json({ error: "권한 없음" }, 403);
      await ensureWeek(weekId);
      // 저장 충돌 감지: 내가 불러온 시점(baseUpdatedAt) 이후 남이 저장했으면 막고 알림
      if (body.baseUpdatedAt) {
        const { data: cur } = await db
          .from("pastor_inputs").select("updated_at").eq("week_id", weekId).maybeSingle();
        if (cur && cur.updated_at && new Date(cur.updated_at) > new Date(body.baseUpdatedAt as string)) {
          return json({ error: "conflict", conflict: true, serverUpdatedAt: cur.updated_at }, 409);
        }
      }
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = { updated_at: nowIso };
      if (body.data !== undefined) patch.data = body.data;
      if (body.hymnImages !== undefined) patch.hymn_images = body.hymnImages;
      const { error } = await db
        .from("pastor_inputs")
        .update(patch)
        .eq("week_id", weekId);
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true, updatedAt: nowIso });
    }

    // 곡 저장 (신규/수정 겸용). 담당자(자기 섹션) + 관리자·본부장(찬양팀·성가대 대리 편집)
    case "saveSong": {
      const canEdit = role === "praise" || role === "choir" || role === "admin" || role === "owner";
      if (!canEdit) return json({ error: "권한 없음" }, 403);
      await ensureWeek(weekId);
      const s = (body.song || {}) as Record<string, unknown>;
      // 대상 섹션(곡 소속): 담당자는 자기 역할, 관리자·본부장은 곡의 role을 지정받음
      const target = (role === "praise" || role === "choir") ? role : String(s.role ?? "");
      if (target !== "praise" && target !== "choir")
        return json({ error: "곡 소속(role)이 올바르지 않습니다" }, 400);
      const nowIso = new Date().toISOString();
      const row: Record<string, unknown> = {
        week_id: weekId,
        role: target,
        name: String(s.name ?? ""),
        position: Number(s.position ?? 0),
        status: String(s.status ?? "review"),
        song_type: (s.songType === "special" ? "special" : "choir"), // 성가대 기본 / 특송
        song_performer: String(s.performer ?? ""),   // 특송 이름/팀 (성가대는 빈 값 — 자막엔 '시온 성가대')
        blocks: s.blocks ?? null,
        ord: s.ord ?? [],
        arrange: s.arrange ?? null,          // 세트 편곡(회차·×N·간주·메모) — D29
        song_key: String(s.songKey ?? ""),   // 곡 키
        images: s.images ?? [],
        warn_dark: Boolean(s.warnDark),
        updated_at: nowIso,
      };
      let q;
      if (s.id) {
        // 저장 충돌 감지 (신규 곡은 검사 안 함)
        if (body.baseUpdatedAt) {
          const { data: cur } = await db
            .from("songs").select("updated_at").eq("id", s.id).maybeSingle();
          if (cur && cur.updated_at && new Date(cur.updated_at) > new Date(body.baseUpdatedAt as string)) {
            return json({ error: "conflict", conflict: true, serverUpdatedAt: cur.updated_at }, 409);
          }
        }
        q = await db.from("songs").update(row).eq("id", s.id).eq("role", target).select("id, updated_at").single();
      } else {
        q = await db.from("songs").insert(row).select("id, updated_at").single();
      }
      if (q.error || !q.data) return json({ error: "저장 실패" }, 500);
      return json({ ok: true, id: q.data.id, updatedAt: q.data.updated_at });
    }

    case "deleteSong": {
      const canEdit = role === "praise" || role === "choir" || role === "admin" || role === "owner";
      if (!canEdit) return json({ error: "권한 없음" }, 403);
      const del = db.from("songs").delete().eq("id", body.id as string);
      // 담당자는 자기 섹션만, 관리자·본부장은 id로 삭제(찬양팀·성가대 어느 쪽이든)
      if (role === "praise" || role === "choir") del.eq("role", role);
      await del;
      return json({ ok: true });
    }

    // 지난 곡 불러오기 — 곡명으로 과거 '가장 최근 1건'의 콘티·자막 반환 (설계 2026-07-12).
    //   정규화(공백·기호 무시)로 매칭, 이번 주 제외, 내용(blocks) 있는 것만. 버전 목록 없이 최신 1건.
    case "songLookup": {
      if (role !== "praise" && role !== "choir" && role !== "admin" && role !== "owner")
        return json({ error: "권한 없음" }, 403);
      const norm = (x: string) => x.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
      const q = norm(String(body.name || ""));
      if (!q) return json({ match: null });
      const target = (role === "praise" || role === "choir") ? role : String(body.role || "");
      if (target !== "praise" && target !== "choir") return json({ match: null });
      const cur = currentWeekId();
      // 1단계: 가벼운 목록(id·name·week_id)만 받아 정규화 매칭으로 '가장 최근 1건' 찾기 (가사 대량 전송 회피)
      const { data: list } = await db
        .from("songs")
        .select("id, name, week_id")
        .eq("role", target)
        .order("week_id", { ascending: false });
      const found = (list || []).find((r: Record<string, unknown>) =>
        r.week_id !== cur && norm(String(r.name || "")) === q);
      if (!found) return json({ match: null });
      // 2단계: 매칭된 그 1건의 내용만 조회
      const { data: full } = await db
        .from("songs")
        .select("name, blocks, ord, arrange, song_key, week_id")
        .eq("id", found.id as string)
        .maybeSingle();
      return json({ match: full || null });
    }

    // 이미지 업로드용 서명 URL 발급 (지침 5번 — 키는 서버에만). 담당자 + 관리자·본부장(대리 편집)
    case "uploadUrl": {
      // 저장 경로용 섹션: 담당자는 자기 역할, 관리자·본부장은 지정받은 섹션(없으면 misc)
      const seg = (role === "praise" || role === "choir" || role === "pastor")
        ? role
        : (String(body.sectionRole ?? "") || "misc");
      const path = `${weekId}/${seg}/${crypto.randomUUID()}.jpg`;
      const { data, error } = await db.storage.from("scores").createSignedUploadUrl(path);
      if (error || !data) return json({ error: "업로드 URL 발급 실패" }, 500);
      return json({ path, url: data.signedUrl });
    }

    // 저장된 이미지 열람용 서명 URL (1시간)
    case "imageUrls": {
      const paths = (body.paths as string[]) || [];
      if (!paths.length) return json({ urls: [] });
      const { data, error } = await db.storage.from("scores").createSignedUrls(paths, 3600);
      if (error || !data) return json({ error: "URL 발급 실패" }, 500);
      return json({ urls: data.map((d) => d.signedUrl) });
    }

    // ── 관리자 자산: 날짜 썸네일·봉헌송·폐회송·마침 이미지 (④-a, D21·D22) ──
    // 교회 공용·매주 재사용. assets 테이블(key→paths jsonb)에 저장, 파일은 scores 버킷 assets/ 경로
    case "assetUploadUrl": {
      if (role !== "owner") return json({ error: "권한 없음" }, 403);   // 관리(저장)는 본부장만
      const kind = String(body.kind || "misc").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "misc";
      const path = `assets/${kind}/${crypto.randomUUID()}.jpg`;
      const { data, error } = await db.storage.from("scores").createSignedUploadUrl(path);
      if (error || !data) return json({ error: "업로드 URL 발급 실패" }, 500);
      return json({ path, url: data.signedUrl });
    }

    case "getAssets": {
      if (role !== "admin" && role !== "owner") return json({ error: "권한 없음" }, 403);   // 읽기(PPT 생성)는 관리자·본부장
      const { data: rows } = await db.from("assets").select("key, paths");
      const all = (rows || []).flatMap((r) => (r.paths as string[]) || []);
      const urls: Record<string, string> = {};
      if (all.length) {
        const { data: signed } = await db.storage.from("scores").createSignedUrls(all, 3600);
        (signed || []).forEach((s, i) => { if (s.signedUrl) urls[all[i]] = s.signedUrl; });
      }
      return json({ assets: rows || [], urls });
    }

    case "saveAsset": {
      if (role !== "owner") return json({ error: "권한 없음" }, 403);   // 관리(저장)는 본부장만
      const key = String(body.key || "").slice(0, 64);
      if (!key) return json({ error: "key 필요" }, 400);
      const paths = (body.paths as string[]) || [];
      const { error } = await db
        .from("assets")
        .upsert({ key, paths, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true });
    }

    // ── 관리자 고정 문구 (사도신경 본문·다함께 찬양 곡명 등, B) — settings 테이블 ──
    case "getSettings": {
      if (role !== "admin" && role !== "owner") return json({ error: "권한 없음" }, 403);   // 읽기(PPT 생성)는 관리자·본부장
      const { data } = await db.from("settings").select("key, value");
      const map: Record<string, string> = {};
      (data || []).forEach((r) => { map[r.key] = r.value; });
      return json({ settings: map });
    }

    case "saveSetting": {
      if (role !== "owner") return json({ error: "권한 없음" }, 403);   // 관리(저장)는 본부장만
      const key = String(body.key || "").slice(0, 64);
      if (!key) return json({ error: "key 필요" }, 400);
      const value = String(body.value ?? "");
      const { error } = await db
        .from("settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true });
    }

    // 악보 이미지 → 가사 추출 (지침 12번). storage 경로 배열을 받아 서버가 내려받아 비전 호출
    case "extract": {
      if (role !== "praise" && role !== "choir" && role !== "pastor" && role !== "admin" && role !== "owner")
        return json({ error: "권한 없음" }, 403);
      if (!ANTHROPIC_KEY) return json({ error: "추출 키가 설정되지 않았습니다(관리자 문의)" }, 500);
      const paths = (body.paths as string[]) || [];
      if (!paths.length) return json({ error: "이미지가 없습니다" }, 400);
      const content: unknown[] = [];
      for (const p of paths.slice(0, 12)) {
        const { data: blob, error } = await db.storage.from("scores").download(p);
        if (error || !blob) return json({ error: "악보를 불러오지 못했습니다" }, 500);
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) },
        });
      }
      content.push({ type: "text", text: extractInstruction() });
      try {
        const result = await callClaude(content);
        return json(result);
      } catch (e) {
        return json({ error: (e as Error).message }, 502);
      }
    }

    // 가사 붙여넣기 반자동 모드 (지침 12-7): 텍스트를 절/후렴 분류 + 2줄 분할
    case "extractText": {
      if (role !== "praise" && role !== "choir" && role !== "pastor" && role !== "admin" && role !== "owner")
        return json({ error: "권한 없음" }, 403);
      if (!ANTHROPIC_KEY) return json({ error: "추출 키가 설정되지 않았습니다(관리자 문의)" }, 500);
      const text = String(body.text || "").trim();
      if (!text) return json({ error: "텍스트가 비어 있습니다" }, 400);
      const content = [{ type: "text", text: extractInstruction() + "\n\n[붙여넣은 가사]\n" + text }];
      try {
        const result = await callClaude(content);
        return json(result);
      } catch (e) {
        return json({ error: (e as Error).message }, 502);
      }
    }

    // 담당자 PIN 설정·변경 (owner 전용). PIN 평문은 로그·응답에 남기지 않음 (지침 10)
    case "setPin": {
      if (role !== "owner") return json({ error: "권한 없음" }, 403);
      const target = String(body.role || "");
      if (!["pastor", "praise", "choir", "admin", "owner"].includes(target))
        return json({ error: "알 수 없는 역할" }, 400);
      const pin = String(body.pin || "");
      if (!/^\d{4,8}$/.test(pin)) return json({ error: "PIN은 숫자 4~8자리로 설정해 주세요" }, 400);
      const { error } = await db.rpc("set_pin", { r: target, p: pin });
      if (error) return json({ error: "PIN 저장 실패(set_pin 함수가 배포됐는지 확인)" }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "알 수 없는 요청: " + action }, 400);
  }
});
