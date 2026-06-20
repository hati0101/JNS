// functions/api/bucket.js
// 버킷리스트 (같이 이뤄가는 목록). 모든 요청은 사이트 로그인 필요(미들웨어).
// 마스터/슬레이브 둘 다 추가/수정/상태변경 가능 (협업).

function nowKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
}
function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, title, detail, author, status, image_url, done_at, sort_order, created_at FROM bucket ORDER BY sort_order ASC, id ASC"
  ).all();
  return json({ items: results });
}

export async function onRequestPost({ request, env }) {
  const action = new URL(request.url).searchParams.get("action");
  const b = await request.json().catch(() => ({}));

  if (action === "add") {
    if (!b.title?.trim()) return json({ error: "title required" }, 400);
    const { mx } = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS mx FROM bucket").first();
    await env.DB.prepare(
      "INSERT INTO bucket (title, detail, author, status, image_url, sort_order, created_at) VALUES (?, ?, ?, 'todo', ?, ?, ?)"
    ).bind(b.title.trim(), b.detail || null, b.author || null, b.image_url || null, (mx || 0) + 1, nowKST()).run();
    return json({ ok: true });
  }

  if (action === "update") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare(
      "UPDATE bucket SET title = ?, detail = ?, author = ?, image_url = ? WHERE id = ?"
    ).bind(b.title?.trim() || "", b.detail || null, b.author || null, b.image_url || null, b.id).run();
    return json({ ok: true });
  }

  if (action === "status") {
    if (!b.id || !["todo", "doing", "done"].includes(b.status)) return json({ error: "bad request" }, 400);
    const doneAt = b.status === "done" ? todayKST() : null;
    await env.DB.prepare("UPDATE bucket SET status = ?, done_at = ? WHERE id = ?")
      .bind(b.status, doneAt, b.id).run();
    return json({ ok: true });
  }

  if (action === "delete") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM bucket WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
