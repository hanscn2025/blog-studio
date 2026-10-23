import { AwsClient } from "aws4fetch";
import { seal, unseal } from "./github-settings.js";

const settingKey = "image-host";
const maxImageBytes = 8 * 1024 * 1024;
const maxMediaBytes = 80 * 1024 * 1024;
const types = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const packageExtensions = /\.(?:zip|7z|rar|tar|gz|tgz|dmg|exe|msi|deb|rpm|apk|pdf)$/i;
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function imageObjectKey(slug, number, type) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || slug.length > 120) throw new Error("文章 Slug 无效");
  if (!Number.isInteger(number) || number < 1 || number > 999) throw new Error("图片编号已超出 001–999");
  if (!types[type]) throw new Error("仅支持 PNG、JPEG、WebP 和 GIF 图片");
  return `${slug}/${String(number).padStart(3, "0")}.${types[type]}`;
}

function publicUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("公开域名必须是 HTTPS 地址");
  return url.href.replace(/\/$/, "");
}

function validate(input, previous) {
  const accountId = String(input.accountId || "").trim();
  const bucket = String(input.bucket || "").trim();
  const accessKeyId = String(input.accessKeyId || previous?.accessKeyId || "").trim();
  const secretAccessKey = String(input.secretAccessKey || previous?.secretAccessKey || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("Cloudflare 账户 ID 应为 32 位十六进制字符");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("R2 存储桶名称无效");
  if (!accessKeyId || !secretAccessKey) throw new Error("请填写 R2 Access Key 和 Secret Key");
  return { accountId, bucket, publicUrl: publicUrl(input.publicUrl), accessKeyId, secretAccessKey };
}

function client(config) {
  return new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto", retries: 0 });
}

function bucketUrl(config) { return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`; }

function imageKeys(xml, slug) {
  return new Set([...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(match => match[1].match(new RegExp(`^${slug}/(\\d{3})\\.(?:png|jpg|webp|gif)$`))?.[1]).filter(Boolean).map(Number));
}

function mediaName(value) {
  const name = String(value || "").normalize("NFKC");
  if (!name || name.length > 120 || /[\\/\x00-\x1f\x7f]/.test(name) || name === "." || name === ".." || !packageExtensions.test(name)) throw new Error("软件包文件名或格式无效；支持 ZIP、7Z、RAR、TAR、GZ、TGZ、DMG、EXE、MSI、DEB、RPM、APK、PDF");
  return name;
}

function mediaItems(xml, config) {
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, entry]) => {
    const value = tag => entry.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || "";
    const key = decodeURIComponent(value("Key"));
    return { key, url: `${config.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`, size: Number(value("Size")) || 0, lastModified: value("LastModified"), type: /\.(?:png|jpe?g|webp|gif)$/i.test(key) ? "image" : "file" };
  });
}

async function load(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(settingKey).first();
  return row ? unseal(row.value, env.CONFIG_ENCRYPTION_KEY) : null;
}

async function limitedJson(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("请提交 JSON 数据");
  if (Number(request.headers.get("content-length")) > 11_500_000) throw new Error("图片超过 8 MB 限制");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请求内容为空");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 11_500_000) { await reader.cancel(); throw new Error("图片超过 8 MB 限制"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function imageHostApi(request, env) {
  if (!env.DB || !env.CONFIG_ENCRYPTION_KEY) return json({ error: "后台加密存储尚未就绪" }, 503);
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "请求来源不匹配" }, 403);
  try {
    const config = await load(env);
    if (url.pathname === "/api/images/settings" && request.method === "GET") {
      return json({ connected: !!config, provider: "Cloudflare R2", accountId: config?.accountId || "", bucket: config?.bucket || "", publicUrl: config?.publicUrl || "" });
    }
    if (url.pathname === "/api/images/settings" && request.method === "POST") {
      const candidate = validate(await limitedJson(request), config);
      const response = await client(candidate).fetch(`${bucketUrl(candidate)}?list-type=2&max-keys=1`);
      if (!response.ok) return json({ error: `R2 验证失败（HTTP ${response.status}）；请检查桶、密钥权限和账户 ID` }, 422);
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(settingKey, await seal(candidate, env.CONFIG_ENCRYPTION_KEY)).run();
      return json({ connected: true, provider: "Cloudflare R2", accountId: candidate.accountId, bucket: candidate.bucket, publicUrl: candidate.publicUrl });
    }
    if (url.pathname === "/api/images/upload" && request.method === "POST") {
      if (!config) return json({ error: "请先验证并保存 R2 图床连接" }, 409);
      const input = await limitedJson(request);
      const match = String(input.src || "").match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("图片数据格式无效");
      if (match[2].length > Math.ceil(maxImageBytes * 4 / 3) + 4) throw new Error("图片超过 8 MB 限制");
      const binary = atob(match[2]);
      if (binary.length > maxImageBytes) throw new Error("图片超过 8 MB 限制");
      const body = Uint8Array.from(binary, char => char.charCodeAt(0));
      const storage = client(config);
      const slug = String(input.slug || "");
      imageObjectKey(slug, 1, match[1]);
      const listing = await storage.fetch(`${bucketUrl(config)}?list-type=2&prefix=${encodeURIComponent(`${slug}/`)}&max-keys=1000`);
      if (!listing.ok) return json({ error: `R2 目录读取失败（HTTP ${listing.status}）` }, 502);
      const xml = await listing.text();
      if (/<IsTruncated>true<\/IsTruncated>/.test(xml)) throw new Error("该文章图片已达到 999 张上限");
      const used = new Set([...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(match => match[1].match(new RegExp(`^${slug}/(\\d{3})\\.(?:png|jpg|webp|gif)$`))?.[1]).filter(Boolean).map(Number));
      for (let number = 1; number <= 999; number++) {
        if (used.has(number)) continue;
        const key = imageObjectKey(slug, number, match[1]);
        const response = await storage.fetch(`${bucketUrl(config)}/${key}`, { method: "PUT", headers: { "Content-Type": match[1], "If-None-Match": "*" }, body });
        if (response.status === 412) continue;
        if (!response.ok) return json({ error: `R2 上传失败（HTTP ${response.status}）；原图仍在本地草稿` }, 502);
        return json({ key, url: `${config.publicUrl}/${key}` });
      }
      throw new Error("该文章图片已达到 999 张上限");
    }
    if (url.pathname === "/api/images/media" && request.method === "GET") {
      if (!config) return json({ error: "请先连接 R2 图床" }, 409);
      const slug = url.searchParams.get("slug") || "";
      if (slug) imageObjectKey(slug, 1, "image/png");
      const cursor = url.searchParams.get("cursor") || "";
      if (cursor.length > 2048) throw new Error("分页标记无效");
      const params = new URLSearchParams({ "list-type": "2", "max-keys": "200", "encoding-type": "url" });
      if (slug) params.set("prefix", `${slug}/`);
      if (cursor) params.set("continuation-token", cursor);
      const response = await client(config).fetch(`${bucketUrl(config)}?${params}`);
      if (!response.ok) return json({ error: `R2 文件列表读取失败（HTTP ${response.status}）` }, 502);
      const xml = await response.text();
      const nextCursor = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]?.replaceAll("&amp;", "&") || "";
      return json({ items: mediaItems(xml, config), nextCursor });
    }
    if (url.pathname === "/api/images/media/upload" && request.method === "POST") {
      if (!config) return json({ error: "请先连接 R2 图床" }, 409);
      const slug = url.searchParams.get("slug") || "";
      imageObjectKey(slug, 1, "image/png");
      const length = Number(request.headers.get("x-upload-size"));
      if (!Number.isInteger(length) || length < 1 || length > maxMediaBytes || !request.body) throw new Error("文件必须大于 0 且不超过 80 MB");
      const name = url.searchParams.get("name") || "";
      const extension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
      const imageType = Object.entries(types).find(([, ext]) => ext === extension || (ext === "jpg" && extension === "jpeg"))?.[0];
      if (imageType && length > maxImageBytes) throw new Error("图片不能超过 8 MB");
      const storage = client(config);
      let key;
      if (imageType) {
        const listing = await storage.fetch(`${bucketUrl(config)}?list-type=2&prefix=${encodeURIComponent(`${slug}/`)}&max-keys=1000`);
        if (!listing.ok) return json({ error: `R2 目录读取失败（HTTP ${listing.status}）` }, 502);
        const xml = await listing.text();
        if (/<IsTruncated>true<\/IsTruncated>/.test(xml)) throw new Error("该文章图片已达到 999 张上限");
        const used = imageKeys(xml, slug);
        const number = Array.from({ length: 999 }, (_, index) => index + 1).find(value => !used.has(value));
        if (!number) throw new Error("该文章图片已达到 999 张上限");
        key = imageObjectKey(slug, number, imageType);
      } else key = `${slug}/files/${mediaName(name)}`;
      let received = 0;
      const body = request.body.pipeThrough(new TransformStream({ transform(chunk, controller) { received += chunk.byteLength; if (received > length || received > maxMediaBytes) throw new Error("文件大小与声明不符或超过 80 MB"); controller.enqueue(chunk); } }));
      const headers = { "Content-Type": imageType || "application/octet-stream", "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD", "If-None-Match": "*" };
      if (!imageType) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
      const target = `${bucketUrl(config)}/${key.split("/").map(encodeURIComponent).join("/")}`;
      const response = await storage.fetch(target, { method: "PUT", headers, body, duplex: "half" });
      if (response.status === 412) return json({ error: "同名文件已存在，未覆盖；请改名后重试" }, 409);
      if (!response.ok) return json({ error: `R2 上传失败（HTTP ${response.status}）` }, 502);
      if (received !== length) throw new Error("上传文件大小不完整，请核查 R2 对象");
      return json({ key, url: `${config.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}` });
    }
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    return json({ error: error.message || "图床请求失败" }, 400);
  }
}
