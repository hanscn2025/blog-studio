const scalar = value => {
  const text = String(value || "").trim();
  if (text.startsWith('"')) { try { return JSON.parse(text); } catch {} }
  return text.replace(/^'|'$/g, "");
};

function blocks(raw) {
  const match = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  if (!match) return null;
  const eol = match[1].includes("\r\n") ? "\r\n" : "\n";
  const lines = match[2].split(eol);
  const entries = [];
  for (const line of lines) {
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (field) entries.push({ key: field[1], lines: [line] });
    else if (entries.length) entries.at(-1).lines.push(line);
    else entries.push({ key: "", lines: [line] });
  }
  return { match, eol, entries, body: raw.slice(match[0].length) };
}

function fieldValue(entries, key) {
  const entry = entries.find(item => item.key === key);
  if (!entry) return "";
  return scalar(entry.lines[0].slice(entry.lines[0].indexOf(":") + 1));
}

function fieldList(entries, key) {
  const entry = entries.find(item => item.key === key);
  if (!entry) return [];
  const inline = fieldValue(entries, key);
  if (inline.startsWith("[")) return inline.slice(1, -1).split(",").map(scalar).filter(Boolean);
  if (inline) return [inline];
  return entry.lines.slice(1).map(line => line.match(/^\s*-\s*(.*)$/)?.[1]).filter(value => value !== undefined).map(scalar);
}

export function parseRepositoryArticle(raw, file) {
  const source = blocks(raw);
  if (!source) return null;
  const value = key => fieldValue(source.entries, key);
  const categories = fieldList(source.entries, "categories");
  return {
    title: value("title") || file.split("/").at(-1).replace(/\.md$/i, ""),
    slug: file.split("/").at(-1).replace(/\.md$/i, ""),
    date: value("date"), description: value("description") || value("excerpt"),
    cover: value("cover") || value("thumbnail"),
    category: value("category") || categories[0] || "",
    tags: fieldList(source.entries, "tags").join(", "),
    channels: fieldList(source.entries, "nav_channels"),
    top: Number(value("top")) || 0,
    status: "已提交 GitHub", remote: true, file, content: source.body,
  };
}

export function mergeRepositoryArticle(raw, before, after) {
  const source = blocks(raw);
  if (!source || !before || !after) throw new Error("文章没有可识别的 Front Matter，不能安全保存");
  const entries = source.entries.map(entry => ({ ...entry, lines: [...entry.lines] }));
  const set = (key, value, previous, array = false) => {
    if (JSON.stringify(value) === JSON.stringify(previous)) return;
    const index = entries.findIndex(entry => entry.key === key);
    if (index < 0 && (value === "" || value == null || Array.isArray(value) && !value.length)) return;
    const lines = array ? [`${key}:`, ...value.map(item => `  - ${JSON.stringify(item)}`)] : [`${key}: ${typeof value === "number" ? value : JSON.stringify(String(value ?? ""))}`];
    if (index < 0) entries.push({ key, lines }); else entries[index] = { key, lines };
  };
  set("title", after.title, before.title);
  set("date", after.date, before.date);
  const descriptionKey = entries.some(entry => entry.key === "description") ? "description" : entries.some(entry => entry.key === "excerpt") ? "excerpt" : "description";
  set(descriptionKey, after.description, before.description);
  const coverKey = entries.some(entry => entry.key === "cover") ? "cover" : entries.some(entry => entry.key === "thumbnail") ? "thumbnail" : "cover";
  set(coverKey, after.cover, before.cover);
  const categoryKey = entries.some(entry => entry.key === "category") ? "category" : "categories";
  set(categoryKey, categoryKey === "categories" ? after.category ? [after.category] : [] : after.category, categoryKey === "categories" ? before.category ? [before.category] : [] : before.category, categoryKey === "categories");
  set("tags", String(after.tags || "").split(",").map(item => item.trim()).filter(Boolean), String(before.tags || "").split(",").map(item => item.trim()).filter(Boolean), true);
  set("nav_channels", after.channels || [], before.channels || [], true);
  set("top", Number(after.top) || 0, Number(before.top) || 0);
  const meta = entries.map(entry => entry.lines.join(source.eol)).join(source.eol);
  return `${source.match[1]}${meta}${source.match[3]}${after.content === before.content ? source.body : after.content}`;
}
