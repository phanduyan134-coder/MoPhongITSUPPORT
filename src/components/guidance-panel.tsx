"use client";

import { BookOpen, CircleAlert, LocateFixed, Monitor, RotateCcw, Terminal, X } from "lucide-react";
import { useLab } from "@/lib/store";
import type { InstallGuideStep } from "@/lib/install-guide";
import type { NetworkGuideStep } from "@/lib/network-guide";
import type { GuidanceMode } from "@/lib/store";

type Props = {
  step: InstallGuideStep | NetworkGuideStep;
  onLocate: () => void;
  onBlank: () => void;
  onClose: () => void;
};

export function GuidancePanel({ step, onLocate, onBlank, onClose }: Props) {
  const acceptReinstall = useLab((s) => s.acceptGuidedReinstall);
  const mode = useLab((s) => s.guidanceMode);
  const setMode = useLab((s) => s.setGuidanceMode);
  return <section id="simulation-guidance" className="install-guidance" aria-labelledby="guidance-title" data-guide-mode={mode} data-guide-step={step.id}>
    <div className="guidance-heading">
      <h2 id="guidance-title"><BookOpen size={16} />Hướng dẫn làm cùng</h2>
      <select aria-label="Nội dung hướng dẫn" value={mode} onChange={(e) => setMode(e.target.value as GuidanceMode)}>
        <option value="windows">Cài Windows từ USB</option>
        <option value="network">Kiểm tra và xử lý mạng</option>
      </select>
      <button className="icon-button" aria-label="Tắt hướng dẫn" title="Tắt hướng dẫn" onClick={onClose}><X size={17} /></button>
    </div>
    <div className="guidance-body">
      <div className="guidance-copy" aria-live="polite" aria-atomic="true">
        <h3>{step.title}</h3>
        <p>{step.instruction}</p>
        {"command" in step && step.command && <div className="guidance-command"><Terminal size={15} /><code>{step.command}</code></div>}
        {step.warning && <p className="guidance-warning"><CircleAlert size={15} /><span>{step.warning}</span></p>}
      </div>
      <div className="guidance-actions">
        {step.id === "existing-windows" ? <>
          <button className="button primary" onClick={onBlank}><Monitor size={15} />Tạo máy trống</button>
          <button className="button subtle" onClick={acceptReinstall}><RotateCcw size={15} />Cài lại trên máy này</button>
        </> : step.id === "network-no-windows" ? <button className="button subtle" onClick={() => setMode("windows")}><Monitor size={15} />Chuyển sang cài Windows</button>
          : step.target && <button className="button subtle" onClick={onLocate}><LocateFixed size={16} />Chỉ vị trí thao tác</button>}
      </div>
    </div>
    <details className="guidance-explanation" key={step.id}>
      <summary>Vì sao cần bước này?</summary>
      <p>{step.explanation}</p>
    </details>
  </section>;
}
