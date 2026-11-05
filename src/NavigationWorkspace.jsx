import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CaretDown, CaretRight, Folder, Plus } from "@phosphor-icons/react";

const example = [
  { key: "guides", name: "使用指南", level: 1 },
  { key: "getting-started", name: "入门教程", level: 2, groupKey: "guides" },
  { key: "tools", name: "工具与资源", level: 1 },
];

export function NavigationWorkspace({ navigation, demo = false }) {
  const initial = demo ? example : navigation?.channels || [];
  const [draft, setDraft] = useState(initial);
  const [review, setReview] = useState(false);
  const [collapsed, setCollapsed] = useState([]);
  useEffect(() => { setDraft(initial); setReview(false); setCollapsed([]); }, [navigation, demo]);
  const editable = demo || (navigation?.status === "detected" && navigation.confirmed && navigation.format === "channels");
  const parents = draft.filter(item => item.level === 1);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const keys = draft.map(item => item.key);
  const error = draft.some(item => !item.name.trim()) ? "栏目名称不能为空" : new Set(keys).size !== keys.length ? "栏目标识不能重复" : draft.some(item => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.key)) ? "栏目标识只能使用小写字母、数字和连字符" : "";

  function update(key, patch) { setDraft(items => items.map(item => item.key === key ? { ...item, ...patch } : item)); setReview(false); }
  function add(level, parent) {
    const base = level === 1 ? "new-section" : "new-page";
    let key = base, number = 2;
    while (keys.includes(key)) key = `${base}-${number++}`;
    setDraft(items => [...items, { key, name: "新栏目", level, ...(parent ? { groupKey: parent } : {}) }]);
    setReview(false);
  }
  function remove(key) {
    if (!window.confirm("从预览草稿中移除此栏目？原仓库不会修改。")) return;
    setDraft(items => items.filter(item => item.key !== key && item.groupKey !== key));
    setReview(false);
  }
  function move(key, direction) {
    setDraft(items => {
      const item = items.find(entry => entry.key === key);
      const siblings = items.filter(entry => entry.level === item.level && entry.groupKey === item.groupKey);
      const index = siblings.findIndex(entry => entry.key === key);
      const target = index + direction;
      if (target < 0 || target >= siblings.length) return items;
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      if (item.level === 1) return siblings.flatMap(parent => [parent, ...items.filter(child => child.groupKey === parent.key)]);
      let sibling = 0;
      return items.map(entry => entry.level === 2 && entry.groupKey === item.groupKey ? siblings[sibling++] : entry);
    });
    setReview(false);
  }

  return <section className="navigation-manager navigation-workspace">
    <header><div><h2>导航管理 {demo && <span className="navigation-demo-tag">本地示例</span>}</h2><p>{demo ? "用通用示例体验编辑；不会连接或修改你的博客。" : navigation?.status === "detected" ? `来源：${navigation.source} · ${editable ? "已确认，可预览编辑" : "当前只读"}` : "未识别到可编辑导航，请先确认博客的导航来源。"}</p></div>{editable && <button onClick={() => add(1)}><Plus/>新增一级栏目</button>}</header>
    {!editable && <p className="navigation-readonly-note">{navigation?.status === "detected" ? "此格式暂不支持安全写回，或尚未确认来源；保留只读，避免误改主题配置。" : "连接博客后会识别导航配置；无法识别时可手动指定文件，不能自动创建无效导航。"}</p>}
    <div className="navigation-list">{parents.map(parent => <article key={parent.key}><div className="navigation-row parent"><button type="button" className="navigation-toggle" aria-label={`${collapsed.includes(parent.key) ? "展开" : "收起"}${parent.name}的子栏目`} aria-expanded={!collapsed.includes(parent.key)} onClick={() => setCollapsed(items => items.includes(parent.key) ? items.filter(key => key !== parent.key) : [...items, parent.key])}>{collapsed.includes(parent.key) ? <CaretRight/> : <CaretDown/>}</button><Folder/>{editable ? <input aria-label="一级栏目名称" value={parent.name} onChange={event => update(parent.key, { name: event.target.value })}/> : <strong>{parent.name}</strong>}{editable && <div className="navigation-row-actions"><button className="navigation-move" onClick={() => move(parent.key, -1)} aria-label={`上移${parent.name}`} title="上移"><ArrowUp/></button><button className="navigation-move" onClick={() => move(parent.key, 1)} aria-label={`下移${parent.name}`} title="下移"><ArrowDown/></button><button onClick={() => add(2, parent.key)}>新增子栏目</button><button className="danger" onClick={() => remove(parent.key)}>移除</button></div>}</div>{!collapsed.includes(parent.key) && draft.filter(item => item.groupKey === parent.key).map(child => <div className="navigation-row child" key={child.key}><span className="navigation-branch"/><span/>{editable ? <input aria-label="子栏目名称" value={child.name} onChange={event => update(child.key, { name: event.target.value })}/> : <span>{child.name}</span>}{editable && <div className="navigation-row-actions"><button className="navigation-move" onClick={() => move(child.key, -1)} aria-label={`上移${child.name}`} title="上移"><ArrowUp/></button><button className="navigation-move" onClick={() => move(child.key, 1)} aria-label={`下移${child.name}`} title="下移"><ArrowDown/></button><button className="danger" onClick={() => remove(child.key)}>移除</button></div>}</div>)}</article>)}{!parents.length && <p className="navigation-empty">暂无栏目</p>}</div>
    {editable && <div className="navigation-review"><p>{error || (changed ? "有未保存的导航调整；这里只预览，不会写入 GitHub。" : "尚无改动。改名不会改变现有文章归属或网址。")}</p><div><button disabled={!changed || !!error} onClick={() => setReview(true)}>预览变更</button><button disabled={!changed} onClick={() => { setDraft(initial); setReview(false); }}>撤销改动</button></div>{review && !error && <div className="navigation-diff"><strong>变更预览</strong>{draft.filter(item => !initial.some(old => old.key === item.key)).map(item => <p key={item.key}>＋ 新增：{item.name}</p>)}{initial.filter(item => !draft.some(next => next.key === item.key)).map(item => <p key={item.key}>－ 移除：{item.name}</p>)}{draft.filter(item => initial.some(old => old.key === item.key && old.name !== item.name)).map(item => <p key={item.key}>修改：{initial.find(old => old.key === item.key).name} → {item.name}</p>)}{draft.filter(item => initial.some(old => old.key === item.key && old.groupKey !== item.groupKey)).map(item => <p key={`group-${item.key}`}>移动：{item.name}</p>)}{draft.map(item => item.key).join("|") !== initial.map(item => item.key).join("|") && <p>栏目顺序已调整</p>}<small>本地预览不提交博客仓库。实际保存还需连接仓库、校验文件版本与构建结果。</small></div>}</div>}
  </section>;
}
