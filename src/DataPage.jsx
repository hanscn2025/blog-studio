import { useEffect, useState } from "react";
import { validateArticle } from "./article-standard.js";
import { demoArticles } from "./demo-articles.js";
import { hasDraftContent } from "./draft-store.js";

function demoArticleCount(){
  try { const removed=JSON.parse(localStorage.getItem("hans-demo-removed-v1")||"[]"); return demoArticles.filter(item=>!removed.includes(item.file)).length; }
  catch { return demoArticles.length; }
}

export function DataPage({article,drafts,siteProfile,setActive}){
  const demo=import.meta.env.DEV;
  const [repositoryCount,setRepositoryCount]=useState(null);
  const [countError,setCountError]=useState("");
  useEffect(()=>{
    if(demo||!siteProfile.repository)return;
    let active=true;
    fetch("/api/github/articles",{credentials:"same-origin"}).then(async response=>{
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"读取仓库文章失败");
      if(active){setRepositoryCount(result.articles.length);setCountError("")}
    }).catch(error=>{if(active){setRepositoryCount(null);setCountError(error.message)}});
    return()=>{active=false};
  },[demo,siteProfile.repository]);
  const draftCount=drafts.filter(item=>item.demo||hasDraftContent(item)||item.draftStarted).length;
  const currentDraft=!article.remote&&(hasDraftContent(article)||article.draftStarted);
  const issues=currentDraft?validateArticle(article):[];
  const pendingImages=currentDraft?(article.pendingImages?.length||0):0;
  const repositoryStatus=demo?"本地演示仓库":siteProfile.repository||(siteProfile.connectionStatus==="error"?"连接状态无法确认":"未连接");
  return <section className="module-page data-page">
    <header className="module-title"><h1>站点概览</h1><p>查看当前已载入的内容与发布准备状态。</p></header>
    <div className="data-body">
      <section className="data-section"><header><h2>内容</h2><span>{demo?"本地演示文章与当前浏览器草稿":"GitHub 仓库文章与当前浏览器草稿"}</span></header><div className="data-stats"><div><small>仓库文章</small><strong>{demo?demoArticleCount():repositoryCount??"—"}</strong></div><div><small>本地草稿</small><strong>{draftCount}</strong></div><div><small>待上传图片</small><strong>{pendingImages}</strong></div></div><button className="data-text-link" onClick={()=>setActive("文章管理")}>查看文章 →</button></section>
      <section className="data-section"><header><h2>发布状态</h2><span>仅展示可核验的状态</span></header><div className="data-status-list"><div><strong>GitHub 仓库</strong><span>{repositoryStatus}</span></div><div><strong>最近构建</strong><span>暂无可核验记录</span></div><div><strong>最近部署</strong><span>暂无可核验记录</span></div></div>{countError&&<p role="alert">文章数量读取失败：{countError}</p>}</section>
      <section className="data-section"><header><h2>待处理</h2><span>只列当前能确认的问题</span></header><div className="data-tasks">{pendingImages>0&&<button onClick={()=>setActive("写作")}><strong>当前草稿有 {pendingImages} 张图片待上传</strong><span>返回写作处理 →</span></button>}{issues.length>0&&<button onClick={()=>setActive("写作")}><strong>当前草稿有 {issues.length} 项本地校验问题</strong><span>返回写作处理 →</span></button>}{!demo&&!siteProfile.repository&&<button onClick={()=>setActive("GitHub 设置")}><strong>{siteProfile.connectionStatus==="error"?"GitHub 连接状态无法确认":"GitHub 尚未连接"}</strong><span>前往设置 →</span></button>}</div></section>
    </div>
  </section>;
}
