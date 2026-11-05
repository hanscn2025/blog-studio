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
  assert.doesNotMatch(source,/整站部署回退/);
  assert.match(source,/role="tablist"/);
  assert.match(source,/<SecurityBackup\s*\/>/);
  assert.doesNotMatch(source,/setActive\("安全与备份"\)/);
  const sidebar=readFileSync(new URL("../src/MainSidebar.jsx",import.meta.url),"utf8");
  assert.doesNotMatch(sidebar,/安全与备份|备份恢复/);
  assert.doesNotMatch(source,/<strong>尚未连接 GitHub 仓库<\/strong>/);
});
