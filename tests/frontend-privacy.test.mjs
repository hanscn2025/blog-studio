import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectedSiteProfile, initialArticles } from "../src/article-template.js";

test("frontend starts disconnected and does not bundle local blog content",()=>{
  const vite=readFileSync(new URL("../vite.config.mjs",import.meta.url),"utf8");
  assert.deepEqual(initialArticles,[]);
  assert.equal(detectedSiteProfile.root,"");
  assert.doesNotMatch(vite,/readFileSync|readdirSync|hexo-source|virtual:hans-blog-posts/);
});

test("writing menu starts a separately identified draft without replacing the current one",()=>{
  const sidebar=readFileSync(new URL("../src/MainSidebar.jsx",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  assert.equal((sidebar.match(/target==="写作"\?createArticle\(\):setActive\(target\)/g)||[]).length,2);
  assert.match(app,/createArticle=\(\)=>\{setArticle\(\{\.\.\.createArticleFromTemplate\(\),draftId:crypto\.randomUUID\(\),draftStarted:true\}\)/);
  assert.match(app,/setDrafts\(current=>upsertDraft\(current,article\)\)/);
  assert.match(app,/<MainSidebar[^>]+createArticle=\{createArticle\}/);
});
