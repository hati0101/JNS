// functions/api/homework.js
// 모든 /api/homework 요청은 _middleware.js 에서 사이트 토큰(로그인)을 요구함.
// 어드민 변경 작업(템플릿/아이템 CRUD)은 추가로 X-HW-Admin 토큰을 요구함.

function nowKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace("T", " ").slice(0, 19);
}
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── 어드민 토큰 (JWT_SECRET 으로 서명) ──
const JWT_HEADER = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const b64url = (s) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(btoa(String.fromCharCode(...new Uint8Array(sig))));
}
async function makeAdminToken(secret) {
  const payload = b64url(btoa(JSON.stringify({ hw_admin: true, exp: Date.now() + 12 * 3600 * 1000 })));
  const sig = await hmacSign(secret, `${JWT_HEADER}.${payload}`);
  return `${JWT_HEADER}.${payload}.${sig}`;
}
async function isAdmin(env, request) {
  const token = request.headers.get("X-HW-Admin");
  if (!token) return false;
  try {
    const [h, p, s] = token.split(".");
    if (await hmacSign(env.JWT_SECRET, `${h}.${p}`) !== s) return false;
    const { exp, hw_admin } = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    return hw_admin === true && Date.now() < exp;
  } catch { return false; }
}
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── 특정 날짜의 숙제 목록 계산 ──
async function tasksForDate(env, date) {
  // 적용되는 고정 숙제
  const { results: tpls } = await env.DB.prepare(
    `SELECT id, title, sort_order FROM hw_templates
     WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?)
     ORDER BY sort_order ASC, id ASC`
  ).bind(date, date).all();

  // 그날 추가 숙제
  const { results: items } = await env.DB.prepare(
    "SELECT id, title FROM hw_items WHERE date = ? ORDER BY id ASC"
  ).bind(date).all();

  // 완료 기록
  const { results: done } = await env.DB.prepare(
    "SELECT kind, ref_id FROM hw_done WHERE date = ?"
  ).bind(date).all();
  const doneSet = new Set(done.map(d => `${d.kind}:${d.ref_id}`));

  const tasks = [
    ...tpls.map(t => ({ kind: "template", id: t.id, title: t.title, done: doneSet.has(`template:${t.id}`) })),
    ...items.map(i => ({ kind: "item", id: i.id, title: i.title, done: doneSet.has(`item:${i.id}`) })),
  ];
  const doneCount = tasks.filter(t => t.done).length;
  return { date, tasks, total: tasks.length, done: doneCount };
}

// ── GET ──
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // 어드민 데이터 (템플릿 전체 + 특정 날짜 아이템)
  if (action === "admin-data") {
    if (!(await isAdmin(env, request))) return json({ error: "admin required" }, 403);
    const date = url.searchParams.get("date") || todayKST();
    const { results: templates } = await env.DB.prepare(
      "SELECT id, title, start_date, end_date, sort_order FROM hw_templates ORDER BY sort_order ASC, id ASC"
    ).all();
    const { results: items } = await env.DB.prepare(
      "SELECT id, title FROM hw_items WHERE date = ? ORDER BY id ASC"
    ).bind(date).all();
    return json({ date, templates, items });
  }

  // 특정 날짜 숙제
  const date = url.searchParams.get("date");
  if (date) return json(await tasksForDate(env, date));

  // 한 달 달력 집계
  const month = url.searchParams.get("month"); // 'YYYY-MM'
  if (month) {
    const first = `${month}-01`;
    const last = `${month}-31`;

    const { results: tpls } = await env.DB.prepare(
      `SELECT id, start_date, end_date FROM hw_templates
       WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?)`
    ).bind(last, first).all();

    const { results: items } = await env.DB.prepare(
      "SELECT date FROM hw_items WHERE date >= ? AND date <= ?"
    ).bind(first, last).all();

    const { results: done } = await env.DB.prepare(
      "SELECT date FROM hw_done WHERE date >= ? AND date <= ?"
    ).bind(first, last).all();

    // 날짜별 total / done 계산
    const y = parseInt(month.slice(0, 4)), m = parseInt(month.slice(5, 7));
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${month}-${String(d).padStart(2, "0")}`;
      const tplCount = tpls.filter(t => t.start_date <= ds && (!t.end_date || t.end_date >= ds)).length;
      const itemCount = items.filter(i => i.date === ds).length;
      const total = tplCount + itemCount;
      if (total > 0) days[ds] = { total, done: 0 };
    }
    for (const r of done) {
      if (days[r.date]) days[r.date].done++;
    }
    return json({ month, days });
  }

  return json({ error: "date or month required" }, 400);
}

// ── POST (action 분기) ──
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const body = await request.json().catch(() => ({}));

  // 어드민 비번 인증 → 어드민 토큰 발급
  if (action === "admin-auth") {
    if (!env.HW_ADMIN_HASH) return json({ error: "HW_ADMIN_HASH not set" }, 500);
    const hex = await sha256hex(body.password || "");
    if (hex !== env.HW_ADMIN_HASH) return json({ ok: false }, 401);
    return json({ ok: true, token: await makeAdminToken(env.JWT_SECRET) });
  }

  // 완료 토글 (로그인된 사용자 누구나)
  if (action === "toggle") {
    const { date, kind, ref_id, done } = body;
    if (!date || !["template", "item"].includes(kind) || !ref_id)
      return json({ error: "bad request" }, 400);
    if (done) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO hw_done (date, kind, ref_id, done_at) VALUES (?, ?, ?, ?)"
      ).bind(date, kind, ref_id, nowKST()).run();
    } else {
      await env.DB.prepare(
        "DELETE FROM hw_done WHERE date = ? AND kind = ? AND ref_id = ?"
      ).bind(date, kind, ref_id).run();
    }
    return json(await tasksForDate(env, date));
  }

  // ── 이하 어드민 전용 ──
  if (!(await isAdmin(env, request))) return json({ error: "admin required" }, 403);

  if (action === "template-add") {
    if (!body.title?.trim()) return json({ error: "title required" }, 400);
    const { mx } = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS mx FROM hw_templates").first();
    await env.DB.prepare(
      "INSERT INTO hw_templates (title, start_date, end_date, sort_order, created_at) VALUES (?, ?, NULL, ?, ?)"
    ).bind(body.title.trim(), body.start_date || todayKST(), (mx || 0) + 1, nowKST()).run();
    return json({ ok: true });
  }

  if (action === "template-update") {
    if (!body.id || !body.title?.trim()) return json({ error: "bad request" }, 400);
    await env.DB.prepare("UPDATE hw_templates SET title = ? WHERE id = ?")
      .bind(body.title.trim(), body.id).run();
    return json({ ok: true });
  }

  // 종료(보관) — 과거 기록은 유지, end_date 이후 적용 중단
  if (action === "template-end") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("UPDATE hw_templates SET end_date = ? WHERE id = ?")
      .bind(body.end_date || todayKST(), body.id).run();
    return json({ ok: true });
  }

  // 재활성화
  if (action === "template-reactivate") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("UPDATE hw_templates SET end_date = NULL WHERE id = ?")
      .bind(body.id).run();
    return json({ ok: true });
  }

  // 완전 삭제 (모든 날짜 기록까지)
  if (action === "template-delete") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM hw_done WHERE kind = 'template' AND ref_id = ?").bind(body.id).run();
    await env.DB.prepare("DELETE FROM hw_templates WHERE id = ?").bind(body.id).run();
    return json({ ok: true });
  }

  if (action === "item-add") {
    if (!body.date || !body.title?.trim()) return json({ error: "bad request" }, 400);
    await env.DB.prepare(
      "INSERT INTO hw_items (date, title, created_at) VALUES (?, ?, ?)"
    ).bind(body.date, body.title.trim(), nowKST()).run();
    return json({ ok: true });
  }

  if (action === "item-update") {
    if (!body.id || !body.title?.trim()) return json({ error: "bad request" }, 400);
    await env.DB.prepare("UPDATE hw_items SET title = ? WHERE id = ?")
      .bind(body.title.trim(), body.id).run();
    return json({ ok: true });
  }

  if (action === "item-delete") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM hw_done WHERE kind = 'item' AND ref_id = ?").bind(body.id).run();
    await env.DB.prepare("DELETE FROM hw_items WHERE id = ?").bind(body.id).run();
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
