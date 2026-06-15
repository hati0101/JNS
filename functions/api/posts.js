// functions/api/posts.js

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
    "SELECT id, title, author, created_at FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all();

  const { total } = await env.DB.prepare("SELECT COUNT(*) as total FROM posts").first();

  return json({ posts: results, total, page, pages: Math.ceil(total / limit) });
}

export async function onRequestPost({ request, env }) {
  const { title, content, author, created_at } = await request.json().catch(() => ({}));
  if (!title?.trim() || !content?.trim()) return json({ error: "title and content required" }, 400);

  const dt = created_at || new Date().toISOString().replace("T"," ").slice(0,19);
  const result = await env.DB.prepare(
    "INSERT INTO posts (title, content, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id, created_at"
  ).bind(title.trim(), content.trim(), author || "마스터", dt, dt).first();

  return json({ ok: true, ...result }, 201);
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const { title, content, author, created_at } = await request.json().catch(() => ({}));
  if (!title?.trim() || !content?.trim()) return json({ error: "title and content required" }, 400);

  const now = new Date().toISOString().replace("T"," ").slice(0,19);
  const dt = created_at || undefined;

  if (dt) {
    await env.DB.prepare(
      "UPDATE posts SET title=?, content=?, author=?, created_at=?, updated_at=? WHERE id=?"
    ).bind(title.trim(), content.trim(), author || "마스터", dt, now, id).run();
  } else {
    await env.DB.prepare(
      "UPDATE posts SET title=?, content=?, author=?, updated_at=? WHERE id=?"
    ).bind(title.trim(), content.trim(), author || "마스터", now, id).run();
  }

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
