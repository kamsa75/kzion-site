// ============================================================
// 주보 생성 엔진 — 전용 Edge Function (컨셉 락 B11)
//
// ★ 기존 api 함수(PPT)와 분리돼 있다. api는 손대지 않는다 —
//   대시보드 붙여넣기는 파일 통째 교체라, 504줄짜리 PPT 심장부를 덮어쓰면
//   복사 실수 하나로 주일 방송이 멈춘다. 주보는 새 함수라 깨질 게 없다.
//
// 로그인은 api와 공유한다(같은 sessions 테이블) — 목사님은 PIN을 한 번만 넣는다.
// 인증: api의 login으로 발급된 세션 토큰을 매 요청 body.token으로 검증.
//
// 배포: Supabase 대시보드 → Edge Functions → 이름 "bt" → 이 파일 붙여넣기
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

// ---------- 날짜 유틸 (전부 UTC 정오 기준 — 서머타임·시차로 하루 밀리는 것 방지) ----------
const DAY = 86400000;

function d(iso: string): Date {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd, 12));
}
function iso(x: Date): string {
  return x.toISOString().slice(0, 10);
}
function addDays(x: Date, n: number): Date {
  return new Date(x.getTime() + n * DAY);
}
// 두 주일 사이의 주 수 (b가 뒤면 양수)
function weeksBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (7 * DAY));
}

// 다가오는 주일 (시애틀 PT 기준 — 오늘이 일요일이면 오늘). api의 currentWeekId와 동일 규칙.
function currentWeekId(): string {
  const pt = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const target = new Date(
    Date.UTC(pt.getFullYear(), pt.getMonth(), pt.getDate() + ((7 - pt.getDay()) % 7), 12),
  );
  return iso(target);
}

// 그 해의 첫 주일
function firstSundayOf(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1, 12));
  return addDays(jan1, (7 - jan1.getUTCDay()) % 7);
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

// 주보는 목사님과 본부장만
function canEdit(role: string): boolean {
  return role === "pastor" || role === "owner" || role === "admin";
}

// 주차 문서 보장 (weeks는 api와 공유 — 없으면 만든다)
async function ensureWeek(weekId: string) {
  await db.from("weeks").upsert({ id: weekId }, { onConflict: "id", ignoreDuplicates: true });
  await db.from("bulletin_inputs").upsert(
    { week_id: weekId },
    { onConflict: "week_id", ignoreDuplicates: true },
  );
}

// ============================================================
// 로테이션 엔진 (B1·B3 — 앵커 기준 순수 계산)
// ============================================================

type Pools = Record<string, string[]>;
type Anchor = { role: string; effective_from: string; spec: Record<string, unknown> };

async function loadPools(): Promise<Pools> {
  const { data } = await db.from("rotation_pools").select("id, member_names");
  const out: Pools = {};
  (data || []).forEach((r: { id: string; member_names: string[] }) => {
    out[r.id] = Array.isArray(r.member_names) ? r.member_names : [];
  });
  return out;
}

async function loadAnchors(role: string): Promise<Anchor[]> {
  const { data } = await db
    .from("rotation_anchors")
    .select("role, effective_from, spec")
    .eq("role", role)
    .order("effective_from");
  return (data || []) as Anchor[];
}

// 해당 주차에 적용될 앵커 = effective_from <= week 중 가장 늦은 것
function anchorFor(anchors: Anchor[], weekId: string): Anchor | null {
  let picked: Anchor | null = null;
  for (const a of anchors) {
    if (a.effective_from <= weekId) picked = a;
    else break;
  }
  return picked || anchors[0] || null;
}

// 기도 담당의 '상태' — 그 주에 각 풀의 다음 차례가 누구이고 3주 주기 어디인지.
// 이 값이 곧 그 주의 앵커 spec이 된다(수동 개입 시 그대로 재사용).
function prayerStateAt(
  anchors: Anchor[],
  pools: Pools,
  weekId: string,
): { phase: number; elder: string; deacon: string; assigned: string } | null {
  const a = anchorFor(anchors, weekId);
  if (!a) return null;
  const elders = pools["prayer_elders"] || [];
  const deacons = pools["prayer_deacons"] || [];
  if (!elders.length || !deacons.length) return null;

  const spec = a.spec as { elder: string; deacon: string; phase: number };
  const n = weeksBetween(d(a.effective_from), d(weekId));
  if (n < 0) return null;

  const phase0 = Number(spec.phase) || 0;
  let eldersElapsed = 0, deaconsElapsed = 0;
  for (let i = 0; i < n; i++) {
    if ((phase0 + i) % 3 === 2) deaconsElapsed++;
    else eldersElapsed++;
  }

  // 앵커 이름이 풀에서 빠졌으면(명단 편집) 0번부터 — 계산이 멈추지 않게
  const ei = Math.max(0, elders.indexOf(spec.elder));
  const di = Math.max(0, deacons.indexOf(spec.deacon));

  const phase = (phase0 + n) % 3;
  const elder = elders[(ei + eldersElapsed) % elders.length];
  const deacon = deacons[(di + deaconsElapsed) % deacons.length];
  return { phase, elder, deacon, assigned: phase === 2 ? deacon : elder };
}

// 봉헌위원 — 월 단위 순환
function offeringAt(anchors: Anchor[], pools: Pools, weekId: string): string | null {
  const a = anchorFor(anchors, weekId);
  const pool = pools["offering"] || [];
  if (!a || !pool.length) return null;
  const spec = a.spec as { month: string; name: string };
  const [ay, am] = String(spec.month).split("-").map(Number);
  const w = d(weekId);
  const months = (w.getUTCFullYear() - ay) * 12 + (w.getUTCMonth() + 1 - am);
  if (months < 0) return null;
  const i = Math.max(0, pool.indexOf(spec.name));
  return pool[(i + months) % pool.length];
}

// 그 주 전체 배정 — 오버라이드(수동·인쇄 스냅샷)가 계산보다 우선
async function assignmentsFor(weekIds: string[]) {
  const pools = await loadPools();
  const [pAnch, oAnch] = await Promise.all([loadAnchors("prayer"), loadAnchors("offering")]);
  const { data: overrides } = await db
    .from("rotation_assignments")
    .select("week_id, role, assigned, is_manual, locked_at")
    .in("week_id", weekIds);

  const ovMap = new Map<string, string>();
  const lockMap = new Map<string, boolean>();
  (overrides || []).forEach((r: {
    week_id: string; role: string; assigned: string; is_manual: boolean; locked_at: string | null;
  }) => {
    ovMap.set(`${r.week_id}|${r.role}`, r.assigned);
    if (r.locked_at) lockMap.set(`${r.week_id}|${r.role}`, true);
  });

  const { data: usherMeta } = await db
    .from("bulletin_meta").select("value").eq("key", "usher_current").maybeSingle();
  const usherNames = ((usherMeta?.value as { names?: string[] })?.names) || [];

  return weekIds.map((w) => {
    const pick = (role: string, computed: string | null) =>
      ovMap.get(`${w}|${role}`) ?? computed ?? "";
    const st = prayerStateAt(pAnch, pools, w);
    return {
      week: w,
      prayer: pick("prayer", st?.assigned ?? null),
      offering: pick("offering", offeringAt(oAnch, pools, w)),
      usher: pick("usher", usherNames.join(" ")),
      love_offering: ovMap.get(`${w}|love_offering`) ?? "",   // 손입력 전용(B5)
      love_service: ovMap.get(`${w}|love_service`) ?? "",     // 손입력 전용(B5)
      locked: lockMap.has(`${w}|prayer`),
      manual: {
        prayer: ovMap.has(`${w}|prayer`),
        offering: ovMap.has(`${w}|offering`),
        usher: ovMap.has(`${w}|usher`),
      },
    };
  });
}

// ---------- 권/호 (§4) ----------
async function volNo(weekId: string): Promise<{ vol: number; no: number }> {
  const { data } = await db
    .from("bulletin_meta").select("value").eq("key", "vol_seed").maybeSingle();
  const seed = (data?.value as { date: string; vol: number; no: number }) ||
    { date: "2026-07-19", vol: 41, no: 29 };
  const w = d(weekId);
  const year = w.getUTCFullYear();
  const seedYear = d(seed.date).getUTCFullYear();
  const no = weeksBetween(firstSundayOf(year), w) + 1;   // 그 해 몇 번째 주일
  const vol = seed.vol + (year - seedYear);              // 해 넘어가면 +1, 리셋 없음
  return { vol, no };
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

  const role = await auth(body.token as string | undefined);
  if (!role) return json({ error: "다시 로그인해 주세요" }, 401);
  if (!canEdit(role)) return json({ error: "권한 없음" }, 403);

  const weekId = String(body.weekId || currentWeekId());

  switch (action) {
    // ---------- 주보 한 판 통째로 ----------
    case "getBulletin": {
      await ensureWeek(weekId);

      // 4주 롤링 창 (이번 주 포함 앞 3주 — 7/19 주보 실측: 6/28~7/19)
      const window = [-3, -2, -1, 0].map((k) => iso(addDays(d(weekId), k * 7)));
      // 로테이션 표는 이번 주 + 다음 3주도 필요("예배를 섬기는 이들" 실측)
      const ahead = [0, 1, 2, 3].map((k) => iso(addDays(d(weekId), k * 7)));

      const [bul, pastor, events, meta, mem, rotWindow, rotAhead, vn, choir] = await Promise.all([
        db.from("bulletin_inputs").select("data, field_times, printed_at, updated_at")
          .eq("week_id", weekId).maybeSingle(),
        // PPT 공유 필드 — 읽기만. 저장은 별도 action에서 병합 저장한다(B11)
        db.from("pastor_inputs").select("data, updated_at").eq("week_id", weekId).maybeSingle(),
        db.from("annual_events").select("display_week, label, event_date, is_communion")
          .eq("show_in_bulletin", true).gte("display_week", weekId)
          .order("display_week").limit(6),
        db.from("bulletin_meta").select("key, value"),
        db.from("members").select("id, name, title, active").eq("active", true)
          .order("name"),
        assignmentsFor(window),
        assignmentsFor(ahead),
        volNo(weekId),
        // 성가대 곡 — 특송/성가대 줄을 예배순서에 자동 반영 (PPT 성가대 섹션)
        db.from("songs").select("name, song_type, song_performer, position")
          .eq("week_id", weekId).eq("role", "choir").order("position"),
      ]);

      const metaMap: Record<string, unknown> = {};
      (meta.data || []).forEach((r: { key: string; value: unknown }) => { metaMap[r.key] = r.value; });

      // 이번 주가 성찬식 예정인지 (§6-4 선제 제안)
      const communion = (events.data || []).some(
        (e: { display_week: string; is_communion: boolean }) =>
          e.display_week === weekId && e.is_communion,
      );

      return json({
        weekId,
        role,
        vol: vn.vol,
        no: vn.no,
        bulletin: bul.data?.data ?? {},
        fieldTimes: bul.data?.field_times ?? {},
        printedAt: bul.data?.printed_at ?? null,
        bulletinUpdatedAt: bul.data?.updated_at ?? null,   // saveBulletin의 baseUpdatedAt용
        pastor: pastor.data?.data ?? {},     // 설교 제목·본문·기도담당·찬송 (PPT와 공유)
        pastorUpdatedAt: pastor.data?.updated_at ?? null,  // savePastorShared의 baseUpdatedAt용
        events: events.data || [],
        communionThisWeek: communion,
        meta: metaMap,
        members: mem.data || [],
        loveWindow: rotWindow,               // 사랑의 나눔 4주 (지난 3주 + 이번 주)
        serveWindow: rotAhead,               // 예배를 섬기는 이들 4주 (이번 주 + 앞 3주)
        choirSongs: choir.data || [],        // 특송/성가대 줄 자동 반영
      });
    }

    // ---------- 주보 본문 저장 ----------
    case "saveBulletin": {
      await ensureWeek(weekId);
      // 저장 충돌 감지 (B11-1 — api의 savePastor와 같은 패턴)
      if (body.baseUpdatedAt) {
        const { data: cur } = await db
          .from("bulletin_inputs").select("updated_at").eq("week_id", weekId).maybeSingle();
        if (cur?.updated_at && new Date(cur.updated_at) > new Date(body.baseUpdatedAt as string)) {
          return json({ error: "conflict", conflict: true, serverUpdatedAt: cur.updated_at }, 409);
        }
      }
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = { updated_at: nowIso };
      if (body.data !== undefined) patch.data = body.data;
      if (body.fieldTimes !== undefined) patch.field_times = body.fieldTimes;
      const { error } = await db.from("bulletin_inputs").update(patch).eq("week_id", weekId);
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true, updatedAt: nowIso });
    }

    // ---------- PPT 공유 필드 저장 (병합) ----------
    // ★ pastor_inputs.data를 통째로 덮어쓰지 않는다 — 기존 값을 읽어 지정한 키만 바꾼다.
    //   PPT가 쓰는 키(hymn.blocks 등)를 주보가 날려버리는 사고 방지(B11).
    case "savePastorShared": {
      await ensureWeek(weekId);
      const { data: cur } = await db
        .from("pastor_inputs").select("data, updated_at").eq("week_id", weekId).maybeSingle();
      if (body.baseUpdatedAt && cur?.updated_at &&
          new Date(cur.updated_at) > new Date(body.baseUpdatedAt as string)) {
        return json({ error: "conflict", conflict: true, serverUpdatedAt: cur.updated_at }, 409);
      }
      const merged = { ...(cur?.data as Record<string, unknown> || {}) };
      const patchIn = (body.patch as Record<string, unknown>) || {};
      // 최상위 키만 병합. hymn은 하위 병합(가사 blocks 보존)
      for (const [k, v] of Object.entries(patchIn)) {
        if (k === "hymn" && typeof v === "object" && v !== null) {
          merged.hymn = { ...(merged.hymn as Record<string, unknown> || {}), ...(v as object) };
        } else {
          merged[k] = v;
        }
      }
      const nowIso = new Date().toISOString();
      const { error } = await db.from("pastor_inputs")
        .update({ data: merged, updated_at: nowIso }).eq("week_id", weekId);
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true, updatedAt: nowIso, data: merged });
    }

    // ---------- 로테이션 수동 개입 3종 (B3-1) ----------
    // mode 'once'   이번 주만 대타 — 뒤 주차 불변
    // mode 'shift'  이 사람 건너뛰고 순서 당기기 — 이 주부터 새 앵커
    // mode 'insert' 중간에 끼워넣기 — 이번 주는 지정한 사람, 원래 담당자는 다음으로 밀림
    case "overrideRotation": {
      const r = String(body.role || "prayer");           // prayer / offering / usher / love_*
      const mode = String(body.mode || "once");
      const name = String(body.name || "");
      const w = weekId;

      // 인쇄 확정된 주차는 건드리지 않는다 (B3-2)
      const { data: locked } = await db.from("rotation_assignments")
        .select("locked_at").eq("week_id", w).eq("role", r).maybeSingle();
      if (locked?.locked_at) return json({ error: "이미 인쇄 확정된 주간입니다" }, 409);

      const nowIso = new Date().toISOString();

      if (mode === "once" || r.startsWith("love_") || r === "usher") {
        // 사랑의 나눔(친교헌금·봉사담당)은 빈칸 허용 → 비우면 이번 주 배정 삭제(#6-1)
        if (!name) {
          if (r.startsWith("love_")) {
            await db.from("rotation_assignments").delete()
              .eq("week_id", w).eq("role", r).is("locked_at", null);
            return json({ ok: true });
          }
          return json({ error: "이름이 필요합니다" }, 400);
        }
        const { error } = await db.from("rotation_assignments").upsert({
          week_id: w, role: r, assigned: name, is_manual: true, updated_at: nowIso,
        }, { onConflict: "week_id,role" });
        if (error) return json({ error: "저장 실패" }, 500);
        return json({ ok: true });
      }

      const pools = await loadPools();

      if (r === "prayer") {
        const anchors = await loadAnchors("prayer");
        const st = prayerStateAt(anchors, pools, w);
        if (!st) return json({ error: "기준점을 찾을 수 없습니다" }, 400);
        const elders = pools["prayer_elders"] || [];
        const deacons = pools["prayer_deacons"] || [];

        if (mode === "shift") {
          // 건너뛰기: 이번 주 슬롯의 풀 포인터를 한 칸 전진시킨 앵커를 이 주에 심는다
          const spec = st.phase === 2
            ? { phase: st.phase, elder: st.elder,
                deacon: deacons[(deacons.indexOf(st.deacon) + 1) % deacons.length] }
            : { phase: st.phase, deacon: st.deacon,
                elder: elders[(elders.indexOf(st.elder) + 1) % elders.length] };
          const { error } = await db.from("rotation_anchors").upsert({
            role: "prayer", effective_from: w, spec,
            note: `${st.assigned} 건너뜀 (순서 당김)`,
          }, { onConflict: "role,effective_from" });
          if (error) return json({ error: "저장 실패" }, 500);
          return json({ ok: true });
        }

        if (mode === "insert") {
          if (!name) return json({ error: "끼워넣을 분을 골라주세요" }, 400);
          // 이번 주 = 지정한 사람(오버라이드), 다음 주부터 = 원래 순서 그대로 (포인터 불변)
          const next = iso(addDays(d(w), 7));
          const e1 = await db.from("rotation_assignments").upsert({
            week_id: w, role: "prayer", assigned: name, is_manual: true, updated_at: nowIso,
            note: "끼워넣기",
          }, { onConflict: "week_id,role" });
          const e2 = await db.from("rotation_anchors").upsert({
            role: "prayer", effective_from: next,
            spec: { phase: (st.phase + 1) % 3, elder: st.elder, deacon: st.deacon },
            note: `${name} 끼워넣어 ${st.assigned} 이후로 밀림`,
          }, { onConflict: "role,effective_from" });
          if (e1.error || e2.error) return json({ error: "저장 실패" }, 500);
          return json({ ok: true });
        }
      }

      if (r === "offering") {
        const anchors = await loadAnchors("offering");
        const pool = pools["offering"] || [];
        const cur = offeringAt(anchors, pools, w);
        if (!cur) return json({ error: "기준점을 찾을 수 없습니다" }, 400);
        const month = w.slice(0, 7);
        const target = mode === "shift"
          ? pool[(pool.indexOf(cur) + 1) % pool.length]
          : name;
        if (!target) return json({ error: "이름이 필요합니다" }, 400);
        const { error } = await db.from("rotation_anchors").upsert({
          role: "offering", effective_from: `${month}-01`,
          spec: { month, name: target },
          note: mode === "shift" ? `${cur} 건너뜀` : `${month} 수동 지정`,
        }, { onConflict: "role,effective_from" });
        if (error) return json({ error: "저장 실패" }, 500);
        return json({ ok: true });
      }

      return json({ error: "알 수 없는 요청" }, 400);
    }

    // ---------- 이 주 수동 로테이션 초기화 (되돌리기, #9·후속#4) ----------
    // 이번 주에 직접 바꾼 담당자(기도·안내·봉헌위원 once 오버라이드 + 사랑의나눔)를 지우고
    // 자동 계산값으로 복귀. 인쇄 확정(locked_at)된 주간은 보존한다.
    case "resetRotations": {
      const { error } = await db.from("rotation_assignments")
        .delete().eq("week_id", weekId).is("locked_at", null);
      if (error) return json({ error: "초기화 실패" }, 500);
      return json({ ok: true });
    }

    // ---------- 앞으로 N주 미리보기 (명단 편집 결과 확인용) ----------
    case "previewRotation": {
      const n = Math.min(20, Math.max(1, Number(body.weeks) || 8));
      const weeks = Array.from({ length: n }, (_, i) => iso(addDays(d(weekId), i * 7)));
      return json({ weeks: await assignmentsFor(weeks) });
    }

    // ---------- 명단 ----------
    case "getMembers": {
      const [mem, pools] = await Promise.all([
        db.from("members").select("id, name, title, active, note").order("title").order("name"),
        db.from("rotation_pools").select("id, label, cycle, member_names"),
      ]);
      return json({ members: mem.data || [], pools: pools.data || [] });
    }

    case "saveMember": {
      const m = (body.member as Record<string, unknown>) || {};
      const nowIso = new Date().toISOString();
      if (m.id) {
        const patch: Record<string, unknown> = { updated_at: nowIso };
        ["name", "title", "active", "note"].forEach((k) => {
          if (m[k] !== undefined) patch[k] = m[k];
        });
        const { error } = await db.from("members").update(patch).eq("id", m.id as string);
        if (error) return json({ error: "저장 실패" }, 500);
      } else {
        if (!m.name) return json({ error: "이름이 필요합니다" }, 400);
        const { error } = await db.from("members").insert({
          name: m.name, title: m.title || "교인", note: m.note ?? null,
        });
        if (error) return json({ error: "저장 실패" }, 500);
      }
      return json({ ok: true });
    }

    // 풀 순서·소속 변경 (드래그 정렬 / 넣기·빼기 토글)
    case "savePool": {
      const id = String(body.id || "");
      const names = body.memberNames;
      if (!id || !Array.isArray(names)) return json({ error: "잘못된 요청" }, 400);
      const { error } = await db.from("rotation_pools")
        .update({ member_names: names, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true });
    }

    // ---------- 연간 행사표 ----------
    case "getAnnualEvents": {
      const { data } = await db.from("annual_events")
        .select("id, display_week, label, event_date, is_communion, show_in_bulletin")
        .order("display_week");
      return json({ events: data || [] });
    }

    case "saveAnnualEvent": {
      const e = (body.event as Record<string, unknown>) || {};
      const nowIso = new Date().toISOString();
      if (e.id) {
        const patch: Record<string, unknown> = { updated_at: nowIso };
        ["display_week", "label", "event_date", "is_communion", "show_in_bulletin"]
          .forEach((k) => { if (e[k] !== undefined) patch[k] = e[k]; });
        const { error } = await db.from("annual_events").update(patch).eq("id", e.id as string);
        if (error) return json({ error: "저장 실패" }, 500);
      } else {
        if (!e.display_week || !e.label) return json({ error: "날짜와 내용이 필요합니다" }, 400);
        const { error } = await db.from("annual_events").insert({
          display_week: e.display_week, label: e.label,
          event_date: e.event_date ?? null, is_communion: !!e.is_communion,
        });
        if (error) return json({ error: "저장 실패" }, 500);
      }
      return json({ ok: true });
    }

    // ---------- 준고정 설정 (교회표어·섬기는사람들·안내위원·폐회송 등) ----------
    case "saveMeta": {
      const key = String(body.key || "");
      if (!key) return json({ error: "잘못된 요청" }, 400);
      const { error } = await db.from("bulletin_meta")
        .upsert({ key, value: body.value }, { onConflict: "key" });
      if (error) return json({ error: "저장 실패" }, 500);
      return json({ ok: true });
    }

    // ---------- 인쇄 확정 — 그 주 배정을 스냅샷으로 고정 (B3-2) ----------
    case "confirmPrint": {
      const rows = await assignmentsFor([weekId]);
      const a = rows[0];
      const nowIso = new Date().toISOString();
      const snap = [
        { role: "prayer", assigned: a.prayer },
        { role: "offering", assigned: a.offering },
        { role: "usher", assigned: a.usher },
        { role: "love_offering", assigned: a.love_offering },
        { role: "love_service", assigned: a.love_service },
      ].filter((x) => x.assigned).map((x) => ({
        week_id: weekId, role: x.role, assigned: x.assigned,
        is_manual: false, locked_at: nowIso, updated_at: nowIso,
      }));
      if (snap.length) {
        const { error } = await db.from("rotation_assignments")
          .upsert(snap, { onConflict: "week_id,role" });
        if (error) return json({ error: "확정 실패" }, 500);
      }
      await db.from("bulletin_inputs").update({ printed_at: nowIso }).eq("week_id", weekId);
      return json({ ok: true, printedAt: nowIso });
    }

    // ---------- 이 주 수동 로테이션 초기화 (#9 되돌리기) ----------
    // 이 주에 넣은 수동 배정(이번 주만·안내·사랑나눔·끼워넣기)만 삭제한다.
    // 인쇄 확정(locked_at)된 것은 건드리지 않고, 앵커(당기기·봉헌 월지정)는 보존한다(로테이션 기준선 보호).
    case "resetRotations": {
      const { error } = await db.from("rotation_assignments")
        .delete().eq("week_id", weekId).eq("is_manual", true).is("locked_at", null);
      if (error) return json({ error: "로테이션 초기화 실패" }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: "알 수 없는 요청" }, 400);
  }
});
