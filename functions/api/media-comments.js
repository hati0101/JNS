// functions/api/media-comments.js
// GET    /api/media-comments?post_id=1&media_url=...  → 목록
// POST   /api/media-comments                          → { post_id, media_url, content }
// DELETE /api/media-comments?id=1                     → 삭제

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
  const post_id = url.searchParams.get("post_id");
  const media_url = url.searchParams.get("media_url");
  if (!post_id || !media_url) return json({ error: "post_id and media_url required" }, 400);

  const { results } = await env.DB.prepare(
    "SELECT * FROM media_comments WHERE post_id = ? AND media_url = ? ORDER BY created_at ASC"
  ).bind(post_id, media_url).all();

  return json({ comments: results });
}

export async function onRequestPost({ request, env }) {
  const { post_id, media_url, content } = await request.json().catch(() => ({}));
  if (!post_id || !media_url || !content?.trim()) return json({ error: "required fields missing" }, 400);

  const result = await env.DB.prepare(
    "INSERT INTO media_comments (post_id, media_url, content, created_at) VALUES (?, ?, ?, ?) RETURNING id, created_at"
  ).bind(post_id, media_url, content.trim(), nowKST()).first();

  return json({ ok: true, ...result }, 201);
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM media_comments WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
