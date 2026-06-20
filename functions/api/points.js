// functions/api/points.js
// 적립 포인트(포상용) 와 벌점을 분리 관리.
//  - 적립 포인트(reward track): 마스터가 적립/차감, 포상 교환 시 차감. 잔액으로 포상 구매.
//  - 벌점(penalty track): 징계 부과 시 누적(+). 마스터가 부여/감면. 적립과 별개로 쌓임.
// 보기/포상 교환신청 = 로그인된 사용자. 적립·벌점 조정·징계 부과·상점 관리·승인 = 마스터.

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

async function getPerTask(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='hw_per_task'").first();
    const v = row ? parseInt(row.value, 10) : NaN;
    return Number.isFinite(v) && v >= 0 ? v : 2;
  } catch { return 2; }
}

async function balances(env) {
  const led = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN track='reward' THEN delta ELSE 0 END),0) AS reward,
            COALESCE(SUM(CASE WHEN track='penalty' THEN delta ELSE 0 END),0) AS penalty
     FROM point_ledger`
  ).first();
  const perTask = await getPerTask(env);
  let hwDone = 0;
  try { hwDone = (await env.DB.prepare("SELECT COUNT(*) AS c FROM hw_done").first()).c || 0; } catch { hwDone = 0; }
  const hwEarned = perTask * hwDone;
  return { reward: (led.reward || 0) + hwEarned, penalty: led.penalty || 0, hwEarned, perTask, hwDone };
}

// ── GET: 요약 ──
export async function onRequestGet({ env }) {
  const bal = await balances(env);
  const { results: ledger } = await env.DB.prepare(
    "SELECT id, delta, reason, type, track, created_at FROM point_ledger ORDER BY id DESC LIMIT 60"
  ).all();
  const { results: shop } = await env.DB.prepare(
    "SELECT id, kind, name, detail, cost, sort_order FROM shop_items ORDER BY sort_order ASC, id ASC"
  ).all();
  const { results: requests } = await env.DB.prepare(
    "SELECT id, item_id, name, cost, status, requested_at FROM reward_requests WHERE status = 'pending' ORDER BY id ASC"
  ).all();
  return json({
    rewardBalance: bal.reward,
    penaltyTotal: bal.penalty,
    hwEarned: bal.hwEarned,
    perTask: bal.perTask,
    hwDone: bal.hwDone,
    ledger,
    requests,
    rewards: shop.filter(s => s.kind === "reward"),
    punishments: shop.filter(s => s.kind === "punishment"),
  });
}

export async function onRequestPost({ request, env }) {
  const action = new URL(request.url).searchParams.get("action");
  const b = await request.json().catch(() => ({}));

  // ── 포상 교환 신청 (로그인된 사용자) : 적립 잔액 확인, 차감은 승인 시 ──
  if (action === "redeem") {
    if (!b.item_id) return json({ error: "item_id required" }, 400);
    const item = await env.DB.prepare("SELECT name, cost, kind FROM shop_items WHERE id = ?").bind(b.item_id).first();
    if (!item || item.kind !== "reward") return json({ error: "reward not found" }, 404);
    const bal = await balances(env);
    if (bal.reward < item.cost) return json({ error: "insufficient", balance: bal.reward }, 400);
    const dup = await env.DB.prepare(
      "SELECT id FROM reward_requests WHERE item_id = ? AND status = 'pending'"
    ).bind(b.item_id).first();
    if (dup) return json({ error: "already pending" }, 409);
    await env.DB.prepare(
      "INSERT INTO reward_requests (item_id, name, cost, status, requested_at) VALUES (?, ?, ?, 'pending', ?)"
    ).bind(b.item_id, item.name, item.cost, nowKST()).run();
    return json({ ok: true });
  }

  // ── 신청 취소 (로그인된 사용자) ──
  if (action === "request-cancel") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM reward_requests WHERE id = ? AND status = 'pending'").bind(b.id).run();
    return json({ ok: true });
  }

  // ── 이하 마스터 전용 ──
  if (!(await isMaster(env, request))) return json({ error: "master required" }, 403);

  // 적립 포인트 조정 (+적립 / -차감)
  if (action === "reward-adjust") {
    const delta = parseInt(b.delta, 10);
    if (!delta) return json({ error: "delta required" }, 400);
    await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, track, created_at) VALUES (?, ?, ?, 'reward', ?)"
    ).bind(delta, b.reason || null, delta > 0 ? "merit" : "adjust", nowKST()).run();
    return json({ ok: true, ...(await balances(env)) });
  }

  // 벌점 조정 (+부여 / -감면)
  if (action === "penalty-adjust") {
    const delta = parseInt(b.delta, 10);
    if (!delta) return json({ error: "delta required" }, 400);
    await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, track, created_at) VALUES (?, ?, ?, 'penalty', ?)"
    ).bind(delta, b.reason || null, delta > 0 ? "demerit" : "adjust", nowKST()).run();
    return json({ ok: true, ...(await balances(env)) });
  }

  // 포상 신청 승인 (적립 포인트 차감)
  if (action === "request-approve") {
    if (!b.id) return json({ error: "id required" }, 400);
    const req = await env.DB.prepare(
      "SELECT id, name, cost, status FROM reward_requests WHERE id = ?"
    ).bind(b.id).first();
    if (!req || req.status !== "pending") return json({ error: "not pending" }, 404);
    const bal = await balances(env);
    if (bal.reward < req.cost) return json({ error: "insufficient", balance: bal.reward }, 400);
    const led = await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, track, created_at) VALUES (?, ?, 'reward', 'reward', ?)"
    ).bind(-req.cost, `포상 교환: ${req.name}`, nowKST()).run();
    const ledgerId = led.meta?.last_row_id ?? null;
    await env.DB.prepare(
      "UPDATE reward_requests SET status = 'approved', decided_at = ?, ledger_id = ? WHERE id = ?"
    ).bind(nowKST(), ledgerId, b.id).run();
    return json({ ok: true, ...(await balances(env)) });
  }

  // 포상 신청 거절
  if (action === "request-reject") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare(
      "UPDATE reward_requests SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(nowKST(), b.id).run();
    return json({ ok: true });
  }

  // 징계 부과 → 벌점 누적(+)
  if (action === "impose") {
    if (!b.item_id) return json({ error: "item_id required" }, 400);
    const item = await env.DB.prepare("SELECT name, cost, kind FROM shop_items WHERE id = ?").bind(b.item_id).first();
    if (!item || item.kind !== "punishment") return json({ error: "punishment not found" }, 404);
    await env.DB.prepare(
      "INSERT INTO point_ledger (delta, reason, type, track, created_at) VALUES (?, ?, 'demerit', 'penalty', ?)"
    ).bind(item.cost || 0, `징계: ${item.name}`, nowKST()).run();
    return json({ ok: true, ...(await balances(env)) });
  }

  // 기록 삭제
  if (action === "ledger-delete") {
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM point_ledger WHERE id = ?").bind(b.id).run();
    return json({ ok: true, ...(await balances(env)) });
  }

  // 숙제 1개당 적립 포인트 설정
  if (action === "hw-config") {
    const v = parseInt(b.perTask, 10);
    if (!Number.isFinite(v) || v < 0) return json({ error: "bad request" }, 400);
    await env.DB.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('hw_per_task', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(String(v)).run();
    return json({ ok: true, ...(await balances(env)) });
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
