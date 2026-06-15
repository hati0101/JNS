// functions/api/media-list.js
// GET /api/media-list  → R2 버킷 파일 목록

export async function onRequestGet({ env }) {
  const listed = await env.BUCKET.list({ prefix: "media/", limit: 200 });

  const files = listed.objects
    .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
    .map(obj => ({
      key: obj.key,
      url: `${env.R2_PUBLIC_URL}/${obj.key}`,
      size: obj.size,
      uploaded: obj.uploaded,
      type: guessType(obj.key),
    }));

  return new Response(JSON.stringify({ files }), {
    headers: { "Content-Type": "application/json" },
  });
}

function guessType(key) {
  const ext = key.split(".").pop().toLowerCase();
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  return "image";
}
