import assert from "node:assert/strict";
import { generateKeyPairSync, webcrypto } from "node:crypto";
import test from "node:test";
import { githubSettingsApi } from "../worker/github-settings.js";

globalThis.crypto ||= webcrypto;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" });
const rows = new Map();
const db = { prepare(sql) { return {
  bind(...values) { return { first: async () => rows.has(values[0]) ? { value: rows.get(values[0]) } : null, run: async () => { rows.set(values[0], values[1]); } }; },
  run: async () => { assert.match(sql, /CREATE TABLE/); },
}; } };
const env = { DB: db, CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
const request = (path, body, origin = "https://admin.example") => new Request(`https://admin.example${path}`, { method: body ? "POST" : "GET", headers: body ? { Origin: origin, "Content-Type": "application/json" } : {}, body: body && JSON.stringify(body) });
const github = async url => {
  if (url.endsWith("/access_tokens")) return Response.json({ token: "short-lived-token" });
  if (url.includes("/installation/repositories")) return Response.json({ total_count: 1, repositories: [{ full_name: "owner/blog-source", default_branch: "main", private: true }] });
  if (url.includes("/git/trees/")) return Response.json({ truncated: false, tree: [{ type: "blob", path: "source/_posts/hello.md", size: 20, sha: "abc" }, { type: "blob", path: "source/_data/navigation.yml", size: 52, sha: "nav" }] });
  if (url.includes("/contents/source/_data/navigation.yml")) return Response.json({ type: "file", encoding: "base64", size: 52, content: Buffer.from("items:\n  - key: home\n    name: 首页\n").toString("base64") });
  if (url.includes("/git/blobs/abc")) return Response.json({ encoding: "base64", content: Buffer.from("---\ntitle: Hello\n---\nBody").toString("base64") });
  if (url.includes("/contents/source/_posts/hello.md")) return Response.json({ type: "file", encoding: "base64", size: 20, sha: "abc", content: Buffer.from("---\ntitle: Hello\n---\nBody").toString("base64") });
  return new Response(null, { status: ["_config.yml", "source/_posts", "scaffolds/post.md"].some(path => url.includes(path)) ? 200 : 404 });
};

test("rejects cross-origin writes before touching credentials", async () => {
  const response = await githubSettingsApi(request("/api/github/settings", { appId: "1" }, "https://evil.example"), env, github);
  assert.equal(response.status, 403);
  assert.equal(rows.size, 0);
});

test("verifies, encrypts, lists and binds an installed source repository", async () => {
  const saved = await githubSettingsApi(request("/api/github/settings", { appId: "42", installationId: "9", privateKey: pem }), env, github);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).repositories[0].fullName, "owner/blog-source");
  assert.ok(!rows.get("github").includes("PRIVATE KEY"));
  const status = await githubSettingsApi(request("/api/github/settings"), env, github);
  assert.deepEqual(await status.json(), { connected: true, appId: "42", installationId: "9", repository: "", site: null });
  const bound = await githubSettingsApi(request("/api/github/repository", { repository: "owner/blog-source" }), env, github);
  assert.equal((await bound.json()).site.engine, "hexo");
  const after = await githubSettingsApi(request("/api/github/settings"), env, github);
  assert.equal((await after.json()).repository, "owner/blog-source");
  const navigation = await githubSettingsApi(request("/api/github/navigation"), env, github);
  assert.equal((await navigation.json()).channels[0].name, "首页");
  const chosen = await githubSettingsApi(request("/api/github/navigation", { path: "source/_data/navigation.yml", format: "channels" }), env, github);
  assert.equal((await chosen.json()).confirmed, true);
  assert.ok(rows.get("github").includes("."));
  const listed = await githubSettingsApi(request("/api/github/articles"), env, github);
  assert.equal((await listed.json()).articles[0].file, "source/_posts/hello.md");
  const opened = await githubSettingsApi(request("/api/github/article?path=source%2F_posts%2Fhello.md"), env, github);
  assert.match((await opened.json()).article.content, /title: Hello/);
});

test("publishes only a new article to the bound repository", async () => {
  await githubSettingsApi(request("/api/github/settings", { appId: "42", installationId: "9", privateKey: pem }), env, github);
  await githubSettingsApi(request("/api/github/repository", { repository: "owner/blog-source" }), env, github);
  const article = { title: "Test", slug: "new-test", date: "2026-10-12 12:00:00", content: "Body" };
  let written = null;
  const githubWrite = async (url, options) => {
    if (url.includes("/contents/source/_posts/new-test.md")) {
      if (options?.method !== "PUT") return new Response(null, { status: 404 });
      written = { url, body: JSON.parse(options.body) };
      return Response.json({ commit: { sha: "abc123" } });
    }
    return github(url, options);
  };
  const safeEnv = { ...env, PUBLISH_ALLOWED_REPOSITORY: "owner/blog-source" };
  const result = await githubSettingsApi(request("/api/github/publish", { article, message: "Add test article" }), safeEnv, githubWrite);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).published.commit, "abc123");
  assert.match(written.url, /owner\/blog-source\/contents\/source\/_posts\/new-test\.md$/);
  assert.equal(written.body.branch, "main");
  assert.match(Buffer.from(written.body.content, "base64").toString(), /title: "Test"/);
  const denied = await githubSettingsApi(request("/api/github/publish", { article }), { ...env, PUBLISH_ALLOWED_REPOSITORY: "owner/other" }, githubWrite);
  assert.equal(denied.status, 403);
  assert.equal((await githubSettingsApi(request("/api/github/publish", { article }), env, githubWrite)).status, 403);
  const existing = await githubSettingsApi(request("/api/github/publish", { article }), safeEnv, async (url, options) => {
    if (url.includes("/contents/source/_posts/new-test.md")) return Response.json({ type: "file" });
    return github(url, options);
  });
  assert.equal(existing.status, 400);
  assert.match((await existing.json()).error, /已存在/);
});

test("existing article updates stay inside the sandbox repository allowlist", async () => {
  await githubSettingsApi(request("/api/github/settings", { appId: "42", installationId: "9", privateKey: pem }), env, github);
  await githubSettingsApi(request("/api/github/repository", { repository: "owner/blog-source" }), env, github);
  const denied = await githubSettingsApi(request("/api/github/update", { path: "source/_posts/hello.md", sha: "a".repeat(40), content: "---\ntitle: Hi\n---\nBody" }), { ...env, PUBLISH_ALLOWED_REPOSITORY: "owner/other" }, github);
  assert.equal(denied.status, 403);
  assert.equal((await githubSettingsApi(request("/api/github/update", { path: "source/_posts/hello.md", sha: "a".repeat(40), content: "---\ntitle: Hi\n---\nBody" }), env, github)).status, 403);
});

test("article deletion is disabled without an explicit sandbox repository allowlist", async () => {
  await githubSettingsApi(request("/api/github/settings", { appId: "42", installationId: "9", privateKey: pem }), env, github);
  await githubSettingsApi(request("/api/github/repository", { repository: "owner/blog-source" }), env, github);
  const input = { path: "source/_posts/hello.md", sha: "a".repeat(40) };
  assert.equal((await githubSettingsApi(request("/api/github/delete", input), env, github)).status, 403);
  assert.equal((await githubSettingsApi(request("/api/github/delete", input), { ...env, PUBLISH_ALLOWED_REPOSITORY: "owner/other" }, github)).status, 403);
});

test("history is read-only and revision requests reject invalid commit IDs", async () => {
  await githubSettingsApi(request("/api/github/settings", { appId: "42", installationId: "9", privateKey: pem }), env, github);
  await githubSettingsApi(request("/api/github/repository", { repository: "owner/blog-source" }), env, github);
  const history = await githubSettingsApi(request("/api/github/history?path=source%2F_posts%2Fhello.md"), env, async (url, options) => {
    if (url.includes("/commits?")) return Response.json([{ sha: "a".repeat(40), commit: { message: "Edit", author: { date: "2026-10-12T00:00:00Z" } } }]);
    return github(url, options);
  });
  assert.equal((await history.json()).commits[0].message, "Edit");
  const invalid = await githubSettingsApi(request("/api/github/revision?path=source%2F_posts%2Fhello.md&commit=bad"), env, github);
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /提交 SHA 无效/);
});
