import assert from "node:assert/strict";
import test from "node:test";
import { parseChannelNavigation, parseHexoMenu, parseHugoTomlMenu, parseHugoYamlMenu, readRepositoryNavigation } from "../worker/navigation.js";

const yaml = `enable: true
items:
  - key: homelab
    name: HomeLab
    children:
      - key: nas-storage
        name: NAS/存储
      - key: docker-apps
        name: Docker应用
  - key: more
    name: 更多
    url: /channel/more/
`;

test("reads channel tree without treating unrelated theme menu as article channels", () => {
  assert.deepEqual(parseChannelNavigation(yaml), [
    { key: "homelab", name: "HomeLab", level: 1 },
    { key: "nas-storage", name: "NAS/存储", level: 2, groupKey: "homelab" },
    { key: "docker-apps", name: "Docker应用", level: 2, groupKey: "homelab" },
    { key: "more", name: "更多", level: 1 },
  ]);
  assert.equal(parseChannelNavigation("menu:\n  首页: /\n"), null);
});

test("reads only an authorized repository navigation file", async () => {
  const calls = [];
  const result = await readRepositoryNavigation({ repository: "owner/source", site: { engine: "hexo", defaultBranch: "main" } }, "installation-token", async (url, options) => {
    calls.push({ url, method: options.method || "GET" });
    if (url.includes("/git/trees/")) return Response.json({ truncated: false, tree: [{ type: "blob", path: "source/_data/navigation.yml", size: yaml.length }] });
    return Response.json({ type: "file", encoding: "base64", size: yaml.length, content: Buffer.from(yaml).toString("base64") });
  });
  assert.equal(result.status, "detected");
  assert.equal(result.source, "source/_data/navigation.yml");
  assert.equal(result.channels.length, 4);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.method === "GET"));
  assert.match(calls[1].url, /\/repos\/owner\/source\/contents\/source\/_data\/navigation.yml\?ref=main$/);
});

test("other blogs without supported channel data are not reported as empty navigation", async () => {
  const result = await readRepositoryNavigation({ repository: "owner/source", site: { engine: "hugo", defaultBranch: "main" } }, "installation-token", async () => Response.json({ truncated: false, tree: [] }));
  assert.deepEqual(result, { status: "not_found", source: "", channels: [], candidates: [] });
});

test("discovers a different Hexo theme menu and permits an explicit read-only mapping", async () => {
  const menu = "menu:\n  发现:\n    首页: /\n    文章: /archives/\n  关于: /about/\n";
  assert.equal(parseHexoMenu(menu)?.length, 4);
  const config = { repository: "owner/source", site: { engine: "hexo", defaultBranch: "main" } };
  const mock = async url => url.includes("/git/trees/") ? Response.json({ truncated: false, tree: [
    { type: "blob", path: "_config.my-theme.yml", size: menu.length },
    { type: "blob", path: ".github/workflows/deploy.yml", size: 100 },
  ] }) : Response.json({ type: "file", encoding: "base64", size: menu.length, content: Buffer.from(menu).toString("base64") });
  const result = await readRepositoryNavigation(config, "installation-token", mock);
  assert.equal(result.source, "_config.my-theme.yml");
  assert.equal(result.format, "hexo-menu");
  assert.deepEqual(result.candidates, ["_config.my-theme.yml"]);
  const chosen = await readRepositoryNavigation(config, "installation-token", mock, { path: "_config.my-theme.yml", format: "hexo-menu" });
  assert.equal(chosen.confirmed, true);
  await assert.rejects(() => readRepositoryNavigation(config, "installation-token", mock, { path: ".github/workflows/deploy.yml", format: "hexo-menu" }), /配置文件范围/);
});

test("recognizes a Hugo TOML main menu without modifying the repository", async () => {
  const toml = "[menus]\n[[menus.main]]\nname = 'Home'\nidentifier = 'home'\n[[menus.main]]\nname = 'Guides'\nidentifier = 'guides'\nparent = 'home'\n";
  assert.deepEqual(parseHugoTomlMenu(toml), [
    { key: "home", name: "Home", level: 1 },
    { key: "guides", name: "Guides", level: 2, groupKey: "home" },
  ]);
  const calls = [];
  const result = await readRepositoryNavigation({ repository: "owner/hugo", site: { engine: "hugo", defaultBranch: "main" } }, "installation-token", async (url, options) => {
    calls.push(options.method || "GET");
    return url.includes("/git/trees/") ? Response.json({ truncated: false, tree: [{ type: "blob", path: "hugo.toml", size: toml.length }] }) : Response.json({ type: "file", encoding: "base64", size: toml.length, content: Buffer.from(toml).toString("base64") });
  });
  assert.equal(result.format, "hugo-toml");
  assert.equal(result.channels.length, 2);
  assert.deepEqual(calls, ["GET", "GET"]);
});

test("a manually entered data-file path works without a built-in filename rule", async () => {
  const custom = "items:\n  - key: docs\n    name: 文档\n";
  const config = { repository: "owner/source", site: { engine: "hexo", defaultBranch: "main" } };
  const mock = async url => url.includes("/git/trees/") ? Response.json({ truncated: false, tree: [{ type: "blob", path: "source/_data/sidebar.yml", size: custom.length }] }) : Response.json({ type: "file", encoding: "base64", size: custom.length, content: Buffer.from(custom).toString("base64") });
  const automatic = await readRepositoryNavigation(config, "installation-token", mock);
  assert.equal(automatic.status, "not_found");
  const selected = await readRepositoryNavigation(config, "installation-token", mock, { path: "source/_data/sidebar.yml", format: "channels" });
  assert.equal(selected.channels[0].name, "文档");
  await assert.rejects(() => readRepositoryNavigation(config, "installation-token", mock, { path: "../secret.yml", format: "channels" }), /配置文件范围/);
});

test("recognizes Hugo YAML menus.main in root and split configuration", async () => {
  const root = "menus:\n  main:\n  - name: Home\n    identifier: home\n  - name: Guides\n    identifier: guides\n    parent: home\n";
  const split = "main:\n- name: Home\n  identifier: home\n";
  assert.deepEqual(parseHugoYamlMenu(root), [
    { key: "home", name: "Home", level: 1 },
    { key: "guides", name: "Guides", level: 2, groupKey: "home" },
  ]);
  assert.deepEqual(parseHugoYamlMenu(split), [{ key: "home", name: "Home", level: 1 }]);
  const config = { repository: "owner/hugo", site: { engine: "hugo", defaultBranch: "main" } };
  const result = await readRepositoryNavigation(config, "installation-token", async url => url.includes("/git/trees/") ? Response.json({ truncated: false, tree: [{ type: "blob", path: "config/_default/menus.yaml", size: split.length }] }) : Response.json({ type: "file", encoding: "base64", size: split.length, content: Buffer.from(split).toString("base64") }));
  assert.equal(result.format, "hugo-yaml");
});
