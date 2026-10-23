import { useEffect, useState } from "react";
import { Check, WarningCircle } from "@phosphor-icons/react";
import { serializeArticle, validateArticle } from "./article-standard.js";

export function PublishPage({ article, setArticle, batchArticles, setBatchArticles, setActive, onPublished }) {
  const [checked, setChecked] = useState(false);
  const [connection, setConnection] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [published, setPublished] = useState(null);
  const [commitNote,setCommitNote]=useState(()=>localStorage.getItem("hans-publish-commit-note")||"");
  const batch = batchArticles.length > 0;
  const articles = batch ? batchArticles : [article];
  const results = articles.map(item => ({ item, errors: validateArticle(item) }));
  const readyCount = results.filter(result => result.errors.length === 0).length;
  const imagesPending = articles.some(item => item.pendingImages?.length);

  useEffect(() => {
    let active = true;
    fetch("/api/github/settings", { credentials: "same-origin" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "无法读取 GitHub 连接");
      if (active) setConnection(result);
    }).catch(error => active && setConnectionError(error.message));
    return () => { active = false; };
  }, []);

  async function submit() {
    if (!connection?.repository || batch || readyCount !== 1 || imagesPending) return;
    const path = `${connection.site.articleDir}/${article.slug}.md`;
    if (!window.confirm(`确认向 ${connection.repository} 提交新文章 ${path}？`)) return;
    setBusy(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/github/publish", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ article, message: commitNote }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败");
      setPublished(result.published);
      onPublished(article.draftId);
      setArticle(current => current.slug === article.slug && serializeArticle(current) === serializeArticle(article) ? { ...current, file: result.published.path, status: "已提交 GitHub", remote: true } : current);
    } catch (error) { setSubmitError(error.message); } finally { setBusy(false); }
  }

  return <section className="module-page publish-page">
    <header className="module-title"><h1>发布中心</h1><p>检查文章，确认后提交到 GitHub 设置中已绑定的仓库。</p></header>
    <div className="publish-flow">
      <section className="publish-section">
        <div className="publish-heading"><span>1</span><div><h2>{batch ? "待发布文章" : "当前文章"}</h2><p>{batch ? "从草稿箱选择的文章；仓库文章不在本次范围内" : "发布对象是当前编辑的草稿"}</p></div></div>
        <div className="publish-article-list">{articles.map((item,index)=><div className="publish-article" key={item.file||item.slug||index}><div><strong>{item.title || "未命名文章"}</strong><small>{item.slug ? `${item.slug}.md` : "尚未填写 Slug"} · {item.status || "草稿"}</small></div>{!batch&&<button type="button" onClick={() => setActive("写作")}>返回编辑</button>}</div>)}</div>
        {batch&&<div className="publish-selection-actions"><button type="button" onClick={() => setActive("草稿箱")}>重新选择文章</button><button type="button" onClick={() => { setBatchArticles([]); setChecked(false); }}>切换为单篇</button></div>}
      </section>

      <section className="publish-section">
        <div className="publish-heading"><span>2</span><div><h2>发布前检查</h2><p>本地检查通过后，提交时由 GitHub 确认目标文件不存在</p></div></div>
        <div className="publish-checks" aria-live="polite">
          <div><strong>Markdown 与文章属性</strong><span className={checked ? readyCount===articles.length ? "passed" : "blocked" : "pending"}>{checked ? `${readyCount}/${articles.length} 篇本地通过` : "待检查"}</span></div>
          <div><strong>文章图片</strong><span className={imagesPending ? "blocked" : "passed"}>{imagesPending ? "有图片尚未上传图床" : "无本地暂存图片"}</span></div>
          <div><strong>目标 GitHub 仓库</strong><span className={connection?.repository ? "passed" : "pending"}>{connectionError || connection?.repository || "正在读取连接…"}</span></div>
        </div>
        <button type="button" className="publish-check-button" onClick={() => setChecked(true)}>检查{batch ? "选中" : "当前"}文章</button>
        {checked&&<div className="publish-results">{results.map(({item,errors},index)=><div className="publish-check-result" key={item.file||item.slug||index}><div><strong>{item.title||"未命名文章"}</strong><span className={errors.length?"blocked":"passed"}>{errors.length?`${errors.length} 项待修正`:"本地通过"}</span></div>{errors.length>0&&<ul>{errors.map(error=><li key={error}>{error}</li>)}</ul>}</div>)}</div>}
      </section>

      <section className="publish-section">
        <div className="publish-heading"><span>3</span><div><h2>确认提交</h2><p>当前仅支持新建单篇文章；不会覆盖仓库已有文件</p></div></div>
        <label className="publish-note">提交备注<input value={commitNote} maxLength={120} placeholder={batch?"例如：更新两篇 NAS 教程":"例如：修正 NAS 教程中的步骤"} onChange={event=>{setCommitNote(event.target.value);localStorage.setItem("hans-publish-commit-note",event.target.value)}}/><small>说明本次文章改动；暂存在此浏览器，尚未上传 GitHub</small></label>
        {(batch || !connection?.repository || !connection?.site || imagesPending || submitError) && <div className="publish-blocked"><WarningCircle/><span>{submitError || (batch ? "批量提交尚未接入，请切换为单篇" : !connection?.repository || !connection?.site ? connectionError || "请先在 GitHub 设置中完成一次连接和仓库绑定" : "请先上传暂存图片")}</span></div>}
        <button type="button" className="primary" disabled={busy || !!published || !checked || readyCount !== 1 || batch || imagesPending || !connection?.repository || !connection?.site} onClick={submit}>{busy ? "提交中…" : `提交新文章到 ${connection?.repository || "已绑定仓库"}`}</button>
      </section>

      <section className="publish-section">
        <div className="publish-heading"><span>4</span><div><h2>提交结果</h2><p>GitHub 提交成功后，Pages 构建状态仍需另行核验</p></div></div>
        <div className="publish-result"><Check/><span>{published ? <>已提交 {published.repository}/{published.path} · <a href={`https://github.com/${published.repository}/commit/${published.commit}`} target="_blank" rel="noreferrer">查看 GitHub 提交</a>；博客页面需等待托管平台构建后另行核验</> : "本次尚无可核验的提交记录"}</span></div>
      </section>
    </div>
  </section>;
}
