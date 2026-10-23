import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { createAppJwt, deleteRepositoryArticle, installationToken, inspectInstalledRepository, listArticleHistory, listInstalledRepositories, listRepositoryArticles, readArticleRevision, readRepositoryArticle, updateRepositoryArticle } from "../worker/github-app.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: "pkcs1", format: "pem" }),
  GITHUB_INSTALLATION_ID: "123",
};

test("GitHub App JWT uses RS256 and a short expiry", () => {
  const token = createAppJwt(config.GITHUB_APP_ID, config.GITHUB_APP_PRIVATE_KEY, 1_000_000);
  const [header, payload, signature] = token.split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "RS256");
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), { iat: 940, exp: 1540, iss: "123456" });
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
});

test("installation token is requested without exposing the key", async () => {
  const calls = [];
  const token = await installationToken(config, async (url, options) => {
    calls.push({ url, method: options.method, authorization: options.headers.Authorization });
    return Response.json({ token: "temporary-token" });
  });
  assert.equal(token, "temporary-token");
  assert.equal(calls[0].url, "https://api.github.com/app/installations/123/access_tokens");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].authorization, /^Bearer eyJ/);
});

test("repository list contains only installation-visible repos", async () => {
  const repos = await listInstalledRepositories(config, async (url) => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    assert.match(url, /\/installation\/repositories\?per_page=100&page=1$/);
    return Response.json({ total_count: 1, repositories: [{ full_name: "owner/dev-blog", default_branch: "main", private: true }] });
  });
  assert.deepEqual(repos, [{ fullName: "owner/dev-blog", defaultBranch: "main", private: true }]);
});

test("recognizes an authorized Hexo repository without reading article bodies", async () => {
  const paths = [];
  const site = await inspectInstalledRepository(config, "owner/dev-blog", async url => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    if (url.includes("/installation/repositories?")) return Response.json({ total_count: 1, repositories: [{ full_name: "owner/dev-blog", default_branch: "main", private: true }] });
    paths.push(url);
    return new Response(null, { status: ["_config.yml", "source/_posts", "scaffolds/post.md"].some(path => url.includes(path)) ? 200 : 404 });
  });
  assert.equal(site.engine, "hexo");
  assert.equal(site.articleDir, "source/_posts");
  assert.equal(site.template, "scaffolds/post.md");
  assert.ok(paths.every(path => !path.includes("/source/_posts/") && !path.includes("/contents/.github/")));
});

test("rejects repositories outside the App installation", async () => {
  await assert.rejects(() => inspectInstalledRepository(config, "owner/production", async url => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    return Response.json({ total_count: 1, repositories: [{ full_name: "owner/dev-blog", default_branch: "main", private: true }] });
  }), /不在 GitHub App 授权范围内/);
});

test("reports which GitHub step returned 403 without exposing the private key", async () => {
  await assert.rejects(() => listInstalledRepositories(config, async () => Response.json({ message: "Resource not accessible by integration" }, { status: 403 })), error => {
    assert.match(error.message, /创建安装令牌失败 \(403\)/);
    assert.ok(!error.message.includes("PRIVATE KEY"));
    return true;
  });
});

test("lists only Markdown files in the recognized article directory", async () => {
  const bound = { ...config, repository: "owner/dev-blog", site: { articleDir: "source/_posts", defaultBranch: "main" } };
  const markdown = "---\ntitle: 真实文章标题\ncategories: OpenWrt 与软路由\nnav_channels:\n  - firmware-flashing\n  - soft-router\ndate: 2025-11-20 01:30:02\ntop: 22\n---\nPrivate body";
  const articles = await listRepositoryArticles(bound, async url => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    if (url.endsWith("/git/blobs/abc")) return Response.json({ encoding: "base64", content: Buffer.from(markdown).toString("base64") });
    assert.match(url, /\/git\/trees\/main\?recursive=1$/);
    return Response.json({ tree: [
      { type: "blob", path: "source/_posts/hello.md", size: 12, sha: "abc" },
      { type: "blob", path: "source/_drafts/private.md", size: 5, sha: "def" },
      { type: "blob", path: "source/_posts/photo.jpg", size: 9, sha: "ghi" },
    ], truncated: false });
  });
  assert.deepEqual(articles, [{ file: "source/_posts/hello.md", title: "真实文章标题", category: "OpenWrt 与软路由", channels: ["firmware-flashing", "soft-router"], date: "2025-11-20 01:30:02", updated: "2025-11-20 01:30:02", top: 22, size: 12, sha: "abc" }]);
  assert.ok(!JSON.stringify(articles).includes("Private body"));
});

test("orders pinned articles first, then newest dated articles", async () => {
  const bound = { ...config, repository: "owner/dev-blog", site: { articleDir: "source/_posts", defaultBranch: "main" } };
  const contents = {
    old: "---\ntitle: Old\ndate: 2025-01-01 00:00:00\nupdated: 2026-12-31 00:00:00\n---\nOld",
    new: "---\ntitle: New\ndate: 2026-10-12 11:11:00\n---\nNew",
    pinned: "---\ntitle: Pinned\ndate: 2024-01-01 00:00:00\ntop: 20\n---\nPinned",
  };
  const articles = await listRepositoryArticles(bound, async url => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    const blob = url.match(/\/git\/blobs\/(old|new|pinned)$/)?.[1];
    if (blob) return Response.json({ encoding: "base64", content: Buffer.from(contents[blob]).toString("base64") });
    return Response.json({ tree: Object.keys(contents).map(name => ({ type: "blob", path: `source/_posts/${name}.md`, size: 100, sha: name })), truncated: false });
  });
  assert.deepEqual(articles.map(item => item.title), ["Pinned", "New", "Old"]);
});

test("reads one authorized Markdown file and rejects path traversal", async () => {
  const bound = { ...config, repository: "owner/dev-blog", site: { articleDir: "source/_posts", defaultBranch: "main" } };
  const article = await readRepositoryArticle(bound, "source/_posts/hello.md", async url => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    assert.match(url, /\/contents\/source\/_posts\/hello.md\?ref=main$/);
    return Response.json({ type: "file", encoding: "base64", size: 12, sha: "abc", content: Buffer.from("---\ntitle: Hi\n---\nBody").toString("base64") });
  });
  assert.match(article.content, /title: Hi/);
  await assert.rejects(() => readRepositoryArticle(bound, "source/_posts/../secret.md", async () => { throw new Error("must not request GitHub"); }), /文章路径无效/);
});

test("updates only the matching SHA and preserves unknown front matter in raw Markdown", async () => {
  const bound = { ...config, repository: "owner/dev-blog", site: { articleDir: "source/_posts", defaultBranch: "main" } };
  const sha = "a".repeat(40);
  const old = "---\ntitle: Old\ncustom_theme_flag: true\n---\nOld body\n";
  const changed = old.replace("Old body", "New body");
  let written;
  const request = async (url, options) => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    if (url.includes("/contents/source/_posts/hello.md") && options?.method === "PUT") {
      written = JSON.parse(options.body);
      return Response.json({ content: { sha: "b".repeat(40) }, commit: { sha: "c".repeat(40) } });
    }
    if (url.includes("/contents/source/_posts/hello.md")) return Response.json({ type: "file", encoding: "base64", size: old.length, sha, content: Buffer.from(old).toString("base64") });
    throw new Error(`Unexpected URL: ${url}`);
  };
  await assert.rejects(() => updateRepositoryArticle(bound, "source/_posts/../hello.md", sha, changed, "", request), /路径无效/);
  await assert.rejects(() => updateRepositoryArticle(bound, "source/_posts/hello.md", "d".repeat(40), changed, "", request), /已更新/);
  assert.equal(written, undefined);
  const result = await updateRepositoryArticle(bound, "source/_posts/hello.md", sha, changed, "Fix body", request);
  assert.equal(result.commit, "c".repeat(40));
  assert.equal(written.sha, sha);
  assert.equal(Buffer.from(written.content, "base64").toString(), changed);
  assert.match(changed, /custom_theme_flag: true/);
});

test("deletes only a current article in the bound directory with matching SHA", async () => {
  const bound = { ...config, repository: "owner/dev-blog", site: { articleDir: "source/_posts", defaultBranch: "main" } };
  const sha = "a".repeat(40);
  let deleted;
  const request = async (url, options) => {
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    if (options?.method === "DELETE") { deleted = JSON.parse(options.body); return Response.json({ commit: { sha: "b".repeat(40) } }); }
    return Response.json({ type: "file", encoding: "base64", size: 20, sha, content: Buffer.from("---\ntitle: Test\n---\nBody").toString("base64") });
  };
  await assert.rejects(() => deleteRepositoryArticle(bound, "source/_posts/../secret.md", sha, request), /路径无效/);
  await assert.rejects(() => deleteRepositoryArticle(bound, "source/_posts/hello.md", "c".repeat(40), request), /已更新/);
  assert.equal(deleted, undefined);
  const result = await deleteRepositoryArticle(bound, "source/_posts/hello.md", sha, request);
  assert.equal(result.commit, "b".repeat(40));
  assert.deepEqual({ sha: deleted.sha, branch: deleted.branch }, { sha, branch: "main" });
});

test("article history and revision stay inside the bound article directory", async () => {
  const bound = { ...config, repository: "owner/dev-blog", site: { articleDir: "source/_posts", defaultBranch: "main" } };
  const commit = "a".repeat(40);
  const content = "---\ntitle: Old\n---\nOld body";
  const calls = [];
  const request = async url => {
    calls.push(url);
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-token" });
    if (url.includes("/commits?")) return Response.json([{ sha: commit, commit: { message: "Edit article\nDetails", author: { date: "2026-10-12T00:00:00Z" } } }]);
    return Response.json({ type: "file", encoding: "base64", size: content.length, sha: "b".repeat(40), content: Buffer.from(content).toString("base64") });
  };
  assert.deepEqual(await listArticleHistory(bound, "source/_posts/hello.md", request), [{ sha: commit, message: "Edit article", date: "2026-10-12T00:00:00Z" }]);
  assert.match(calls.find(url => url.includes("/commits?")), /path=source%2F_posts%2Fhello.md/);
  assert.equal((await readArticleRevision(bound, "source/_posts/hello.md", commit, request)).content, content);
  await assert.rejects(() => readArticleRevision(bound, "source/_posts/../secret.md", commit, request), /路径无效/);
  await assert.rejects(() => readArticleRevision(bound, "source/_posts/hello.md", "bad", request), /提交 SHA 无效/);
});
