import { useState } from "react";
import { FileText, MagnifyingGlass, Plus } from "@phosphor-icons/react";

export function DraftBox({ drafts, cloudDrafts = [], cloudError = "", openDraft, openCloudDraft, removeDraft, removeCloudDraft, createArticle }) {
  const [query, setQuery] = useState("");
  const rows = drafts.filter(item => `${item.title} ${item.slug}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const cloudOnly = cloudDrafts.filter(item => !drafts.some(draft => draft.draftId === item.id) && `${item.title} ${item.slug}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="article-manager draft-box">
    <header><div><h1>草稿箱</h1><p>共 {drafts.length + cloudDrafts.filter(item => !drafts.some(draft => draft.draftId === item.id)).length} 篇；打开文章后以“已保存”确认云端草稿。</p></div><div className="article-header-actions"><button className="new-article" onClick={createArticle}><Plus/>新建文章</button></div></header>
    {import.meta.env.DEV && <p className="demo-banner">本地演示：标有“演示”的文章仅用于查看效果，不会上传到仓库。</p>}
    <div className="article-controls"><div className="article-search"><MagnifyingGlass/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索草稿标题或 Slug"/></div></div>
    {cloudError && <p className="media-feedback" role="status">{cloudError}</p>}
    <div className="article-table draft-table"><div className="article-table-head"><span>草稿文章</span><span>文章日期</span><span>操作</span></div>{rows.map(item => { const cloud = cloudDrafts.find(entry => entry.id === item.draftId); return <div className="article-row" key={item.draftId}><button className="article-name article-open" onClick={() => openDraft(item)}><FileText/><span><strong>{item.title || "未命名文章"}</strong><small>{item.slug ? `${item.slug}.md` : "尚未填写 Slug"}{item.demo ? " · 演示" : cloud ? " · 本机和云端均有版本" : " · 仅本机"}</small></span></button><span>{item.date || "—"}</span><span className="article-row-actions"><button onClick={() => openDraft(item)}>继续编辑</button>{cloud && <button onClick={() => openCloudDraft(cloud)}>打开云端版</button>}<button className="danger" disabled={item.demo} title={item.demo ? "演示样例不可删除；新建的草稿可以删除" : "删除本机和云端草稿，并清理其临时图片"} onClick={() => removeDraft(item)}>删除</button></span></div>; })}{cloudOnly.map(item => <div className="article-row" key={item.id}><button className="article-name article-open" onClick={() => openCloudDraft(item)}><FileText/><span><strong>{item.title || "未命名文章"}</strong><small>{item.slug ? `${item.slug}.md` : "尚未填写 Slug"} · 云端</small></span></button><span>{new Date(item.updatedAt).toLocaleString("zh-CN")}</span><span className="article-row-actions"><button onClick={() => openCloudDraft(item)}>继续编辑</button><button className="danger" onClick={() => removeCloudDraft(item)}>删除</button></span></div>)}{!rows.length && !cloudOnly.length && <div className="article-empty">{query ? "没有符合条件的草稿" : "暂无草稿"}</div>}</div>
  </section>;
}
