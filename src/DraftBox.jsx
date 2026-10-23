import { useState } from "react";
import { FileText, MagnifyingGlass, Plus } from "@phosphor-icons/react";

export function DraftBox({ drafts, openDraft, removeDraft, createArticle }) {
  const [query, setQuery] = useState("");
  const rows = drafts.filter(item => `${item.title} ${item.slug}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return <section className="article-manager draft-box">
    <header><div><h1>草稿箱</h1><p>{drafts.length} 篇未提交文章 · 保存在当前浏览器，不会出现在博客或 GitHub</p></div><div className="article-header-actions"><button className="new-article" onClick={createArticle}><Plus/>新建文章</button></div></header>
    {import.meta.env.DEV && <p className="demo-banner">本地演示：标有“演示”的文章仅用于查看效果，不会上传到仓库。</p>}
    <div className="article-controls"><div className="article-search"><MagnifyingGlass/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索草稿标题或 Slug"/></div></div>
    <div className="article-table draft-table"><div className="article-table-head"><span>草稿文章</span><span>文章日期</span><span>操作</span></div>{rows.map(item => <div className="article-row" key={item.draftId}><button className="article-name article-open" onClick={() => openDraft(item)}><FileText/><span><strong>{item.title || "未命名文章"}</strong><small>{item.slug ? `${item.slug}.md` : "尚未填写 Slug"}{item.demo ? " · 演示" : ""}</small></span></button><span>{item.date || "—"}</span><span className="article-row-actions"><button onClick={() => openDraft(item)}>继续编辑</button><button className="danger" disabled={item.demo} title={item.demo ? "演示样例不可删除；新建的草稿可以删除" : "删除草稿"} onClick={() => removeDraft(item)}>删除</button></span></div>)}{rows.length === 0 && <div className="article-empty">{drafts.length ? "没有符合条件的草稿" : "草稿箱为空，开始写一篇新文章吧"}</div>}</div>
  </section>;
}
