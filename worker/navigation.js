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
  return Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
}

export async function readRepositoryNavigation(config, token, request = fetch, selection = config.navigationSource) {
  const { allowed, candidates } = await repositoryCandidates(config, token, request);
  if (selection && (!allowed.includes(selection.path) || !formats[selection.format])) throw new Error("选择的导航来源不在当前仓库配置文件范围内");
  const paths = selection ? [selection.path] : candidates;
  for (const path of paths) {
    const content = await readCandidate(config, token, path, request);
    const options = selection ? [selection.format] : path.endsWith(".toml") ? ["hugo-toml"] : config.site.engine === "hugo" ? ["hugo-yaml", "channels"] : priority(path) === 0 ? ["channels", "hexo-menu"] : ["hexo-menu", "channels"];
    for (const format of options) {
      const channels = formats[format](content);
      if (channels) return { status: "detected", source: path, format, channels, candidates: selection && !candidates.includes(path) ? [path, ...candidates] : candidates, confirmed: !!selection };
    }
  }
  return { status: candidates.length ? "unsupported" : "not_found", source: selection?.path || candidates[0] || "", channels: [], candidates };
}
