import { isMap, isSeq, parseDocument } from "yaml";

const candidatePath = path => /(?:^|\/)(?:navigation|menu)\.ya?ml$/i.test(path)
  || /^_config\.[^/]+\.ya?ml$/i.test(path)
  || /^themes\/[^/]+\/_config\.ya?ml$/i.test(path)
  || /^(?:hugo|config)\.(?:toml|ya?ml)$/i.test(path)
  || /^config\/_default\/(?:menu|menus)(?:\.[\w-]+)?\.(?:toml|ya?ml)$/i.test(path);
const safePath = path => typeof path === "string" && path.length <= 200 && !path.split("/").some(part => !part || part === "." || part === "..") && /^[\w./-]+$/.test(path);
const manualPath = path => safePath(path) && /\.(?:ya?ml|toml)$/i.test(path) && /^(?:source\/_data\/|data\/|config\/|themes\/[^/]+\/|_config\.|hugo\.|config\.)/.test(path);

export function parseChannelNavigation(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(line => /^items:\s*(?:#.*)?$/.test(line));
  if (start < 0) return null;
  const channels = [];
  let parent = null;
  for (const line of lines.slice(start + 1)) {
    if (line && !/^\s|#/.test(line)) break;
    if (/^  - key:\s*/.test(line)) {
      const key = line.replace(/^  - key:\s*/, "").trim();
      if (!key) return null;
      parent = { key, name: "", level: 1 };
      channels.push(parent);
    } else if (/^    name:\s*/.test(line) && parent) {
      parent.name = line.replace(/^    name:\s*/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    } else if (/^      - key:\s*/.test(line) && parent) {
      const key = line.replace(/^      - key:\s*/, "").trim();
      if (!key) return null;
      channels.push({ key, name: "", level: 2, groupKey: parent.key });
    } else if (/^        name:\s*/.test(line) && channels.at(-1)?.level === 2) {
      channels.at(-1).name = line.replace(/^        name:\s*/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  if (!channels.length || channels.some(item => !item.name) || new Set(channels.map(item => item.key)).size !== channels.length) return null;
  return channels;
}
export function renderChannelNavigation(text, draft) {
  if (!Array.isArray(draft) || !draft.length || draft.length > 100) throw new Error("导航栏目数量无效");
  const keys = new Set();
  for (const item of draft) {
    if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.key || "") || typeof item.name !== "string" || !item.name.trim() || item.name.length > 80 || ![1, 2].includes(item.level) || keys.has(item.key)) throw new Error("导航栏目名称或标识无效");
    keys.add(item.key);
  }
  const parents = draft.filter(item => item.level === 1);
  if (!parents.length || draft.some(item => item.level === 2 && !parents.some(parent => parent.key === item.groupKey))) throw new Error("子栏目必须属于现有一级栏目");
  const document = parseDocument(text, { keepSourceTokens: true });
  if (document.errors.length) throw new Error("导航 YAML 无法安全解析");
  const items = document.get("items", true);
  if (!isSeq(items)) throw new Error("导航 items 结构不支持安全保存");
  const existing = new Map();
  for (const parent of items.items) {
    if (!isMap(parent)) throw new Error("导航结构不支持安全保存");
    existing.set(parent.get("key"), parent);
    const children = parent.get("children", true);
    if (children && !isSeq(children)) throw new Error("导航子栏目结构不支持安全保存");
    for (const child of children?.items || []) {
      if (!isMap(child)) throw new Error("导航子栏目结构不支持安全保存");
      existing.set(child.get("key"), child);
    }
  }
  items.items = parents.map(parent => {
    const node = existing.get(parent.key) || document.createNode({ key: parent.key, name: parent.name, description: "", children: [] });
    node.set("name", parent.name.trim());
    let children = node.get("children", true);
    if (!isSeq(children)) { children = document.createNode([]); node.set("children", children); }
    children.items = draft.filter(item => item.level === 2 && item.groupKey === parent.key).map(child => {
      const childNode = existing.get(child.key) || document.createNode({ key: child.key, name: child.name, description: "" });
      childNode.set("name", child.name.trim());
      return childNode;
    });
    return node;
  });
  const rendered = document.toString({ lineWidth: 0 });
  if (!parseChannelNavigation(rendered)) throw new Error("保存后的导航无法识别");
  return rendered;
}

export function parseHexoMenu(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(line => /^menu:\s*(?:#.*)?$/.test(line));
  if (start < 0) return null;
  const channels = [];
  let parent = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !/^\s|#/.test(line)) break;
    if (/^  [^\s#][^:]*:\s*/.test(line)) {
      const match = line.match(/^  ([^:]+):\s*(.*)$/);
      parent = { key: `menu-${channels.length}`, name: match[1].trim(), level: 1 };
      channels.push(parent);
    } else if (parent && /^    [^\s#][^:]*:\s*/.test(line)) {
      const match = line.match(/^    ([^:]+):\s*(.*)$/);
      channels.push({ key: `menu-${channels.length}`, name: match[1].trim(), level: 2, groupKey: parent.key });
    }
  }
  return channels.length ? channels : null;
}

export function parseHugoTomlMenu(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const section = line.trim().match(/^\[\[([^\]]+)\]\]$/);
    if (section) {
      current = /^(?:menus\.)?main$/.test(section[1]) ? {} : null;
      if (current) entries.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.trim().match(/^(name|identifier|parent)\s*=\s*(['"])(.*?)\2\s*(?:#.*)?$/);
    if (field) current[field[1]] = field[3];
  }
  if (!entries.length || entries.some(entry => !entry.name)) return null;
  return entries.map((entry, index) => ({ key: entry.identifier || `hugo-${index}`, name: entry.name, level: entry.parent ? 2 : 1, ...(entry.parent ? { groupKey: entry.parent } : {}) }));
}

export function parseHugoYamlMenu(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(line => /^\s*main:\s*(?:#.*)?$/.test(line));
  if (start < 0) return null;
  const indent = lines[start].search(/\S/);
  const entries = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const depth = line.search(/\S/);
    if (depth < indent || (depth === indent && !/^\s*-\s+/.test(line))) break;
    const item = line.match(/^\s*-\s+name:\s*(.+)$/);
    if (item && depth <= indent + 2) {
      current = { name: item[1].trim().replace(/^(['"])(.*)\1$/, "$2") };
      entries.push(current);
      continue;
    }
    const field = line.trim().match(/^(name|identifier|parent):\s*(.+)$/);
    if (current && field) current[field[1]] = field[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  if (!entries.length || entries.some(entry => !entry.name)) return null;
  return entries.map((entry, index) => ({ key: entry.identifier || `hugo-${index}`, name: entry.name, level: entry.parent ? 2 : 1, ...(entry.parent ? { groupKey: entry.parent } : {}) }));
}

const formats = { channels: parseChannelNavigation, "hexo-menu": parseHexoMenu, "hugo-toml": parseHugoTomlMenu, "hugo-yaml": parseHugoYamlMenu };
const priority = path => /(?:^|\/)navigation\.ya?ml$/i.test(path) ? 0 : /(?:^|\/)menus?(?:\.[\w-]+)?\.(?:toml|ya?ml)$/i.test(path) ? 1 : 2;

async function repositoryCandidates(config, token, request) {
  const response = await request(`https://api.github.com/repos/${config.repository}/git/trees/${encodeURIComponent(config.site.defaultBranch)}?recursive=1`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "blog-admin", "X-GitHub-Api-Version": "2026-03-10" },
  });
  if (!response.ok) throw new Error(`查找导航配置失败 (${response.status})`);
  const tree = await response.json();
  if (tree.truncated) throw new Error("仓库文件树不完整，无法可靠识别导航");
  const allowed = (tree.tree || []).filter(item => item.type === "blob" && manualPath(item.path) && item.size <= 100_000).map(item => item.path);
  return { allowed, candidates: allowed.filter(candidatePath).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b)).slice(0, 20) };
}

async function readCandidate(config, token, path, request) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await request(`https://api.github.com/repos/${config.repository}/contents/${encoded}?ref=${encodeURIComponent(config.site.defaultBranch)}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "blog-admin", "X-GitHub-Api-Version": "2026-03-10" },
  });
  if (!response.ok) throw new Error(`读取导航配置失败 (${response.status})`);
  const file = await response.json();
  if (file.type !== "file" || file.encoding !== "base64" || file.size > 100_000 || !file.content) throw new Error("导航配置文件不可读取");
  return { content: Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8"), sha: file.sha };
}

export async function readRepositoryNavigation(config, token, request = fetch, selection = config.navigationSource) {
  const { allowed, candidates } = await repositoryCandidates(config, token, request);
  if (selection && (!allowed.includes(selection.path) || !formats[selection.format])) throw new Error("选择的导航来源不在当前仓库配置文件范围内");
  const paths = selection ? [selection.path] : candidates;
  for (const path of paths) {
    const { content, sha } = await readCandidate(config, token, path, request);
    const options = selection ? [selection.format] : path.endsWith(".toml") ? ["hugo-toml"] : config.site.engine === "hugo" ? ["hugo-yaml", "channels"] : priority(path) === 0 ? ["channels", "hexo-menu"] : ["hexo-menu", "channels"];
    for (const format of options) {
      const channels = formats[format](content);
      if (channels) return { status: "detected", source: path, format, channels, sha, candidates: selection && !candidates.includes(path) ? [path, ...candidates] : candidates, confirmed: !!selection };
    }
  }
  return { status: candidates.length ? "unsupported" : "not_found", source: selection?.path || candidates[0] || "", channels: [], candidates };
}

export async function submitNavigationReview(config, token, draft, expectedSha, request = fetch) {
  const path = config.navigationSource?.path;
  const branch = config.site?.defaultBranch;
  if (config.navigationSource?.format !== "channels" || !path || !manualPath(path) || !branch) throw new Error("请先确认可编辑的频道导航来源");
  if (!/^[0-9a-f]{40}$/i.test(expectedSha || "")) throw new Error("导航文件版本无效，请刷新后重试");
  const source = await readCandidate(config, token, path, request);
  if (source.sha !== expectedSha) throw new Error("导航文件已被更新，请刷新后重新预览，未覆盖新版本");
  const content = renderChannelNavigation(source.content, draft);
  if (content === source.content) throw new Error("导航内容没有变化");
  const api = `https://api.github.com/repos/${config.repository}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "blog-admin", "X-GitHub-Api-Version": "2026-03-10" };
  async function json(endpoint, method = "GET", body) {
    const response = await request(`${api}${endpoint}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GitHub 审核提交失败 (${response.status})：${String(result.message || "请检查 GitHub App 的 Contents 与 Pull requests 权限").slice(0, 140)}`);
    return result;
  }
  const head = await json(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const reviewBranch = `codex/navigation-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  await json("/git/refs", "POST", { ref: `refs/heads/${reviewBranch}`, sha: head.object.sha });
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  await json(`/contents/${encoded}`, "PUT", { message: "Propose blog navigation update", content: Buffer.from(content).toString("base64"), sha: expectedSha, branch: reviewBranch });
  const compareUrl = `https://github.com/${config.repository}/compare/${branch}...${reviewBranch}?expand=1`;
  try {
    const pull = await json("/pulls", "POST", { title: "Update blog navigation", head: reviewBranch, base: branch, body: "Submitted from Blog Studio. Review the navigation diff and apply the repository's protected-file approval rule before merging." });
    return { url: pull.html_url, branch: reviewBranch, requiresReview: true };
  } catch (error) {
    return { url: compareUrl, branch: reviewBranch, requiresReview: true, warning: `${error.message}；导航已保存到审核分支，请在打开的页面手动创建 PR` };
  }
}

export async function saveRepositoryNavigation(config, token, draft, expectedSha, request = fetch) {
  const path = config.navigationSource?.path;
  const branch = config.site?.defaultBranch;
  if (config.navigationSource?.format !== "channels" || !path || !manualPath(path) || !branch) throw new Error("请先确认可编辑的频道导航来源");
  if (!/^[0-9a-f]{40}$/i.test(expectedSha || "")) throw new Error("导航文件版本无效，请刷新后重试");
  const source = await readCandidate(config, token, path, request);
  if (source.sha !== expectedSha) throw new Error("导航文件已被更新，请刷新后重新预览，未覆盖新版本");
  const content = renderChannelNavigation(source.content, draft);
  if (content === source.content) throw new Error("导航内容没有变化");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await request(`https://api.github.com/repos/${config.repository}/contents/${encoded}`, {
    method: "PUT",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "blog-admin", "X-GitHub-Api-Version": "2026-03-10" },
    body: JSON.stringify({ message: "Update blog navigation", content: Buffer.from(content).toString("base64"), sha: expectedSha, branch }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`导航保存到开发仓失败 (${response.status})：${String(result.message || "请检查仓库写入权限和分支保护规则").slice(0, 140)}`);
  return { commit: result.commit?.sha || "", repository: config.repository, path };
}
