import { useEffect, useRef, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import "./date-time-picker.css";

const pad = number => String(number).padStart(2, "0");
const dateParts = value => {
  const match = String(value || "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  const now = new Date();
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0) } : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes(), second: 0 };
};

export function DateTimePicker({ value, onChange }) {
  const picker = useRef(null);
  const trigger = useRef(null);
  const [selected, setSelected] = useState(() => dateParts(value));
  const [visibleMonth, setVisibleMonth] = useState(() => { const date = dateParts(value); return new Date(date.year, date.month - 1, 1); });
  useEffect(() => { if (picker.current?.matches(":popover-open")) return; const date = dateParts(value); setSelected(date); setVisibleMonth(new Date(date.year, date.month - 1, 1)); }, [value]);
  const open = () => {
    const date = dateParts(value);
    setSelected(date);
    setVisibleMonth(new Date(date.year, date.month - 1, 1));
    const anchor = trigger.current.getBoundingClientRect();
    const sidebar = trigger.current.closest(".right-properties").getBoundingClientRect();
    picker.current.style.width = `${sidebar.width}px`;
    picker.current?.showPopover();
    const panel = picker.current.getBoundingClientRect();
    picker.current.style.left = `${sidebar.left}px`;
    picker.current.style.top = `${anchor.bottom + panel.height + 8 <= innerHeight ? anchor.bottom + 8 : Math.max(12, anchor.top - panel.height - 8)}px`;
  };
  const changeMonth = offset => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const days = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const save = () => { onChange(`${selected.year}-${pad(selected.month)}-${pad(selected.day)} ${pad(selected.hour)}:${pad(selected.minute)}:${pad(selected.second)}`); picker.current?.hidePopover(); };
  return <>
    <button type="button" ref={trigger} className="date-time-trigger" onClick={open} aria-label="选择发布日期和时间" aria-haspopup="dialog"><span>{value || "选择发布日期和时间"}</span><CalendarBlank size={17} /></button>
    <div popover="auto" role="dialog" className="date-time-dialog" ref={picker} aria-label="选择发布日期和时间">
      <div className="date-time-panel">
        <header><strong>选择发布日期</strong><button type="button" onClick={() => picker.current?.hidePopover()} aria-label="关闭日期选择">×</button></header>
        <div className="date-time-month"><button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}><CaretLeft /></button><strong>{visibleMonth.getFullYear()} 年 {visibleMonth.getMonth() + 1} 月</strong><button type="button" aria-label="下个月" onClick={() => changeMonth(1)}><CaretRight /></button></div>
        <div className="date-time-calendar">{["日", "一", "二", "三", "四", "五", "六"].map(day => <span key={day}>{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => { const day = index + 1, active = selected.year === visibleMonth.getFullYear() && selected.month === visibleMonth.getMonth() + 1 && selected.day === day; return <button type="button" key={day} className={active ? "selected" : ""} aria-label={`${visibleMonth.getFullYear()}年${visibleMonth.getMonth() + 1}月${day}日`} aria-pressed={active} onClick={() => setSelected(current => ({ ...current, year: visibleMonth.getFullYear(), month: visibleMonth.getMonth() + 1, day }))}>{day}</button>; })}</div>
        <div className="date-time-clock"><strong>时间</strong>{[["hour", "时", 23], ["minute", "分", 59], ["second", "秒", 59]].map(([key, label, max]) => <label key={key}>{label}<select value={selected[key]} onChange={event => setSelected(current => ({ ...current, [key]: Number(event.target.value) }))}>{Array.from({ length: max + 1 }, (_, number) => <option key={number} value={number}>{pad(number)}</option>)}</select></label>)}</div>
        <footer><button type="button" onClick={() => picker.current?.hidePopover()}>取消</button><button type="button" className="primary" onClick={save}>确定</button></footer>
      </div>
    </div>
  </>;
}
