import test from "node:test";
import assert from "node:assert/strict";
import { pendingKey, removeDraft, savePending, upsertDraft } from "../src/draft-store.js";
import { draftsWithoutImageData } from "../src/draft-image-store.js";

test("draft metadata omits bulky image data without losing references", () => {
  const drafts = [{ draftId: "one", content: "![图](asset://image-1)", pendingImages: [{ id: "image-1", name: "a.png", src: "data:image/png;base64,AAAA" }] }];
  assert.deepEqual(draftsWithoutImageData(drafts), [{ draftId: "one", content: "![图](asset://image-1)", pendingImages: [{ id: "image-1", name: "a.png" }] }]);
  assert.equal(drafts[0].pendingImages[0].src, "data:image/png;base64,AAAA");
});

test("multiple new drafts keep distinct identities and deletion affects one", () => {
  const first = { draftId: "one", title: "第一篇", content: "正文" };
  const second = { draftId: "two", title: "第二篇", content: "正文" };
  const drafts = upsertDraft(upsertDraft([], first), second);
  assert.deepEqual(drafts.map(item => item.draftId), ["two", "one"]);
  assert.deepEqual(upsertDraft(drafts, { ...first, title: "已修改" }).map(item => item.title), ["第二篇", "已修改"]);
  assert.deepEqual(removeDraft(drafts, "one"), [second]);
});

test("existing article updates stay under repository and original path", () => {
  const source = { file: "source/_posts/old.md", sha: "current-sha", content: "原文", title: "旧文" };
  const pending = savePending({}, "test/repo", source, "修改后的原文");
  assert.equal(pending[pendingKey("test/repo", source.file)].sha, "current-sha");
  assert.equal(pending[pendingKey("test/repo", source.file)].content, "修改后的原文");
  assert.deepEqual(savePending(pending, "test/repo", source, "原文"), {});
  assert.equal(pending[pendingKey("other/repo", source.file)], undefined);
});
