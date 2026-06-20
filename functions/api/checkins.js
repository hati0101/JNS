// functions/api/checkins.js
// 데일리 체크인. 모든 요청은 사이트 로그인 필요(미들웨어). 슬레이브가 기록, 마스터가 열람.

function nowKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
}
function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function clamp15(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, n));
}

export async function onRequestGet({ env }) {
  const today = todayKST();
  const todayRow = await env.DB.prepare(
    "SELECT id, date, mood, energy, headspace, aftercare, note FROM checkins WHERE date = ?"
  ).bind(today).first();
  const { results: recent } = await env.DB.prepare(
    "SELECT id, date, mood, energy, headspace, aftercare, note FROM checkins ORDER BY date DESC LIMIT 30"
  ).all();
  return json({ today, todayRow: todayRow || null, recent });
}

export async function onRequestPost({ request, env }) {
  const action = new URL(request.url).searchParams.get("action");
  const b = await request.json().catch(() => ({}));

  if (action === "save") {
    const date = (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) ? b.date : todayKST();
    await env.DB.prepare(
      `INSERT INTO checkins (date, mood, energy, headspace, aftercare, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         mood = excluded.mood, energy = excluded.energy, headspace = excluded.headspace,
         aftercare = excluded.aftercare, note = excluded.note, updated_at = excluded.updated_at`
    ).bind(
      date, clamp15(b.mood), clamp15(b.energy), b.headspace?.trim() || null,
      b.aftercare ? 1 : 0, b.note?.trim() || null, nowKST(), nowKST()
    ).run();
    return json({ ok: true });
  }

  if (action === "delete") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM checkins WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
