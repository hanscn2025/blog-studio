import { sign } from "node:crypto";

const API = "https://api.github.com";
const encode = value => Buffer.from(value).toString("base64url");

export function createAppJwt(clientId, privateKey, now = Date.now()) {
  if (!clientId || !privateKey) throw new Error("GitHub App 尚未配置");
  const seconds = Math.floor(now / 1000);
  const payload = `${encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${encode(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: String(clientId) }))}`;
  return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
}

async function githubJson(path, token, options = {}, request = fetch) {
  const response = await request(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "blog-admin",
      "X-GitHub-Api-Version": "2026-03-10",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const stage = path.includes("/access_tokens") ? "创建安装令牌" : "读取已授权仓库";
    const result = await response.json().catch(() => ({}));
    const reason = typeof result.message === "string" ? result.message.slice(0, 160) : "";
    throw new Error(`GitHub ${stage}失败 (${response.status})${reason ? `：${reason}` : ""}`);
  }
  return response.json();
}

export async function installationToken(config, request = fetch) {
  const installationId = String(config.GITHUB_INSTALLATION_ID || "");
  if (!/^\d+$/.test(installationId)) throw new Error("GitHub App 安装 ID 尚未配置");
  const jwt = createAppJwt(config.GITHUB_APP_ID, config.GITHUB_APP_PRIVATE_KEY);
  const result = await githubJson(`/app/installations/${installationId}/access_tokens`, jwt, { method: "POST" }, request);
  if (!result.token) throw new Error("GitHub 未返回安装令牌");
  return result.token;
}

export async function listInstalledRepositories(config, request = fetch) {
  const token = await installationToken(config, request);
  return repositoriesForToken(token, request);
}

async function repositoriesForToken(token, request) {
  const repositories = [];
  for (let page = 1; page <= 10; page++) {
    const result = await githubJson(`/installation/repositories?per_page=100&page=${page}`, token, {}, request);
    repositories.push(...result.repositories.map(repo => ({ fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private })));
    if (repositories.length >= result.total_count) return repositories;
  }
  throw new Error("仓库数量超过当前可安全列出的范围");
}

export async function inspectInstalledRepository(config, fullName, request = fetch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName || "")) throw new Error("仓库名称无效");
  const token = await installationToken(config, request);
  const repository = (await repositoriesForToken(token, request)).find(item => item.fullName === fullName);
  if (!repository) throw new Error("仓库不在 GitHub App 授权范围内");
  const base = `/repos/${fullName}/contents/`;
  const exists = async path => {
    const response = await request(`${API}${base}${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(repository.defaultBranch)}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "blog-admin", "X-GitHub-Api-Version": "2026-03-10" },
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`GitHub 仓库识别失败 (${response.status})`);
    return true;
  };
  const hexo = await exists("_config.yml");
  const hugo = !hexo && (await exists("hugo.toml") || await exists("hugo.yaml") || await exists("config.toml") || await exists("config.yaml"));
  if (!hexo && !hugo) return { repository, engine: "unsupported", articleDir: null, template: null };
  const articleDirs = hexo ? ["source/_posts"] : ["content/posts", "content/blog", "content"];
  const availableDirs = await Promise.all(articleDirs.map(exists));
  const articleDir = articleDirs[availableDirs.indexOf(true)] || null;
  const template = hexo ? "scaffolds/post.md" : "archetypes/default.md";
  return { repository, engine: hexo ? "hexo" : "hugo", articleDir, template: await exists(template) ? template : null };
}

function source(config) {
  const repository = config.repository;
  const articleDir = config.site?.articleDir;
  const branch = config.site?.defaultBranch;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") || !articleDir || !branch) throw new Error("请重新识别并绑定博客源码仓库");
  return { repository, articleDir, branch };
}

function frontMatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!match) return {};
  const values = {};
  let listKey = "";
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_][\w-]*):\s*(.*)$/i);
    if (field) {
      listKey = field[1];
      const raw = field[2].trim();
      values[listKey] = raw ? raw.replace(/^(['"])(.*)\1$/, "$2") : [];
    } else if (listKey && /^\s+-\s+/.test(line) && Array.isArray(values[listKey])) {
      values[listKey].push(line.replace(/^\s+-\s+/, "").trim().replace(/^(['"])(.*)\1$/, "$2"));
    } else if (line.trim()) listKey = "";
  }
  const first = value => Array.isArray(value) ? value[0] || "" : value || "";
  const channels = values.nav_channels || values.nav_channel || [];
  return {
    title: first(values.title),
    category: first(values.categories || values.category),
    channels: Array.isArray(channels) ? channels : [channels],
    date: first(values.date),
    updated: first(values.updated) || first(values.date),
    top: /^\d+$/.test(String(first(values.top)).trim()) ? Number(first(values.top)) : 0,
  };
}

export async function listRepositoryArticles(config, request = fetch) {
  const { repository, articleDir, branch } = source(config);
  const token = await installationToken(config, request);
  const result = await githubJson(`/repos/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token, {}, request);
  if (result.truncated) throw new Error("GitHub 文件树过大，无法完整列出文章");
  const prefix = `${articleDir}/`;
  const articles = (result.tree || []).filter(item => item.type === "blob" && item.path.startsWith(prefix) && /\.md$/i.test(item.path)).map(item => ({
    file: item.path,
    title: item.path.slice(prefix.length).replace(/\.md$/i, ""),
    size: item.size,
    sha: item.sha,
  }));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, articles.length) }, async () => {
    while (next < articles.length) {
      const article = articles[next++];
      if (article.size > 1_000_000) continue;
      try {
        const blob = await githubJson(`/repos/${repository}/git/blobs/${encodeURIComponent(article.sha)}`, token, {}, request);
        if (blob.encoding !== "base64" || !blob.content) continue;
        Object.assign(article, frontMatter(Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8")));
        if (!article.title) article.title = article.file.slice(prefix.length).replace(/\.md$/i, "");
      } catch { article.metadataError = true; }
    }
  }));
  return articles.sort((a, b) => (b.top || 0) - (a.top || 0) || String(b.date || "").localeCompare(String(a.date || "")) || a.file.localeCompare(b.file, "zh-CN"));
}

export async function readRepositoryArticle(config, path, request = fetch) {
  const { repository, articleDir, branch } = source(config);
  if (typeof path !== "string" || !path.startsWith(`${articleDir}/`) || path.split("/").some(part => !part || part === "." || part === "..") || !/\.md$/i.test(path)) throw new Error("文章路径无效");
  const token = await installationToken(config, request);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const result = await githubJson(`/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, token, {}, request);
  if (result.type !== "file" || result.encoding !== "base64" || result.size > 1_000_000 || !result.content) throw new Error("文章不是可读取的 Markdown 文件（最大 1 MB）");
  return { file: path, sha: result.sha, content: Buffer.from(result.content.replace(/\s/g, ""), "base64").toString("utf8") };
}

export async function listArticleHistory(config, path, request = fetch) {
  const { repository, branch } = source(config);
  await readRepositoryArticle(config, path, request);
  const token = await installationToken(config, request);
  const commits = await githubJson(`/repos/${repository}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=30`, token, {}, request);
  return commits.map(item => ({ sha: item.sha, message: item.commit?.message?.split("\n")[0] || "", date: item.commit?.author?.date || "" }));
}

export async function readArticleRevision(config, path, commit, request = fetch) {
  const { repository, articleDir } = source(config);
  if (typeof path !== "string" || !path.startsWith(`${articleDir}/`) || path.split("/").some(part => !part || part === "." || part === "..") || !/\.md$/i.test(path)) throw new Error("文章路径无效");
  if (!/^[0-9a-f]{40}$/i.test(commit || "")) throw new Error("提交 SHA 无效");
  const token = await installationToken(config, request);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const result = await githubJson(`/repos/${repository}/contents/${encodedPath}?ref=${commit}`, token, {}, request);
  if (result.type !== "file" || result.encoding !== "base64" || result.size > 1_000_000 || !result.content) throw new Error("历史文章不可读取（最大 1 MB）");
  return { file: path, commit, content: Buffer.from(result.content.replace(/\s/g, ""), "base64").toString("utf8") };
}

export async function createRepositoryArticle(config, slug, content, message, request = fetch) {
  const { repository, articleDir, branch } = source(config);
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("文章 Slug 无效");
  if (typeof content !== "string" || !content.startsWith("---\n") || !content.trim() || Buffer.byteLength(content) > 1_000_000) throw new Error("文章内容无效或超过 1 MB");
  const path = `${articleDir}/${slug}.md`;
  const token = await installationToken(config, request);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const target = `/repos/${repository}/contents/${encodedPath}`;
  const existing = await request(`${API}${target}?ref=${encodeURIComponent(branch)}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "blog-admin", "X-GitHub-Api-Version": "2026-03-10" },
  });
  if (existing.ok) throw new Error("目标文章已存在，已停止提交以避免覆盖");
  if (existing.status !== 404) throw new Error(`GitHub 检查目标文件失败 (${existing.status})`);
  const result = await githubJson(target, token, { method: "PUT", body: JSON.stringify({ message: String(message || `Add blog post: ${slug}`).slice(0, 120), content: Buffer.from(content).toString("base64"), branch }) }, request);
  return { repository, branch, path, commit: result.commit?.sha || "" };
}

export async function updateRepositoryArticle(config, path, sha, content, message, request = fetch) {
  const { repository, articleDir, branch } = source(config);
  if (typeof path !== "string" || !path.startsWith(`${articleDir}/`) || path.split("/").some(part => !part || part === "." || part === "..") || !/\.md$/i.test(path)) throw new Error("文章路径无效");
  if (!/^[0-9a-f]{40}$/i.test(sha || "")) throw new Error("文章版本 SHA 无效");
  if (typeof content !== "string" || !/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(content) || Buffer.byteLength(content) > 1_000_000) throw new Error("文章内容无效或超过 1 MB");
  const current = await readRepositoryArticle(config, path, request);
  if (current.sha !== sha) throw new Error("仓库文章已更新，请重新打开并比较，未覆盖新版本");
  if (current.content === content) throw new Error("文章内容没有变化");
  const token = await installationToken(config, request);
  const target = `/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const result = await githubJson(target, token, { method: "PUT", body: JSON.stringify({ message: String(message || `Update blog post: ${path}`).slice(0, 120), content: Buffer.from(content).toString("base64"), sha, branch }) }, request);
  return { repository, branch, path, sha: result.content?.sha || "", commit: result.commit?.sha || "" };
}

export async function deleteRepositoryArticle(config, path, sha, request = fetch) {
  const { repository, branch } = source(config);
  if (!/^[0-9a-f]{40}$/i.test(sha || "")) throw new Error("文章版本 SHA 无效");
  const current = await readRepositoryArticle(config, path, request);
  if (current.sha !== sha) throw new Error("仓库文章已更新，请刷新列表后重试，未删除新版本");
  const token = await installationToken(config, request);
  const target = `/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const result = await githubJson(target, token, { method: "DELETE", body: JSON.stringify({ message: `Delete blog post: ${path}`.slice(0, 120), sha, branch }) }, request);
  return { repository, branch, path, commit: result.commit?.sha || "" };
}
