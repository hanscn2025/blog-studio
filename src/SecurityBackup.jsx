import { useEffect, useState } from "react";
import { DownloadSimple, ArrowClockwise } from "@phosphor-icons/react";

const sizeLabel = bytes => bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "大小未知";
const link = (item, type) => `/api/backups/download?${new URLSearchParams({ tag: item.tag, archive: item.archive, date: item.uploadedAt.slice(0, 10), type })}`;
const previewItem = { tag: "v1.2.3", archive: "blog-production-v1.2.3.tar.gz", filename: "blog-production-v1.2.3-2026-10-24.tar.gz", uploadedAt: "2026-10-24T10:30:00Z", size: 18_874_368 };

export function SecurityBackup() {
  const [state, setState] = useState({ loading: true, items: [], error: "", truncated: false });
  const preview = import.meta.env.DEV && !!state.error;
  const items = preview ? [previewItem] : state.items;
  const refresh = () => {
    setState(current => ({ ...current, loading: true, error: "" }));
    fetch("/api/backups/releases", { credentials: "same-origin" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "备份清单读取失败");
      setState({ loading: false, items: result.items || [], truncated: !!result.truncated, error: "" });
    }).catch(error => setState({ loading: false, items: [], truncated: false, error: error.message }));
  };
  useEffect(refresh, []);

  return <section className="version-section security-backup">
    <div className="backup-body">
      <div className="backup-heading"><div><h2>生产仓备份</h2><p>仅下载已有版本，不执行恢复。文件名中的日期为备份上传日期。</p></div><button type="button" onClick={refresh} disabled={state.loading}><ArrowClockwise size={16}/>刷新</button></div>
      {!state.loading && preview && <p className="backup-message" role="status">本地演示数据，非真实备份；下载按钮已禁用。</p>}
      {state.loading ? <p className="backup-message" role="status">正在读取备份清单…</p> : state.error && !preview ? <p className="backup-message" role="alert">{state.error}。未配置专用只读凭据的部署无法列出真实备份。</p> : items.length === 0 ? <p className="backup-message">未找到生产版本备份。普通文章提交不会生成版本快照。</p> : <div className="backup-list">{items.map(item => <article key={`${item.tag}/${item.archive}`}><div><strong>{item.tag}{preview && <em className="backup-demo-label">演示</em>}</strong><span>{item.filename}</span><small>{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString("zh-CN") : "日期未知"} · {sizeLabel(item.size)}</small></div><div className="backup-actions">{preview ? <><button type="button" disabled><DownloadSimple size={16}/>下载备份</button><button type="button" disabled>下载校验文件</button></> : <><a href={link(item, "archive")}><DownloadSimple size={16}/>下载备份</a><a href={link(item, "checksum")}>下载校验文件</a></>}</div></article>)}</div>}
      {state.truncated && <p className="backup-message" role="status">备份较多，当前仅显示桶清单的前 1000 项；旧版本请在 R2 中查询。</p>}
      <details className="backup-footnote"><summary>下载后如何校验？</summary><p>把压缩包和同名校验文件放在同一目录，运行 <code>sha256sum -c 文件名.sha256</code>。</p></details>
    </div>
  </section>;
}
