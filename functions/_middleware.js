// functions/_middleware.js
import { verifyToken } from "./api/auth.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // 정적 파일 통과
  if (!url.pathname.startsWith("/api/")) return next();

  // 로그인은 인증 불필요
  if (url.pathname === "/api/auth" && request.method === "POST") return next();

  // 글 목록/상세 GET은 통과 (나만 쓰지만 읽기는 허용)
  if (url.pathname === "/api/posts" && request.method === "GET") return next();

  // 나머지 모두 토큰 검증
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
