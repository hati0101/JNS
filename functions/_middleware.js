import { verifyToken } from "./api/auth.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) return next();
  if (url.pathname === "/api/auth" && request.method === "POST") return next();
  if (request.method === "GET" && url.pathname === "/api/posts") return next();
  if (request.method === "GET" && url.pathname === "/api/highlights") return next();

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/token=([^;]+)/)?.[1]
    || request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token || !(await verifyToken(env.JWT_SECRET, token))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return next();
}
