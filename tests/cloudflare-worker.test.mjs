import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/cloudflare.js";

test("deployed Worker fails closed before Access is configured", async () => {
  const response = await worker.fetch(new Request("https://admin.example.test/"), { ASSETS: { fetch: () => { throw new Error("assets must remain private"); } } });
  assert.equal(response.status, 503);
});

test("deployed Worker rejects requests without a signed Access token", async () => {
  const response = await worker.fetch(new Request("https://admin.example.test/api/github/settings"), {
    ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com",
    ACCESS_AUD: "app-aud",
    ASSETS: { fetch: () => { throw new Error("assets must remain private"); } },
  });
  assert.equal(response.status, 401);
});
