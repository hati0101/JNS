// functions/api/auth.js
// POST /api/auth  { password }  → { token }

const JWT_HEADER = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeToken(secret) {
  const payload = btoa(JSON.stringify({ exp: Date.now() + 86400000 * 30 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = await hmacSign(secret, `${JWT_HEADER}.${payload}`);
  return `${JWT_HEADER}.${payload}.${sig}`;
}

export async function verifyToken(secret, token) {
  try {
    const [h, p, s] = token.split(".");
    const expected = await hmacSign(secret, `${h}.${p}`);
    if (expected !== s) return false;
    const { exp } = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const { password } = await request.json().catch(() => ({}));
  if (!password) return new Response("bad request", { status: 400 });

  // PASSWORD_HASH: echo -n "yourpassword" | sha256sum  (hex)
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );
  const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");

  if (hex !== env.PASSWORD_HASH) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = await makeToken(env.JWT_SECRET);
  return new Response(JSON.stringify({ ok: true, token }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${86400 * 30}`,
    },
  });
}

export async function onRequestDelete({ env, request }) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    },
  });
}
