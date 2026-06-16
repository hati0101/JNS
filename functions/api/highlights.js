// functions/api/highlights.js
// GET  /api/highlights?post_id=1  → 목록
// POST /api/highlights            → 생성 { post_id, text, color, memo }
// PUT  /api/highlights?id=1       → 수정 { memo, color }
// DELETE /api/highlights?id=1     → 삭제

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const post_id = url.searchParams.get("post_id");
  if (!post_id) return json({ error: "post_id required" }, 400);

  const { results } = await env.DB.prepare(
    "SELECT * FROM highlights WHERE post_id = ? ORDER BY created_at ASC"
  ).bind(post_id).all();

  return json({ highlights: results });
}

export async function onRequestPost({ request, env }) {
  const { post_id, text, color, memo } = await request.json().catch(() => ({}));
  if (!post_id || !text) return json({ error: "post_id and text required" }, 400);

  const result = await env.DB.prepare(
    "INSERT INTO highlights (post_id, text, color, memo) VALUES (?, ?, ?, ?) RETURNING id"
  ).bind(post_id, text, color || "#ffeb3b", memo || "").first();

  return json({ ok: true, id: result.id }, 201);
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const { memo, color } = await request.json().catch(() => ({}));
  await env.DB.prepare(
    "UPDATE highlights SET memo = ?, color = ? WHERE id = ?"
  ).bind(memo ?? "", color ?? "#ffeb3b", id).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM highlights WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
