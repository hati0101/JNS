// functions/api/highlight-comments.js
// GET    /api/highlight-comments?highlight_id=1  → 댓글 목록
// POST   /api/highlight-comments                 → { highlight_id, content }
// DELETE /api/highlight-comments?id=1            → 삭제

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nowKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace("T"," ").slice(0,19);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const highlight_id = url.searchParams.get("highlight_id");
  if (!highlight_id) return json({ error: "highlight_id required" }, 400);

  const { results } = await env.DB.prepare(
    "SELECT * FROM highlight_comments WHERE highlight_id = ? ORDER BY created_at ASC"
  ).bind(highlight_id).all();

  return json({ comments: results });
}

export async function onRequestPost({ request, env }) {
  const { highlight_id, content } = await request.json().catch(() => ({}));
  if (!highlight_id || !content?.trim()) return json({ error: "highlight_id and content required" }, 400);

  const result = await env.DB.prepare(
    "INSERT INTO highlight_comments (highlight_id, content, created_at) VALUES (?, ?, ?) RETURNING id, created_at"
  ).bind(highlight_id, content.trim(), nowKST()).first();

  return json({ ok: true, ...result }, 201);
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM highlight_comments WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
