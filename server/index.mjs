import { createServer } from "node:http";
import { inspectSite, listArticles, readArticle, resolveAllowedRoot, saveArticle } from "./site-service.mjs";

const allowedRoots=(process.env.BLOG_ALLOWED_ROOTS||"").split(":").filter(Boolean);
const host=process.env.BLOG_API_HOST||"127.0.0.1",port=Number(process.env.BLOG_API_PORT||8788);

function send(response,status,data){response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(data))}
async function body(request){let raw="";for await(const chunk of request){raw+=chunk;if(raw.length>65536)throw new Error("请求内容过大")}return JSON.parse(raw||"{}")}

export function createApiServer(options={}){
  const roots=options.allowedRoots||allowedRoots;
  return createServer(async(request,response)=>{
    try{
      const url=new URL(request.url,"http://localhost");
      if(request.method==="GET"&&url.pathname==="/api/health")return send(response,200,{ok:true,service:"hans-blog-publisher-api"});
      if(request.method==="POST"&&url.pathname==="/api/sites/inspect"){
        if(!roots.length)return send(response,503,{error:"未配置 BLOG_ALLOWED_ROOTS"});
        const input=await body(request),root=await resolveAllowedRoot(input.root,roots),site=await inspectSite(root);
        return send(response,200,{site});
      }
      if(request.method==="POST"&&url.pathname==="/api/articles"){
        if(!roots.length)return send(response,503,{error:"未配置 BLOG_ALLOWED_ROOTS"});
        const input=await body(request),root=await resolveAllowedRoot(input.root,roots),site=await inspectSite(root);
        return send(response,200,{site,articles:await listArticles(root,site.contentDir)});
      }
      if(request.method==="POST"&&url.pathname==="/api/article/read"){
        if(!roots.length)return send(response,503,{error:"未配置 BLOG_ALLOWED_ROOTS"});
        const input=await body(request),root=await resolveAllowedRoot(input.root,roots),site=await inspectSite(root);
        return send(response,200,{article:await readArticle(root,site.contentDir,input.path)});
      }
      if(request.method==="POST"&&url.pathname==="/api/article/save"){
        if(!roots.length)return send(response,503,{error:"未配置 BLOG_ALLOWED_ROOTS"});
        const input=await body(request),root=await resolveAllowedRoot(input.root,roots),site=await inspectSite(root);
        return send(response,200,{article:await saveArticle(root,site.contentDir,input.path,input.content,input.expectedHash||"")});
      }
      send(response,404,{error:"接口不存在"});
    }catch(error){send(response,400,{error:error.message||"请求失败"})}
  });
}

if(process.argv[1]===new URL(import.meta.url).pathname)createApiServer().listen(port,host,()=>console.log(`Blog API listening on http://${host}:${port}`));
