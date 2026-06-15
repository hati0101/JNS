// functions/_middleware.js
import { verifyToken } from "./api/auth.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // 로그인 엔드포인트는 인증 불필요
  if (url.pathname === "/api/auth" && request.method === "POST") return next();

  // 정적 파일 (HTML, CSS, JS 등) 인증 불필요
  if (!url.pathname.startsWith("/api/")) return next();

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
