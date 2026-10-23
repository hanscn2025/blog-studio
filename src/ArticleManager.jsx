import { useEffect, useState } from "react";
import { FileText, MagnifyingGlass } from "@phosphor-icons/react";
import { sortArticlesForDisplay } from "./article-standard.js";
import { PENDING_KEY, pendingKey, savePending } from "./draft-store.js";
import { demoArticles, demoRepository } from "./demo-articles.js";
import { mergeRepositoryArticle, parseRepositoryArticle } from "./repository-article.js";

async function api(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "读取仓库文章失败");
  return result;
}

function readPending() {
  try {
    const stored = localStorage.getItem(PENDING_KEY);
    if (stored !== null) return JSON.parse(stored) || {};
    if (import.meta.env.DEV) {
      const item = demoArticles[2];
      return savePending({}, demoRepository, item, item.content.replace("旧文内容，可试用编辑后保存为待提交更新。", "补充图片与视频整理步骤，等待确认后提交。"));
    }
  } catch {}
  return {};
}

function demoRows() {
  try { const removed = JSON.parse(localStorage.getItem("hans-demo-removed-v1")) || []; return demoArticles.filter(item => !removed.includes(item.file)); }
  catch { return demoArticles; }
}

export function ArticleManager({ siteProfile, renderEditor, targetPath, clearTargetPath }) {
  const demo = import.meta.env.DEV;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [remoteArticles, setRemoteArticles] = useState(demo ? demoRows : []);
  const [repository, setRepository] = useState(demo ? demoRepository : "");
  const [pending, setPending] = useState(readPending);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [viewing, setViewing] = useState(null);
  const usesCategories = siteProfile?.usesCategories !== false || remoteArticles.some(item => item.category);

  useEffect(() => {
    if (demo) return;
    let active = true;
    Promise.all([api("/api/github/settings"), api("/api/github/articles")]).then(([settings, result]) => {
      if (!active) return;
      setRepository(settings.repository || "");
      setRemoteArticles(result.articles.map(item => ({ ...item, remote: true })));
      setError("");
    }).catch(reason => active && setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reload, demo]);

  useEffect(() => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); }
    catch { setError("待提交更新保存失败：浏览器空间不足，请先复制修改内容"); }
  }, [pending]);

  const hasPending = item => !!pending[pendingKey(repository, item.file)];
  const rows = sortArticlesForDisplay(remoteArticles.filter(item => (filter === "全部" || (filter === "待提交更新" ? hasPending(item) : Number(item.top) > 0)) && `${item.title} ${item.file}`.toLowerCase().includes(query.toLowerCase())), filter === "置顶");

  async function open(item, edit = false) {
    setViewing({ file: item.file, loading: true });
    try {
      const source = demo ? item : (await api(`/api/github/article?path=${encodeURIComponent(item.file)}`)).article;
      const saved = pending[pendingKey(repository, item.file)];
      const content = saved?.content ?? source.content;
      const article = parseRepositoryArticle(content, item.file);
      setViewing({ ...source, title: item.title, original: source.content, content, article, originalArticle: parseRepositoryArticle(source.content, item.file), pendingSha: saved?.sha, editing: edit && !!article, loading: false, error: edit && !article ? "无法识别文章属性，暂不能安全编辑" : "" });
    } catch (reason) { setViewing({ file: item.file, error: reason.message, loading: false }); }
  }

  useEffect(() => {
    if (!targetPath || loading) return;
    const item = remoteArticles.find(article => article.file === targetPath);
    if (item) open(item);
    clearTargetPath();
  }, [targetPath, loading, remoteArticles]);

  function saveLocal() {
    if (!viewing?.article) return;
    let content;
    try { content = mergeRepositoryArticle(viewing.content, parseRepositoryArticle(viewing.content, viewing.file), viewing.article); }
    catch (reason) { setViewing(current => ({ ...current, error: reason.message })); return; }
    const next = savePending(pending, repository, { ...viewing, content: viewing.original }, content);
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(next)); }
    catch { setViewing(current => ({ ...current, error: "保存失败：浏览器空间不足，请先复制修改内容" })); return; }
    setPending(next);
    setViewing(current => ({ ...current, content, editing: false, pendingSha: next[pendingKey(repository, current.file)]?.sha, error: "" }));
  }

  async function submitUpdate() {
    const saved = pending[pendingKey(repository, viewing.file)];
    if (!saved || demo) return;
    if (/asset:\/\/|data:image\//i.test(saved.content)) { setViewing(current => ({ ...current, error: "文章仍含本地暂存图片，请先换成图床 URL" })); return; }
    if (saved.sha !== viewing.sha) { setViewing(current => ({ ...current, error: "仓库文件已变化：请复制待提交内容，刷新后重新核对差异" })); return; }
    if (!window.confirm(`确认将修改提交回 ${repository}/${viewing.file}？这会更新仓库中的原文件。`)) return;
    setViewing(current => ({ ...current, saving: true, error: "" }));
    try {
      const response = await fetch("/api/github/update", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: viewing.file, sha: saved.sha, content: saved.content }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败");
      setPending(current => { const next = { ...current }; delete next[pendingKey(repository, viewing.file)]; return next; });
      setViewing(current => ({ ...current, sha: result.updated.sha, original: current.content, originalArticle: parseRepositoryArticle(current.content, current.file), pendingSha: null, saving: false, savedCommit: result.updated.commit }));
      setReload(value => value + 1);
    } catch (reason) { setViewing(current => ({ ...current, saving: false, error: reason.message })); }
  }

  function discardUpdate() {
    if (!window.confirm(`丢弃 ${viewing.file} 的本地待提交更新？仓库原文不会改变。`)) return;
    setPending(current => { const next = { ...current }; delete next[pendingKey(repository, viewing.file)]; return next; });
    setViewing(current => ({ ...current, content: current.original, article: current.originalArticle, pendingSha: null, editing: false }));
  }

  async function remove(item) {
    const fileName = item.file.split("/").at(-1);
    if (window.prompt(`删除文章 ${item.file}？请输入文件名 ${fileName} 确认：`) !== fileName) return;
    try {
      if (!demo) {
        const response = await fetch("/api/github/delete", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: item.file, sha: item.sha }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "删除失败");
      }
      setRemoteArticles(current => current.filter(value => value.file !== item.file));
      if (demo) {
        const removed = JSON.parse(localStorage.getItem("hans-demo-removed-v1") || "[]");
        localStorage.setItem("hans-demo-removed-v1", JSON.stringify([...removed, item.file]));
      }
      setPending(current => { const next = { ...current }; delete next[pendingKey(repository, item.file)]; return next; });
      if (!demo) setReload(value => value + 1);
    } catch (reason) { setError(reason.message); }
  }

  if (viewing) {
    const saved = pending[pendingKey(repository, viewing.file)];
    return <section className="article-manager remote-article-view">
      <header><div><h1>{viewing.title || viewing.file.split("/").at(-1)}</h1><p>{demo ? "演示仓库 · 不会提交" : `${repository}/${viewing.file}`} · {saved ? "更新未提交" : "仓库原文"}</p></div><div className="article-header-actions"><button onClick={() => setViewing(null)}>返回文章管理</button></div></header>
      {viewing.loading ? <div className="article-empty">正在读取文章…</div> : <>
        {viewing.error && <p className="demo-banner" role="alert">{viewing.error}</p>}
        {viewing.editing ? <><p className="editor-local-hint">修改先保存到当前浏览器；不会立即修改 GitHub 原文件。</p>{renderEditor(viewing.article, updater => setViewing(current => ({ ...current, article: typeof updater === "function" ? updater(current.article) : updater })), saveLocal)}<div className="article-header-actions"><button onClick={() => setViewing(current => ({ ...current, article: parseRepositoryArticle(saved?.content ?? current.original, current.file), editing: false }))}>取消编辑</button></div></> : typeof viewing.content === "string" && <>
          {saved ? <><div className="pending-heading"><strong>更新未提交</strong><span>左侧是仓库原文，右侧是保存在当前浏览器的修改</span></div><div className="article-diff"><div><strong>仓库原文</strong><pre>{viewing.original}</pre></div><div><strong>待提交修改</strong><pre>{viewing.content}</pre></div></div><div className="article-header-actions"><button onClick={() => setViewing(current => ({ ...current, editing: !!current.article }))}>继续编辑</button><button disabled={demo || viewing.saving} onClick={submitUpdate}>{demo ? "演示模式不可提交" : viewing.saving ? "提交中…" : "确认并提交到原文件"}</button><button className="danger" onClick={discardUpdate}>丢弃修改</button></div></> : <><pre>{viewing.content}</pre><div className="article-header-actions"><button onClick={() => setViewing(current => ({ ...current, editing: !!current.article }))}>编辑文章</button></div></>}
        </>}
        {viewing.savedCommit && <p>已提交 GitHub：{viewing.savedCommit}。博客上线仍需核对构建结果。</p>}
      </>}
    </section>;
  }

  return <section className="article-manager"><header><div><h1>文章管理</h1><p>{loading ? "正在读取 GitHub 仓库…" : demo ? "本地演示仓库 · 可试用编辑、保存待提交更新；不会修改 GitHub" : `仓库 ${repository || "未连接"} · ${remoteArticles.length} 篇文章；提交不等于已上线`}</p></div><div className="article-header-actions"><button className="batch-toggle" disabled={demo || loading} onClick={() => { setLoading(true); setReload(value => value + 1); }}>刷新仓库</button></div></header>
    {demo && <p className="demo-banner">本地演示数据：这三篇不是测试仓文章。可编辑并查看“更新未提交”，真实提交已禁用。</p>}
    {error && <p className="demo-banner" role="alert">{error}</p>}
    <div className="article-controls"><div className="article-search"><MagnifyingGlass/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索文件名或文章路径"/></div><nav>{["全部", "待提交更新", "置顶"].map(value => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "待提交更新" ? `${value} ${remoteArticles.filter(hasPending).length}` : value}</button>)}</nav></div>
    <div className={`article-table ${usesCategories ? "" : "no-categories"}`}><div className="article-table-head"><span>文章</span>{usesCategories && <span>主分类</span>}<span>导航位置</span><span>状态</span><span>文章日期</span><span>操作</span></div>{rows.map(item => <div className="article-row" key={item.file}><button className="article-name article-open" onClick={() => open(item)}><FileText/><span><strong>{item.title}</strong><small>{item.file}</small></span></button>{usesCategories && <span>{item.category || "—"}</span>}<span className="article-channels">{(item.channels || []).join(" · ") || "—"}</span><span><em className={hasPending(item) ? "pending-status" : ""}>{hasPending(item) ? "更新未提交" : demo ? "演示" : "已提交仓库"}</em></span><span>{item.date || "—"}</span><span className="article-row-actions"><button onClick={() => open(item, true)}>编辑</button><button className="danger" onClick={() => remove(item)}>删除</button></span></div>)}{rows.length === 0 && <div className="article-empty">{loading ? "正在读取…" : "没有符合条件的仓库文章"}</div>}</div>
  </section>;
}
