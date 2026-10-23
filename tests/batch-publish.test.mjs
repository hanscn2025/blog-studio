import test from "node:test";
import assert from "node:assert/strict";
import { articleSelectionKey, selectPublishableArticles } from "../src/batch-publish.js";

test("batch selection includes only selected drafts and keeps each article distinct", () => {
  const current = { title: "当前草稿", status: "草稿" };
  const draft = { file: "draft.md", title: "另一篇", status: "草稿" };
  const published = { file: "live.md", title: "旧文章", status: "已发布" };
  const review = { file: "review.md", title: "审阅中", status: "审阅中" };
  assert.deepEqual(selectPublishableArticles([current, draft, published, review], [articleSelectionKey(current), "draft.md", "live.md", "review.md"]), [current, draft]);
});
