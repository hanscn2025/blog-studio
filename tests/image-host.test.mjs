import assert from "node:assert/strict";
import test from "node:test";
import { imageHostApi, imageObjectKey } from "../worker/image-host.js";

test("image keys use the exact article slug and three-digit names", () => {
  assert.equal(imageObjectKey("nas-guide", 1, "image/webp"), "nas-guide/001.webp");
  assert.equal(imageObjectKey("nas-guide", 12, "image/jpeg"), "nas-guide/012.jpg");
  assert.throws(() => imageObjectKey("../other", 1, "image/png"));
  assert.throws(() => imageObjectKey("nas-guide", 1000, "image/png"));
});

test("image settings reject cross-origin writes and never expose credentials", async () => {
  const env = { DB: {}, CONFIG_ENCRYPTION_KEY: "configured" };
  const response = await imageHostApi(new Request("https://admin.example.test/api/images/settings", { method: "POST", headers: { origin: "https://other.example.test" } }), env);
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /configured/);
});

test("verified R2 settings stay encrypted and uploads allocate short names without overwrite", async () => {
  let sealed;
  const keys = [];
  const objects = new Map();
  const env = {
    CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    DB: { prepare(sql) { return {
      async run() {},
      bind(...values) { return {
        async first() { return sealed ? { value: sealed } : null; },
        async run() { if (sql.startsWith("INSERT")) sealed = values[1]; },
      }; },
    }; } },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const request = new Request(input);
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (!url.search) {
        const key = url.pathname.split("/").slice(2).join("/");
        return objects.has(key) ? new Response(objects.get(key).body, { status: 200, headers: { "Content-Type": objects.get(key).type } }) : new Response(null, { status: 404 });
      }
      const prefix = url.searchParams.get("prefix") || "";
      const matching = keys.filter(key => key.startsWith(prefix));
      const grouped = url.searchParams.get("delimiter") === "/";
      const folders = grouped ? [...new Set(matching.map(key => key.slice(prefix.length).split("/")).filter(parts => parts.length > 1).map(parts => `${prefix}${parts[0]}/`))] : [];
      const files = grouped ? matching.filter(key => !key.slice(prefix.length).includes("/")) : matching;
      const xml = `<ListBucketResult><IsTruncated>false</IsTruncated>${folders.map(folder => `<CommonPrefixes><Prefix>${encodeURIComponent(folder)}</Prefix></CommonPrefixes>`).join("")}${files.map(key => `<Contents><Key>${grouped ? encodeURIComponent(key) : key}</Key></Contents>`).join("")}</ListBucketResult>`;
      return new Response(xml, { status: 200 });
    }
    if (request.method === "DELETE") {
      const key = url.pathname.split("/").slice(2).join("/");
      objects.delete(key);
      keys.splice(keys.indexOf(key), 1);
      return new Response(null, { status: 204 });
    }
    assert.equal(request.headers.get("if-none-match"), "*");
    const key = url.pathname.split("/").slice(2).join("/");
    const body = await request.arrayBuffer();
    if (keys.includes(key)) return new Response(null, { status: 412 });
    keys.push(key);
    objects.set(key, { body, type: request.headers.get("content-type") });
    return new Response(null, { status: 200 });
  };
  try {
    const origin = "https://admin.example.test";
    const settings = await imageHostApi(new Request(`${origin}/api/images/settings`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ accountId: "a".repeat(32), bucket: "test-bucket", publicUrl: "https://img.example.test", accessKeyId: "access-secret", secretAccessKey: "private-secret" }) }), env);
    assert.equal(settings.status, 200);
    assert.doesNotMatch(sealed, /private-secret|access-secret/);
    assert.doesNotMatch(await settings.text(), /private-secret|access-secret/);
    const image = "data:image/png;base64," + Buffer.from("png-bytes").toString("base64");
    for (let number = 1; number <= 2; number++) {
      const response = await imageHostApi(new Request(`${origin}/api/images/upload`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ slug: "nas-guide", src: image }) }), env);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).key, `nas-guide/${String(number).padStart(3, "0")}.png`);
    }
    assert.deepEqual(keys, ["nas-guide/001.png", "nas-guide/002.png"]);
    const draftId = "4e51b621-7838-488e-a617-113f43719945";
    const uploadTemp = await imageHostApi(new Request(`${origin}/api/images/draft-upload`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ draftId, src: image }) }), env, { sub: "owner-a" });
    assert.equal(uploadTemp.status, 200);
    const temp = await uploadTemp.json();
    assert.match(temp.key, /^_drafts\//);
    const sourceRequest = sub => imageHostApi(new Request(`${origin}/api/images/draft-source`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ draftId, tempKey: temp.key }) }), env, { sub });
    assert.equal((await sourceRequest("owner-b")).status, 400);
    const source = await sourceRequest("owner-a");
    assert.equal(source.status, 200);
    assert.equal((await source.json()).src, image);
    const foreign = await imageHostApi(new Request(`${origin}/api/images/draft-cleanup`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ draftId, keys: [temp.key] }) }), env, { sub: "owner-b" });
    assert.equal(foreign.status, 400);
    const promote = await imageHostApi(new Request(`${origin}/api/images/draft-promote`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ draftId, slug: "nas-guide", tempKey: temp.key }) }), env, { sub: "owner-a" });
    assert.equal(promote.status, 200);
    assert.equal((await promote.json()).key, "nas-guide/003.png");
    assert.ok(objects.has(temp.key), "promotion retains temporary image until publication succeeds");
    const cleanup = await imageHostApi(new Request(`${origin}/api/images/draft-cleanup`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ draftId, keys: [temp.key] }) }), env, { sub: "owner-a" });
    assert.equal(cleanup.status, 200);
    assert.ok(!objects.has(temp.key));
    assert.ok(objects.has("nas-guide/003.png"), "published image is retained");
    const packageBytes = Buffer.from("software-package");
    const media = await imageHostApi(new Request(`${origin}/api/images/media/upload?slug=nas-guide&name=tool.zip`, { method: "POST", headers: { origin, "X-Upload-Size": String(packageBytes.length) }, body: packageBytes }), env);
    assert.equal(media.status, 200);
    assert.deepEqual(await media.json(), { key: "nas-guide/files/tool.zip", url: "https://img.example.test/nas-guide/files/tool.zip" });
    const duplicate = await imageHostApi(new Request(`${origin}/api/images/media/upload?slug=nas-guide&name=tool.zip`, { method: "POST", headers: { origin, "X-Upload-Size": String(packageBytes.length) }, body: packageBytes }), env);
    assert.equal(duplicate.status, 409);
    keys.push("2024/11/legacy.jpg", "BPB/fm.jpg");
    const root = await imageHostApi(new Request(`${origin}/api/images/media`), env);
    assert.deepEqual((await root.json()).folders, ["nas-guide/", "2024/", "BPB/"]);
    const year = await imageHostApi(new Request(`${origin}/api/images/media?prefix=2024%2F`), env);
    assert.deepEqual((await year.json()).folders, ["2024/11/"]);
    const legacy = await imageHostApi(new Request(`${origin}/api/images/media?prefix=2024%2F11%2F`), env);
    assert.equal((await legacy.json()).items[0].key, "2024/11/legacy.jpg");
    const listed = await imageHostApi(new Request(`${origin}/api/images/media?slug=nas-guide`), env);
    assert.equal(listed.status, 200);
    const listedData = await listed.json();
    assert.deepEqual(listedData.folders, ["nas-guide/files/"]);
    assert.equal(listedData.items.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});
