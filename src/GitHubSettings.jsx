import { useEffect, useState } from "react";
import { GithubLogo, LockKey, ShieldCheck } from "@phosphor-icons/react";

async function api(path, options) {
  const response = await fetch(path, { ...options, headers: options?.body ? { "Content-Type": "application/json" } : undefined, credentials: "same-origin" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result;
}

export function GitHubSettings({ notify }) {
  const [status, setStatus] = useState(null);
  const [appId, setAppId] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [keyFileName, setKeyFileName] = useState("");
  const [repositories, setRepositories] = useState([]);
  const [repository, setRepository] = useState("");
  const [site, setSite] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api("/api/github/settings").then(result => {
      if (!active) return;
      setStatus(result.connected ? "已连接 GitHub App" : "尚未连接 GitHub App");
      setAppId(result.appId);
      setInstallationId(result.installationId);
      setRepository(result.repository);
      if (result.connected) api("/api/github/repositories").then(data => active && setRepositories(data.repositories)).catch(error => active && setStatus(error.message));
    }).catch(error => active && setStatus(error.message));
    return () => { active = false; };
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const result = await api("/api/github/settings", { method: "POST", body: JSON.stringify({ appId, installationId, privateKey }) });
      setRepositories(result.repositories);
      setPrivateKey("");
      setKeyFileName("");
      setStatus("已连接 GitHub App");
      notify("连接成功，请选择博客源码仓库");
    } catch (error) { notify(error.message); } finally { setPrivateKey(""); setKeyFileName(""); setBusy(false); }
  }

  async function inspect() {
    setBusy(true);
    try {
      const result = await api("/api/github/repository", { method: "POST", body: JSON.stringify({ repository }) });
      setSite(result.site);
      notify("博客源码仓库已识别");
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  }

  return <section className="module-page connection-page github-settings">
    <header className="module-title"><h1>GitHub 设置</h1><p>先部署自己的后台，再连接 GitHub App 和博客源码仓库。</p></header>
    <div className="connection-status"><span/><div><strong>{status || "正在检查连接…"}</strong><small>只列出 GitHub App 已获授权的仓库；私钥不会写入浏览器存储或博客仓库。</small></div></div>
    <div className="settings-rows site-setup">
      <div className="ai-current"><GithubLogo/><div><strong>连接 GitHub App</strong><small>在 GitHub 创建 App、安装到指定源码仓库后，在此填写信息。</small></div></div>
      <label>App ID<input inputMode="numeric" value={appId} onChange={event => setAppId(event.target.value)} placeholder="GitHub App ID"/></label>
      <label>安装 ID<input inputMode="numeric" value={installationId} onChange={event => setInstallationId(event.target.value)} placeholder="Installation ID"/></label>
      <label>PEM 私钥<input type="file" accept=".pem" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size > 10000) { notify("PEM 文件过大，请确认选择的是 GitHub App 私钥"); return; }
        setPrivateKey(await file.text());
        setKeyFileName(file.name);
      }}/><small>{keyFileName ? `已选择 ${keyFileName}，内容不会显示在页面上` : "选择 GitHub App 下载的 .pem 文件；无需复制或展示私钥内容"}</small></label>
      <div className="connection-actions"><button className="primary" disabled={busy || !privateKey} onClick={connect}>验证并保存连接</button></div>
      <label>博客源码仓库<select value={repository} onChange={event => { setRepository(event.target.value); setSite(null); }}><option value="">请选择已授权的仓库</option>{repositories.map(item => <option key={item.fullName} value={item.fullName}>{item.fullName}</option>)}</select></label>
      <div className="connection-actions"><button disabled={busy || !repository} onClick={inspect}>识别并绑定仓库</button></div>
      <div className="detected-summary"><strong>{site ? `${site.engine.toUpperCase()} · ${site.repository.fullName}` : "等待识别博客源码"}</strong><span>{site ? `文章目录：${site.articleDir}；模板：${site.template || "未找到"}` : "选择仓库后验证博客类型、文章目录和模板"}</span></div>
      <div className="github-boundary"><ShieldCheck/><div><strong>权限边界</strong><small>仅访问该 App 安装时获授权的仓库；生产仓库无需授权。</small></div></div>
      <div className="github-boundary"><LockKey/><div><strong>凭据存储</strong><small>私钥在后端加密保存，GitHub 安装令牌按需短期获取，不返回浏览器。</small></div></div>
    </div>
  </section>;
}
