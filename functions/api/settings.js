// functions/api/settings.js
// 간단한 KV 설정 저장소. 모든 요청은 _middleware.js 에서 사이트 토큰 요구.
// GET  /api/settings?key=dday   → { key, value }   (없으면 value: null)
// POST /api/settings  body { key, value }          → upsert (value "" 또는 null 이면 삭제)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return json({ error: "key required" }, 400);
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first();
  return json({ key, value: row ? row.value : null });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (!body.key) return json({ error: "key required" }, 400);

  if (body.value === "" || body.value === null || body.value === undefined) {
    await env.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind(body.key).run();
    return json({ ok: true, cleared: true });
  }
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(body.key, String(body.value)).run();
  return json({ ok: true });
}
