"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, Send, Sparkles } from "lucide-react";
import { useLab } from "@/lib/store";

type Message = { role: "user" | "assistant"; content: string; source?: string };
export function AgentPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(""); const [pending, setPending] = useState(false);
  const [error, setError] = useState(""); const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages, pending]);
  async function ask(text: string) {
    if (!text.trim() || pending) return;
    const state = useLab.getState(); const controller = new AbortController(); abort.current = controller;
    const question = text.trim().slice(0, 1500);
    const history = [...messages, { role: "user" as const, content: question }];
    setMessages(history); setInput(""); setPending(true); setError("");
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ pc: state.pc,
          history: history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 3000) })),
          actions: state.logs.slice(-15).map((log) => log.text), terminal: state.terminal.slice(-5) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không nhận được phản hồi từ trợ lý.");
      if (controller.signal.aborted) return;
      const changed = state.revision !== useLab.getState().revision;
      setMessages((current) => [...current, { role: "assistant", content: data.message,
        source: `${data.source === "openai" ? "OpenAI · công cụ chỉ đọc" : "Gợi ý cục bộ · không dùng AI"}${changed ? " · theo trạng thái lúc gửi" : ""}` }]);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Lỗi kết nối.");
    } finally { if (!controller.signal.aborted) setPending(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void ask(input); }
  return <section className="agent-section"><div className="agent-heading"><span className="agent-avatar"><Sparkles size={18} /></span><div><h2>Trợ lý kỹ thuật</h2><p>Trạng thái máy mô phỏng</p></div><span className="agent-label">ASSIST</span></div><div className="chat-messages" aria-live="polite">{!messages.length && <div className="agent-welcome"><Bot size={22} /><p>Bạn muốn kiểm tra điều gì trên máy mô phỏng?</p><button disabled={pending} onClick={() => void ask("Phân tích trạng thái máy mô phỏng hiện tại, giải thích ảnh hưởng của cấu hình và đề xuất thao tác phù hợp.")}><Sparkles size={13} />Phân tích trạng thái máy</button></div>}{messages.map((m, i) => <div className={`chat-message ${m.role}`} key={i}><small>{m.role === "user" ? "Bạn" : "Trợ lý"}</small><p>{m.content}</p>{m.source && <span className="message-source">{m.source}</span>}</div>)}{pending && <div className="agent-pending"><LoaderCircle size={14} className="spin" />Đang kiểm tra trạng thái…</div>}<div ref={bottom} /></div>{error && <div className="agent-error" role="alert">{error}<button className="text-button" disabled={pending} onClick={() => { const last = [...messages].reverse().find((m) => m.role === "user"); if (last) void ask(last.content); }}>Thử lại</button></div>}<form className="chat-form" onSubmit={submit}><input aria-label="Câu hỏi cho trợ lý" placeholder="Hỏi về cấu hình, cài đặt hoặc sự cố…" value={input} maxLength={1500} disabled={pending} onChange={(e) => setInput(e.target.value)} /><button className="icon-button" disabled={pending || !input.trim()} title="Gửi câu hỏi" aria-label="Gửi câu hỏi"><Send size={16} /></button></form><div className="agent-footnote">Phản hồi tham khảo · Đối chiếu tài liệu thiết bị khi áp dụng thực tế</div></section>;
}
