import assert from "node:assert/strict";
import { test } from "node:test";
import { localImagePaths, matchLocalImages } from "../src/import-local-images.js";
import { validateArticle } from "../src/article-standard.js";

test("imports local Markdown images without touching remote URLs", () => {
  const markdown = "![封面](/Volumes/App Store/博客文稿-Markdown/Starryblu/fm.jpg)\n![图](images/001.jpg)\n![远程](https://img.example.com/a.jpg)";
  assert.deepEqual(localImagePaths(markdown), ["/Volumes/App Store/博客文稿-Markdown/Starryblu/fm.jpg", "images/001.jpg"]);
  const files = [
    { name: "fm.jpg", type: "image/jpeg", webkitRelativePath: "Starryblu/fm.jpg" },
    { name: "001.jpg", type: "image/jpeg", webkitRelativePath: "Starryblu/images/001.jpg" },
  ];
  assert.equal(matchLocalImages(markdown, files).matched.length, 2);
});

test("does not guess when two selected images have the same filename", () => {
  const files = [
    { name: "001.jpg", type: "image/jpeg", webkitRelativePath: "post/a/001.jpg" },
    { name: "001.jpg", type: "image/jpeg", webkitRelativePath: "post/b/001.jpg" },
  ];
  assert.deepEqual(matchLocalImages("![图](001.jpg)", files).unresolved, ["001.jpg"]);
});

test("publishing rejects an unresolved local image path containing spaces", () => {
  const errors = validateArticle({ title: "文章", slug: "post", date: "2026-10-27", content: "正文\n![图](/Volumes/App Store/post/001.jpg)" });
  assert.ok(errors.some(error => error.includes("本地图片路径")));
});
