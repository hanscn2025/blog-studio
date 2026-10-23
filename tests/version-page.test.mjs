import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("version page reads article history and never presents a fake site rollback",()=>{
  const source=readFileSync(new URL("../src/VersionPage.jsx",import.meta.url),"utf8");
  assert.match(source,/api\("\/api\/github\/settings"\)/);
  assert.match(source,/已连接 \$\{connection\.repository\}/);
  assert.match(source,/\/api\/github\/history/);
  assert.match(source,/\/api\/github\/revision/);
  assert.match(source,/\/api\/github\/update/);
  assert.match(source,/当前后台未接入 Pages 部署记录与回退授权/);
  assert.doesNotMatch(source,/<strong>尚未连接 GitHub 仓库<\/strong>/);
});
