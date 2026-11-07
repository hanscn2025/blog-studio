import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "@uiw/react-md-editor/markdown-editor.css";
import { ArrowClockwise, ArrowCounterClockwise, Bookmarks, CalendarBlank, CaretDown, CaretRight, Check, Code, CodeSimple, Database, DotsThree, DownloadSimple, Eye, FileArrowUp, FileText, Files, Folder, Gear, Graph, GridFour, Image, Link, ListBullets, ListChecks, ListDashes, ListNumbers, MagnifyingGlass, Minus, PaperPlaneTilt, PencilSimple, Plus, Quotes, SidebarSimple, Table, Tag, TerminalWindow, TextB, TextItalic, TextStrikethrough, UploadSimple, Wrench } from "@phosphor-icons/react";
import { ArticleManager } from "./ArticleManager.jsx";
import { DraftBox } from "./DraftBox.jsx";
import { MainSidebar } from "./MainSidebar.jsx";
import { GitHubSettings } from "./GitHubSettings.jsx";
import { PublishPage } from "./PublishPage.jsx";
import { VersionPage } from "./VersionPage.jsx";
import { MediaLibrary } from "./MediaLibrary.jsx";
import { NavigationWorkspace } from "./NavigationWorkspace.jsx";
import { DateTimePicker } from "./DateTimePicker.jsx";
import { plainDescription } from "./article-description.js";
import { createArticleFromTemplate,detectedSiteProfile } from "./article-template.js";
import { articleImageSources, hasYouTubeEmbed, referencedDraftImages, registerDraftImages, resolveDraftImage, youtubeEmbed } from "./markdown-media.js";
import { normalizeRepositoryStatus } from "./article-standard.js";
import { repositorySiteProfile } from "./site-profile.js";
import { DRAFTS_KEY, PENDING_KEY, hasDraftContent, removeDraft, upsertDraft } from "./draft-store.js";
import { draftsWithoutImageData, hydrateDraftImages, persistDraftImages, removeStoredDraftImage, replaceStoredDraftImage } from "./draft-image-store.js";
import { demoArticles, demoDrafts } from "./demo-articles.js";
import { WATERMARK_KEY, defaultWatermark, drawWatermark, imageToDataUrl, normalizeWatermark } from "./image-watermark.js";
import { localImagePaths, matchLocalImages } from "./import-local-images.js";

const initialArticle=createArticleFromTemplate();
const MDEditor=lazy(()=>import("@uiw/react-md-editor"));
const MarkdownRenderer=lazy(()=>import("@uiw/react-md-editor").then(module=>({default:module.default.Markdown})));
function readDrafts(){
  try {
    const stored=localStorage.getItem(DRAFTS_KEY);
    if(stored){const drafts=JSON.parse(stored);return import.meta.env.DEV?[...drafts,...demoDrafts.filter(item=>!drafts.some(draft=>draft.draftId===item.draftId))]:drafts}
    const old=normalizeRepositoryStatus(JSON.parse(localStorage.getItem("hans-pro-article")));
    if(hasDraftContent(old))return [...[{...old,draftId:old.draftId||crypto.randomUUID()}],...(import.meta.env.DEV?demoDrafts:[])];
  } catch {}
  return import.meta.env.DEV ? demoDrafts : [];
}

function parseMarkdown(raw,fileName){const next={...initialArticle,content:raw,title:fileName.replace(/\.(md|markdown)$/i,"")};const match=raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);if(!match)return next;const meta={};match[1].split("\n").forEach(line=>{const i=line.indexOf(":");if(i>0)meta[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^['"]|['"]$/g,"")});return {...next,title:meta.title||next.title,slug:meta.slug||next.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),description:meta.description||meta.excerpt||"",category:meta.category||meta.categories||"未分类",top:/^\d+$/.test(meta.top||"")?Number(meta.top):0,tags:(meta.tags||"").replace(/^\[|\]$/g,"").replaceAll('"',""),content:raw.slice(match[0].length)}}

const slugFromTitle=title=>title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export function App(){
  const [drafts,setDrafts]=useState(readDrafts);
  const [draftsReady,setDraftsReady]=useState(false),[draftsError,setDraftsError]=useState("");
  const saveQueue=useRef(Promise.resolve());
  const [article,setArticle]=useState(()=>drafts[0]||{...initialArticle,draftId:crypto.randomUUID()}),[active,setActive]=useState("首页"),[savedAt,setSavedAt]=useState("10:24"),[saveState,setSaveState]=useState("saved"),[preview,setPreview]=useState(false),[treeOpen,setTreeOpen]=useState(true),[toast,setToast]=useState(""),[siteProfile,setSiteProfile]=useState(detectedSiteProfile);
  const [imageHost,setImageHost]=useState({provider:"Cloudflare R2",accountId:"",bucket:"",endpoint:"",publicUrl:"",status:"未连接"});
  const [cloudDrafts,setCloudDrafts]=useState([]),[cloudError,setCloudError]=useState("");
  async function loadCloudDrafts(){
    try{const response=await fetch("/api/drafts",{credentials:"same-origin"}),result=await response.json();if(!response.ok)throw new Error(result.error||"云端草稿读取失败");setCloudDrafts(result.drafts||[]);setCloudError("")}
    catch(error){setCloudError(import.meta.env.DEV?"本地演示不连接云端草稿；部署后可使用":error.message)}
  }
  useEffect(()=>{if(active==="草稿箱")loadCloudDrafts()},[active]);
  async function openCloudDraft(item){
    try{const response=await fetch(`/api/drafts/${item.id}`,{credentials:"same-origin"}),result=await response.json();if(!response.ok)throw new Error(result.error||"草稿读取失败");setArticle(result.article);setActive("写作")}
    catch(error){setCloudError(error.message)}
  }
  async function cleanupDraftImages(draft){
    if(!draft.tempImageKeys?.length)return;
    const response=await fetch("/api/images/draft-cleanup",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({draftId:draft.draftId,keys:draft.tempImageKeys})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"临时图片清理失败");
  }
  async function deleteDraft(item,cloud=cloudDrafts.find(entry=>entry.id===item.draftId||entry.id===item.id)){
    if(item.demo)return;
    if(!window.confirm(`删除草稿「${item.title||"未命名文章"}」及其云端副本、临时图片？此操作无法撤销。`))return;
    setCloudError("");
    try{
      let source=item;
      if(cloud){
        const detailResponse=await fetch(`/api/drafts/${cloud.id}`,{credentials:"same-origin"}),detail=await detailResponse.json();
        if(!detailResponse.ok)throw new Error(detail.error||"读取云端草稿失败");
        if(detail.article.cloudRevision!==cloud.revision)throw new Error("云端草稿已有新版本，请刷新后再删除");
        source=detail.article;
        const response=await fetch(`/api/drafts/${cloud.id}`,{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({revision:cloud.revision})}),result=await response.json();
        if(!response.ok)throw new Error(result.error||"删除云端草稿失败");
        await loadCloudDrafts();
      }
      await cleanupDraftImages({...source,tempImageKeys:[...new Set([...(source.tempImageKeys||[]),...(item.tempImageKeys||[])])]});
      for(const image of item.pendingImages||[])await removeStoredDraftImage(image.id);
      const id=item.draftId||item.id;
      setDrafts(current=>removeDraft(current,id));
      if(article.draftId===id)setArticle({...createArticleFromTemplate(),draftId:crypto.randomUUID()});
    }catch(error){setCloudError(`草稿清理未完成：${error.message}`)}
  }
  async function finishPublished(draftId){
    if(article.tempImageKeys?.length){
      const response=await fetch("/api/images/draft-cleanup",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({draftId,keys:article.tempImageKeys})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"临时图片清理失败");
    }
    if(article.cloudRevision){
      const response=await fetch(`/api/drafts/${draftId}`,{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({revision:article.cloudRevision})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"云端草稿清理失败");
      await loadCloudDrafts();
    }
    setDrafts(current=>removeDraft(current,draftId));
  }
  useEffect(()=>{if(active==="备份恢复")setActive("版本回溯");else if(active==="数据"||active==="工具箱")setActive("首页")},[active]);
  const [watermark,setWatermark]=useState(()=>{try{return normalizeWatermark(JSON.parse(localStorage.getItem(WATERMARK_KEY))||defaultWatermark)}catch{return defaultWatermark}});
  useEffect(()=>{try{localStorage.setItem(WATERMARK_KEY,JSON.stringify(watermark))}catch{setToast("水印设置保存失败：浏览器存储空间不足")}},[watermark]);
  const [targetArticlePath,setTargetArticlePath]=useState("");
  useEffect(()=>{let active=true;Promise.all([fetch("/api/github/settings",{credentials:"same-origin"}),fetch("/api/github/navigation",{credentials:"same-origin"}),fetch("/api/github/articles",{credentials:"same-origin"})]).then(async responses=>{const [settings,navigation,articles]=await Promise.all(responses.map(response=>response.json()));if(!responses[0].ok)throw new Error(settings.error||"GitHub 连接状态读取失败");if(!responses[1].ok)throw new Error(navigation.error||"导航读取失败");if(!responses[2].ok)throw new Error(articles.error||"文章分类读取失败");if(active)setSiteProfile(current=>({...current,...repositorySiteProfile(settings,navigation,articles.articles)}))}).catch(error=>{if(active)setSiteProfile(current=>({...current,connectionStatus:"error",connectionError:error.message}))});return()=>{active=false}},[]);
  useEffect(()=>{let active=true;hydrateDraftImages(drafts).then(items=>{if(!active)return;setDrafts(items);setArticle(items[0]||{...initialArticle,draftId:crypto.randomUUID()});setDraftsReady(true)}).catch(error=>{if(active)setDraftsError(error.message)});return()=>{active=false}},[]);
  useEffect(()=>{if(!draftsReady)return;if(hasDraftContent(article)||article.draftStarted)setDrafts(current=>upsertDraft(current,article));setSaveState("saving")},[article,draftsReady]);
  useEffect(()=>{if(!draftsReady)return;saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{await persistDraftImages(drafts);localStorage.setItem(DRAFTS_KEY,JSON.stringify(draftsWithoutImageData(drafts)));setSavedAt(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}));setSaveState("saved")}).catch(()=>{setSaveState("error");setToast("草稿保存失败：图片仍在当前页面，请勿关闭；请先导出文章")})},[drafts,draftsReady]);
  useEffect(()=>{const warn=event=>{if(saveState!=="saved"&&!article.remote){event.preventDefault();event.returnValue=""}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn)},[saveState,article.remote]);
  async function saveDraftNow(current){
    const next=upsertDraft(drafts,current);
    saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{await persistDraftImages(next);localStorage.setItem(DRAFTS_KEY,JSON.stringify(draftsWithoutImageData(next)))});
    await saveQueue.current;
    setDrafts(next);
    setSaveState("saved");
  }
  const notify=m=>{setToast(m);setTimeout(()=>setToast(""),1800)},closeArticle=async()=>{if(!article.remote){if(saveState!=="saved"&&!window.confirm("草稿尚未保存完成。现在保存草稿并返回？"))return;try{await saveDraftNow(article)}catch(error){notify(`草稿保存失败：${error.message}；请勿关闭页面`);return}}setActive(article.remote?"文章管理":"草稿箱");notify(article.remote?"仓库文章请在文章管理中编辑":"文章已保存到当前浏览器草稿箱")};
  async function navigate(next){
    if(active==="写作"&&next!=="写作"&&!article.remote){
      if(saveState!=="saved"&&!window.confirm("草稿尚未保存完成。现在保存草稿并离开？"))return;
      try{await saveDraftNow(article)}catch(error){notify(`草稿保存失败：${error.message}；请勿关闭页面`);return}
    }
    setActive(next);
  }
  const createArticle=()=>{setArticle({...createArticleFromTemplate(),draftId:crypto.randomUUID(),draftStarted:true});setPreview(false);setActive("写作")};
  const page=active==="首页"?<HomePage createArticle={createArticle} setActive={setActive}/>:active==="写作"?<Editor article={article} setArticle={setArticle} preview={preview} setPreview={setPreview} savedAt={savedAt} saveState={saveState} notify={notify} siteProfile={siteProfile} watermark={watermark} openPublish={()=>setActive("发布中心")} onCloudSaved={loadCloudDrafts} saveDraft={saveDraftNow}/>:active==="草稿箱"?<DraftBox drafts={drafts} cloudDrafts={cloudDrafts} cloudError={cloudError} openCloudDraft={openCloudDraft} removeCloudDraft={deleteDraft} openDraft={item=>{setArticle(item);setActive("写作")}} removeDraft={deleteDraft} createArticle={createArticle}/>:active==="文章管理"?<ArticleManager siteProfile={siteProfile} targetPath={targetArticlePath} clearTargetPath={()=>setTargetArticlePath("")} renderEditor={(remoteArticle,setRemoteArticle,saveRemote)=><Editor article={remoteArticle} setArticle={setRemoteArticle} preview={preview} setPreview={setPreview} notify={notify} siteProfile={siteProfile} watermark={watermark} saveRepository={saveRemote}/>}/>:active==="媒体库"?<MediaLibrary drafts={drafts} openReference={ref=>{if(ref.kind==="draft"){const found=drafts.find(item=>item.draftId===ref.draftId);if(found){setArticle(found);setActive("写作")}}else{setTargetArticlePath(ref.file);setActive("文章管理")}}}/>:active==="发布中心"?<PublishPage article={article} setArticle={setArticle} setActive={setActive} onPublished={finishPublished}/>:active==="版本回溯"?<VersionPage setActive={setActive}/>:active==="GitHub 设置"?<GitHubSettings notify={notify} profile={siteProfile}/>:<ModulePage name={active} article={article} setArticle={setArticle} setActive={setActive} notify={notify} siteProfile={siteProfile} setSiteProfile={setSiteProfile} imageHost={imageHost} setImageHost={setImageHost} watermark={watermark} setWatermark={setWatermark}/>;
  if(draftsError)return <div role="alert">{draftsError}；请勿清理浏览器数据或关闭已有草稿标签。</div>;
  if(!draftsReady)return <div role="status">正在恢复本地草稿…</div>;
  return <div className={`obsidian-app ${treeOpen?"":"tree-collapsed"}`}><MainSidebar active={active} setActive={navigate} createArticle={createArticle} treeOpen={treeOpen} setTreeOpen={setTreeOpen}/><main className={`workspace ${active==="写作"?"":"module-workspace"}`}>{active==="写作"&&<Header article={article} treeOpen={treeOpen} setTreeOpen={setTreeOpen} closeTab={closeArticle}/>} {page}</main>{toast&&<div className="obsidian-toast" role="status" aria-live="polite">{toast}</div>}</div>
}

function Sidebar({active,setActive,createArticle,treeOpen,setTreeOpen}){const items=[["首页",GridFour],["新建文章",PencilSimple],["文章管理",Files],["发布中心",PaperPlaneTilt],["数据",Database],["媒体库",Image],["版本回溯",ArrowCounterClockwise],["博客连接",Gear],["图床连接",Image],["备份恢复",UploadSimple],["工具箱",Wrench]],go=label=>setActive(label);return <aside className="sidebar-shell codex-sidebar"><div className="codex-brand">{treeOpen&&<button onClick={()=>go("首页")}>Hans Blog <CaretDown/></button>}<span/><button title="搜索"><MagnifyingGlass/></button><button title="通知"><Bookmarks/></button><button className="sidebar-toggle" title={treeOpen?"收起菜单":"展开菜单"} onClick={()=>setTreeOpen(!treeOpen)}><SidebarSimple/></button></div>{treeOpen?<div className="codex-menu"><nav className="codex-quick"><button className={active==="首页"?"active":""} onClick={()=>go("首页")}><GridFour/>首页</button><button className="new-article-nav" onClick={createArticle}><PencilSimple/>新建文章<Plus/></button><button className={active==="文章管理"?"active":""} onClick={()=>go("文章管理")}><Files/>文章管理</button><button className={active==="发布中心"?"active":""} onClick={()=>go("发布中心")}><PaperPlaneTilt/>发布管理</button><button className={active==="数据"?"active":""} onClick={()=>go("数据")}><Database/>数据概览</button><button><DotsThree/>更多</button></nav><div className="codex-section"><small>内容</small><MenuGroup label="内容管理"><button className={active==="媒体库"?"active":""} onClick={()=>go("媒体库")}>媒体资源</button><button onClick={()=>go("文章管理")}>分类与标签</button></MenuGroup></div><div className="codex-section"><small>发布</small><MenuGroup label="版本与备份"><button className={active==="版本回溯"?"active":""} onClick={()=>go("版本回溯")}>版本记录</button><button className={active==="备份恢复"?"active":""} onClick={()=>go("备份恢复")}>备份与恢复</button></MenuGroup></div><div className="codex-section"><small>系统</small><MenuGroup label="连接与设置"><button className={active==="博客连接"?"active":""} onClick={()=>go("博客连接")}>博客连接</button><button className={active==="图床连接"?"active":""} onClick={()=>go("图床连接")}>图床连接</button><button className={active==="工具箱"?"active":""} onClick={()=>go("工具箱")}>工具箱</button></MenuGroup></div></div>:<nav className="collapsed-nav">{items.map(([label,Icon])=><button key={label} title={label} className={active===label?"active":""} onClick={()=>label==="新建文章"?createArticle():go(label)}><Icon/></button>)}</nav>}</aside>}

function HomePage({createArticle,setActive}){
  const demo=import.meta.env.DEV;
  const [filter,setFilter]=useState("全部"),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(!demo),[error,setError]=useState("");
  const [remote,setRemote]=useState(demo?demoArticles:[]);
  const drafts=(()=>{try{const saved=JSON.parse(localStorage.getItem(DRAFTS_KEY)||"[]");return demo?[...saved,...demoDrafts.filter(item=>!saved.some(draft=>draft.draftId===item.draftId))]:saved}catch{return demo?demoDrafts:[]}})().filter(item=>item.demo||hasDraftContent(item)||item.draftStarted);
  const pending=(()=>{try{return Object.values(JSON.parse(localStorage.getItem(PENDING_KEY)||"{}"))}catch{return []}})();
  useEffect(()=>{if(demo)return;let active=true;setLoading(true);fetch("/api/github/articles",{credentials:"same-origin"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"仓库文章读取失败");if(active){setRemote(data.articles||[]);setError("")}}).catch(reason=>{if(active){setRemote([]);setError(reason.message)}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[demo,refresh]);
  const rows=[...drafts.map(item=>({...item,kind:"draft"})),...remote.map(item=>({...item,kind:"remote"}))].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).filter(item=>filter==="全部"||item.kind===(filter==="草稿"?"draft":"remote")).slice(0,5);
  return <section className="home-page"><div className="home-inner"><div className="home-top"><div><p className="home-kicker">工作台 · {demo?"本地演示":"当前工作区"}</p><h1>内容工作台</h1><p>从内容到发布，先处理最需要关注的事。</p></div><button className="home-refresh" onClick={()=>setRefresh(value=>value+1)} disabled={loading}><ArrowClockwise/>{loading?"读取中":"刷新状态"}</button></div>
    <div className="home-actions"><button className="primary" onClick={createArticle}><PencilSimple/>新建文章</button><button onClick={()=>setActive("草稿箱")}><FileText/>继续草稿</button><button onClick={()=>setActive("文章管理")}><Files/>管理文章</button></div>
    <div className="home-metrics"><button onClick={()=>setActive("文章管理")}><small>仓库文章</small><strong>{loading?"…":error?"—":remote.length}</strong><span>{demo?"演示文章":error?"读取失败":"当前绑定仓库"} →</span></button><button onClick={()=>setActive("草稿箱")}><small>本机草稿</small><strong>{drafts.length}</strong><span>仅保存在当前浏览器 →</span></button><button onClick={()=>setActive("文章管理")}><small>待提交更新</small><strong>{pending.length}</strong><span>尚未写入 GitHub →</span></button></div>
    <div className={`home-grid ${error || pending.length ? "" : "home-grid-solo"}`}><section className="home-panel"><header><h2>最近内容</h2><button onClick={()=>setActive("文章管理")}>查看全部 →</button></header><div className="home-filters" role="group" aria-label="最近内容筛选">{["全部","草稿","仓库"].map(value=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)} aria-pressed={filter===value}>{value}</button>)}</div><div className="home-list">{rows.map(item=><button key={`${item.kind}-${item.file||item.draftId}`} onClick={()=>setActive(item.kind==="draft"?"草稿箱":"文章管理")}><FileText/><span><strong>{item.title||"未命名文章"}</strong><small>{item.kind==="draft"?"本机草稿":"仓库文章"} · {item.date||"日期未填写"}</small></span><CaretRight/></button>)}{!rows.length&&<p>{loading?"正在读取文章…":error?"仓库文章暂不可用":filter==="草稿"?"暂无草稿":"暂无可显示内容"}</p>}</div></section>
{(error || pending.length > 0) && <section className="home-panel home-status"><header><h2>待处理</h2></header>{error && <div className="home-status-item"><span className="warn"/><div><strong>仓库文章读取失败</strong><small>{error}</small></div></div>}{pending.length > 0 && <button className="home-status-action" onClick={()=>setActive("文章管理")}><span className="warn"/><span><strong>待提交更新</strong><small>{pending.length} 篇保存在当前浏览器，尚未提交到 GitHub →</small></span></button>}</section>}</div>
  </div></section>;
}
function MenuGroup({label,children}){const [open,setOpen]=useState(true);return <div className="menu-group"><button className="menu-group-title" onClick={()=>setOpen(!open)}><Folder/>{label}{open?<CaretDown/>:<CaretRight/>}</button>{open&&<div className="menu-group-children">{children}</div>}</div>}
function TreeRow({label,open=false,children}){const [expanded,setExpanded]=useState(open);return <div className="tree-group"><button className="tree-folder" onClick={()=>setExpanded(!expanded)}>{expanded?<CaretDown/>:<CaretRight/>}<span>{label}</span></button>{expanded&&<div className="tree-children">{children}</div>}</div>}

function Header({article,treeOpen,setTreeOpen,closeTab}){return <header className="tab-strip"><button className="pane-toggle" title={treeOpen?"收起菜单":"展开菜单"} onClick={()=>setTreeOpen(!treeOpen)}><SidebarSimple/></button><div className="active-tab"><FileText/><span>{article.title}</span><button type="button" aria-label="关闭文章" title="关闭文章" onClick={closeTab}>×</button></div></header>}

function Editor({article,setArticle,preview,setPreview,savedAt,saveState,notify,siteProfile,watermark,openPublish,saveRepository,onCloudSaved,saveDraft}){
  const editorHost=useRef(null),fileInput=useRef(null),imageInput=useRef(null),localDirectoryInput=useRef(null),[propertiesOpen,setPropertiesOpen]=useState(()=>window.innerWidth>=1300),[uploading,setUploading]=useState(false),[draftSaving,setDraftSaving]=useState(false),[cloudSaving,setCloudSaving]=useState(false),[cloudStatus,setCloudStatus]=useState("仅本机");const update=p=>setArticle(a=>({...a,...p}));const getTextarea=()=>editorHost.current?.querySelector("textarea");
  const articleRef=useRef(article);articleRef.current=article;
  const syncedDraft=useRef({id:"",signature:""}),failedDraft=useRef({id:"",signature:""});
  const draftSignature=value=>JSON.stringify({...value,cloudRevision:undefined,cloudSavedAt:undefined});
  const syncOnExit=useRef(null),publishing=useRef(false);
  syncOnExit.current=()=>{const current=articleRef.current;if(!publishing.current&&!cloudSaving&&current.draftId&&(hasDraftContent(current)||current.draftStarted)&&syncedDraft.current.signature!==draftSignature(current))saveCloudDraft(true)};
  useEffect(()=>{const onVisibility=()=>{if(document.visibilityState==="hidden")syncOnExit.current?.()},onOnline=()=>{failedDraft.current={id:"",signature:""};syncOnExit.current?.()};document.addEventListener("visibilitychange",onVisibility);window.addEventListener("online",onOnline);return()=>{document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("online",onOnline);syncOnExit.current?.()}},[]);
  useEffect(()=>{
    if(saveRepository||article.demo||article.remote||!article.draftId||(!hasDraftContent(article)&&!article.draftStarted))return;
    const signature=draftSignature(article);
    if(syncedDraft.current.id===article.draftId&&syncedDraft.current.signature===signature){setCloudStatus("已同步云端");return}
    if(failedDraft.current.id===article.draftId&&failedDraft.current.signature===signature)return;
    if(cloudSaving)return;
    setCloudStatus("待同步");
    const timer=setTimeout(()=>saveCloudDraft(true),3000);
    return()=>clearTimeout(timer);
  },[article,cloudSaving,saveRepository]);
  const history=useRef({key:"",value:article.content||"",past:[],future:[],lastTyping:0});
  const articleKey=article.file||article.draftId||"";
  useEffect(()=>{if(article.content&&!article.description)setArticle(current=>current.content===article.content&&!current.description?{...current,description:plainDescription(current.content),descriptionAuto:true}:current)},[articleKey]);
  if(history.current.key!==articleKey)history.current={key:articleKey,value:article.content||"",past:[],future:[],lastTyping:0};
  function changeContent(value,typing=false){
    const current=history.current;
    if(value===current.value)return;
    const now=Date.now();
    if(!typing||now-current.lastTyping>900)current.past=[...current.past.slice(-29),current.value];
    current.value=value;current.future=[];current.lastTyping=typing?now:0;
    setArticle(article=>({...article,content:value,...(!article.description||article.descriptionAuto?{description:plainDescription(value),descriptionAuto:true}:{})}));
  }
  function travelHistory(direction){
    const current=history.current,from=direction==="undo"?current.past:current.future,to=direction==="undo"?current.future:current.past;
    if(!from.length)return;
    to.push(current.value);current.value=from.pop();current.lastTyping=0;update({content:current.value});getTextarea()?.focus();
  }
  function editorKeys(event){if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();travelHistory(event.shiftKey?"redo":"undo")}}
  useEffect(()=>{if(history.current.value!==article.content){history.current.value=article.content||"";history.current.past=[];history.current.future=[];history.current.lastTyping=0}},[article.content]);
  useEffect(()=>{let changed=false,content=article.content||"";const images=(article.pendingImages||[]).map(image=>{const id=image.id||crypto.randomUUID();if(!image.id)changed=true;if(image.src&&content.includes(image.src)){content=content.replaceAll(image.src,`asset://${id}`);changed=true}return {...image,id}});const referenced=referencedDraftImages(images,content,article.cover);if(referenced.length!==images.length)changed=true;registerDraftImages(referenced);if(changed)setArticle(current=>({...current,content,pendingImages:referenced}))},[article.content,article.cover,article.pendingImages]);
  function wrap(before,after=before,placeholder="文字"){const el=getTextarea();if(!el)return;const s=el.selectionStart,e=el.selectionEnd,selected=article.content.slice(s,e)||placeholder;changeContent(`${article.content.slice(0,s)}${before}${selected}${after}${article.content.slice(e)}`);setTimeout(()=>{el.focus();el.setSelectionRange(s+before.length,s+before.length+selected.length)},0)}
  function prefixLines(prefix,placeholder="文字"){const el=getTextarea();if(!el)return;const s=el.selectionStart,e=el.selectionEnd,selected=article.content.slice(s,e)||placeholder,next=selected.split("\n").map((line,i)=>`${typeof prefix==="function"?prefix(i):prefix}${line}`).join("\n");changeContent(`${article.content.slice(0,s)}${next}${article.content.slice(e)}`);setTimeout(()=>{el.focus();el.setSelectionRange(s,s+next.length)},0)}
  function insertAlert(type){if(!type)return;const el=getTextarea();if(!el)return;const s=el.selectionStart,e=el.selectionEnd,selected=article.content.slice(s,e)||"提示内容",next=`> [!${type}]\n${selected.split("\n").map(line=>`> ${line}`).join("\n")}`;changeContent(`${article.content.slice(0,s)}${next}${article.content.slice(e)}`);setTimeout(()=>{el.focus();el.setSelectionRange(s,s+next.length)},0)}
  function insertYouTube(link,placement){const embed=youtubeEmbed(link.trim());if(!embed){notify("请输入有效的 YouTube 视频链接");return false}const el=getTextarea();if(placement==="cursor"&&!el){notify("请切换到编辑模式，将光标放在插入位置");return false}const pos=placement==="start"?0:placement==="end"?article.content.length:el.selectionStart;changeContent(`${article.content.slice(0,pos)}\n${embed}\n${article.content.slice(pos)}`);notify("已插入 YouTube 视频到正文");return true}
  function insertExtra(type){if(type==="math-inline")return wrap("$","$","E = mc^2");if(type==="math-block")return wrap("$$\n","\n$$","E = mc^2");if(type==="footnote")return wrap("","[^1]\n\n[^1]: 脚注说明","需要注释的文字");if(type==="details")return wrap("<details>\n<summary>展开查看</summary>\n\n","\n\n</details>","折叠内容")}
  async function importFile(e){const file=e.target.files?.[0];if(!file)return;if(!/\.(md|markdown)$/i.test(file.name)){notify("请选择 Markdown 文件");return}const imported=parseMarkdown(await file.text(),file.name),missing=localImagePaths(imported.content).length;setArticle({...imported,draftId:article.draftId||crypto.randomUUID(),draftStarted:true,...(!imported.description?{description:plainDescription(imported.content),descriptionAuto:true}:{})});notify(missing?`已导入 ${file.name}；请关联 ${missing} 张本地图片`:`已导入 ${file.name}`);e.target.value=""}
  async function insertLocalImages(files){if(!files.length)return;const el=getTextarea(),start=el?.selectionStart??article.content.length,end=el?.selectionEnd??start;try{const images=await Promise.all(files.map(async file=>({id:crypto.randomUUID(),name:file.name||`clipboard-${Date.now()}.png`,src:await imageToDataUrl(file,{...watermark,enabled:false}),watermarkPending:true})));registerDraftImages([...(article.pendingImages||[]),...images]);setArticle(current=>{const markdown=images.map(image=>`![${image.name}](asset://${image.id})`).join("\n\n");return {...current,pendingImages:[...(current.pendingImages||[]),...images],content:`${current.content.slice(0,start)}${markdown}${current.content.slice(end)}`}});notify(`已插入 ${images.length} 张图片，发布前需要上传图床`)}catch(error){notify(error.message||"图片处理失败，未插入")}}
  async function pasteImages(event){const files=[...event.clipboardData.items].filter(item=>item.type.startsWith("image/")).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;event.preventDefault();await insertLocalImages(files)}
  async function chooseImages(event){const files=[...event.target.files||[]];await insertLocalImages(files);event.target.value=""}
  async function linkImportedImages(event){
    const {matched,unresolved}=matchLocalImages(article.content||"",event.target.files||[]);
    event.target.value="";
    if(!matched.length){notify("未匹配到图片，请选择包含 Markdown 引用图片的文件夹");return}
    try{
      const images=await Promise.all(matched.map(async ({file})=>({id:crypto.randomUUID(),name:file.name,src:await imageToDataUrl(file,{...watermark,enabled:false}),watermarkPending:true})));
      registerDraftImages([...(article.pendingImages||[]),...images]);
      setArticle(current=>{
        let content=current.content;
        matched.forEach(({path},index)=>{content=content.replaceAll(`](${path})`,`](asset://${images[index].id})`).replaceAll(`](<${path}>)`,`](asset://${images[index].id})`)});
        return {...current,content,pendingImages:[...(current.pendingImages||[]),...images]};
      });
      notify(`已关联 ${images.length} 张图片${unresolved.length?`，还有 ${unresolved.length} 张未找到`:""}；发布前请上传图床`);
    }catch(error){notify(error.message||"图片关联失败，原文保持不变")}
  }
  async function saveCloudDraft(silent=false){
    if(article.demo||article.remote||!article.draftId){if(!silent)notify("只有新建草稿可以同步到云端");return}
    if(localImagePaths(article.content||"").length){setCloudStatus("需关联本地图片");if(!silent)notify("请先关联 Markdown 中的本地图片");return}
    if(article.cover&&!/^https?:\/\/|^asset:\/\//i.test(article.cover)){setCloudStatus("需处理本地封面");if(!silent)notify("请先处理本地封面图片");return}
    setCloudSaving(true);
    setCloudStatus("同步中…");
    const initialText=JSON.stringify({...article,pendingImages:undefined,tempImageKeys:undefined,cloudRevision:undefined,cloudSavedAt:undefined});
    let next={...article,pendingImages:[...(article.pendingImages||[])],tempImageKeys:[...(article.tempImageKeys||[])]};
    let cacheWarning=false;
    try{
      for(const image of next.pendingImages){
        if(image.tempKey)continue;
        if(!String(image.src||"").startsWith("data:image/"))throw new Error("草稿图片已丢失，请重新选择图片");
        const response=await fetch("/api/images/draft-upload",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({draftId:article.draftId,src:image.src})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||"草稿图片上传失败");
        next={...next,pendingImages:next.pendingImages.map(item=>item.id===image.id?{...item,src:result.url,tempKey:result.key}:item),tempImageKeys:[...new Set([...next.tempImageKeys,result.key])]};
        setArticle(current=>current.draftId===article.draftId?{...current,pendingImages:(current.pendingImages||[]).map(item=>item.id===image.id?{...item,src:result.url,tempKey:result.key}:item),tempImageKeys:[...new Set([...(current.tempImageKeys||[]),result.key])]}:current);
        try{await replaceStoredDraftImage(image.id,result.url)}catch{cacheWarning=true}
      }
      if(JSON.stringify({...articleRef.current,pendingImages:undefined,tempImageKeys:undefined,cloudRevision:undefined,cloudSavedAt:undefined})!==initialText)throw new Error("同步期间文章有新改动；图片已暂存，请再次点击同步云端");
      const response=await fetch(`/api/drafts/${article.draftId}`,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({article:next,revision:article.cloudRevision||0})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"云端草稿保存失败");
      syncedDraft.current={id:article.draftId,signature:draftSignature(next)};
      failedDraft.current={id:"",signature:""};
      setArticle(current=>current.draftId===article.draftId?{...current,cloudRevision:result.revision,cloudSavedAt:result.updatedAt}:current);
      await onCloudSaved?.();
      setCloudStatus(cacheWarning?"已同步，图片缓存待清理":"已同步云端");
      if(!silent)notify(cacheWarning?"云端草稿已保存，但本机图片缓存清理失败":`云端草稿已保存（第 ${result.revision} 版）`);
    }catch(error){if(!String(error.message).includes("同步期间文章有新改动"))failedDraft.current={id:article.draftId,signature:draftSignature(articleRef.current)};setCloudStatus(`同步失败：${error.message||"请重试"}`);if(!silent)notify(error.message||"云端草稿保存失败；本机副本仍保留")}
    finally{setCloudSaving(false)}
  }
  async function saveDraftExplicitly(){
    setDraftSaving(true);
    try{
      await saveDraft(articleRef.current);
      notify("本机草稿已保存；正在同步云端");
      await saveCloudDraft();
    }catch(error){notify(`草稿保存失败：${error.message}；请勿关闭页面`)}
    finally{setDraftSaving(false)}
  }
  async function uploadPending(){
    if(!/^[a-z0-9][a-z0-9-]*$/.test(article.slug||"")){notify("请先填写有效的文章 Slug，再上传图片");return}
    setUploading(true);
    try{
      let done=0;
      for(const image of referencedDraftImages(article.pendingImages,article.content,article.cover)){
        const bodyUsed=article.content.includes(`asset://${image.id}`);
        const coverUsed=article.cover===`asset://${image.id}`;
        async function send(endpoint,payload){
          const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify(payload)});
          const result=await response.json();
          if(!response.ok)throw new Error(result.error||"图片上传失败");
          return result.url;
        }
        const originalPayload=image.tempKey?{draftId:article.draftId,slug:article.slug,tempKey:image.tempKey}:{slug:article.slug,src:image.src};
        const originalEndpoint=image.tempKey?"/api/images/draft-promote":"/api/images/upload";
        const markBody=bodyUsed&&image.watermarkPending&&watermark.enabled&&!watermark.whitelist.split(/[\n,，]/).some(name=>name.trim().toLowerCase()===image.name.toLowerCase());
        let coverUrl="";
        if(coverUsed){
          coverUrl=await send(originalEndpoint,originalPayload);
          setArticle(current=>({...current,cover:current.cover===`asset://${image.id}`?coverUrl:current.cover,pendingImages:current.content.includes(`asset://${image.id}`)?current.pendingImages:(current.pendingImages||[]).filter(item=>item.id!==image.id)}));
          if(!bodyUsed){await removeStoredDraftImage(image.id).catch(()=>notify("正式图片已上传，但本机临时缓存清理失败"));done++;continue}
        }
        if(bodyUsed){
          let endpoint=originalEndpoint,payload=originalPayload;
          if(markBody){
            let source=image.src;
            if(image.tempKey){
              const response=await fetch("/api/images/draft-source",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Origin:location.origin},body:JSON.stringify({draftId:article.draftId,tempKey:image.tempKey})});
              const result=await response.json();
              if(!response.ok)throw new Error(result.error||"草稿原图读取失败");
              source=result.src;
            }
            const blob=await (await fetch(source)).blob();
            payload={slug:article.slug,src:await imageToDataUrl(new File([blob],image.name,{type:blob.type}),watermark)};
            endpoint="/api/images/upload";
          }
          const bodyUrl=coverUrl&&!markBody?coverUrl:await send(endpoint,payload);
          setArticle(current=>({...current,content:current.content.replaceAll(`asset://${image.id}`,bodyUrl),pendingImages:(current.pendingImages||[]).filter(item=>item.id!==image.id)}));
          await removeStoredDraftImage(image.id).catch(()=>notify("正式图片已上传，但本机临时缓存清理失败"));
          done++;
        }
      }
      notify(`已上传 ${done} 张图片到 ${article.slug}/，请检查公开地址`);
    }catch(error){notify(error.message||"上传中断；未完成的图片仍在本地草稿")}finally{setUploading(false)}
  }
  const pendingCount=article.pendingImages?.length||0,localCount=localImagePaths(article.content||"").length,toolGroups=[[[TextB,"粗体",()=>wrap("**","**","粗体")],[TextItalic,"斜体",()=>wrap("*","*","斜体")],[TextStrikethrough,"删除线",()=>wrap("~~","~~","删除线")],[CodeSimple,"行内代码",()=>wrap("`","`","代码")]],[[Link,"链接",()=>wrap("[","](https://example.com)","链接")],[Quotes,"引用",()=>prefixLines("> ","引用内容")]],[[ListBullets,"无序列表",()=>prefixLines("- ","列表项")],[ListNumbers,"有序列表",()=>prefixLines(i=>`${i+1}. `,"列表项")],[ListChecks,"任务列表",()=>prefixLines("- [ ] ","待办事项")]],[[Image,"插入本地图片",()=>imageInput.current?.click()],[Table,"表格",()=>wrap("| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |\n","","")],[Code,"代码块",()=>wrap("```text\n","\n```","代码")],[Minus,"分隔线",()=>wrap("\n---\n","","")]]];
  return <section className={`note-view ${propertiesOpen?"properties-open":""}`}>
    <div className="note-tools office-toolbar">
      <input ref={fileInput} type="file" accept=".md,.markdown,text/markdown" hidden onChange={importFile}/>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={chooseImages}/>
      <input ref={localDirectoryInput} type="file" webkitdirectory="" multiple hidden onChange={linkImportedImages}/>
      <div className="tool-group"><button title="撤销" onClick={()=>travelHistory("undo")}><ArrowCounterClockwise/></button><button title="重做" onClick={()=>travelHistory("redo")}><ArrowClockwise/></button></div>
      <div className="tool-group"><select aria-label="段落样式" defaultValue="正文" onChange={e=>{const mark={"一级标题":"# ","二级标题":"## ","三级标题":"### ","四级标题":"#### ","正文":""}[e.target.value];if(mark)prefixLines(mark,"标题")}}><option>正文</option><option>一级标题</option><option>二级标题</option><option>三级标题</option><option>四级标题</option></select></div>
      {toolGroups.map((group,i)=><div className="tool-group" key={i}>{group.map(([Icon,label,action])=><button key={label} title={label} aria-label={label} onClick={action}><Icon/></button>)}</div>)}
      <div className="tool-group alert-group"><select aria-label="插入提示框" defaultValue="" onChange={e=>{insertAlert(e.target.value);e.target.value=""}}><option value="">提示框</option><option value="NOTE">说明</option><option value="TIP">提示</option><option value="IMPORTANT">重要</option><option value="WARNING">警告</option><option value="CAUTION">注意</option></select></div>
      <div className="tool-group extra-group"><select aria-label="插入更多内容" defaultValue="" onChange={e=>{insertExtra(e.target.value);e.target.value=""}}><option value="">更多</option><option value="math-inline">行内公式</option><option value="math-block">公式块</option><option value="footnote">脚注</option><option value="details">折叠内容</option></select></div>
      <div className="editor-actions">
        {!saveRepository&&<button className="import-action" title="导入 Markdown 文件" aria-label="导入 Markdown" onClick={()=>fileInput.current?.click()}><FileArrowUp/><span>导入</span></button>}
        {!saveRepository&&<><button className="import-action" title="保存到当前浏览器并同步云端" disabled={draftSaving||cloudSaving} onClick={saveDraftExplicitly}><Database/><span>{draftSaving?"保存中…":"保存草稿"}</span></button><span className="cloud-sync-status" role="status" title={cloudStatus}>{cloudStatus}</span></>}
        {localCount>0&&<button className="import-action" title="选择本地图片所在文件夹，关联 Markdown 图片" onClick={()=>localDirectoryInput.current?.click()}><Folder/><span>关联图片 {localCount}</span></button>}
        <button title={propertiesOpen?"隐藏文章属性":"显示文章属性"} aria-label={propertiesOpen?"隐藏文章属性":"显示文章属性"} className={propertiesOpen?"active":""} onClick={()=>setPropertiesOpen(!propertiesOpen)}><Gear/><span>属性</span></button>
        {!saveRepository&&<small className={`save-state ${saveState}`} title={saveState==="error"?"草稿保存失败":saveState==="saving"?"正在自动保存":`已自动保存 ${savedAt}`}>{saveState==="error"?<span>未保存</span>:saveState==="saving"?<span>保存中…</span>:<Check weight="bold"/>}</small>}
        <button className="preview-action" title={preview?"返回编辑":"预览文章"} aria-label={preview?"返回编辑":"预览文章"} onClick={()=>setPreview(!preview)}>{preview?<PencilSimple/>:<Eye/>}<span>{preview?"编辑":"预览"}</span></button>
        {pendingCount>0&&<button className="upload-action" title="将本文暂存图片上传到图床" disabled={uploading} onClick={uploadPending}><UploadSimple/><span>{uploading?"上传中…":`${pendingCount} 张待上传`}</span></button>}
        <button className="publish-action" title={saveRepository?"保存为待提交更新":"校验并发布"} aria-label={saveRepository?"保存为待提交更新":"校验并发布"} disabled={!saveRepository&&cloudSaving} onClick={saveRepository||(()=>{publishing.current=true;openPublish()})}><PaperPlaneTilt/><span>{saveRepository?"保存待提交更新":"发布"}</span></button>
      </div>
    </div>
    <div className="editor-body"><article className="note-page"><h1 contentEditable suppressContentEditableWarning onBlur={e=>{const title=e.currentTarget.textContent||"";update({title,...(!article.slug&&{slug:slugFromTitle(title)})})}}>{article.title}</h1><div className="note-divider"/>{localCount>0&&<div className="local-image-notice" role="status"><span>这篇文章引用了 {localCount} 张电脑上的图片。选择图片所在文件夹后即可预览；点击「同步云端」后才会暂存到当前公开图床。</span><button type="button" onClick={()=>localDirectoryInput.current?.click()}>选择图片文件夹</button></div>}{preview?<div className="article-rendered-preview" data-color-mode="light">{article.cover&&(!hasYouTubeEmbed(article.content)||article.video_as_cover===false)&&<img className="article-cover" src={resolveDraftImage(article.cover)} alt="文章封面"/>}<Suspense fallback={<p role="status">正在加载文章预览…</p>}><MarkdownRenderer source={article.content||""} components={{img:props=><img {...props} src={resolveDraftImage(props.src||"")} alt={props.alt||""}/>}}/></Suspense></div>:<div ref={editorHost} onPaste={pasteImages} onKeyDown={editorKeys} className="markdown-workbench" data-color-mode="light"><Suspense fallback={<p role="status">正在加载 Markdown 编辑器…</p>}><MDEditor value={article.content||""} onChange={value=>changeContent(value||"",true)} preview="edit" hideToolbar visibleDragbar={false} height="100%" textareaProps={{"aria-label":"Markdown 正文"}}/></Suspense></div>}</article>{propertiesOpen&&<RightProperties article={article} update={update} close={()=>setPropertiesOpen(false)} siteProfile={siteProfile} notify={notify} insertYouTube={insertYouTube} watermark={watermark}/>}</div>
    <footer className="note-status"><span>{preview?"阅读视图":"Markdown 编辑"} · {article.content.length} 字符</span></footer>
  </section>
}

function Properties({article,update}){const tags=article.tags.split(",").filter(Boolean);return <section className="properties"><h3>笔记属性</h3><label><ListDashes/>title<input value={article.title} onChange={e=>update({title:e.target.value})}/></label><label><Link/>slug<input value={article.slug} onChange={e=>update({slug:e.target.value})}/></label><label><Tag/>tags<div className="property-tags">{tags.map(t=><span key={t}>{t.trim()} ×</span>)}</div></label><label><Folder/>category<input value={article.category} onChange={e=>update({category:e.target.value})}/></label><label><CalendarBlank/>updated<span>2026/09/29</span></label><button><Plus/>添加笔记属性</button></section>}
function YouTubeField({article,insertYouTube}){const [link,setLink]=useState(""),[placement,setPlacement]=useState("cursor");return <div className="youtube-field"><label>YouTube 视频链接<input value={link} onChange={e=>setLink(e.target.value)} placeholder="粘贴 YouTube 视频链接"/></label><label>插入位置<select value={placement} onChange={e=>setPlacement(e.target.value)}><option value="cursor">正文光标处</option><option value="start">正文开头</option><option value="end">正文结尾</option></select></label><button type="button" onClick={()=>{if(insertYouTube(link,placement))setLink("")}}>插入正文</button><small>{hasYouTubeEmbed(article.content)?"正文已有 YouTube 视频；可在正文移动或删除视频代码":"可在正文移动视频代码，预览查看位置"}</small></div>}
function RightProperties({article,update,close,siteProfile,notify,insertYouTube,watermark}){
  const [navOpen,setNavOpen]=useState(false),[coverOpen,setCoverOpen]=useState(false),[coverTab,setCoverTab]=useState("article"),[selectedCover,setSelectedCover]=useState(""),[tagDraft,setTagDraft]=useState(""),navField=useRef(null),coverDialog=useRef(null),coverInput=useRef(null),channels=article.channels||[],tags=String(article.tags||"").split(",").map(x=>x.trim()).filter(Boolean),groups=siteProfile.channels.filter(x=>x.level===1),toggle=key=>{if(channels.includes(key))return update({channels:channels.filter(x=>x!==key)});if(channels.length>=2)return notify("当前站点最多选择两个导航位置");update({channels:[...channels,key]})};
  useEffect(()=>{if(!navOpen)return;const closeNav=e=>{if(!navField.current?.contains(e.target))setNavOpen(false)};document.addEventListener("mousedown",closeNav);return()=>document.removeEventListener("mousedown",closeNav)},[navOpen]);
  useEffect(()=>{const dialog=coverDialog.current;if(!dialog)return;if(coverOpen&&!dialog.open)dialog.showModal();else if(!coverOpen&&dialog.open)dialog.close()},[coverOpen]);
  const articleImages=articleImageSources(article.content||"").filter(src=>(article.pendingImages||[]).some(image=>src===`asset://${image.id}`&&image.watermarkPending));
  const addTag=()=>{const tag=tagDraft.trim();if(tag&&!tags.includes(tag))update({tags:[...tags,tag].join(", ")});setTagDraft("")},removeTag=tag=>update({tags:tags.filter(x=>x!==tag).join(", ")});
  const chooseCover=async event=>{const file=event.target.files?.[0];if(!file)return;event.target.value="";setCoverOpen(false);try{const id=crypto.randomUUID(),image={id,name:file.name,src:await imageToDataUrl(file,{...watermark,enabled:false})};registerDraftImages([...(article.pendingImages||[]),image]);update({cover:`asset://${id}`,pendingImages:[...(article.pendingImages||[]),image]});notify("封面原图已暂存，发布前需要上传图床")}catch(error){notify(error.message||"封面读取失败")}};
  const Node=({item,parent=false})=><button className={channels.includes(item.key)?"selected":""} onClick={()=>toggle(item.key)}><span className="nav-check">{channels.includes(item.key)&&<Check weight="bold"/>}</span>{parent&&<Folder/>}<span>{item.name}</span></button>;
  return <aside className="right-properties"><header><strong>文章属性</strong><button onClick={close} title="隐藏属性面板">×</button></header><div className="property-fields">{article.templateApplied&&<div className="property-check"><Check/><div><strong>已套用当前站点模板</strong><small>{siteProfile.engine} · {siteProfile.template}</small></div></div>}<label>标题 <em>*</em><input value={article.title||""} onChange={e=>update({title:e.target.value})} onBlur={()=>{if(!article.slug&&article.title)update({slug:slugFromTitle(article.title)})}}/>{!article.title&&<small className="field-error">请填写标题</small>}</label><label>Slug <em>*</em><input value={article.slug||""} placeholder="例如 nas-guide" readOnly={article.remote} onChange={e=>update({slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"")})}/><small>{article.remote?"仓库文章的 Slug 已锁定":"填写简短、可读的英文地址"}</small>{article.slug&&!/^[a-z0-9][a-z0-9-]*$/.test(article.slug)&&<small className="field-error">只能使用小写字母、数字和连字符</small>}</label><label>发布日期<DateTimePicker value={article.date||""} onChange={date=>update({date})}/>{!article.date&&<small className="field-error">请选择发布日期</small>}</label><label>描述 <span className="field-count">{(article.description||"").length}/160</span><textarea maxLength="160" value={article.description||""} onChange={e=>update({description:e.target.value,descriptionAuto:false})}/><button type="button" className="description-generate" onClick={()=>update({description:plainDescription(article.content),descriptionAuto:true})}>从正文重新生成</button><small>{article.descriptionAuto?"随正文自动更新；手动修改后停止覆盖":"可手动修改；需要时可重新提取"}</small></label><label>封面地址<div className="cover-field"><input value={article.cover||""} onChange={e=>update({cover:e.target.value})}/><button type="button" onClick={()=>{setSelectedCover(articleImages.includes(article.cover)?article.cover:"");setCoverTab("article");setCoverOpen(true)}}>选择图片</button><input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={chooseCover}/></div>{article.cover&&<img className="cover-preview" src={resolveDraftImage(article.cover)} alt="封面预览"/>}{article.cover.startsWith("http")&&articleImageSources(article.content||"").includes(article.cover)&&<small className="field-error">此封面复用了已上传的正文图片；若图上已有水印，请从本地上传原图，已加的水印无法自动去除。</small>}</label><YouTubeField article={article} insertYouTube={insertYouTube}/>{siteProfile.channels.length>0&&<div className="nav-field" ref={navField}><div className="nav-field-title"><strong>导航位置</strong><span>已选 {channels.length}/2</span></div><button className="nav-combobox" onClick={()=>setNavOpen(!navOpen)}>{channels.length?channels.map(key=><span key={key}>{siteProfile.channels.find(x=>x.key===key)?.name||key}</span>):<em>请选择导航位置</em>}<CaretDown/></button>{navOpen&&<div className="nav-dropdown"><header><strong>选择导航位置</strong><span>{channels.length}/2</span></header><div className="nav-tree-selector">{groups.map(parent=><div className="nav-tree-group" key={parent.key}><Node item={parent} parent/><div>{siteProfile.channels.filter(x=>x.level===2&&x.groupKey===parent.key).map(child=><Node item={child} key={child.key}/>)}</div></div>)}</div></div>}<small>可选择两个，已选栏目显示在输入框内</small></div>}<label>标签<div className="tag-editor">{tags.map(tag=><button type="button" key={tag} onClick={()=>removeTag(tag)}>{tag}<span>×</span></button>)}<input value={tagDraft} placeholder={tags.length?"添加标签":"输入标签后按回车"} onChange={e=>setTagDraft(e.target.value)} onBlur={addTag} onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addTag()}}}/></div><small>按回车添加，点击标签可删除</small></label>{siteProfile.usesCategories&&<details className="custom-frontmatter" open><summary>归档设置</summary><label>分类<select value={article.category||""} onChange={e=>update({category:e.target.value})}><option value="">请选择分类</option>{siteProfile.categories.map(x=><option key={x}>{x}</option>)}</select><small>用于分类归档、相关文章和文章信息，不等于导航</small></label></details>}<label>置顶顺序<input type="number" min="0" step="1" value={article.top??0} onChange={e=>update({top:e.target.value===""?0:Math.max(0,Math.floor(Number(e.target.value)||0))})}/><small>0 为取消置顶；数字越大越靠前。仅保存到当前草稿，尚不会修改 GitHub 文章。</small></label><label>发布状态<select value={article.status||"草稿"} disabled={article.remote} onChange={e=>update({status:e.target.value})}><option>草稿</option><option>审阅中</option>{article.remote&&<option>已提交 GitHub</option>}</select><small>{article.remote?"已提交仓库；博客上线状态仍待核验":"完成校验后进入发布流程"}</small></label><div className="property-check"><div><strong>{siteProfile.connectionStatus==="connected"?`已连接 ${siteProfile.repository}`:siteProfile.connectionStatus==="error"?"GitHub 连接状态读取失败":siteProfile.connectionStatus==="disconnected"?"GitHub 尚未连接":"正在读取 GitHub 连接…"}</strong><small>{siteProfile.connectionError|| (siteProfile.connectionStatus==="connected"?"导航与分类来自已连接仓库":"请检查 GitHub 设置")}</small></div></div></div><dialog className="cover-dialog" ref={coverDialog} onClose={()=>setCoverOpen(false)} aria-label="选择封面图片"><header><div><strong>选择封面图片</strong><small>可选未正式上传的正文原图；已上传的水印图请从本地重新上传原图</small></div><button type="button" aria-label="关闭封面选择" onClick={()=>setCoverOpen(false)}>×</button></header><div className="cover-dialog-tabs" role="tablist" aria-label="图片来源"><button type="button" role="tab" aria-selected={coverTab==="article"} className={coverTab==="article"?"active":""} onClick={()=>setCoverTab("article")}>本文图片</button><button type="button" role="tab" aria-selected={coverTab==="upload"} className={coverTab==="upload"?"active":""} onClick={()=>setCoverTab("upload")}>本地上传</button></div>{coverTab==="article"?<div className="cover-dialog-content">{articleImages.length?<div className="cover-image-grid">{articleImages.map((src,index)=><button type="button" key={src} className={selectedCover===src?"selected":""} aria-label={`选择第 ${index+1} 张本文图片`} aria-pressed={selectedCover===src} onClick={()=>setSelectedCover(src)}><img src={resolveDraftImage(src)} alt=""/><span>图片 {index+1}</span></button>)}</div>:<p className="cover-dialog-empty">本文没有待上传的原图。已上传的正文图片可能带水印，请从本地上传封面原图。</p>}</div>:<div className="cover-dialog-upload"><Image size={36}/><strong>从电脑选择封面图片</strong><small>PNG、JPG、WebP 或 GIF；封面不会加水印</small><button type="button" onClick={()=>coverInput.current?.click()}>选择本地图片</button></div>}<footer><button type="button" onClick={()=>setCoverOpen(false)}>取消</button>{coverTab==="article"&&<button type="button" className="primary" disabled={!selectedCover} onClick={()=>{update({cover:selectedCover});setCoverOpen(false)}}>使用选中图片</button>}</footer></dialog></aside>
}

function ModulePage({name,article,setArticle,setActive,notify,siteProfile,setSiteProfile,imageHost,setImageHost,watermark,setWatermark}){const [query,setQuery]=useState(""),[media,setMedia]=useState([]);const articles=[article,{...article,title:"从想法到发布：一个人的博客系统",slug:"idea-to-publish",status:"审阅中"},{...article,title:"构建更少，写作更多",slug:"build-less-write-more",status:"已发布"}].filter(a=>`${a.title} ${a.slug}`.toLowerCase().includes(query.toLowerCase()));const head=text=><header className="module-title"><h1>{name}</h1><p>{text}</p></header>;if(name==="博客连接")return <SiteSetup profile={siteProfile} setProfile={setSiteProfile} notify={notify}/>;if(name==="图床连接")return <ImageHostSetup config={imageHost} setConfig={setImageHost} notify={notify}/>;if(name==="水印设置")return <section className="module-page connection-page"><header className="module-title"><h1>水印设置</h1><p>新图片先保留原图；正式上传时只给正文图片加水印。封面始终使用原图，设置保存在当前浏览器。</p></header><WatermarkSettings settings={watermark} setSettings={setWatermark}/></section>;if(name==="文章管理")return <section className="module-page">{head("管理本地 Markdown 文章。")}<div className="module-toolbar"><input placeholder="搜索文章" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>{setArticle({...initialArticle,title:"未命名文章",slug:`new-${Date.now()}`});setActive("写作")}}><Plus/>新建文章</button></div><div className="obsidian-list">{articles.map(a=><button key={a.slug} onClick={()=>{setArticle(a);setActive("写作")}}><FileText/><div><strong>{a.title}</strong><small>{a.slug}.md · {a.status}</small></div></button>)}</div></section>;if(name==="媒体库")return <section className="module-page">{head("管理文章引用的图片。")}<label className="obsidian-drop"><Image/><strong>添加本地图片</strong><span>PNG、JPG、WebP</span><input type="file" accept="image/*" multiple onChange={e=>setMedia([...media,...[...e.target.files].map(f=>f.name)])}/></label><div className="media-list">{media.map(x=><span key={x}>{x}</span>)}</div></section>;return <section className="module-page">{head("运行本地维护工具。")}<div className="settings-rows"><button className="primary" onClick={()=>notify("工具尚未连接")}>运行</button></div></section>}

function SiteSetup({profile,setProfile,notify}){
  const [connection,setConnection]=useState(null),[connectionError,setConnectionError]=useState(""),[navigation,setNavigation]=useState(null),[sourcePick,setSourcePick]=useState(""),[formatPick,setFormatPick]=useState("channels"),[sourceError,setSourceError]=useState("");
  useEffect(()=>{let active=true;Promise.all([fetch("/api/github/settings",{credentials:"same-origin"}),fetch("/api/github/navigation",{credentials:"same-origin"})]).then(async ([settingsResponse,navigationResponse])=>{const settings=await settingsResponse.json(),nav=await navigationResponse.json();if(!settingsResponse.ok)throw new Error(settings.error||"无法读取连接状态");if(active){setConnection(settings);setNavigation(navigationResponse.ok?nav:{status:"error",error:nav.error});setSourcePick(nav.source||nav.candidates?.[0]||"");setFormatPick(nav.format||"channels")}}).catch(error=>{if(active)setConnectionError(error.message)});return()=>{active=false}},[]);
  async function chooseSource(save){
    setSourceError("");
    try {const path=`/api/github/navigation${save?"":`?path=${encodeURIComponent(sourcePick)}&format=${encodeURIComponent(formatPick)}`}`,response=await fetch(path,{method:save?"POST":"GET",credentials:"same-origin",headers:save?{"Content-Type":"application/json",Origin:location.origin}:{},body:save?JSON.stringify({path:sourcePick,format:formatPick}):undefined}),result=await response.json();if(!response.ok)throw new Error(result.error||"导航读取失败");setNavigation(result);if(save)setProfile(current=>({...current,channels:result.channels}));notify(save?"读取规则已保存到后台；博客仓库未更改":"已重新读取候选导航")}catch(error){setSourceError(error.message)}
  }
  const connected=!!connection?.repository;
  return <section className="module-page connection-page"><header className="module-title"><h1>博客设置</h1><p>识别博客导航来源，预览栏目编辑；本地预览不会修改博客源码。</p></header><div className="connection-status"><span/><div><strong>{connectionError?"连接状态读取失败":connection===null?"正在读取 GitHub 连接状态…":connected?`已连接 ${connection.repository}`:"GitHub 尚未绑定博客仓库"}</strong><small>{connectionError|| (connected?`${connection.site?.engine?.toUpperCase()||"博客类型待识别"} · 文章目录 ${connection.site?.articleDir||"待识别"}`:"请先在 GitHub 设置中连接 App 并绑定博客源码仓库")}</small></div></div><div className="settings-rows site-setup"><label>站点名称<input value={profile.siteName||""} placeholder="博客名称" onChange={e=>setProfile({...profile,siteName:e.target.value})}/></label><div className="detected-summary"><strong>{navigation?.status==="detected"?`仓库导航 · ${navigation.source}`:"仓库导航"}</strong><span>{navigation?.status==="detected"?`${navigation.channels.length} 个栏目${navigation.confirmed?" · 已确认":" · 待确认"}`:navigation===null?"读取中":navigation.status==="not_found"?"未找到":navigation.status==="unsupported"?"格式待适配":"读取失败"}</span></div>{connected&&navigation&&<><label>导航来源（可填写仓库内配置文件路径）<input list="navigation-candidates" value={sourcePick} onChange={e=>setSourcePick(e.target.value)} placeholder="例如 source/_data/navigation.yml"/><datalist id="navigation-candidates">{navigation.candidates.map(path=><option key={path} value={path}/>)}</datalist></label><label>配置结构<select value={formatPick} onChange={e=>setFormatPick(e.target.value)}><option value="channels">频道数据（items / key / name / children）</option><option value="hexo-menu">Hexo 主题菜单（menu）</option><option value="hugo-toml">Hugo TOML 主菜单（menus.main）</option><option value="hugo-yaml">Hugo YAML 主菜单（menus.main）</option></select></label><div className="connection-actions"><button onClick={()=>chooseSource(false)}>试读所选配置</button><button className="primary" disabled={navigation.status!=="detected"||navigation.source!==sourcePick||navigation.format!==formatPick} onClick={()=>chooseSource(true)}>确认并保存读取规则</button></div><small>仅读取已授权仓库；确认只保存后台的来源与结构，不会修改博客文件。</small>{sourceError&&<small className="field-error">{sourceError}</small>}</>}</div><NavigationWorkspace navigation={navigation} demo={import.meta.env.DEV && !connected}/></section>
}


function ImageHostSetup({config,setConfig,notify}){
  const [accessKeyId,setAccessKeyId]=useState(""),[secretAccessKey,setSecretAccessKey]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;fetch("/api/images/settings",{credentials:"same-origin"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"读取图床设置失败");if(active)setConfig(current=>({...current,...data,status:data.connected?"已验证 R2 存储桶":"未连接"}))}).catch(error=>{if(active)setConfig(current=>({...current,status:error.message}))});return()=>{active=false}},[setConfig]);
  const update=patch=>setConfig(current=>({...current,...patch}));
  async function verify(){setBusy(true);try{const response=await fetch("/api/images/settings",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:config.accountId,bucket:config.bucket,publicUrl:config.publicUrl,accessKeyId,secretAccessKey})});const data=await response.json();if(!response.ok)throw new Error(data.error||"图床验证失败");update({...data,status:"已验证 R2 存储桶；公开域名需上传图片后核验"});setAccessKeyId("");setSecretAccessKey("");notify("图床连接已验证并保存到后台")}catch(error){update({status:error.message||"图床验证失败"});notify("图床验证未通过")}finally{setBusy(false)}}
  return <section className="module-page connection-page"><header className="module-title"><h1>图床设置</h1><p>连接 Cloudflare R2 存储桶；凭据仅提交到受保护的后台并加密保存，不写入浏览器或博客仓库。</p></header><div className="connection-status"><span/><div><strong>{config.status}</strong><small>图片上传后按文章 Slug 分类，如 nas-guide/001.webp；不会覆盖同名图片。</small></div></div><div className="settings-rows site-setup"><label>服务类型<input value="Cloudflare R2" readOnly/></label><label>账户 ID<input value={config.accountId||""} onChange={e=>update({accountId:e.target.value})} placeholder="Cloudflare Account ID"/></label><label>存储桶<input value={config.bucket||""} onChange={e=>update({bucket:e.target.value})} placeholder="Bucket 名称"/></label><label>API 端点<input value={config.accountId?`https://${config.accountId}.r2.cloudflarestorage.com`:""} readOnly placeholder="由账户 ID 自动生成"/></label><label>公开域名<input value={config.publicUrl||""} onChange={e=>update({publicUrl:e.target.value})} placeholder="https://img.example.com 或 R2 公开地址"/></label><label>Access Key<input type="password" value={accessKeyId} onChange={e=>setAccessKeyId(e.target.value)} autoComplete="off" placeholder="仅首次连接或更换密钥时填写"/></label><label>Secret Key<input type="password" value={secretAccessKey} onChange={e=>setSecretAccessKey(e.target.value)} autoComplete="off" placeholder="不会从后台回显"/></label><div className="connection-actions"><button className="primary" disabled={busy} onClick={verify}>{busy?"验证中…":"验证并保存连接"}</button></div><small>请使用只授权目标桶的 Object Read & Write 密钥。此处验证存储桶访问；公开地址在上传第一张图片后单独检查。</small></div></section>;
}

function WatermarkSettings({settings,setSettings}){
  const canvas=useRef(null),update=patch=>setSettings(current=>normalizeWatermark({...current,...patch}));
  useEffect(()=>{const el=canvas.current;if(!el)return;const ctx=el.getContext("2d");if(!ctx)return;ctx.fillStyle="#e9edf2";ctx.fillRect(0,0,el.width,el.height);ctx.fillStyle="#a2b5cb";ctx.fillRect(38,55,250,125);ctx.fillStyle="#d0dce8";ctx.fillRect(310,26,265,174);ctx.fillStyle="#596f89";ctx.font="600 28px sans-serif";ctx.fillText("预览图片",50,110);drawWatermark(ctx,el.width,el.height,settings)},[settings]);
  return <section className="watermark-settings"><header><h2>自动水印</h2><p>仅处理新插入的正文图片；封面始终不加水印。设置保存在当前浏览器，旧图不变。</p></header><div className="watermark-grid"><div className="watermark-fields"><label className="watermark-toggle"><input type="checkbox" checked={settings.enabled} onChange={e=>update({enabled:e.target.checked})}/> 启用自动水印</label><label>水印文字<input maxLength="60" value={settings.text} onChange={e=>update({text:e.target.value})}/></label><label>大小（占图宽） <strong>{settings.size}%</strong><input type="range" min="2" max="18" value={settings.size} onChange={e=>update({size:Number(e.target.value)})}/></label><label>透明度 <strong>{settings.opacity}%</strong><input type="range" min="5" max="80" value={settings.opacity} onChange={e=>update({opacity:Number(e.target.value)})}/></label><label>水印数量 <strong>{settings.layout==="center"?1:settings.count} 个</strong><input type="range" min="1" max="12" value={settings.count} disabled={settings.layout==="center"} onChange={e=>update({count:Number(e.target.value)})}/></label><label>方向<select value={settings.direction} onChange={e=>update({direction:e.target.value})}><option value="diagonal-up">左下到右上</option><option value="diagonal-down">左上到右下</option><option value="horizontal">水平</option></select></label><label>布局<select value={settings.layout} onChange={e=>update({layout:e.target.value})}><option value="repeat">平铺</option><option value="center">居中单个</option></select></label><label>颜色<select value={settings.color} onChange={e=>update({color:e.target.value})}><option value="white">白色</option><option value="black">黑色</option></select></label><label>不加水印的正文图片文件名<textarea rows="3" value={settings.whitelist} onChange={e=>update({whitelist:e.target.value})} placeholder="例如 logo.png，每行一个；也可用逗号分隔"/><small>按完整文件名匹配，忽略大小写；封面无需加入白名单。</small></label></div><div className="watermark-preview"><strong>效果预览</strong><canvas ref={canvas} width="640" height="360"/><small>预览图是示意素材，不会上传。正文图片在本地插入时生成带水印副本。</small></div></div></section>;
}
