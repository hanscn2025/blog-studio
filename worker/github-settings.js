import { createRepositoryArticle, deleteRepositoryArticle, inspectInstalledRepository, installationToken, listArticleHistory, listInstalledRepositories, listRepositoryArticles, readArticleRevision, readRepositoryArticle, updateRepositoryArticle } from "./github-app.js";
import { readRepositoryNavigation } from "./navigation.js";
import { serializeArticle, validateArticle } from "../src/article-standard.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function encryptionKey(secret) {
  if (!secret) throw new Error("后台加密密钥尚未配置");
  const raw = decode(secret);
  if (raw.length !== 32) throw new Error("后台加密密钥无效");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoder.encode(JSON.stringify(value)));
  return `${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}

export async function unseal(value, secret) {
  const [iv, cipher] = value.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await encryptionKey(secret), decode(cipher));
  return JSON.parse(decoder.decode(plain));
}

async function table(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
}

export async function loadGitHubSettings(env) {
  if (!env.DB || !env.CONFIG_ENCRYPTION_KEY) return null;
  await table(env.DB);
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind("github").first();
  return row ? unseal(row.value, env.CONFIG_ENCRYPTION_KEY) : null;
}

async function saveGitHubSettings(env, config) {
  await table(env.DB);
  const value = await seal(config, env.CONFIG_ENCRYPTION_KEY);
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("github", value).run();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function inputJson(request, maxLength = 20000) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("请提交 JSON 配置");
  const raw = await request.text();
  if (raw.length > maxLength) throw new Error("提交内容过大");
  return JSON.parse(raw);
}

export async function githubSettingsApi(request, env, requestGitHub = fetch) {
  if (!env.DB || !env.CONFIG_ENCRYPTION_KEY) return json({ error: "后台配置存储尚未就绪" }, 503);
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "请求来源不匹配" }, 403);
  try {
    const config = await loadGitHubSettings(env);
    if (url.pathname === "/api/github/settings" && request.method === "GET") {
      return json({ connected: !!config, appId: config?.GITHUB_APP_ID || "", installationId: config?.GITHUB_INSTALLATION_ID || "", repository: config?.repository || "", site: config?.site || null });
    }
    if (url.pathname === "/api/github/settings" && request.method === "POST") {
      const input = await inputJson(request);
      const candidate = {
        GITHUB_APP_ID: String(input.appId || "").trim(),
        GITHUB_INSTALLATION_ID: String(input.installationId || "").trim(),
        GITHUB_APP_PRIVATE_KEY: String(input.privateKey || "").trim(),
        repository: "",
      };
      if (!/^\d+$/.test(candidate.GITHUB_APP_ID) || !/^\d+$/.test(candidate.GITHUB_INSTALLATION_ID) || !candidate.GITHUB_APP_PRIVATE_KEY.startsWith("-----BEGIN ")) throw new Error("App ID、安装 ID 或 PEM 私钥无效");
      const repositories = await listInstalledRepositories(candidate, requestGitHub);
      await saveGitHubSettings(env, candidate);
      return json({ connected: true, repositories });
    }
    if (!config) return json({ error: "请先连接 GitHub App" }, 409);
    if (url.pathname === "/api/github/repositories" && request.method === "GET") return json({ repositories: await listInstalledRepositories(config, requestGitHub) });
    if (url.pathname === "/api/github/repository" && request.method === "POST") {
      const input = await inputJson(request);
      const site = await inspectInstalledRepository(config, input.repository, requestGitHub);
      if (site.engine === "unsupported" || !site.articleDir) return json({ error: "未识别到可用的 Hexo/Hugo 文章目录" }, 422);
      await saveGitHubSettings(env, { ...config, repository: input.repository, navigationSource: undefined, site: { engine: site.engine, articleDir: site.articleDir, template: site.template, defaultBranch: site.repository.defaultBranch } });
      return json({ site });
    }
    if (!config.repository) return json({ error: "请先在 GitHub 设置绑定博客源码仓库" }, 409);
    if (url.pathname === "/api/github/publish" && request.method === "POST") {
      if (!env.PUBLISH_ALLOWED_REPOSITORY || config.repository !== env.PUBLISH_ALLOWED_REPOSITORY) return json({ error: "当前后台不允许向该仓库提交" }, 403);
      if (!config.site) return json({ error: "请重新识别并绑定博客源码仓库" }, 409);
      const input = await inputJson(request, 1_200_000);
      const article = input.article;
      if (!article || typeof article !== "object" || Array.isArray(article)) throw new Error("文章数据无效");
      const errors = validateArticle(article);
      if (article.pendingImages?.length) errors.push("暂存图片尚未上传图床");
      if (errors.length) return json({ error: errors.join("；") }, 422);
      return json({ published: await createRepositoryArticle(config, article.slug, serializeArticle(article), input.message, requestGitHub) });
    }
    if (url.pathname === "/api/github/update" && request.method === "POST") {
      if (!env.PUBLISH_ALLOWED_REPOSITORY || config.repository !== env.PUBLISH_ALLOWED_REPOSITORY) return json({ error: "当前后台不允许向该仓库提交" }, 403);
      if (!config.site) return json({ error: "请重新识别并绑定博客源码仓库" }, 409);
      const input = await inputJson(request, 1_200_000);
      return json({ updated: await updateRepositoryArticle(config, input.path, input.sha, input.content, input.message, requestGitHub) });
    }
    if (url.pathname === "/api/github/delete" && request.method === "POST") {
      if (!env.PUBLISH_ALLOWED_REPOSITORY || config.repository !== env.PUBLISH_ALLOWED_REPOSITORY) return json({ error: "当前后台不允许删除该仓库文章" }, 403);
      if (!config.site) return json({ error: "请重新识别并绑定博客源码仓库" }, 409);
      const input = await inputJson(request);
      return json({ deleted: await deleteRepositoryArticle(config, input.path, input.sha, requestGitHub) });
    }
    if (url.pathname === "/api/github/history" && request.method === "GET") {
      if (!config.site) return json({ error: "请重新识别并绑定博客源码仓库" }, 409);
      return json({ commits: await listArticleHistory(config, url.searchParams.get("path"), requestGitHub) });
    }
    if (url.pathname === "/api/github/revision" && request.method === "GET") {
      if (!config.site) return json({ error: "请重新识别并绑定博客源码仓库" }, 409);
      return json({ revision: await readArticleRevision(config, url.searchParams.get("path"), url.searchParams.get("commit"), requestGitHub) });
    }
    if (url.pathname === "/api/github/navigation" && (request.method === "GET" || request.method === "POST")) {
      if (!config.site) return json({ error: "请重新识别并绑定博客源码仓库" }, 409);
      const input = request.method === "POST" ? await inputJson(request) : null;
      const selection = input ? { path: input.path, format: input.format } : url.searchParams.has("path") ? { path: url.searchParams.get("path"), format: url.searchParams.get("format") } : config.navigationSource;
      const result = await readRepositoryNavigation(config, await installationToken(config, requestGitHub), requestGitHub, selection);
      if (input) {
        if (result.status !== "detected") return json({ error: "所选文件和结构未识别出导航，未保存" }, 422);
        await saveGitHubSettings(env, { ...config, navigationSource: selection });
      }
      return json(result);
    }
    if (url.pathname.startsWith("/api/github/article") && request.method === "GET") {
      let bound = config;
      if (!config.site) {
        const site = await inspectInstalledRepository(config, config.repository, requestGitHub);
        if (site.engine === "unsupported" || !site.articleDir) return json({ error: "未识别到可用的文章目录" }, 422);
        bound = { ...config, site: { engine: site.engine, articleDir: site.articleDir, template: site.template, defaultBranch: site.repository.defaultBranch } };
        await saveGitHubSettings(env, bound);
      }
      if (url.pathname === "/api/github/articles") return json({ articles: await listRepositoryArticles(bound, requestGitHub) });
      if (url.pathname === "/api/github/article") return json({ article: await readRepositoryArticle(bound, url.searchParams.get("path"), requestGitHub) });
    }
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    return json({ error: error.message || "连接失败" }, 400);
  }
}
