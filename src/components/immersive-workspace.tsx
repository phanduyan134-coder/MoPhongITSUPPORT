"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Crosshair, Download, HelpCircle, Layers, LoaderCircle, Plus, X } from "lucide-react";
import "@/app/immersive-workspace.css";

type ImmersiveWorkspaceProps = {
  children: ReactNode;
  assistant: ReactNode;
  guide: ReactNode;
  report: string;
  busy: boolean;
  revision: number;
  notice: string;
  error: string;
  onDismiss: () => void;
  onReset: () => void;
  onExport: () => void;
  onStartGuide?: () => void;
  guideActive: boolean;
  onLocateGuide: () => void;
};

export function ImmersiveWorkspace({ children, assistant, guide, report, busy, revision, notice, error, onDismiss, onReset, onExport, onStartGuide, guideActive, onLocateGuide }: ImmersiveWorkspaceProps) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const assistantButton = useRef<HTMLButtonElement>(null);
  const guideButton = useRef<HTMLButtonElement>(null);
  const assistantPanel = useRef<HTMLElement>(null);
  const guidePanel = useRef<HTMLElement>(null);

  function closeAssistant() {
    setAssistantOpen(false);
    assistantButton.current?.focus();
  }
  function closeGuide() {
    setGuideOpen(false);
    if (guideButton.current && !guideButton.current.disabled) guideButton.current.focus();
    else document.querySelector<HTMLElement>(".iw-home")?.focus();
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // A native confirmation dialog or an application's own menu handles its
      // Escape first. Closing the workspace drawer as well would lose focus.
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (assistantOpen) {
        event.preventDefault();
        closeAssistant();
      } else if (guideOpen) {
        event.preventDefault();
        closeGuide();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [assistantOpen, guideOpen]);
  useEffect(() => {
    if (assistantOpen) {
      const target = assistantPanel.current?.querySelector<HTMLElement>("textarea") ?? assistantPanel.current?.querySelector<HTMLElement>("button");
      target?.focus({ preventScroll: true });
    }
  }, [assistantOpen]);
  useEffect(() => {
    if (guideOpen) guidePanel.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [guideOpen]);
  useEffect(() => { if (!guideActive && guideOpen) closeGuide(); }, [guideActive, guideOpen]);

  return <main className="iw-workspace" data-testid="system-ready" aria-label="Không gian desktop mô phỏng">
    <header className="iw-header">
      <Link className="iw-home" href="/" aria-label="Về trang chủ chọn mô phỏng"><ArrowLeft size={17} /><span>Trang chủ</span></Link>
      <span className="iw-brand"><Layers size={18} /><strong>SupportLab</strong><small>MÔ PHỎNG HỆ THỐNG</small></span>
      <div className="iw-header-actions">
        <button ref={guideButton} className={guideOpen ? "is-active" : ""} aria-label="Hướng dẫn" aria-expanded={guideOpen} aria-controls="immersive-guide" disabled={!guideActive && !onStartGuide} onClick={() => { setAssistantOpen(false); if (guideActive) setGuideOpen(!guideOpen); else { onStartGuide?.(); setGuideOpen(false); } }}><HelpCircle size={16} /><span>Hướng dẫn</span></button>
        <button ref={assistantButton} className={assistantOpen ? "is-active" : ""} aria-label="Trợ lý AI" aria-expanded={assistantOpen} aria-controls="immersive-assistant" onClick={() => { setGuideOpen(false); setAssistantOpen(!assistantOpen); }}><Bot size={16} /><span>Trợ lý AI</span></button>
        <button aria-label="Xuất trạng thái phiên" title="Xuất trạng thái phiên" onClick={onExport} disabled={busy}><Download size={16} /></button>
        <button aria-label="Tạo phiên mới" onClick={onReset} disabled={busy}><Plus size={16} /><span>Tạo phiên mới</span></button>
      </div>
    </header>

    <div className="iw-session-bar">
      <button aria-expanded={reportOpen} aria-controls="immersive-report" onClick={() => setReportOpen(!reportOpen)}><span className="iw-live-dot" /><strong>Tình huống</strong><span className="iw-session-summary">{report}</span></button>
      <span className="iw-revision">{busy && <LoaderCircle className="iw-spin" size={12} />}r{revision}</span>
    </div>
    {reportOpen && <p id="immersive-report" className="iw-report">{report}</p>}

    {(notice || error) && <div className={"iw-notice " + (error ? "is-error" : "")} role={error ? "alert" : "status"}><span>{error || notice}</span><button aria-label="Đóng thông báo" onClick={onDismiss}><X size={14} /></button></div>}

    {guideActive && <aside ref={guidePanel} id="immersive-guide" className={"iw-guide " + (guideOpen ? "is-open" : "is-compact")} aria-label="Tiến trình hướng dẫn">
      {guideOpen && <div className="iw-panel-heading"><strong>Hướng dẫn thao tác</strong><button aria-label="Thu gọn hướng dẫn" onClick={closeGuide}><X size={17} /></button></div>}
      <div className="iw-guide-content" onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest(".sl-guide-locate")) setGuideOpen(false);
      }}>{guide}</div>
      {!guideOpen && <button className="iw-locate" aria-label="Đến thao tác hiện tại" onClick={onLocateGuide}><Crosshair size={14} /><span>Đến thao tác hiện tại</span></button>}
    </aside>}

    <div className="iw-desktop-stage">{children}</div>

    <aside ref={assistantPanel} id="immersive-assistant" className="iw-assistant" hidden={!assistantOpen} aria-label="Trợ lý AI trong mô phỏng">
      <div className="iw-panel-heading"><strong><Bot size={17} />Trợ lý AI</strong><button aria-label="Đóng trợ lý AI" onClick={closeAssistant}><X size={17} /></button></div>
      <div className="iw-assistant-content">{assistant}</div>
    </aside>
  </main>;
}
