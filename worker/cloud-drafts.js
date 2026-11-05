import { localImagePaths } from "../src/import-local-images.js";
import { draftImagePrefix, ownsTempImage } from "./image-host.js";

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const draftIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function table(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS cloud_drafts (owner TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL, article_date TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (owner, id))").run();
}

async function inputJson(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("请提交 JSON 数据");
  if (Number(request.headers.get("content-length")) > 900_000) throw new Error("草稿超过 900 KB 限制");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请求内容为空");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 900_000) { await reader.cancel(); throw new Error("草稿超过 900 KB 限制"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function cleanArticle(article, id, access) {
  if (!article || typeof article !== "object" || article.draftId !== id || article.remote) throw new Error("草稿身份无效");
  if (/data:image\//i.test(`${article.content || ""} ${article.cover || ""}`)) throw new Error("图片仍保存在当前浏览器");
  if (localImagePaths(article.content || "").length) throw new Error("请先关联并上传正文中的本地图片");
  if (String(article.title || "").length > 200 || String(article.slug || "").length > 120) throw new Error("标题或 Slug 过长");
  const prefix = await draftImagePrefix(access, id), pending = article.pendingImages || [];
  if (!Array.isArray(pending) || pending.length > 200 || pending.some(image => !image?.id || !ownsTempImage(image.tempKey, prefix) || !/^https:\/\//.test(image.src || "") || !new URL(image.src).pathname.endsWith(`/${image.tempKey}`))) throw new Error("云端草稿图片信息无效");
  const ids = new Set(pending.map(image => image.id));
  for (const match of `${article.content || ""} ${article.cover || ""}`.matchAll(/asset:\/\/([0-9a-f-]{36})/gi)) if (!ids.has(match[1])) throw new Error("正文仍有未上传的图片");
  const keys = article.tempImageKeys || [];
  if (!Array.isArray(keys) || keys.length > 200 || keys.some(key => !ownsTempImage(key, prefix))) throw new Error("临时图片清单无效");
  const { cloudRevision, pendingImages, demo, remote, file, ...saved } = article;
  const value = JSON.stringify({ ...saved, draftId: id, pendingImages: pending.map(({ id: imageId, name, src, tempKey, watermarkPending }) => ({ id: imageId, name, src, tempKey, watermarkPending })) });
  if (new TextEncoder().encode(value).length > 800_000) throw new Error("草稿正文超过 800 KB 限制");
  return { value, title: String(saved.title || "未命名文章"), slug: String(saved.slug || ""), date: String(saved.date || "") };
}

export async function cloudDraftsApi(request, env, access) {
  if (!env.DB || !access?.sub) return json({ error: "云端草稿存储或登录身份不可用" }, 503);
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "请求来源不匹配" }, 403);
  const id = url.pathname.match(/^\/api\/drafts\/([^/]+)$/)?.[1];
  if (id && !draftIdPattern.test(id)) return json({ error: "草稿 ID 无效" }, 400);
  try {
    await table(env.DB);
    if (url.pathname === "/api/drafts" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, revision, title, slug, article_date AS date, updated_at AS updatedAt FROM cloud_drafts WHERE owner = ? ORDER BY updated_at DESC LIMIT 100").bind(access.sub).all();
      return json({ drafts: results || [] });
    }
    if (id && request.method === "GET") {
      const row = await env.DB.prepare("SELECT value, revision, updated_at FROM cloud_drafts WHERE owner = ? AND id = ? LIMIT 1").bind(access.sub, id).first();
      return row ? json({ article: { ...JSON.parse(row.value), cloudRevision: row.revision }, updatedAt: row.updated_at }) : json({ error: "云端草稿不存在" }, 404);
    }
    if (id && request.method === "PUT") {
      const input = await inputJson(request), expected = input.revision;
      if (!Number.isInteger(expected) || expected < 0) throw new Error("草稿版本无效");
      const saved = await cleanArticle(input.article, id, access), now = new Date().toISOString();
      const result = expected === 0
        ? await env.DB.prepare("INSERT OR IGNORE INTO cloud_drafts (owner, id, revision, title, slug, article_date, value, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)").bind(access.sub, id, saved.title, saved.slug, saved.date, saved.value, now).run()
        : await env.DB.prepare("UPDATE cloud_drafts SET revision = revision + 1, title = ?, slug = ?, article_date = ?, value = ?, updated_at = ? WHERE owner = ? AND id = ? AND revision = ?").bind(saved.title, saved.slug, saved.date, saved.value, now, access.sub, id, expected).run();
      if (result.meta?.changes !== 1) return json({ error: "云端草稿已在其他设备修改；请重新打开后检查，不会覆盖" }, 409);
      return json({ id, revision: expected + 1, updatedAt: now });
    }
    if (id && request.method === "DELETE") {
      const input = await inputJson(request);
      if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("草稿版本无效");
      const result = await env.DB.prepare("DELETE FROM cloud_drafts WHERE owner = ? AND id = ? AND revision = ?").bind(access.sub, id, input.revision).run();
      if (result.meta?.changes !== 1) return json({ error: "云端草稿已变化或不存在，未删除" }, 409);
      return json({ deleted: true });
    }
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    return json({ error: error.message || "云端草稿请求失败" }, 400);
  }
}
