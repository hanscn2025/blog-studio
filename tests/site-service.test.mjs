import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectSite, listArticles, readArticle, resolveAllowedRoot, saveArticle } from "../server/site-service.mjs";

async function fixture(){
  const allowed=await mkdtemp(join(tmpdir(),"blog-api-")),root=join(allowed,"site");
  await mkdir(join(root,"source/_posts"),{recursive:true});
  await mkdir(join(root,"scaffolds"),{recursive:true});
  await writeFile(join(root,"package.json"),JSON.stringify({dependencies:{hexo:"1"},scripts:{build:"hexo generate"}}));
  await writeFile(join(root,"scaffolds/post.md"),"---\ntitle: {{ title }}\n---\n");
  await writeFile(join(root,"source/_posts/hello.md"),"---\ntitle: Hello\n---\n正文\n");
  return {allowed,root};
}

test("detects an allowed Hexo site and lists Markdown articles",async()=>{
  const {allowed,root}=await fixture();
  const safeRoot=await resolveAllowedRoot(root,[allowed]),site=await inspectSite(safeRoot),articles=await listArticles(safeRoot,site.contentDir);
  assert.equal(site.engine,"Hexo");assert.equal(site.contentDir,"source/_posts");assert.equal(articles[0].path,"source/_posts/hello.md");
});

test("rejects source paths outside the configured roots",async()=>{
  const {allowed}=await fixture();
  await assert.rejects(resolveAllowedRoot(tmpdir(),[allowed]),/允许范围/);
});

test("saves one explicit article and rejects stale overwrites",async()=>{
  const {root}=await fixture(),site=await inspectSite(root),path="source/_posts/hello.md";
  const original=await readArticle(root,site.contentDir,path),saved=await saveArticle(root,site.contentDir,path,"更新后的正文\n",original.hash);
  assert.equal((await readArticle(root,site.contentDir,path)).content,"更新后的正文\n");
  await assert.rejects(saveArticle(root,site.contentDir,path,"过期覆盖",original.hash),/其他程序修改/);
  assert.notEqual(saved.hash,original.hash);
});

test("rejects article paths outside the detected content directory",async()=>{
  const {root}=await fixture(),site=await inspectSite(root);
  await assert.rejects(readArticle(root,site.contentDir,"package.json"),/内容目录/);
});
