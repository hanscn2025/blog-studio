import assert from "node:assert/strict";
import test from "node:test";
import { plainDescription } from "../src/article-description.js";

test("描述从首段正文提取并跳过标题、图片和代码", () => {
  assert.equal(plainDescription("# 标题\n\n![封面](asset://one)\n\n正文 **重点**与[链接](https://example.com)。\n\n```js\nsecret()\n```"), "正文 重点与链接。");
});
