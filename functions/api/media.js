// functions/api/media.js
// POST /api/media   (multipart/form-data, field: file)
// → { url, filename }

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4"];
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export async function onRequestPost({ request, env }) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return resp({ error: "invalid form data" }, 400);

  const file = formData.get("file");
  if (!file || typeof file === "string") return resp({ error: "no file" }, 400);
  if (!ALLOWED.includes(file.type)) return resp({ error: "unsupported type" }, 415);
  if (file.size > MAX_SIZE) return resp({ error: "too large (max 100MB)" }, 413);

  const ext = file.name.split(".").pop().toLowerCase();
  const key = `media/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // R2 public URL (버킷에 퍼블릭 액세스 활성화 필요)
  const url = `${env.R2_PUBLIC_URL}/${key}`;

  return resp({ ok: true, url, filename: file.name });
}

function resp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
