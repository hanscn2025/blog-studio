import assert from "node:assert/strict";
import test from "node:test";
import { cloudDraftsApi } from "../worker/cloud-drafts.js";
import { draftImagePrefix } from "../worker/image-host.js";

function database() {
  const rows = new Map();
  return { prepare(sql) { return { bind(...values) { return {
    async run() {
      if (sql.startsWith("INSERT OR IGNORE")) {
        const [owner, id, title, slug, date, value, updatedAt] = values, key = `${owner}:${id}`;
        if (rows.has(key)) return { meta: { changes: 0 } };
        rows.set(key, { owner, id, revision: 1, title, slug, date, value, updatedAt });
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE cloud_drafts")) {
        const [title, slug, date, value, updatedAt, owner, id, revision] = values, row = rows.get(`${owner}:${id}`);
        if (!row || row.revision !== revision) return { meta: { changes: 0 } };
        rows.set(`${owner}:${id}`, { ...row, title, slug, date, value, updatedAt, revision: revision + 1 });
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("DELETE FROM")) {
        const [owner, id, revision] = values, key = `${owner}:${id}`;
        if (rows.get(key)?.revision !== revision) return { meta: { changes: 0 } };
        rows.delete(key);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
    async first() { const [owner, id] = values; return rows.get(`${owner}:${id}`) || null; },
    async all() { const [owner] = values; return { results: [...rows.values()].filter(row => row.owner === owner).map(({ id, revision, title, slug, date, updatedAt }) => ({ id, revision, title, slug, date, updatedAt })) }; },
  }; }, async run() { return { meta: { changes: 0 } }; } }; } };
}

const origin = "https://admin.example.test";
const id = "4e51b621-7838-488e-a617-113f43719945";
const access = { sub: "owner-a" };
const request = (path, method = "GET", body) => new Request(`${origin}${path}`, { method, headers: body ? { Origin: origin, "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

test("cloud drafts are owner scoped and reject stale writes", async () => {
  const env = { DB: database() }, article = { draftId: id, title: "测试草稿", slug: "test", date: "2026-10-27", content: "正文", pendingImages: [] };
  let response = await cloudDraftsApi(request(`/api/drafts/${id}`, "PUT", { article, revision: 0 }), env, access);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);
  response = await cloudDraftsApi(request("/api/drafts"), env, { sub: "owner-b" });
  assert.equal((await response.json()).drafts.length, 0);
  response = await cloudDraftsApi(request(`/api/drafts/${id}`, "PUT", { article: { ...article, content: "改动" }, revision: 0 }), env, access);
  assert.equal(response.status, 409);
  response = await cloudDraftsApi(request(`/api/drafts/${id}`, "PUT", { article: { ...article, content: "改动" }, revision: 1 }), env, access);
  assert.equal((await response.json()).revision, 2);
  response = await cloudDraftsApi(request(`/api/drafts/${id}`, "DELETE", { revision: 1 }), env, access);
  assert.equal(response.status, 409);
  response = await cloudDraftsApi(request(`/api/drafts/${id}`, "DELETE", { revision: 2 }), env, access);
  assert.equal(response.status, 200);
});

test("cloud drafts reject browser-only images and cross-origin writes", async () => {
  const env = { DB: database() }, article = { draftId: id, title: "测试草稿", content: "![图](asset://4e51b621-7838-488e-a617-113f43719945)", pendingImages: [] };
  const rejected = await cloudDraftsApi(request(`/api/drafts/${id}`, "PUT", { article, revision: 0 }), env, access);
  assert.equal(rejected.status, 400);
  const otherOrigin = new Request(`${origin}/api/drafts/${id}`, { method: "PUT", headers: { Origin: "https://other.example.test", "Content-Type": "application/json" }, body: JSON.stringify({ article, revision: 0 }) });
  assert.equal((await cloudDraftsApi(otherOrigin, env, access)).status, 403);
});

test("cloud drafts retain the pending watermark choice for later publication", async () => {
  const env = { DB: database() }, imageId = "7e51b621-7838-488e-a617-113f43719945";
  const tempKey = `${await draftImagePrefix(access, id)}${imageId}.png`;
  const article = { draftId: id, title: "测试草稿", content: `![图](asset://${imageId})`, pendingImages: [{ id: imageId, name: "01.png", src: `https://img.example.test/${tempKey}`, tempKey, watermarkPending: true }] };
  assert.equal((await cloudDraftsApi(request(`/api/drafts/${id}`, "PUT", { article, revision: 0 }), env, access)).status, 200);
  const response = await cloudDraftsApi(request(`/api/drafts/${id}`), env, access);
  assert.equal((await response.json()).article.pendingImages[0].watermarkPending, true);
});
