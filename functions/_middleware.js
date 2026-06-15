// functions/_middleware.js  (모든 /api/* 요청에 적용)
import { verifyToken } from "./api/auth.js";

const PUBLIC = ["/api/auth", "/api/posts"];  // GET 글 목록/상세는 공개

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // 인증 불필요한 경로
  if (url.pathname === "/api/auth") return next();
  // GET 글 목록/상세 공개 (퍼블릭 칼럼이므로)
  if (request.method === "GET" && url.pathname.startsWith("/api/posts")) return next();

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
