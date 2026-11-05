import { useEffect, useRef, useState } from "react";
import { FileArrowUp, FileText, Folder, MagnifyingGlass } from "@phosphor-icons/react";
import { PENDING_KEY } from "./draft-store.js";

async function api(path, options) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `请求失败（HTTP ${response.status}）`);
  return result;
}

export function mediaReferences(item, articles) {
  const found = new Map();
  for (const article of articles) if (article.content?.includes(item.url)) found.set(article.file || article.draftId, article);
  return [...found.values()];
}

export function MediaLibrary({ drafts, openReference }) {
  const fileInput = useRef(null);
  const [items, setItems] = useState([]), [folders, setFolders] = useState([]), [rootFolders, setRootFolders] = useState([]), [rootCursor, setRootCursor] = useState(""), [cursor, setCursor] = useState(""), [slug, setSlug] = useState(""), [prefix, setPrefix] = useState(""), [query, setQuery] = useState(""), [folderQuery, setFolderQuery] = useState("");
  const [sources, setSources] = useState([]), [scan, setScan] = useState("扫描中"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  async function listRoots(next = "") {
    try {
      const params = new URLSearchParams();
      if (next) params.set("cursor", next);
      const result = await api(`/api/images/media?${params}`);
      const folders=result.folders.filter(folder=>folder!=="_drafts/");
      setRootFolders(current => next ? [...current, ...folders] : folders);
      setRootCursor(result.nextCursor || "");
    } catch (reason) { setError(reason.message); }
  }

  async function list(path = prefix, next = "") {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (path) params.set("prefix", path);
      if (next) params.set("cursor", next);
      const result = await api(`/api/images/media?${params}`);
      if (id !== requestId.current) return;
      setItems(current => next ? [...current, ...result.items] : result.items);
      setFolders(current => next ? [...current, ...result.folders] : result.folders);
      setCursor(result.nextCursor || "");
    } catch (reason) { if (id === requestId.current) setError(reason.message); }
    finally { if (id === requestId.current) setLoading(false); }
  }

  function openFolder(path) { setPrefix(path); setSlug(path.split("/")[0] || ""); setQuery(""); list(path, ""); }

  useEffect(() => { listRoots(); list("", ""); }, []);
  useEffect(() => {
    let active = true;
    async function scanReferences() {
      const local = drafts.map(draft => ({ kind: "draft", draftId: draft.draftId, title: draft.title || draft.slug || "未命名文章", content: `${draft.content || ""}\n${draft.cover || ""}` }));
      try {
        const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
        for (const value of Object.values(pending)) local.push({ kind: "remote", file: value.path, title: value.title || value.path, content: value.content });
      } catch {}
      try {
        const { articles } = await api("/api/github/articles");
        let index = 0, failures = 0;
        const remote = [];
        await Promise.all(Array.from({ length: Math.min(4, articles.length) }, async () => {
          while (index < articles.length) {
            const article = articles[index++];
            try {
              const result = await api(`/api/github/article?path=${encodeURIComponent(article.file)}`);
              remote.push({ kind: "remote", file: article.file, title: article.title, content: result.article.content });
            } catch { failures++; }
          }
        }));
        if (active) { setSources([...local, ...remote]); setScan(failures ? `${failures} 篇仓库文章未能扫描` : `已扫描 ${articles.length} 篇仓库文章及当前浏览器草稿`); }
      } catch (reason) { if (active) { setSources(local); setScan(`仓库未扫描：${reason.message}`); } }
    }
    scanReferences();
    return () => { active = false; };
  }, [drafts]);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { setError("请先填写文章 Slug，再选择文件"); return; }
    if (!file.size || file.size > 80 * 1024 * 1024 || (/\.(?:png|jpe?g|webp|gif)$/i.test(file.name) && file.size > 8 * 1024 * 1024)) { setError("文件必须大于 0 且不超过 80 MB；图片最多 8 MB"); return; }
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ slug, name: file.name });
      const result = await api(`/api/images/media/upload?${params}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-Upload-Size": String(file.size) }, body: file });
      setPrefix(`${slug}/`);
      await list(`${slug}/`, "");
      await listRoots();
      await navigator.clipboard.writeText(result.url).catch(() => {});
      setError(`上传成功：${result.key}。链接已尝试复制，请打开核验公开访问。`);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function copy(text) { try { await navigator.clipboard.writeText(text); setError("已复制到剪贴板"); } catch { setError("复制失败，请打开文件链接手动复制"); } }
  const visible = items.filter(item => `${item.key}`.toLowerCase().includes(query.toLowerCase()));
  const visibleRoots = rootFolders.filter(folder => folder.toLowerCase().includes(folderQuery.toLowerCase()));
  const pathParts = prefix.split("/").filter(Boolean);
  const selectedRoot = pathParts.length ? `${pathParts[0]}/` : "";
  const directoryRows = (selectedRoot && !visibleRoots.includes(selectedRoot) ? [selectedRoot, ...visibleRoots] : visibleRoots).map(root => {
    let path = root;
    const trail = prefix.startsWith(root) ? prefix.slice(root.length).split("/").filter(Boolean).map(part => (path += `${part}/`)) : [];
    const children = prefix.startsWith(root) ? folders.filter(child => !trail.includes(child)) : [];
    return { root, nested: [...trail, ...children] };
  });
  return <section className="article-manager media-library">
    <header><div><h1>媒体库</h1><p>连接当前 R2 存储桶 · 图片按 Slug 编号，软件包存放在 Slug/files/</p></div><button className="new-article" disabled={busy} onClick={() => fileInput.current?.click()}><FileArrowUp/>{busy ? "上传中…" : "上传图片或软件包"}</button></header>
    <input ref={fileInput} type="file" hidden onChange={upload} accept="image/png,image/jpeg,image/webp,image/gif,.zip,.7z,.rar,.tar,.gz,.tgz,.dmg,.exe,.msi,.deb,.rpm,.apk,.pdf"/>
    <div className="media-controls"><label>文章 Slug<input value={slug} onChange={event => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="例如 nas-guide"/></label><button onClick={() => openFolder(slug ? `${slug}/` : "")}>查看该目录</button><div className="article-search"><MagnifyingGlass/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选当前目录"/></div></div>
    <p className="media-hint">引用范围：当前绑定仓库文章、当前浏览器的草稿和待提交更新。{scan}。仅匹配当前公开域名的链接；未发现引用不代表其他仓库、旧域名或外部页面没有使用，暂不提供删除。</p>
    {error && <p className="media-feedback" role="status">{error}</p>}
    <div className="media-browser"><aside className="media-directory-panel" aria-label="媒体目录"><div className="media-directory-heading"><strong>目录</strong><span>{rootFolders.length}{rootCursor ? "+" : ""}</span></div><input aria-label="筛选目录" value={folderQuery} onChange={event => setFolderQuery(event.target.value)} placeholder="筛选目录"/><div className="media-directory-list"><button className={!prefix ? "active" : ""} onClick={() => openFolder("")}><Folder/>根目录</button>{directoryRows.map(({root,nested}) => <div key={root}><button className={prefix === root ? "active" : ""} onClick={() => openFolder(root)}><Folder/><span>{root.replace(/\/$/, "")}</span></button>{nested.map(child => <button className={`media-directory-child ${prefix === child ? "active" : ""}`} key={child} onClick={() => openFolder(child)}><Folder/><span>{child.slice(root.length).replace(/\/$/, "")}</span></button>)}</div>)}</div>{rootCursor && <button className="media-directory-more" onClick={() => listRoots(rootCursor)}>加载更多目录</button>}</aside><section className="media-file-panel"><div className="media-file-heading"><strong>{prefix ? pathParts.join(" / ") : "根目录文件"}</strong><span>{visible.length}{cursor ? "+" : ""} 个文件</span></div><div className="media-table"><div className="media-head"><span>文件</span><span>大小</span><span>引用状态与文章</span><span>操作</span></div>{visible.map(item => {
      const refs = mediaReferences(item, sources);
      return <div className="media-row" key={item.key}><div className="media-file">{item.type === "image" ? <img src={item.url} alt="" loading="lazy"/> : <FileText/>}<span><strong>{item.key.split("/").at(-1)}</strong><small>{item.key}</small></span></div><span>{(item.size / 1024 / 1024).toFixed(2)} MB</span><div className="media-refs">{refs.length ? <><strong>已找到 {refs.length} 篇引用</strong>{refs.map((ref, index) => <button key={`${ref.kind}-${ref.file || ref.draftId}-${index}`} onClick={() => openReference(ref)}>{ref.title} ↗</button>)}</> : <span>{scan.startsWith("已扫描") ? "当前范围未发现引用" : "引用待核验"}</span>}</div><div className="media-actions"><button onClick={() => copy(item.url)}>复制链接</button><button onClick={() => copy(item.type === "image" ? `![图片](${item.url})` : `[下载 ${item.key.split("/").at(-1)}](${item.url})`)}>复制 Markdown</button><a href={item.url} target="_blank" rel="noreferrer">打开</a></div></div>;
    })}{!loading && !visible.length && <div className="article-empty">{prefix ? "该目录暂无文件；可在左侧继续选择子目录" : "根目录暂无文件，请在左侧选择目录"}</div>}</div>
    {cursor && <button className="media-more" disabled={loading} onClick={() => list(prefix, cursor)}>{loading ? "读取中…" : "加载更多文件"}</button>}</section></div>
  </section>;
}
