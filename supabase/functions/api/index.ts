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
      if (role === "pastor" || role === "admin") {
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
      if (role === "admin") {
        const { data } = await db
          .from("songs")
          .select("*")
          .eq("week_id", weekId)
          .order("role")
          .order("position");
        out.songs = data || [];
      }
      return json(out);
    }

    // 목사님 섹션 저장 (자동 저장 — 지침 3번)
    case "savePastor": {
      if (role !== "pastor") return json({ error: "권한 없음" }, 403);
      await ensureWeek(weekId);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.data !== undefined) patch.data = body.data;
      if (body.hymnImages !== undefined) patch.hymn_images = body.hymnImages;
      const { error } = await db
        .from("pastor_inputs")
        .update(patch)
        .eq("week_id", weekId);
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true });
    }

    // 곡 저장 (신규/수정 겸용)
    case "saveSong": {
      if (role !== "praise" && role !== "choir") return json({ error: "권한 없음" }, 403);
      await ensureWeek(weekId);
      const s = (body.song || {}) as Record<string, unknown>;
      const row: Record<string, unknown> = {
        week_id: weekId,
        role,
        name: String(s.name ?? ""),
        position: Number(s.position ?? 0),
        status: String(s.status ?? "review"),
        blocks: s.blocks ?? null,
        ord: s.ord ?? [],
        images: s.images ?? [],
        warn_dark: Boolean(s.warnDark),
        updated_at: new Date().toISOString(),
      };
      let q;
      if (s.id) {
        q = await db.from("songs").update(row).eq("id", s.id).eq("role", role).select("id").single();
      } else {
        q = await db.from("songs").insert(row).select("id").single();
      }
      if (q.error || !q.data) return json({ error: "저장 실패" }, 500);
      return json({ ok: true, id: q.data.id });
    }

    case "deleteSong": {
      if (role !== "praise" && role !== "choir") return json({ error: "권한 없음" }, 403);
      await db.from("songs").delete().eq("id", body.id as string).eq("role", role);
      return json({ ok: true });
    }

    // 이미지 업로드용 서명 URL 발급 (지침 5번 — 키는 서버에만)
    case "uploadUrl": {
      if (role === "admin") return json({ error: "권한 없음" }, 403);
      const path = `${weekId}/${role}/${crypto.randomUUID()}.jpg`;
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

    default:
      return json({ error: "알 수 없는 요청: " + action }, 400);
  }
});
