import test from "node:test";
import assert from "node:assert/strict";
import { repositorySiteProfile } from "../src/site-profile.js";

test("connected Hexo profile provides editor navigation and distinct article categories", () => {
  const settings = { repository: "owner/blog-source", site: { engine: "hexo", template: "scaffolds/post.md" } };
  const navigation = { status: "detected", channels: [{ key: "homelab", name: "HomeLab", level: 1 }] };
  const articles = [{ category: "网络与 Cloudflare" }, { category: "软件与效率" }, { category: "网络与 Cloudflare" }];
  assert.deepEqual(repositorySiteProfile(settings, navigation, articles), {
    engine: "hexo", template: "scaffolds/post.md", channels: navigation.channels,
    categories: ["软件与效率", "网络与 Cloudflare"], usesCategories: true,
    connectionStatus: "connected", repository: settings.repository,
  });
});
