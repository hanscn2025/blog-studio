import { createHash } from "node:crypto";
import { readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

export async function resolveAllowedRoot(candidate,allowedRoots){
  if(!candidate||!isAbsolute(candidate))throw new Error("源码目录必须使用绝对路径");
  const target=await realpath(candidate),roots=await Promise.all(allowedRoots.map(root=>realpath(resolve(root))));
  if(!roots.some(root=>target===root||target.startsWith(`${root}${sep}`)))throw new Error("源码目录不在允许范围内");
  if(!(await stat(target)).isDirectory())throw new Error("源码目录不是文件夹");
  return target;
}

async function exists(path){try{await stat(path);return true}catch{return false}}

export async function inspectSite(root){
  const packageJson=await readFile(join(root,"package.json"),"utf8").then(JSON.parse).catch(()=>({}));
  const packages={...packageJson.dependencies,...packageJson.devDependencies};
  const isHexo=Boolean(packages.hexo)||await exists(join(root,"_config.yml"));
  const isHugo=await Promise.any(["hugo.toml","hugo.yaml","hugo.json","config.toml"].map(name=>stat(join(root,name)))).then(()=>true).catch(()=>false);
  if(!isHexo&&!isHugo)throw new Error("未识别到 Hexo 或 Hugo 站点");
  const engine=isHexo?"Hexo":"Hugo",contentDir=isHexo?"source/_posts":"content",template=isHexo?"scaffolds/post.md":"archetypes/default.md";
  if(!await exists(join(root,contentDir)))throw new Error(`未找到文章目录 ${contentDir}`);
  return {engine,root,contentDir,template:await exists(join(root,template))?template:"",buildCommand:packageJson.scripts?.build||(isHexo?"hexo generate":"hugo")};
}

export async function listArticles(root,contentDir){
  const base=join(root,contentDir),articles=[];
  async function walk(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile()&&/\.md$/i.test(entry.name)){
        const info=await stat(path);
        articles.push({path:relative(root,path),name:entry.name,size:info.size,updatedAt:info.mtime.toISOString()});
      }
    }
  }
  await walk(base);
  return articles.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}

const hash=content=>createHash("sha256").update(content).digest("hex");
async function articlePath(root,contentDir,path){
  const realRoot=await realpath(root),base=await realpath(join(realRoot,contentDir)),target=resolve(realRoot,path);
  if(extname(target).toLowerCase()!==".md"||!(target===base||target.startsWith(`${base}${sep}`)))throw new Error("文章路径不在内容目录内");
  const parent=await realpath(dirname(target));
  if(!(parent===base||parent.startsWith(`${base}${sep}`)))throw new Error("文章路径不在内容目录内");
  return target;
}

export async function readArticle(root,contentDir,path){
  const target=await articlePath(root,contentDir,path),content=await readFile(target,"utf8");
  return {path:relative(root,target),content,hash:hash(content)};
}

export async function saveArticle(root,contentDir,path,content,expectedHash){
  const target=await articlePath(root,contentDir,path),current=await readFile(target,"utf8").catch(error=>error.code==="ENOENT"?null:Promise.reject(error));
  if(current!==null&&expectedHash!==hash(current))throw new Error("文章已被其他程序修改，请重新载入后再保存");
  if(current===null&&expectedHash)throw new Error("文章状态已变化，请重新载入后再保存");
  const temp=`${target}.publisher-tmp`;
  await writeFile(temp,String(content),{encoding:"utf8",flag:"wx"});
  try{await rename(temp,target)}catch(error){throw new Error(`保存失败：${error.message}`)}
  return {path:relative(root,target),hash:hash(String(content))};
}
