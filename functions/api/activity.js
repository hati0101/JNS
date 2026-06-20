// functions/api/activity.js
// 글별 "최근 활동 시각" = MAX(글 수정, 최신 형광펜, 최신 형광펜 댓글, 최신 이미지 댓글)
// NEW 뱃지 판정용. 실패해도 칼럼 목록 자체는 영향 없게 별도 엔드포인트로 둠.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT p.id AS id,
        MAX(
          p.updated_at,
          COALESCE((SELECT MAX(created_at) FROM highlights WHERE post_id = p.id), ''),
          COALESCE((SELECT MAX(hc.created_at) FROM highlight_comments hc
                    JOIN highlights h ON hc.highlight_id = h.id WHERE h.post_id = p.id), ''),
          COALESCE((SELECT MAX(created_at) FROM media_comments WHERE post_id = p.id), '')
        ) AS last_activity
      FROM posts p
    `).all();
    const activity = {};
    for (const r of results) activity[r.id] = r.last_activity;
    return json({ activity });
  } catch (e) {
    return json({ activity: {}, error: "activity unavailable" });
  }
}
