import { useEffect, useState } from "react";
import { Check, WarningCircle } from "@phosphor-icons/react";
import { serializeArticle, validateArticle } from "./article-standard.js";

export function PublishPage({ article, setArticle, setActive, onPublished }) {
  const [connection, setConnection] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [cleanupError, setCleanupError] = useState("");
  const [published, setPublished] = useState(null);
  const [commitNote, setCommitNote] = useState(() => localStorage.getItem("hans-publish-commit-note") || "");
  const errors = validateArticle(article);
  const imagesPending = (article.pendingImages?.length || 0) > 0;
  const canSubmit = !!connection?.repository && !!connection?.site && !errors.length && !imagesPending && !busy && !published;

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
    if (!canSubmit) return;
    const path = `${connection.site.articleDir}/${article.slug}.md`;
    if (!window.confirm(`确认向 ${connection.repository} 提交新文章 ${path}？`)) return;
    setBusy(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/github/publish", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ article, message: commitNote }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败");
      setPublished(result.published);
      try { await onPublished(article.draftId); }
      catch (error) { setCleanupError(`文章已提交，但临时草稿清理未完成：${error.message}`); }
      setArticle(current => current.slug === article.slug && serializeArticle(current) === serializeArticle(article) ? { ...current, file: result.published.path, status: "已提交 GitHub", remote: true } : current);
    } catch (error) { setSubmitError(error.message); } finally { setBusy(false); }
  }

  async function retryCleanup() {
    setBusy(true);
    try { await onPublished(article.draftId); setCleanupError(""); }
    catch (error) { setCleanupError(`文章已提交，但临时草稿清理未完成：${error.message}`); }
    finally { setBusy(false); }
  }

  return <section className="module-page publish-page">
    <header className="module-title publish-title"><div><h1>提交确认</h1><p>确认文章与目标仓库，提交后仍需核验博客是否上线。</p></div><button type="button" onClick={() => setActive("写作")}>返回编辑</button></header>
    <div className="publish-review">
      <div className="publish-target"><strong>{article.title || "未命名文章"}</strong><small>{article.slug ? `${article.slug}.md` : "尚未填写 Slug"}</small></div>
      <section className="publish-card" aria-labelledby="publish-check-title">
        <h2 id="publish-check-title">提交前检查</h2>
        <div className="publish-check-row"><strong>目标仓库</strong><span className={connection?.repository ? "passed" : "blocked"}>{connection?.repository || connectionError || "正在读取连接…"}</span></div>
        <div className="publish-check-row"><strong>文章内容</strong><span className={errors.length ? "blocked" : "passed"}>{errors.length ? `${errors.length} 项待修正` : "检查通过"}</span></div>
        {errors.length > 0 && <ul className="publish-errors">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
        <div className="publish-check-row"><strong>正文图片</strong><span className={imagesPending ? "blocked" : "passed"}>{imagesPending ? "请先上传暂存图片" : "无待上传图片"}</span></div>
        <small className="publish-check-note">提交时还会由 GitHub 确认目标文件不存在，避免覆盖已有文章。</small>
      </section>
      {!published && <section className="publish-card publish-confirm" aria-labelledby="publish-confirm-title">
        <h2 id="publish-confirm-title">确认提交</h2>
        <label className="publish-note">提交备注（可选）<input value={commitNote} maxLength={120} placeholder="例如：新增 NAS 教程" onChange={event => { setCommitNote(event.target.value); localStorage.setItem("hans-publish-commit-note", event.target.value); }}/></label>
        {(connectionError || submitError) && <div className="publish-blocked" role="alert"><WarningCircle/><span>{submitError || connectionError}</span></div>}
        <div className="publish-actions"><button type="button" className="primary" disabled={!canSubmit} onClick={submit}>{busy ? "提交中…" : "确认提交到 GitHub"}</button><small>提交成功不等于博客已上线。</small></div>
      </section>}
      {published && <section className="publish-card publish-verification" role="status" aria-label="提交状态"><h2>提交结果</h2><div><Check/><span>GitHub 已提交：<a href={`https://github.com/${published.repository}/commit/${published.commit}`} target="_blank" rel="noreferrer">查看提交 {published.repository}/{published.path}</a></span></div>{cleanupError&&<p role="alert">{cleanupError} <button type="button" disabled={busy} onClick={retryCleanup}>{busy?"清理中…":"重试清理"}</button></p>}<div><span className="publish-unknown"/><span>部署构建：待核验</span></div><div><span className="publish-unknown"/><span>博客页面：待核验</span></div><small>只有提交记录已由后台确认；后两项尚无可靠数据源，不能标记为已上线。</small></section>}
    </div>
  </section>;
}
