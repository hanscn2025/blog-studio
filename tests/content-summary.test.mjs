import test from "node:test";
import assert from "node:assert/strict";
import { contentSummary } from "../src/content-summary.js";

test("content overview counts loaded articles without duplicating the open article",()=>{
  const snapshot=[{file:"one.md",status:"已发布"},{file:"two.md",status:"草稿"}];
  assert.deepEqual(contentSummary(snapshot,{file:"one.md",status:"草稿"}),{total:2,drafts:2,published:0,hasLocalDraft:false});
  assert.deepEqual(contentSummary(snapshot,{title:"未命名文章",content:"",status:"草稿"}),{total:2,drafts:1,published:1,hasLocalDraft:false});
  assert.deepEqual(contentSummary(snapshot,{title:"新文章",content:"正文",status:"草稿"}),{total:3,drafts:2,published:1,hasLocalDraft:true});
});
