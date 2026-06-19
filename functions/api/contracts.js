// functions/api/contracts.js
// 계약서 이미지 피드. 모든 요청은 _middleware.js 에서 사이트 토큰(로그인) 요구.
// 이미지 업로드는 기존 /api/media (R2) 사용 후, 반환된 url 을 여기에 등록.

function nowKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// ── 목록 (순서대로) ──
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, image_url, caption, sort_order, created_at FROM contracts ORDER BY sort_order ASC, id ASC"
  ).all();
  return json({ contracts: results });
}

// ── 추가 / 삭제 / 순서이동 ──
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const body = await request.json().catch(() => ({}));

  if (action === "add") {
    if (!body.image_url) return json({ error: "image_url required" }, 400);
    const { mx } = await env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order),0) AS mx FROM contracts"
    ).first();
    await env.DB.prepare(
      "INSERT INTO contracts (image_url, caption, sort_order, created_at) VALUES (?, ?, ?, ?)"
    ).bind(body.image_url, body.caption || null, (mx || 0) + 1, nowKST()).run();
    return json({ ok: true });
  }

  if (action === "delete") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM contracts WHERE id = ?").bind(body.id).run();
    return json({ ok: true });
  }

  if (action === "update") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("UPDATE contracts SET caption = ? WHERE id = ?")
      .bind(body.caption || null, body.id).run();
    return json({ ok: true });
  }

  // 위/아래로 한 칸 이동 (이웃과 sort_order 교환)
  if (action === "move") {
    const dir = body.dir; // -1 위 / 1 아래
    if (!body.id || ![-1, 1].includes(dir)) return json({ error: "bad request" }, 400);

    const cur = await env.DB.prepare(
      "SELECT id, sort_order FROM contracts WHERE id = ?"
    ).bind(body.id).first();
    if (!cur) return json({ error: "not found" }, 404);

    const neighbor = await env.DB.prepare(
      dir === -1
        ? "SELECT id, sort_order FROM contracts WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1"
        : "SELECT id, sort_order FROM contracts WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1"
    ).bind(cur.sort_order).first();
    if (!neighbor) return json({ ok: true }); // 이미 끝

    await env.DB.batch([
      env.DB.prepare("UPDATE contracts SET sort_order = ? WHERE id = ?").bind(neighbor.sort_order, cur.id),
      env.DB.prepare("UPDATE contracts SET sort_order = ? WHERE id = ?").bind(cur.sort_order, neighbor.id),
    ]);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
