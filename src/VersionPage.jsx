import { useEffect, useState } from "react";
import { SecurityBackup } from "./SecurityBackup.jsx";

async function api(path, options) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result;
}

export function VersionPage({ setActive }) {
  const [tab, setTab] = useState("articles");
  const [connection, setConnection] = useState({ loading: true, repository: "", error: "" });
  const [articles, setArticles] = useState([]);
  const [path, setPath] = useState("");
  const [commits, setCommits] = useState([]);
  const [revision, setRevision] = useState(null);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    let active = true;
    api("/api/github/settings").then(async settings => {
      if (!active) return;
      setConnection({ loading: false, repository: settings.repository || "", error: "" });
      if (settings.repository) {
        const data = await api("/api/github/articles");
        if (active) setArticles(data.articles || []);
      }
    }).catch(reason => active && setConnection({ loading: false, repository: "", error: reason.message }));
    return () => { active = false; };
  }, []);

  const chooseArticle = async file => {
    setPath(file); setCommits([]); setRevision(null); setCurrent(null); setError(""); setResult("");
    if (!file) return;
    setBusy(true);
    try {
      const [history, article] = await Promise.all([
        api(`/api/github/history?path=${encodeURIComponent(file)}`),
        api(`/api/github/article?path=${encodeURIComponent(file)}`),
      ]);
      setCommits(history.commits); setCurrent(article.article);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const chooseRevision = async commit => {
    setRevision(null); setError(""); setBusy(true);
    try { setRevision((await api(`/api/github/revision?path=${encodeURIComponent(path)}&commit=${commit}`)).revision); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    if (!revision || !current || !window.confirm(`确认将 ${path} 恢复为 ${revision.commit.slice(0, 7)} 的内容？这会向已绑定仓库提交一个新版本，不会删除后续历史。`)) return;
    setBusy(true); setError(""); setResult("");
    try {
      const data = await api("/api/github/update", { method: "POST", headers: { "Content-Type": "application/json", Origin: location.origin }, body: JSON.stringify({ path, sha: current.sha, content: revision.content, message: `Restore ${path} from ${revision.commit.slice(0, 7)}` }) });
      await chooseArticle(path);
      setResult(`已恢复并提交 ${data.updated.commit}；博客上线仍需核对 Pages 构建。`);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  return <section className="module-page version-page">
    <header className="module-title"><h1>版本与恢复</h1><p>按需要选择文章恢复或版本备份；两者不会自动改变线上博客。</p></header>
    <div className="version-body">
      <div className="version-tabs" role="tablist" aria-label="版本操作">
        <button type="button" role="tab" aria-selected={tab==="articles"} onClick={() => setTab("articles")}>文章恢复</button>
        <button type="button" role="tab" aria-selected={tab==="backups"} onClick={() => setTab("backups")}>版本备份</button>
      </div>
      {tab==="articles"?<div className="version-panel" role="tabpanel">
      <div className="version-status"><strong>{connection.loading ? "正在读取 GitHub 设置…" : connection.error ? "GitHub 设置读取失败" : connection.repository ? `已连接 ${connection.repository}` : "尚未绑定 GitHub 仓库"}</strong><span>{connection.error || (connection.repository ? "仅操作 GitHub 设置中绑定的仓库。" : "请先在 GitHub 设置中连接并绑定仓库。")}</span>{!connection.loading && !connection.repository && <button type="button" onClick={() => setActive("GitHub 设置")}>前往 GitHub 设置</button>}</div>
      <section className="version-section"><h2>文章历史与恢复</h2><p>选择文章，比较历史原文与仓库当前内容；恢复前再次检查文件 SHA，拒绝覆盖刚提交的修改。</p>
        <label>选择文章 <select value={path} onChange={event => chooseArticle(event.target.value)} disabled={!connection.repository || busy}><option value="">请选择仓库文章</option>{articles.map(item => <option key={item.file} value={item.file}>{item.title} · {item.file}</option>)}</select></label>
        {busy && <p>正在读取或提交…</p>}{error && <p role="alert">{error}</p>}{result && <p role="status">{result}</p>}
        {commits.length > 0 && <div className="version-history">{commits.map(item => <button type="button" key={item.sha} disabled={busy} onClick={() => chooseRevision(item.sha)}>{item.message || item.sha.slice(0, 7)} · {item.date ? new Date(item.date).toLocaleString("zh-CN") : "时间未知"} · {item.sha.slice(0, 7)}</button>)}</div>}
        {path && !busy && !error && commits.length === 0 && <p>这篇文章没有可读取的提交记录。</p>}
        {revision && current && <div className="version-compare"><h3>历史 {revision.commit.slice(0, 7)} ↔ 当前仓库</h3><div><label>历史原文<textarea readOnly value={revision.content} rows="16" /></label><label>当前原文<textarea readOnly value={current.content} rows="16" /></label></div><button type="button" disabled={busy || revision.content === current.content} onClick={restore}>{revision.content === current.content ? "与当前内容相同" : "恢复此版本到已绑定仓库"}</button></div>}
      </section>
      </div>:<div className="version-panel" role="tabpanel"><SecurityBackup /></div>}
    </div>
  </section>;
}
