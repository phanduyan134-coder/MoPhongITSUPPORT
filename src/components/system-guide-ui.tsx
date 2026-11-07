"use client";

import { motion } from "motion/react";
import { ArrowDown, Check, CheckCircle2, Crosshair, Route, X } from "lucide-react";
import { dnsGuideCopy, type DnsGuideStep } from "@/lib/system-guide-machine";
import { scenarioGuides, type ScenarioGuideId, type ScenarioGuideStep } from "@/lib/scenario-guide-machine";

type ActiveStep = Exclude<DnsGuideStep, "idle">;
const steps = [
  { id: "checkingIp", label: "Kết nối IP" },
  { id: "checkingDns", label: "Tra DNS" },
  { id: "checkingService", label: "Dịch vụ" },
  { id: "repairingDns", label: "Khôi phục" },
  { id: "verifyingDns", label: "Xác minh" },
  { id: "checkingHttp", label: "Website" },
];

export function DnsGuidePanel({ step, onFocus, onStop, desktop = false }: { step: ActiveStep; onFocus: () => void; onStop: () => void; desktop?: boolean }) {
  const complete = step === "complete";
  const index = complete ? steps.length : steps.findIndex((item) => item.id === step);
  const text = desktop && step === "repairingDns" ? "DNS trên SRV-01 đã được xác nhận là Stopped. Trong cửa sổ Services, nút Start đang được tô sáng. Tự bấm Start rồi kiểm tra lại từ CLIENT-01." : dnsGuideCopy[step].text;
  return <GuidePanel label="DNS" steps={steps} index={index} complete={complete} title={dnsGuideCopy[step].title} text={text} onFocus={onFocus} onStop={onStop} />;
}

function GuidePanel({ label, steps: progress, index, complete, title, text, onFocus, onStop }: { label: string; steps: { id: string; label: string }[]; index: number; complete: boolean; title: string; text: string; onFocus: () => void; onStop: () => void }) {
  return <section className="sl-guide-panel" aria-label={"Dẫn thao tác " + label}>
    <header><span><Route size={17} />Mô phỏng có hướng dẫn · {label}</span><button className="sl-icon" title="Dừng dẫn thao tác" aria-label="Dừng dẫn thao tác" onClick={onStop}><X size={17} /></button></header>
    <ol className="sl-guide-progress" style={{ gridTemplateColumns: `repeat(${progress.length}, minmax(0, 1fr))` }} aria-label={"Tiến trình mô phỏng " + label}>{progress.map((item, i) => <li key={item.id} className={i < index ? "is-done" : i === index ? "is-current" : ""} aria-current={i === index ? "step" : undefined}><span>{i < index ? <Check size={13} /> : i + 1}</span><small>{item.label}</small></li>)}</ol>
    <motion.div key={title} className="sl-guide-current" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} aria-live="polite">
      <div>{complete && <CheckCircle2 size={20} />}<strong>{title}</strong></div>
      <p>{text}</p>
    </motion.div>
    <button className="sl-button sl-guide-locate" onClick={onFocus}><Crosshair size={15} />{complete ? "Xem tổng quan" : "Đến thao tác hiện tại"}</button>
  </section>;
}

const targetCopy: Record<Exclude<ActiveStep, "complete">, { title: string; why: string; expected: string }> = {
  checkingIp: { title: "Kiểm tra đường truyền trước", why: "Ping từ CLIENT-01 đến IP máy chủ để tách lỗi kết nối khỏi lỗi DNS.", expected: "Received = 4: máy chủ vẫn liên lạc được bằng IP." },
  checkingDns: { title: "Hỏi DNS từ máy trạm", why: "nslookup yêu cầu DNS tìm IP của portal.lab.test, không kiểm tra website IIS.", expected: "DNS request timed out: máy trạm chưa nhận được phản hồi DNS." },
  checkingService: { title: "Xác nhận trạng thái DNS trên SRV-01", why: "Timeout chưa xác định được nguyên nhân. Chạy Get-Service DNS trên máy chủ để biết dịch vụ có bị dừng không; lỗi DNS còn có thể liên quan cấu hình hoặc tường lửa.", expected: "DNS có Status Stopped trong tình huống mẫu. Nếu đã Running, kiểm tra lại DNS, không bật/tắt dịch vụ theo phỏng đoán." },
  repairingDns: { title: "Khởi động dịch vụ DNS trên SRV-01", why: "Get-Service DNS đã xác nhận Stopped. Bật công tắc DNS bên dưới; không cần đổi bản ghi A trong tình huống mẫu này.", expected: "Trạng thái chuyển từ Stopped sang Running." },
  verifyingDns: { title: "Xác minh từ máy trạm", why: "Dịch vụ Running chưa đủ để kết luận. Hỏi lại DNS từ chính máy trạm ban đầu; nếu vẫn lỗi, cần kiểm tra nguyên nhân khác thay vì bật/tắt dịch vụ.", expected: "Name: portal.lab.test và Address: 192.168.10.10." },
  checkingHttp: { title: "Xác nhận website hoạt động", why: "Tên miền đã phân giải đúng. Kiểm tra HTTP để xác nhận toàn bộ luồng truy cập.", expected: "HTTP/1.1 200 OK: website đã phản hồi thành công." },
};

export function DnsGuideTarget({ step, feedback, desktop = false }: { step: Exclude<ActiveStep, "complete">; feedback: string; desktop?: boolean }) {
  const copy = targetCopy[step];
  return <GuideTarget key={step} id="dns-guide-target" {...copy} why={desktop && step === "repairingDns" ? "Get-Service DNS đã xác nhận Stopped. Bấm Start trong Services; không cần đổi bản ghi A trong tình huống mẫu này." : copy.why} feedback={feedback} />;
}

function GuideTarget({ id, title, instruction, why, expected, feedback }: { id: string; title: string; instruction?: string; why: string; expected: string; feedback: string }) {
  return <motion.aside id={id} className="sl-guide-target-note" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} aria-label="Giải thích thao tác hiện tại">
    <div><ArrowDown size={16} /><strong>{title}</strong></div>{instruction && <p>{instruction}</p>}<p>{why}</p><p className="sl-guide-expected"><span>Cần quan sát</span>{expected}</p>
    {feedback && <p className="sl-guide-feedback" role="status">{feedback}</p>}
  </motion.aside>;
}

export function ScenarioGuidePanel({ guideId, stepIndex, complete, onFocus, onStop }: { guideId: ScenarioGuideId; stepIndex: number; complete: boolean; onFocus: () => void; onStop: () => void }) {
  const config = scenarioGuides[guideId];
  const step = config.steps[stepIndex];
  return <GuidePanel label={config.label} steps={config.steps} index={complete ? config.steps.length : stepIndex} complete={complete} title={complete ? "Đã hoàn thành hướng dẫn " + config.label : step.title} text={complete ? "Các bước kiểm tra và khắc phục trong mô phỏng đã được xác nhận. Bạn có thể tiếp tục khám phá hệ thống hoặc chọn tình huống khác." : step.text} onFocus={onFocus} onStop={onStop} />;
}

export function ScenarioGuideTarget({ step, feedback }: { step: ScenarioGuideStep; feedback: string }) {
  return <GuideTarget key={step.id} id="scenario-guide-target" title={step.label} instruction={step.target ? step.text : undefined} why={step.why} expected={step.expected} feedback={feedback} />;
}
