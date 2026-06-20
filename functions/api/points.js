// functions/api/points.js
// 상벌 포인트 + 포상/징계 상점.
// 보기/포상 교환 = 로그인된 사용자(슬레이브 포함).
// 포인트 적립·차감, 징계 부과, 상점 카탈로그 관리 = 마스터(X-HW-Admin 토큰) 전용.

function nowKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ── 마스터 토큰 검증 (homework.js 와 동일 방식) ──
const JWT_HEADER = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const b64url = (s) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(btoa(String.fromCharCode(...new Uint8Array(sig))));
}
async function isMaster(env, request) {
  const token = request.headers.get("X-HW-Admin");
  if (!token) return false;
  try {
    const [h, p, s] = token.split(".");
    if (await hmacSign(env.JWT_SECRET, `${h}.${p}`) !== s) return false;
    const { exp, hw_admin } = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    return hw_admin === true && Date.now() < exp;
  } catch { return false; }
}

async function getBalance(env) {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(delta),0) AS bal FROM point_ledger").first();
  return row.bal || 0;
}

// ── GET: 요약 (잔액 + 최근 기록 + 상점) ──
export async function onRequestGet({ env }) {
  const balance = await getBalance(env);
  const { results: ledger } = await env.DB.prepare(
    "SELECT id, delta, reason, type, created_at FROM point_ledger ORDER BY id DESC LIMIT 50"
  ).all();
  const { results: shop } = await env.DB.prepare(
    "SELECT id, kind, name, detail, cost, sort_order FROM shop_items ORDER BY sort_order ASC, id ASC"
  ).all();
  return json({
    balance,
    ledger,
    rewards: shop.filter(s => s.kind === "reward"),
    punishments: shop.filter(s => s.kind === "punishment"),
  });
}

export async function onRequestPost({ request, env }) {
  const action = new URL(request.url).searchParams.get("action");
  const b = await request.json().catch(() => ({}));

  // ── 포상 교환 (로그인된 사용자 = 슬레이브 가능) ──
  if (action === "redeem") {
    if (!b.item_id) return json({ error: "item_id required" }, 400);
    const item = await env.DB.prepare("SELECT name, cost, kind FROM shop_items WHERE id = ?").bind(b.item_id).first();
    if (!item || item.kind !== "reward") return json({ error: "reward not found" }, 404);
    const bal = await getBalance(env);
    if (bal < item.cost) return json({ error: "insufficient", balance: bal }, 400);
    await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, created_at) VALUES (?, ?, 'reward', ?)"
    ).bind(-item.cost, `포상 교환: ${item.name}`, nowKST()).run();
    return json({ ok: true, balance: await getBalance(env) });
  }

  // ── 이하 마스터 전용 ──
  if (!(await isMaster(env, request))) return json({ error: "master required" }, 403);

  // 포인트 적립/차감 (수동)
  if (action === "award") {
    const delta = parseInt(b.delta, 10);
    if (!delta) return json({ error: "delta required" }, 400);
    const type = delta > 0 ? "merit" : "demerit";
    await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, created_at) VALUES (?, ?, ?, ?)"
    ).bind(delta, b.reason || null, type, nowKST()).run();
    return json({ ok: true, balance: await getBalance(env) });
  }

  // 징계 부과 (상점의 징계 항목 → 포인트 차감 + 기록)
  if (action === "impose") {
    if (!b.item_id) return json({ error: "item_id required" }, 400);
    const item = await env.DB.prepare("SELECT name, cost, kind FROM shop_items WHERE id = ?").bind(b.item_id).first();
    if (!item || item.kind !== "punishment") return json({ error: "punishment not found" }, 404);
    await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, created_at) VALUES (?, ?, 'demerit', ?)"
    ).bind(-(item.cost || 0), `징계: ${item.name}`, nowKST()).run();
    return json({ ok: true, balance: await getBalance(env) });
  }

  // 기록 삭제 (정정용)
  if (action === "ledger-delete") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM point_ledger WHERE id = ?").bind(b.id).run();
    return json({ ok: true, balance: await getBalance(env) });
  }

  // 상점 항목 추가/수정/삭제
  if (action === "shop-add") {
    if (!["reward", "punishment"].includes(b.kind) || !b.name?.trim())
      return json({ error: "bad request" }, 400);
    const { mx } = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS mx FROM shop_items").first();
    await env.DB.prepare(
      "INSERT INTO shop_items (kind, name, detail, cost, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(b.kind, b.name.trim(), b.detail || null, parseInt(b.cost, 10) || 0, (mx || 0) + 1, nowKST()).run();
    return json({ ok: true });
  }

  if (action === "shop-update") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare(
      "UPDATE shop_items SET name = ?, detail = ?, cost = ? WHERE id = ?"
    ).bind(b.name?.trim() || "", b.detail || null, parseInt(b.cost, 10) || 0, b.id).run();
    return json({ ok: true });
  }

  if (action === "shop-delete") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM shop_items WHERE id = ?").bind(b.id).run();
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
