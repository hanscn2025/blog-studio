import { AwsClient } from "aws4fetch";

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const validTag = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const validArchive = /^[a-z0-9][a-z0-9._-]{0,119}\.tar\.gz$/i;

function config(env) {
  const account = env.BACKUP_R2_ACCOUNT_ID;
  const bucket = env.BACKUP_R2_BUCKET;
  const accessKeyId = env.BACKUP_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.BACKUP_R2_SECRET_ACCESS_KEY;
  if (!account || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  return { account, bucket, client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 0 }) };
}

function bucketUrl({ account, bucket }) { return `https://${account}.r2.cloudflarestorage.com/${bucket}`; }
function xmlValue(source, tag) { return source.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || ""; }
function decodeXml(value) { return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
function datedName(archive, date) { return archive.replace(/\.tar\.gz$/, `-${date}.tar.gz`); }
async function smallText(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) { await reader.cancel(); throw new Error("Response too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export function parseReleaseBackups(xml) {
  const items = [];
  for (const [, entry] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = decodeXml(xmlValue(entry, "Key"));
    const match = key.match(/^production\/(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/([^/]+\.tar\.gz)$/);
    if (!match || !validArchive.test(match[2])) continue;
    const uploadedAt = xmlValue(entry, "LastModified");
    if (!/^\d{4}-\d{2}-\d{2}T/.test(uploadedAt)) continue;
    const date = uploadedAt.slice(0, 10);
    items.push({ tag: match[1], archive: match[2], filename: datedName(match[2], date), uploadedAt, size: Number(xmlValue(entry, "Size")) || 0 });
  }
  return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function releaseBackupsApi(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET") return json({ error: "只允许读取生产版本备份" }, 405);
  const settings = config(env);
  if (!settings) return json({ configured: false, items: [], error: "尚未配置生产备份桶的只读凭据" }, 503);
  try {
    if (url.pathname === "/api/backups/releases") {
      const listing = await settings.client.fetch(`${bucketUrl(settings)}?list-type=2&prefix=production%2F&max-keys=1000`);
      if (!listing.ok) return json({ error: `备份桶读取失败（HTTP ${listing.status}）` }, 502);
      const xml = await smallText(listing, 1_000_000);
      return json({ configured: true, items: parseReleaseBackups(xml), truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml) });
    }
    if (url.pathname === "/api/backups/download") {
      const tag = url.searchParams.get("tag") || "";
      const archive = url.searchParams.get("archive") || "";
      const date = url.searchParams.get("date") || "";
      const type = url.searchParams.get("type") || "archive";
      if (!validTag.test(tag) || !validArchive.test(archive) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !["archive", "checksum"].includes(type)) return json({ error: "备份参数无效" }, 400);
      const key = `production/${tag}/${archive}${type === "checksum" ? ".sha256" : ""}`;
      const response = await settings.client.fetch(`${bucketUrl(settings)}/${key.split("/").map(encodeURIComponent).join("/")}`);
      if (response.status === 404) return json({ error: "备份文件不存在" }, 404);
      if (!response.ok) return json({ error: `备份读取失败（HTTP ${response.status}）` }, 502);
      const filename = datedName(archive, date);
      if (type === "checksum") {
        if (Number(response.headers.get("content-length")) > 4096) return json({ error: "校验文件过大" }, 502);
        const checksum = (await smallText(response, 4096)).match(/^([a-f0-9]{64})\s+/i)?.[1];
        if (!checksum) return json({ error: "校验文件格式错误" }, 502);
        return new Response(`${checksum}  ${filename}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.sha256"`, "Cache-Control": "no-store" } });
      }
      return new Response(response.body, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store", ...(response.headers.get("content-length") ? { "Content-Length": response.headers.get("content-length") } : {}) } });
    }
    return json({ error: "接口不存在" }, 404);
  } catch {
    return json({ error: "备份服务暂时不可用，请检查只读凭据与桶配置" }, 502);
  }
}
