import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Cloudflare Worker has no preview route and keeps its account portable", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.PUBLISH_ALLOWED_REPOSITORY, "");
  assert.equal(config.account_id, undefined);
  assert.equal(config.route, undefined);
  assert.equal(config.routes, undefined);
  assert.equal(config.assets.directory, "./dist/client");
});
