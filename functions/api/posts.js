// functions/api/posts.js
// GET  /api/posts          → 목록 (페이지네이션)
// POST /api/posts          → 새 글 작성
// GET  /api/posts/[id]     → 상세
// PUT  /api/posts/[id]     → 수정
// DELETE /api/posts/[id]  → 삭제

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
    if (!post) return json({ error: "not found" }, 404);
    return json(post);
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 30;
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(
    "SELECT id, title, created_at FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all();

  const { total } = await env.DB.prepare("SELECT COUNT(*) as total FROM posts").first();

  return json({ posts: results, total, page, pages: Math.ceil(total / limit) });
}

export async function onRequestPost({ request, env }) {
  const { title, content } = await request.json().catch(() => ({}));
  if (!title?.trim() || !content?.trim()) return json({ error: "title and content required" }, 400);

  const result = await env.DB.prepare(
    "INSERT INTO posts (title, content) VALUES (?, ?) RETURNING id, created_at"
  ).bind(title.trim(), content.trim()).first();

  return json({ ok: true, ...result }, 201);
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const { title, content } = await request.json().catch(() => ({}));
  if (!title?.trim() || !content?.trim()) return json({ error: "title and content required" }, 400);

  await env.DB.prepare(
    "UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(title.trim(), content.trim(), id).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
