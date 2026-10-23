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
    if (request.method === "GET") return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map(key => `<Contents><Key>${key}</Key></Contents>`).join("")}</ListBucketResult>`, { status: 200 });
    assert.equal(request.headers.get("if-none-match"), "*");
    const key = url.pathname.split("/").slice(2).join("/");
    await request.arrayBuffer();
    if (keys.includes(key)) return new Response(null, { status: 412 });
    keys.push(key);
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
    const packageBytes = Buffer.from("software-package");
    const media = await imageHostApi(new Request(`${origin}/api/images/media/upload?slug=nas-guide&name=tool.zip`, { method: "POST", headers: { origin, "X-Upload-Size": String(packageBytes.length) }, body: packageBytes }), env);
    assert.equal(media.status, 200);
    assert.deepEqual(await media.json(), { key: "nas-guide/files/tool.zip", url: "https://img.example.test/nas-guide/files/tool.zip" });
    const duplicate = await imageHostApi(new Request(`${origin}/api/images/media/upload?slug=nas-guide&name=tool.zip`, { method: "POST", headers: { origin, "X-Upload-Size": String(packageBytes.length) }, body: packageBytes }), env);
    assert.equal(duplicate.status, 409);
    const listed = await imageHostApi(new Request(`${origin}/api/images/media?slug=nas-guide`), env);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).items.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});
