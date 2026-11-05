import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("publishing stays in the editor flow without a standalone menu or batch placeholder", () => {
  const sidebar = readFileSync(new URL("../src/MainSidebar.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/PublishPage.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(sidebar, /\["发布中心","发布中心"/);
  assert.doesNotMatch(app, /home-shortcuts[^\n]*setActive\("发布中心"\)/);
  assert.match(app, /openPublish=\{\(\)=>setActive\("发布中心"\)\}/);
  assert.match(app, /publishing\.current=true;openPublish\(\)/);
  assert.doesNotMatch(page, /batchArticles|批量提交/);
  assert.match(page, /validateArticle\(article\)/);
  assert.match(page, /!imagesPending && !busy && !published/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /部署构建：待核验/);
  assert.match(page, /博客页面：待核验/);
});

test("unfinished AI is hidden and home only shows actionable status", () => {
  const sidebar = readFileSync(new URL("../src/MainSidebar.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(sidebar, /AI 设置/);
  assert.doesNotMatch(app, /<AISettings/);
  assert.match(app, /error \|\| pending.length > 0/);
  assert.match(app, /home-grid-solo/);
});
