"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Bot, Check, ChevronDown, Download, ExternalLink, LoaderCircle, RefreshCw, ScanLine, TriangleAlert, X } from "lucide-react";
import type { DeviceId } from "@/lib/system-simulator";
import type { AgentToolEvidence, DnsVerification } from "@/lib/system-evidence";
import { useSystemLab } from "@/lib/system-store";

type AgentReply = {
  source: "local" | "openai"; message: string; revision: number;
  trace: Pick<AgentToolEvidence, "tool" | "summary" | "origin" | "status" | "revision" | "durationMs">[]; sources: { title: string; url: string }[];
  runId?: string; stale?: boolean; verification?: DnsVerification;
};
type Message = { role: "user" | "assistant"; content: string; result?: AgentReply };

function VerificationResult({ result, stale }: { result: DnsVerification; stale: boolean }) {
  const passed = result.status === "passed";
  return <section className={"sl-verification " + (stale ? "is-stale" : passed ? "is-passed" : "is-failed")} aria-label="DNS và website mô phỏng" data-testid="dns-verification" data-status={stale ? "stale" : result.status}>
    <div className="sl-verification-title">{stale ? <TriangleAlert size={15} /> : passed ? <Check size={15} /> : <TriangleAlert size={15} />}<strong>DNS và website mô phỏng</strong></div>
    <p>{stale ? "Kết quả đã cũ — hãy kiểm tra lại cấu hình hiện tại." : passed ? "Các phép kiểm tra DNS và website đều đạt." : "Còn phép kiểm tra DNS hoặc website chưa đạt."}</p>
    <span className="sl-verification-scope">Kết quả tại cấu hình r{result.revision}; chỉ xác nhận các mục bên dưới.</span>
    {!stale && <div className="sl-verification-assessment" data-testid="dns-assessment" data-code={result.assessment.code}>
      <strong>Nhận định từ các phép kiểm</strong><p>{result.assessment.summary}</p>
      <details><summary>Bước tiếp theo <ChevronDown size={12} /></summary><ol>{result.assessment.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ol></details>
    </div>}
    <ul className="sl-verification-checks">{result.checks.map((check) => <li key={check.id}>
      <details><summary><span className={"sl-check-outcome " + (check.passed ? "is-passed" : "is-failed")}>{check.passed ? <Check size={12} /> : <X size={12} />}{check.passed ? "Đạt" : "Chưa đạt"}</span><span>{check.label}</span><ChevronDown size={12} /></summary>
        <div><code>{check.device === "server" ? "SRV-01" : "CLIENT-01"} &gt; {check.command}</code>{!check.observed && <p>Quan sát thiếu hoặc không thuộc cấu hình đang kiểm tra.</p>}<pre>{check.output}</pre></div>
      </details>
    </li>)}</ul>
  </section>;
}

export function SystemAssistant() {
  const { sessionId, state, generation, busy: simulationBusy } = useSystemLab();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [device, setDevice] = useState<DeviceId>("client");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort(); exportController.current?.abort();
    controller.current = null; exportController.current = null;
    setMessages([]); setInput(""); setBusy(false); setExporting(false); setError(""); setExportNotice("");
    return () => {
      controller.current?.abort(); exportController.current?.abort();
      controller.current = null; exportController.current = null;
    };
  }, [sessionId, generation]);
  async function ask(content: string, purpose: "diagnose" | "verify-dns" = "diagnose") {
    if (!content.trim() || busy || controller.current || exportController.current || !sessionId || !state || simulationBusy || exporting) return;
    const currentController = new AbortController();
    controller.current = currentController;
    const isCurrent = () => {
      const latest = useSystemLab.getState();
      return controller.current === currentController && latest.sessionId === sessionId && latest.generation === generation;
    };
    const history = [...messages, { role: "user" as const, content: content.trim().slice(0, 3000) }];
    setMessages(history); setInput(""); setBusy(true); setError("");
    const timeout = setTimeout(() => currentController.abort(), 40_000);
    try {
      const payload = { sessionId, device, purpose, ...(purpose === "verify-dns" ? { expectedRevision: state.revision } : {}), history: history.slice(-7).map(({ role, content }) => ({ role, content: content.slice(0, 3000) })) };
      while (payload.history.length > 1 && new TextEncoder().encode(JSON.stringify(payload)).byteLength > 30_000) payload.history.splice(0, 2);
      const response = await fetch("/api/system-agent", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: currentController.signal,
        body: JSON.stringify(payload),
      });
      const data = await response.json() as AgentReply & { error?: string };
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(data.error || "Trợ lý chưa phản hồi được.");
      setMessages((s) => [...s, { role: "assistant", content: data.message, result: data }]);
    } catch (error) {
      if (!isCurrent()) return;
      if (currentController.signal.aborted) setError("Yêu cầu đã dừng hoặc hết thời gian chờ.");
      else setError(error instanceof Error ? error.message : "Không thể kết nối tới trợ lý.");
    } finally { clearTimeout(timeout); if (isCurrent()) { controller.current = null; setBusy(false); } }
  }
  async function downloadEvidence() {
    if (!sessionId || busy || controller.current || simulationBusy || exporting || exportController.current) return;
    const currentController = new AbortController();
    exportController.current = currentController;
    const isCurrent = () => {
      const latest = useSystemLab.getState();
      return exportController.current === currentController && latest.sessionId === sessionId && latest.generation === generation;
    };
    setExporting(true); setError(""); setExportNotice("");
    const timeout = setTimeout(() => currentController.abort(), 15_000);
    try {
      const response = await fetch("/api/simulation", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: currentController.signal,
        body: JSON.stringify({ operation: "export", sessionId }),
      });
      const data = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(data.error || "Không thể xuất hồ sơ phiên.");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `supportlab-web-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setExportNotice(data.journal?.truncated ? "Đã tải hồ sơ phiên. Một phần nhật ký đã được lược bớt do giới hạn lưu trữ." : "Đã tải hồ sơ phiên xuống máy.");
    } catch (error) {
      if (!isCurrent()) return;
      setError(currentController.signal.aborted ? "Xuất hồ sơ đã hết thời gian chờ. Vui lòng thử lại." : error instanceof Error ? error.message : "Không thể xuất hồ sơ phiên.");
    } finally { clearTimeout(timeout); if (isCurrent()) { exportController.current = null; setExporting(false); } }
  }
  function submit(e: FormEvent) { e.preventDefault(); void ask(input); }
  return <aside className="sl-assistant" aria-label="Trợ lý chẩn đoán">
    <header><span className="sl-bot"><Bot size={21} /></span><div><h2>Trợ lý chẩn đoán</h2><span>Quan sát · Kiểm tra · Đề xuất</span></div><span className="sl-assistant-indicator" /></header>
    <div className="sl-agent-context"><ScanLine size={15} /><select aria-label="Thiết bị trợ lý" value={device} onChange={(e) => setDevice(e.target.value as DeviceId)}><option value="client">CLIENT-01</option><option value="server">SRV-01</option></select><span>Chỉ đọc</span></div>
    <div className="sl-agent-actions">
      <button className="sl-button sl-agent-recheck" disabled={busy || !sessionId || !state || simulationBusy || exporting} onClick={() => void ask("Kiểm tra lại kết nối, dịch vụ DNS, phân giải portal.lab.test và truy cập website trên cấu hình hiện tại; nêu kết quả từng phép kiểm tra.", "verify-dns")}><RefreshCw size={15} />Kiểm tra lại DNS / website</button>
      <button className="sl-button sl-evidence-export" disabled={busy || !sessionId || simulationBusy || exporting} onClick={() => void downloadEvidence()}>{exporting ? <LoaderCircle size={14} className="sl-spin" /> : <Download size={14} />}Xuất hồ sơ phiên</button>
      <p>Hồ sơ lưu tạm đến khi phiên hết hạn hoặc máy chủ khởi động lại. Tải xuống để giữ lại.</p>
      {exportNotice && <span className="sl-export-notice" role="status">{exportNotice}</span>}
    </div>
    <div className="sl-messages" aria-live="polite">
      {!messages.length && <div className="sl-agent-empty"><Bot size={28} /><strong>Chưa có phiên chẩn đoán</strong><button className="sl-button" disabled={!sessionId || simulationBusy || exporting} onClick={() => void ask("Kiểm tra các dấu hiệu hiện tại, nêu bằng chứng và đề xuất bước chẩn đoán tiếp theo.")}><ScanLine size={15} />Phân tích trạng thái</button></div>}
      {messages.map((message, index) => <article className={"sl-message " + message.role} key={index}><div className="sl-message-label">{message.role === "user" ? "Bạn" : "Trợ lý"}{message.result && <span>{message.result.source === "openai" ? "AI · OpenAI" : "Cục bộ · không dùng AI"}</span>}</div><p>{message.content}</p>
        {message.result && <><small className="sl-revision">r{message.result.revision}{message.result.stale || message.result.revision !== state?.revision ? " · Cấu hình đã thay đổi, cần kiểm tra lại" : ""}</small>{message.result.verification && <VerificationResult result={message.result.verification} stale={Boolean(message.result.stale) || message.result.revision !== state?.revision || message.result.verification.revision !== state?.revision} />}{message.result.trace?.length > 0 && <details className="sl-agent-trace"><summary><ChevronDown size={13} />{message.result.trace.length} bước kiểm tra</summary>{message.result.trace.map((step, i) => <div className="sl-trace" key={i}><code>{step.tool}</code><small>{step.origin === "verification" ? "Phép kiểm cố định" : step.origin === "local" ? "Quy tắc cục bộ" : "Agent lựa chọn"} · r{step.revision}{step.status === "error" ? " · Công cụ không trả quan sát hợp lệ" : ""}</small><pre>{step.summary}</pre></div>)}</details>}{message.result.sources?.length > 0 && <div className="sl-sources">{message.result.sources.filter((source) => /^https:\/\//.test(source.url)).map((source, i) => <a href={source.url} key={i} target="_blank" rel="noreferrer"><ExternalLink size={12} />{source.title}</a>)}</div>}</>}
      </article>)}
      {busy && <div className="sl-agent-pending" role="status"><LoaderCircle size={16} className="sl-spin" />Đang thu thập quan sát…</div>}
    </div>
    {error && <p className="sl-agent-error" role="alert">{error}</p>}
    <form className="sl-agent-form" onSubmit={submit}><textarea aria-label="Tin nhắn trợ lý" placeholder="Mô tả sự cố…" rows={2} maxLength={3000} value={input} onChange={(e) => setInput(e.target.value)} /><button className="sl-icon" title="Gửi tin nhắn" aria-label="Gửi tin nhắn" type="submit" disabled={busy || !sessionId || simulationBusy || exporting || !input.trim()}><ArrowUp size={17} /></button></form>
    <footer>Chỉ thao tác trong môi trường mô phỏng</footer>
  </aside>;
}
