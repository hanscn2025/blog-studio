import test from "node:test";
import assert from "node:assert/strict";
import { mergeRepositoryArticle, parseRepositoryArticle } from "../src/repository-article.js";

const raw = `---\ntitle: 旧文章\ndate: 2026-10-18 09:30:00\ncategories:\n  - HomeLab\nnav_channels:\n  - nas-storage\ncustom_setting:\n  nested: keep-me\n---\n\n旧正文。\n`;

test("仓库文章编辑正文时保留 Front Matter 和原文格式", () => {
  const before = parseRepositoryArticle(raw, "source/_posts/old-post.md");
  assert.equal(before.content, "\n旧正文。\n");
  assert.equal(mergeRepositoryArticle(raw, before, before), raw);
  const result = mergeRepositoryArticle(raw, before, { ...before, content: "\n新正文。\n" });
  assert.equal(result, raw.replace("旧正文。", "新正文。"));
});

test("修改标题及导航时保留未知嵌套属性", () => {
  const before = parseRepositoryArticle(raw, "source/_posts/old-post.md");
  const result = mergeRepositoryArticle(raw, before, { ...before, title: "新标题", channels: ["soft-router"] });
  assert.match(result, /title: "新标题"/);
  assert.match(result, /nav_channels:\n  - "soft-router"/);
  assert.match(result, /custom_setting:\n  nested: keep-me/);
  assert.equal(parseRepositoryArticle(result, "source/_posts/old-post.md").title, "新标题");
});

test("没有 Front Matter 时拒绝可能破坏原文的保存", () => {
  assert.equal(parseRepositoryArticle("正文", "source/_posts/a.md"), null);
  assert.throws(() => mergeRepositoryArticle("正文", {}, {}), /Front Matter/);
});
