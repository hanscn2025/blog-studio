import { DownloadSimple, Key, ShieldCheck } from "@phosphor-icons/react";

export function SecurityBackup(){
  return <section className="module-page connection-page security-backup">
    <header className="module-title"><h1>安全与备份</h1><p>版本记录在 GitHub；备份是独立的恢复副本，不等于 Tag 或 Release。</p></header>
    <div className="security-list">
      <article><ShieldCheck/><div><strong>后台登录</strong><small>由部署侧 Cloudflare Access 管理；本页不能独立核验访问策略。</small></div><span>需核验</span></article>
      <article><Key/><div><strong>密钥存储</strong><small>GitHub App 私钥在后端加密保存；图床和 AI 密钥尚未接入。</small></div><span>部分接入</span></article>
      <article><DownloadSimple/><div><strong>仓库镜像备份</strong><small>保存 Git 历史的独立副本；目标位置和上次备份时间需由后端接入。</small></div><span>未配置</span></article>
      <article><DownloadSimple/><div><strong>后台配置备份</strong><small>导出站点配置与发布记录，不含明文密钥。</small></div><button disabled>导出（待接入）</button></article>
      <article><DownloadSimple/><div><strong>图床图片备份</strong><small>图片文件与对象清单需要独立备份，GitHub 版本不包含图床原图。</small></div><span>未配置</span></article>
    </div>
  </section>
}
