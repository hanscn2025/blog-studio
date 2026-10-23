const list=value=>Array.isArray(value)?value.filter(Boolean):String(value||"").split(",").map(x=>x.trim()).filter(Boolean);
const quote=value=>JSON.stringify(String(value??""));

export function validateArticle(article){
  const errors=[];
  for(const key of ["title","slug","date"])if(!String(article[key]||"").trim())errors.push(`${key} 未填写`);
  if(article.slug&&!/^[a-z0-9][a-z0-9-]*$/.test(article.slug))errors.push("slug 只能使用小写字母、数字和连字符");
  if(/^asset:\/\//i.test(article.cover||""))errors.push("封面图片尚未上传图床");
  else if(article.cover&&!/^https?:\/\//i.test(article.cover))errors.push("封面必须是 HTTP(S) 地址");
  if(!String(article.content||"").trim())errors.push("正文为空");
  if(/^#\s+/m.test(article.content||""))errors.push("正文不能使用一级标题 #");
  if(/^####+\s+/m.test(article.content||""))errors.push("正文不能使用四级及更深标题");
  if(/<style\b|<font\b|\sstyle\s*=/i.test(article.content||""))errors.push("正文不能包含文章级样式");
  if(/!\[\[/.test(article.content||""))errors.push("Obsidian 本地图片必须先上传图床");
  if(/!\[[^\]]*\]\(data:image\//i.test(article.content||""))errors.push("仍有本地暂存图片未上传图床");
  if(/!\[[^\]]*\]\(asset:\/\//i.test(article.content||""))errors.push("仍有本地暂存图片未上传图床");
  for(const match of (article.content||"").matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)){
    if(!match[1].trim())errors.push("图片必须填写说明文字");
    if(!/^https?:\/\//i.test(match[2]))errors.push("正文图片必须使用 HTTP(S) 地址");
  }
  return [...new Set(errors)];
}

export function serializeArticle(article){
  const array=(name,values)=>`${name}:\n${list(values).map(value=>`  - ${quote(value)}`).join("\n")}`;
  const fields=[`title: ${quote(article.title)}`,`slug: ${quote(article.slug)}`,`date: ${quote(article.date)}`];
  if(Object.hasOwn(article,"updated"))fields.push(`updated: ${quote(article.updated||"")}`);
  if(Object.hasOwn(article,"description"))fields.push(`description: ${quote(article.description)}`);
  if(Object.hasOwn(article,"cover"))fields.push(`cover: ${quote(article.cover)}`);
  if(Object.hasOwn(article,"category"))fields.push(array("categories",[article.category]));
  if(Object.hasOwn(article,"tags"))fields.push(array("tags",article.tags));
  if(Object.hasOwn(article,"channels"))fields.push(array("nav_channels",list(article.channels).slice(0,2)));
  if(Object.hasOwn(article,"keywords"))fields.push(array("keywords",article.keywords));
  for(const [key,value] of [["top",Number(article.top)||0],["featured",Boolean(article.featured)],["comments",article.comments!==false],["toc",article.toc!==false],["video_as_cover",article.video_as_cover!==false]])if(Object.hasOwn(article,key))fields.push(`${key}: ${value}`);
  return `---\n${fields.join("\n")}\n---\n${String(article.content||"").trim()}\n`;
}

export function reconcilePublishedArticle(article, remoteArticle){
  if(article.remote || !article.slug || !remoteArticle?.file?.endsWith(`/${article.slug}.md`))return article;
  if(serializeArticle(article)!==remoteArticle.content)return article;
  return {...article,file:remoteArticle.file,status:"已提交 GitHub",remote:true};
}

export function normalizeRepositoryStatus(article){
  return article?.remote && article.status==="已发布" ? {...article,status:"已提交 GitHub"} : article;
}

export function articleListForDisplay(article, remoteArticles){
  if(!article?.title&&!article?.slug&&!article?.content)return remoteArticles;
  return article.remote && remoteArticles.some(item=>item.file===article.file) ? remoteArticles : [article,...remoteArticles.filter(item=>item.file!==article.file)];
}

export function sortArticlesForDisplay(articles, pinnedOnly=false){
  return [...articles].sort((a,b)=>(pinnedOnly ? (Number(b.top)||0)-(Number(a.top)||0) : 0) || String(b.date||"").localeCompare(String(a.date||"")) || String(a.file||a.slug||"").localeCompare(String(b.file||b.slug||""),"zh-CN"));
}
