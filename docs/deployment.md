# Blog Studio 自托管部署教程

本教程适用于将公开的 Blog Studio 代码部署到**自己的私有 GitHub 仓库和 Cloudflare 账户**。后台与博客前台是两个独立项目；后台只能写入你明确列入白名单的博客源码仓库。本文区分新用户首次部署与现有 Worker 更新；请把自己账户的具体名称、ID 和版本记录留在私有部署仓。

## 0. 部署前准备

- 一个 Cloudflare 账户，并可管理 Workers、D1 与 Zero Trust Access。
- 一个私有 GitHub 部署仓；只从本公开仓的稳定 Release 引入应用代码。不要把个人 `wrangler.jsonc`、密钥或博客内容提交到公开仓。
- 本地 Node.js、npm 与 Wrangler 4。本文验证时使用 Wrangler `4.151.3`；云端构建环境的版本也应固定并先测试。
- 一个独立的博客**源码仓库**，以及仅安装到该仓的 GitHub App。不要把博客生产仓授权给后台。

成功标准：Worker 部署到预期账户和名称；未登录访问页面与 API 均被 Access 拦截；登录后能连接 GitHub App、读取授权仓库；写入白名单只包含目标源码仓。后两项必须由部署者用自己的账户实际验收，不能以命令运行成功代替。

## 1. 准备私有部署仓

从公开仓的稳定 Release 创建私有仓并克隆到本机。在私有仓根目录运行：

```bash
npm ci
npm test
npm run build
```

确认工作区干净，记下正在部署的 Git 提交和上游 Release。首次部署不建议直接把公开仓的 `main` 当作生产版本；以后升级也应先在私有仓测试，再部署。

## 2. 创建并绑定 D1

在正确的 Cloudflare 账户中运行 `npx wrangler whoami`，确认账号后创建独立数据库：

```bash
npx wrangler d1 create <your-studio-config-db>
```

把输出中的数据库名称和 `database_id` 填入私有仓的 `wrangler.jsonc`；绑定名必须保留 `DB`。同时把 `name` 改为自己的 Worker 名，把 `PUBLISH_ALLOWED_REPOSITORY` 设为唯一允许写入的 `owner/source-repo`。本公开仓的白名单为空，默认拒绝写入。

```jsonc
{
  "name": "<your-worker-name>",
  "vars": { "PUBLISH_ALLOWED_REPOSITORY": "<owner/source-repo>" },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "<your-studio-config-db>",
    "database_id": "<your-d1-id>"
  }]
}
```

上面只是相关字段示意：保留仓库原有的 `main`、`assets`、兼容性等配置，不要用这段覆盖整个文件。D1 里的 `settings` 表由后台首次使用相关设置接口时创建。

## 3. 部署安全门禁与 Worker

先运行 `npx wrangler deploy --dry-run`，核对输出中的 Worker 名、D1 绑定与写入白名单。然后运行 `npx wrangler deploy`。首次部署时尚未配置 Access 与必要 Secret，代码会返回 503；这只是防止误公开，不等于部署完成。

在 Cloudflare Zero Trust 的 Access 中，为**整个 Worker（包括所需的预览入口）**创建仅授权用户可进入的应用。确认保护范围包含管理页面和 `/api/*`，不要只保护首页。记录团队域名和该应用的 AUD，但不要把它们写进公开仓。按 Wrangler 提示交互式设置三个 Secret：

```bash
npx wrangler secret put CONFIG_ENCRYPTION_KEY
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

`CONFIG_ENCRYPTION_KEY` 必须是随机 32 字节的 Base64 字符串，并单独安全备份；不要放到 shell 历史、README、Issue 或 Git。Secret 更新会产生新的 Worker 版本，因此每次设置后都要重新检查部署状态。不要误把 GitHub App 的 PEM 放入这些 Cloudflare Secret；它通过受 Access 保护的后台页面验证并加密存储在 D1。

## 4. 连接博客源码仓库

在 GitHub 创建 App，仅安装到要管理的源码仓库，授予后台当前功能所需的最小 Contents 读写权限。登录受 Access 保护的后台，在「GitHub 设置」输入 App ID、安装 ID 和下载的 PEM 文件，验证并绑定源码仓库。不要将 App 安装到博客生产仓，也不要把 OAuth Client Secret 当成 PEM。

如需 R2 图床，再单独创建测试桶和限制到该桶的 Object Read & Write 凭据，在「图床设置」验证；公开图片地址需上传测试图片后再检查。R2 不是 Worker 初次部署的前提。

## 5. 验收与回退

1. `npx wrangler deployments list --name <your-worker-name>`：新版本应承载预期流量；记录版本 ID 与时间。
2. 未登录访问 Worker 首页和 `/api/github/settings`：两处均应跳转到 Access 登录，不应直接返回管理页面或配置 JSON。
3. 授权登录后，确认 GitHub 设置仍能读取绑定仓库；用**测试仓**验证一次读取、编辑与 SHA 冲突拒绝。GitHub 提交成功不等于博客已构建上线。
4. 如果新版本有问题，在 Cloudflare Workers 部署页选择上一个已知正常的版本回退；回退 Worker **不会**回退 GitHub 博客内容、D1 配置或 R2 文件。不要为了排障重置 D1 或重建加密密钥。

## 6. 可选：私有仓推送后自动部署

手动部署验收后，可在 Cloudflare Dashboard 打开现有 Worker → **Settings → Builds → Connect**，只连接自己的**私有部署仓**，生产分支选 `main`，根目录选仓库根目录。`wrangler.jsonc` 的 `name` 必须与现有 Worker 名一致。构建命令使用 `npm ci && npm test && npm run build`，部署命令使用 `npx wrangler deploy`。先确认私有仓里的 D1 绑定、白名单和 Worker 名仍正确，再推送一个受控提交触发构建，并在 Cloudflare Builds 与 Worker 部署列表分别核验成功。

公开仓 Release → 私有仓代码同步，与私有仓推送 → Cloudflare Worker 部署是**两条独立链路**。Fork 不会自动拉取上游，也不应把公开仓直接连到自己的正式 Worker。若不开启 Cloudflare Builds，继续按本教程手动部署即可。

## 本教程的验证边界

本教程的命令顺序经过一次**现有 Worker 更新**验证：测试、构建与预演通过；部署列表显示新版本承载全部流量；未登录访问首页和 GitHub 设置 API 均被 Access 拦截。首次创建账户、D1 和 Access 的全过程并未在同一次操作中重新演练。每位部署者仍需逐项检查自己的登录态读写、R2 上传和博客前台上线；Cloudflare Builds 连接也必须单独实测，不能由手动部署成功推断。

参考 Cloudflare 官方文档：[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)、[Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[D1 CLI](https://developers.cloudflare.com/workers/wrangler/commands/d1/)。
