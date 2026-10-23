# Blog Studio · 博客管理后台

面向 Hexo / Hugo 博客的写作与发布管理后台。当前仍是早期版本，**不是完整发布链已验收的声明**。未配置 Cloudflare Access 校验时，页面和接口都会拒绝访问。

## 当前具备的功能

- Markdown 写作、预览、格式工具、`.md` 导入和浏览器内自动保存多篇草稿；草稿与待提交更新只在当前浏览器保存。
- 文章标题、Slug、日期、描述、封面、标签等属性编辑；导航字段按站点配置显示。
- 粘贴图片后暂存为短 `asset://` 引用；可按文章 Slug 上传到已连接的 R2 图床，并可配置新插入正文图片的水印。媒体库可列出及上传同一图床的图片和软件包。
- 文章 Markdown 与属性的本地校验；新文章和已有文章更新可提交到明确允许的源码仓库，并保留 GitHub 文件 SHA 冲突保护。GitHub 提交不等于正式博客上线。
- 独立的本地 API 可在限定目录内识别 Hexo / Hugo、列出和读取文章，并在内容哈希匹配时保存，避免覆盖已变化的文件。该 API **尚未接入管理页面，也没有登录认证**。
- Cloudflare Worker 的 GitHub 设置接口：验证 GitHub App 安装权限、加密保存 PEM、列出授权仓库并识别 Hexo/Hugo 基础目录。该接口在 Access 未配置时拒绝请求。
- 文章管理从已绑定仓库读取 Markdown；编辑后先存为当前浏览器的“更新未提交”，人工确认后才写回原路径。版本页可读取单篇文章历史，但不提供整站回退。

## 尚未完成

- PR 审核、开发仓到生产仓的版本晋级、构建检查、正式域名上线确认和整站回退；这些不能由一次 GitHub 内容提交替代。
- AI 服务和独立备份；媒体库引用检查只覆盖当前已加载的仓库文章与当前浏览器内容，不能证明文件在所有地方均未使用。
- 真实浏览量统计；当前首页只显示当前仓库文章及当前浏览器草稿等可确认数据。
- Cloudflare Access 应用及登录策略需由每个部署账户独立配置。`wrangler.jsonc` 关闭预览 URL；即使启用 workers.dev，缺少 Access 团队域名和应用 AUD 时 Worker 也会返回 503。

因此，后台必须持续受 Access 保护，正式写入只允许开发仓；不要把尚未核验的构建、同步或流量数据标为成功。

## 本地运行

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

测试和构建：

```bash
npm test
npm run build
```

`npm run api` 启动的是仅供本机开发的文件 API，默认监听 `127.0.0.1:8788`；使用前需设置 `BLOG_ALLOWED_ROOTS`。它没有身份认证，不应对外开放。

## 项目结构

- `src/`：管理页面、编辑器和文章校验。
- `server/`：本地博客目录识别与文章文件 API。
- `worker/`：受 Cloudflare Access JWT 校验保护的页面和 GitHub 连接接口；`worker/index.js` 保留独立静态入口。
- `tests/`：文章、文件边界及静态资源行为测试。

## 每位用户的部署与连接顺序

1. 复制本仓库到自己的独立部署仓，创建自己的 D1，并在私有部署仓的 `wrangler.jsonc` 中填写自己的 Worker 名称、D1 名称及 ID，以及唯一允许写入的博客源码仓库 `PUBLISH_ALLOWED_REPOSITORY`。公开仓的该字段留空，默认拒绝写入。先在自己的 Cloudflare 账户部署 Worker；在配置 Access 前地址只会返回 503。
2. 为 Worker 设置随机 32 字节 Base64 `CONFIG_ENCRYPTION_KEY` Secret；不要把值提交到仓库。备份该密钥，否则加密配置将无法恢复。
3. 在 Cloudflare Access 创建仅本人可登录的应用并保护后台域名；为 Worker 配置 `ACCESS_TEAM_DOMAIN`（例如 `https://team.cloudflareaccess.com`）和该应用的 `ACCESS_AUD`。Worker 会验证 JWT 签名、签发者、有效期和受众。访问保护未配置时返回 503。
4. 在自己的 GitHub 账户创建 GitHub App，授予博客**源码仓库**最小 Contents 读写及 Pull requests 读写权限，安装时仅选择要管理的仓库。生成并下载 App 的 PEM 私钥。
5. 登录后台「GitHub 设置」，填写 App ID、安装 ID 和 PEM。后台先获取短期安装令牌验证权限，然后将 PEM 用 AES-GCM 加密保存在 D1；浏览器不持久化、不回显私钥。选择授权仓库并确认识别结果。

GitHub App 的 OAuth Client Secret 不是 PEM 私钥，这套安装令牌流程不需要填写 Client Secret。私钥不要提交到后台代码仓库或博客源码仓库。开发仓库只需授权 App；生产仓库不需要授权后台写入。

后台应独立于博客前台：GitHub 保存后台代码，Cloudflare 承载受保护的管理页面与 API；博客构建仍由各自仓库的流程负责。不要将私有部署配置、密钥或站点数据回传到这个公开仓。真实授权和权限边界完成前，不接入生产仓写权限。
