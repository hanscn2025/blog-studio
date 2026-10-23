import { createArticleFromTemplate } from "./article-template.js";

export const demoRepository = "演示仓库（不会提交）";

export const demoArticles = [
  { title: "家庭服务器搭建记录", file: "source/_posts/homelab-guide.md", sha: "demo-1", date: "2026-10-18 09:30:00", category: "HomeLab", channels: ["nas-storage"], remote: true, content: "---\ntitle: 家庭服务器搭建记录\ndate: 2026-10-18 09:30:00\n---\n\n记录家庭服务器的搭建过程。\n" },
  { title: "OpenWrt 网络排错笔记", file: "source/_posts/openwrt-notes.md", sha: "demo-2", date: "2026-10-12 14:20:00", category: "网络与 Cloudflare", channels: ["soft-router"], remote: true, content: "---\ntitle: OpenWrt 网络排错笔记\ndate: 2026-10-12 14:20:00\n---\n\n整理网络排错步骤。\n" },
  { title: "旧文章：图片与视频整理", file: "source/_posts/media-notes.md", sha: "demo-3", date: "2026-08-01 11:00:00", category: "软件与效率", channels: [], remote: true, content: "---\ntitle: 旧文章：图片与视频整理\ndate: 2026-08-01 11:00:00\n---\n\n旧文内容，可试用编辑后保存为待提交更新。\n" },
];

export const demoDrafts = [
  { ...createArticleFromTemplate(), draftId: "demo-draft-1", title: "NAS 备份实践（演示草稿）", slug: "nas-backup-demo", date: "2026-10-19 09:00:00", content: "## 备份目标\n\n这是仅在本地预览显示的演示草稿。", demo: true },
  { ...createArticleFromTemplate(), draftId: "demo-draft-2", title: "Cloudflare 设置清单（演示草稿）", slug: "cloudflare-checklist-demo", date: "2026-10-18 16:00:00", content: "## 检查清单\n\n这是第二篇演示草稿，不会上传 GitHub。", demo: true },
];
