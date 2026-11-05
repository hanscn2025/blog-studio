import test from "node:test";
import assert from "node:assert/strict";
import { parseReleaseBackups, releaseBackupsApi } from "../worker/release-backups.js";

test("production archive listing includes dated filename and excludes other roles", () => {
  const xml = `<ListBucketResult><Contents><Key>development/v1.4.0/hans-blog-development-v1.4.0.tar.gz</Key><LastModified>2026-10-24T10:00:00Z</LastModified></Contents><Contents><Key>production/v1.4.0/hans-blog-production-v1.4.0.tar.gz</Key><LastModified>2026-10-24T11:00:00Z</LastModified><Size>1048576</Size></Contents></ListBucketResult>`;
  assert.deepEqual(parseReleaseBackups(xml), [{ tag: "v1.4.0", archive: "hans-blog-production-v1.4.0.tar.gz", filename: "hans-blog-production-v1.4.0-2026-10-24.tar.gz", uploadedAt: "2026-10-24T11:00:00Z", size: 1048576 }]);
});

test("backup API fails closed without private read-only credentials", async () => {
  const response = await releaseBackupsApi(new Request("https://example.com/api/backups/releases"), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).configured, false);
});

test("download rejects paths outside a version archive", async () => {
  const env = { BACKUP_R2_ACCOUNT_ID: "a".repeat(32), BACKUP_R2_BUCKET: "release-backups", BACKUP_R2_ACCESS_KEY_ID: "test", BACKUP_R2_SECRET_ACCESS_KEY: "test" };
  const response = await releaseBackupsApi(new Request("https://example.com/api/backups/download?tag=..%2F..&archive=secret.tar.gz&date=2026-10-24"), env);
  assert.equal(response.status, 400);
});
