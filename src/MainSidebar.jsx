import { useState } from "react";
import { Article, CaretDown, CaretRight, Database, FileText, Folder, Gear, House, Image, PaperPlaneTilt, PencilSimple, Robot, ShieldCheck, SidebarSimple, Tag } from "@phosphor-icons/react";

const homeItem=["首页","首页",House];
const contentItems=[["新建文章","写作",PencilSimple],["草稿箱","草稿箱",FileText],["文章管理","文章管理",Article],["媒体库","媒体库",Image]];
const publishItems=[["发布中心","发布中心",PaperPlaneTilt],["版本与恢复","版本回溯",Tag],["数据概览","数据",Database]];

const settings=[
  ["GitHub 设置","GitHub 设置",Database],
  ["博客设置","博客连接",Folder],
  ["图床设置","图床连接",Image],
  ["水印设置","水印设置",Image],
  ["AI 设置","工具箱",Robot],
  ["安全与备份","备份恢复",ShieldCheck],
];

export function MainSidebar({active,setActive,createArticle,treeOpen,setTreeOpen}){
  const [settingsOpen,setSettingsOpen]=useState(false),selected=target=>active===target;
  const all=[homeItem,...contentItems,...publishItems,...settings];
  const itemButton=([label,target,Icon])=><button key={target} title={label} className={`${selected(target)?"active":""} ${target==="写作"?"new-article-nav":""}`} aria-current={selected(target)?"page":undefined} onClick={()=>target==="写作"?createArticle():setActive(target)}><Icon/>{label}</button>;
  return <aside className="sidebar-shell codex-sidebar">
    <div className="codex-brand">{treeOpen&&<button onClick={()=>setActive("首页")}>Hans Blog</button>}<span/><button className="sidebar-toggle" title={treeOpen?"收起菜单":"展开菜单"} onClick={()=>setTreeOpen(!treeOpen)}><SidebarSimple/></button></div>
    {treeOpen?<div className="codex-menu"><nav className="codex-quick main-nav" aria-label="主导航">{itemButton(homeItem)}<div className="sidebar-group"><small>内容</small>{contentItems.map(itemButton)}</div><div className="sidebar-group"><small>发布与分析</small>{publishItems.map(itemButton)}</div></nav><div className="codex-section settings-section"><button className="menu-group-title" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(!settingsOpen)}><Gear/>设置{settingsOpen?<CaretDown/>:<CaretRight/>}</button>{settingsOpen&&<div className="menu-group-children">{settings.map(([label,target,Icon])=><button key={target} title={label} className={selected(target)?"active":""} aria-current={selected(target)?"page":undefined} onClick={()=>setActive(target)}><Icon/>{label}</button>)}</div>}</div></div>:<nav className="collapsed-nav" aria-label="主导航">{all.map(([label,target,Icon])=><button key={target} title={label} aria-label={label} className={selected(target)?"active":""} aria-current={selected(target)?"page":undefined} onClick={()=>target==="写作"?createArticle():setActive(target)}><Icon/></button>)}</nav>}
  </aside>
}
