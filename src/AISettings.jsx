import { useState } from "react";
import { Check, Cpu, Database, Key, Robot } from "@phosphor-icons/react";

const providers={
  OpenAI:{icon:Robot,endpoint:"https://api.openai.com/v1",model:"",hint:"使用 OpenAI API，模型名称由账户可用列表选择。"},
  DeepSeek:{icon:Database,endpoint:"https://api.deepseek.com",model:"deepseek-chat",hint:"使用 DeepSeek 官方兼容接口。"},
  "兼容 API":{icon:Cpu,endpoint:"",model:"",hint:"适用于提供 OpenAI 兼容接口的云服务。"},
  "本地模型":{icon:Cpu,endpoint:"http://127.0.0.1:11434/v1",model:"",hint:"适用于 Ollama 等本地 OpenAI 兼容服务。"},
};

export function AISettings({notify}){
  const [provider,setProvider]=useState("OpenAI"),[config,setConfig]=useState({...providers.OpenAI}),[apiKey,setApiKey]=useState("");
  const choose=name=>{setProvider(name);setConfig({...providers[name]});setApiKey("")};
  const Icon=providers[provider].icon;
  return <section className="module-page connection-page ai-settings">
    <header className="module-title"><h1>AI 设置</h1><p>连接模型服务，为编辑器提供续写、润色、摘要与 Markdown 检查。</p></header>
    <div className="connection-status"><span/><div><strong>尚未连接模型服务</strong><small>API 密钥不会保存在浏览器、日志或博客仓库中</small></div></div>
    <div className="provider-grid">
      {Object.entries(providers).map(([name,item])=>{const ProviderIcon=item.icon;return <button key={name} className={provider===name?"active":""} onClick={()=>choose(name)}><ProviderIcon/><span><strong>{name}</strong><small>{item.hint}</small></span>{provider===name&&<Check weight="bold"/>}</button>})}
    </div>
    <section className="ai-editor-sample">
      <header><div><strong>编辑器集成样板</strong><small>只展示交互结构，不会修改文章</small></div><span>预览</span></header>
      <div className="ai-sample-toolbar"><button>正文</button><button>粗体</button><button>链接</button><i/><button className="ai-entry"><Robot/>AI 写作</button></div>
      <div className="ai-sample-body">
        <article><h2>为什么需要发布后台</h2><p>让写作、构建与发布更清晰，也让版本能够随时回退。</p><p className="sample-selection">作为一个长期写作者，我希望有一个稳定、可控、轻量的发布流程。</p><div className="selection-menu"><button>润色</button><button>改写</button><button>扩写</button><button>提问</button></div></article>
        <aside><header><div><Robot/><strong>AI 建议</strong></div><button>×</button></header><div className="ai-actions"><button className="active">润色</button><button>续写</button><button>摘要</button><button>检查</button></div><label>要求<textarea defaultValue="保持原意，语言更自然、专业，不增加未经验证的信息。"/></label><div className="ai-diff"><small>修改预览</small><del>我希望有一个稳定、可控、轻量的发布流程。</del><ins>我需要一套稳定、可控且足够轻量的发布流程。</ins></div><footer><button>放弃</button><button className="apply" onClick={()=>notify("这是样板，确认设计后再接入编辑器")}>应用修改</button></footer></aside>
      </div>
    </section>
    <div className="settings-rows site-setup ai-form">
      <div className="ai-current"><Icon/><div><strong>{provider}</strong><small>{config.hint}</small></div></div>
      <label>API 地址<input value={config.endpoint} onChange={e=>setConfig({...config,endpoint:e.target.value})} placeholder="https://api.example.com/v1"/></label>
      <label>模型名称<input value={config.model} onChange={e=>setConfig({...config,model:e.target.value})} placeholder={provider==="本地模型"?"例如：deepseek-r1:8b":"输入或从接口获取模型"}/></label>
      {provider!=="本地模型"&&<label>API Key<div className="secret-input"><Key/><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="new-password" placeholder="提交后由后端加密保存"/></div></label>}
      <label>默认用途<select defaultValue="通用写作"><option>通用写作</option><option>文章润色</option><option>长文续写</option><option>Markdown 检查</option></select></label>
      <div className="ai-permissions"><strong>模型权限</strong><label><input type="checkbox" defaultChecked/>允许读取当前文章</label><label><input type="checkbox" defaultChecked/>修改前必须显示差异并确认</label><label><input type="checkbox"/>允许读取整个文章库</label></div>
      <div className="connection-actions"><button className="primary" onClick={()=>notify("AI 后端代理与认证接口尚未接入")}>保存并测试连接</button><button onClick={()=>notify("模型配置尚未提交到后端")}>仅保存配置</button></div>
    </div>
  </section>
}
