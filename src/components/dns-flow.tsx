"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, Clock3, Mail, Monitor, Pause, Play, Radio, RotateCcw, Server, Unplug, XCircle } from "lucide-react";
import type { DnsTrace } from "@/lib/system-simulator";
import type { DnsObservation } from "@/lib/system-store";

const QUERY_MS = 1000;
const WAIT_MS = 1000;
const RESPONSE_MS = 1000;

function resultCopy(trace: DnsTrace) {
  if (trace.outcome === "answer") return {
    title: "Có phản hồi DNS",
    detail: `DNS trả bản ghi A: ${trace.queryName} → ${trace.answerIp}. Phản hồi DNS chưa xác nhận website HTTP hoạt động hoặc bản ghi trỏ đúng máy chủ cần dùng.`,
  };
  if (trace.outcome === "nxdomain") return {
    title: "Không tồn tại tên (NXDOMAIN)",
    detail: "Máy chủ DNS đã phản hồi rằng tên truy vấn không tồn tại. Đây là phản hồi DNS, khác với không nhận được phản hồi.",
  };
  if (trace.reachability === "unreachable") return {
    title: "Không nhận được phản hồi DNS",
    detail: "Đường kết nối IP tới DNS không khả dụng trong mô hình tại lần kiểm tra này. Chưa có bằng chứng yêu cầu đã tới máy chủ; cần kiểm tra link, bộ điều hợp và IPv4 trước.",
  };
  if (trace.reachability === "unknown") return {
    title: "Không nhận được phản hồi DNS",
    detail: "Đích DNS này nằm ngoài dịch vụ được triển khai trong mô hình. Chưa xác nhận yêu cầu đã đến nơi; không suy ra SRV-01 bị dừng từ kết quả này.",
  };
  return {
    title: "Không nhận được phản hồi DNS",
    detail: "Đường IP tới máy chủ có trong mô hình nhưng truy vấn không có phản hồi DNS. Timeout chưa xác định nguyên nhân; cần kiểm tra dịch vụ, cấu hình và các điều kiện liên quan.",
  };
}

export function DnsFlow({ observation, revision }: { observation: DnsObservation | null; revision: number }) {
  return observation ? <DnsTransaction key={observation.id} observation={observation} revision={revision} /> : <section id="dns-flow" className="sl-dns-flow is-idle" aria-label="Giao dịch DNS" data-testid="dns-flow" data-status="idle" data-phase="idle" data-outcome="none">
    <header className="sl-dns-heading"><div><Radio size={17} /><h3>Giao dịch DNS</h3></div><span>DNS · IPv4</span></header>
    <div className="sl-dns-empty"><Mail size={19} /><span>Chưa có truy vấn</span><code>A / DNS</code></div>
  </section>;
}

function DnsTransaction({ observation, revision }: { observation: DnsObservation; revision: number }) {
  const { trace } = observation;
  const reducedMotion = useReducedMotion();
  const stale = trace.revision !== revision;
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const hasResponse = trace.outcome !== "timeout";
  const duration = QUERY_MS + WAIT_MS + (hasResponse ? RESPONSE_MS : 800);
  const ended = elapsed >= duration;
  const complete = stale || !!reducedMotion || ended;
  const phase = complete ? "complete" : elapsed < QUERY_MS ? "query" : elapsed < QUERY_MS + WAIT_MS || !hasResponse ? "waiting" : "response";
  const status = stale ? "stale" : complete ? "complete" : paused ? "paused" : "playing";
  const result = resultCopy(trace);

  useEffect(() => {
    if (stale || reducedMotion || paused || ended) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;
      setElapsed((value) => Math.min(duration, value + delta));
    }, 50);
    return () => window.clearInterval(timer);
  }, [stale, reducedMotion, paused, ended, duration, replay]);

  const queryProgress = Math.min(1, elapsed / QUERY_MS);
  const responseProgress = Math.max(0, Math.min(1, (elapsed - QUERY_MS - WAIT_MS) / RESPONSE_MS));
  const queryExtent = trace.reachability === "reachable" ? 100 : trace.reachability === "unreachable" ? 30 : 55;
  const sourceName = trace.device === "client" ? "CLIENT-01" : "SRV-01";
  const resolverName = trace.resolverDevice === "server" ? trace.transport === "local" ? "DNS cục bộ · SRV-01" : "DNS · SRV-01" : "DNS được chỉ định";
  const SourceIcon = trace.device === "client" ? Monitor : Server;
  const ResolverIcon = trace.resolverDevice === "server" ? Server : CircleHelp;
  const ResultIcon = trace.outcome === "answer" ? CheckCircle2 : trace.outcome === "nxdomain" ? XCircle : Clock3;
  const phaseText = complete ? stale ? "Giao dịch đã ghi nhận" : "Đã kết thúc" : paused ? "Đang tạm dừng" : phase === "query" ? "Gửi truy vấn" : phase === "waiting" ? "Chờ DNS" : "Nhận phản hồi";
  const activeIndex = phase === "query" ? 0 : phase === "waiting" ? 1 : 2;

  function restart() { setElapsed(0); setPaused(false); setReplay((value) => value + 1); }

  return <section id="dns-flow" tabIndex={-1} className={"sl-dns-flow is-" + trace.outcome + (stale ? " is-stale" : "")} aria-label="Giao dịch DNS" data-testid="dns-flow" data-status={status} data-phase={phase} data-outcome={trace.outcome}>
    <header className="sl-dns-heading"><div><Radio size={17} /><h3>Giao dịch DNS</h3><span className="sl-dns-revision">r{trace.revision}</span></div><div className="sl-dns-controls">
      {!complete && <button type="button" className="sl-icon" title={paused ? "Tiếp tục luồng DNS" : "Tạm dừng luồng DNS"} aria-label={paused ? "Tiếp tục luồng DNS" : "Tạm dừng luồng DNS"} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}
      <button type="button" className="sl-icon" title={stale ? "Kết quả thuộc cấu hình trước thay đổi" : reducedMotion ? "Đang giảm chuyển động" : "Phát lại luồng DNS"} aria-label="Phát lại luồng DNS" disabled={stale || !!reducedMotion} onClick={restart}><RotateCcw size={16} /></button>
    </div></header>
    <div className="sl-dns-meta"><code title={observation.command}>{observation.command}</code><span>{trace.transport === "local" ? "Cục bộ · Không qua switch" : "Mạng mô phỏng"}</span></div>
    {stale && <div className="sl-dns-stale" role="status"><Clock3 size={14} />Kết quả trước thay đổi · r{trace.revision} → r{revision}</div>}
    <div className="sl-dns-diagram">
      <div className="sl-dns-node" data-testid="dns-flow-source"><span><SourceIcon size={25} /></span><strong>{sourceName}</strong><code>{trace.sourceIp}</code><small>Nguồn truy vấn</small></div>
      <div className="sl-dns-lanes" aria-hidden="true">
        <div className={"sl-dns-lane sl-dns-query " + (phase === "query" ? "is-active" : "")}><span>A · {trace.queryName}</span><div className="sl-dns-track"><ArrowRight className="sl-dns-direction" size={16} />{phase === "query" && <motion.i data-testid="dns-flow-packet" className="sl-dns-packet" initial={false} animate={{ left: `${queryProgress * queryExtent}%` }} transition={{ duration: 0.05, ease: "linear" }}><Mail size={13} /></motion.i>}{trace.reachability === "unreachable" && <Unplug className="sl-dns-blocked" size={16} />}{trace.reachability === "unknown" && <CircleHelp className="sl-dns-unknown" size={16} />}</div></div>
        <div className={"sl-dns-lane sl-dns-response " + (!hasResponse ? "is-silent " : "") + (phase === "response" ? "is-active" : "")}><div className="sl-dns-track">{hasResponse && <ArrowLeft className="sl-dns-direction" size={16} />}{phase === "response" && <motion.i data-testid="dns-flow-packet" className="sl-dns-packet" initial={false} animate={{ left: `${(1 - responseProgress) * 100}%` }} transition={{ duration: 0.05, ease: "linear" }}><Mail size={13} /></motion.i>}</div><span>{trace.outcome === "answer" ? "A · " + trace.answerIp : trace.outcome === "nxdomain" ? "NXDOMAIN" : "Không có phản hồi"}</span></div>
      </div>
      <div className="sl-dns-node sl-dns-resolver" data-testid="dns-flow-resolver"><span><ResolverIcon size={25} /></span><strong>{resolverName}</strong><code>{trace.resolverIp}</code><small>{trace.reachability === "reachable" ? "Đường IP khả dụng" : trace.reachability === "unreachable" ? "Không có đường IP" : "Ngoài dịch vụ mô hình"}</small></div>
    </div>
    <ol className="sl-dns-phases" aria-label="Các giai đoạn giao dịch DNS">{["Truy vấn A", "Chờ DNS", hasResponse ? "Phản hồi" : "Hết thời gian chờ"].map((label, index) => <li key={label} className={complete || index < activeIndex ? "is-done" : index === activeIndex ? "is-current" : ""} aria-current={!complete && index === activeIndex ? "step" : undefined}><span>{complete || index < activeIndex ? <CheckCircle2 size={12} /> : index + 1}</span>{label}</li>)}</ol>
    <div className="sl-dns-result" role="status"><ResultIcon size={17} /><div><strong>{result.title}</strong><p>{result.detail}</p></div></div>
    <footer><span>{phaseText}</span><span>{reducedMotion ? "Giảm chuyển động · Kết quả tĩnh" : "Thời gian minh họa, không phải độ trễ đo"}</span></footer>
  </section>;
}
