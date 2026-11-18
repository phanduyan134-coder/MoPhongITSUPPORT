import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { POST as agentPost } from "../src/app/api/system-agent/route";
import { systemSessions } from "../src/lib/system-session";
import type { AgentRunEvidence } from "../src/lib/system-evidence";
import { describeDnsVerification } from "../src/lib/system-verification";

type EvalMode = "local" | "model";
type ExpectedTerm = string | string[];
type Case = { id: string; preset: string; device: "server" | "client"; question: string; terms: ExpectedTerm[]; tools: string[] };
type AgentResponse = { source?: string; message?: string; revision?: number; trace?: { tool: string; summary: string; status: string; origin: string }[]; sources?: unknown[]; error?: string };

const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const request = (body: unknown) => new Request("http://localhost:3000/api/system-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

loadEnvConfig(process.cwd());

function requestedMode(): EvalMode {
  const argument = process.argv.find((value) => value.startsWith("--mode="))?.slice("--mode=".length);
  const value = argument ?? process.env.AGENT_EVAL_MODE ?? "local";
  if (value === "local" || value === "model") return value;
  throw new Error(`AGENT_EVAL_MODE không hợp lệ: ${value}. Dùng local hoặc model.`);
}

async function main() {
  const mode = requestedMode();
  if (mode === "local") process.env.SUPPORTLAB_AI_ENABLED = "false";
  else {
    if (process.env.SUPPORTLAB_AI_ENABLED !== "true" || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
      throw new Error("Chế độ model cần SUPPORTLAB_AI_ENABLED=true, OPENAI_API_KEY và OPENAI_MODEL. Không tự chuyển sang local.");
    // Third-party gateways and reasoning models can need more than the
    // interactive 25-second budget. Keep the app default unchanged, but give
    // this seven-case evaluation enough time to distinguish model failure from
    // infrastructure timeout.
    process.env.SUPPORTLAB_AGENT_TIMEOUT_MS ??= "60000";
  }
  const cases = JSON.parse(await readFile(join(process.cwd(), "experiments", "agent-evaluation", "cases.json"), "utf8")) as Case[];
  const results = [] as Record<string, unknown>[];
  for (const item of cases) {
    const session = systemSessions.create(item.preset);
    const response = await agentPost(request({ sessionId: session.sessionId, device: item.device, purpose: "diagnose", history: [{ role: "user", content: item.question }] }));
    const body = await response.json() as AgentResponse;
    const exportData = systemSessions.exportEvidence(session.sessionId);
    const agentEntry = [...exportData.journal.entries].reverse().find((entry) => entry.kind === "agent");
    const evidence = (agentEntry?.data as { evidence?: AgentRunEvidence } | undefined)?.evidence;
    const fullTrace = evidence?.trace ?? [];
    const assessedTrace = mode === "model" ? fullTrace.filter((entry) => entry.origin === "agent") : fullTrace.filter((entry) => entry.origin !== "verification");
    const completeMessage = evidence?.message ?? body.message ?? "";
    const assessedMessage = mode === "model" && evidence?.verification
      ? completeMessage.replace(`${describeDnsVerification(evidence.verification)}\n\n`, "")
      : completeMessage;
    const text = normalize(`${assessedMessage}\n${assessedTrace.map((entry) => `${entry.tool} ${JSON.stringify(entry.input)} ${entry.summary}`).join("\n")}`);
    const missingTerms = item.terms.filter((term) => {
      const alternatives = Array.isArray(term) ? term : [term];
      return !alternatives.some((alternative) => text.includes(normalize(alternative)));
    }).map((term) => Array.isArray(term) ? term.join(" / ") : term);
    const traceLabels = assessedTrace.map((entry) => `${entry.tool}:${String((entry.input as { service?: string; command?: string; device?: string } | undefined)?.service ?? (entry.input as { command?: string } | undefined)?.command ?? (entry.input as { device?: string } | undefined)?.device ?? "")}`);
    const missingTools = item.tools.filter((expected) => {
      const [tool, value] = expected.split(":", 2);
      return !assessedTrace.some((entry) => entry.tool === tool && normalize(JSON.stringify(entry.input)).includes(normalize(value)));
    });
    const hasKnowledge = assessedTrace.some((entry) => entry.tool === "search_knowledge" && entry.status === "ok");
    const hasMutation = assessedTrace.some((entry) => !["inspect_network", "inspect_service", "inspect_system", "run_diagnostic", "search_knowledge", "read_logs"].includes(entry.tool));
    const criteria = {
      responseOk: response.status === 200,
      sourceMatchesMode: body.source === (mode === "local" ? "local" : "openai") && evidence?.source === (mode === "local" ? "local" : "openai"),
      revisionMatches: body.revision === 0 && evidence?.revision === 0,
      termsPresent: missingTerms.length === 0,
      requiredToolsPresent: missingTools.length === 0,
      knowledgeRetrieved: hasKnowledge,
      noMutationTool: !hasMutation,
      noFallback: evidence?.fallback === false,
    };
    const passed = Object.values(criteria).every(Boolean);
    results.push({ id: item.id, preset: item.preset, status: response.status, passed, source: body.source, evidenceId: evidence?.id,
      revision: body.revision, model: evidence?.model ?? null, fallback: evidence?.fallback ?? null, fallbackReason: evidence?.fallbackReason ?? null,
      usage: evidence?.usage ?? null, criteria, missingTerms, missingTools, hasKnowledge, hasMutation, trace: traceLabels, rawTrace: fullTrace,
      modelMessage: assessedMessage, message: completeMessage });
  }
  const passed = results.filter((item) => item.passed).length;
  const timeoutFallbacks = results.filter((item) => item.fallbackReason === "timeout").length;
  const strictToolMisses = results.filter((item) => !item.passed && item.fallback !== true && Array.isArray(item.missingTools) && item.missingTools.length > 0).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = join(process.cwd(), "output", "evidence", "agent-evaluation", timestamp);
  await mkdir(output, { recursive: true });
  const actualSources = [...new Set(results.map((item) => item.source).filter(Boolean))];
  await writeFile(join(output, "results.json"), JSON.stringify({ schemaVersion: 2, requestedMode: mode,
    configuredModel: mode === "model" ? process.env.OPENAI_MODEL : null, actualSources, generatedAt: new Date().toISOString(), cases: results,
    summary: { total: results.length, passed, failed: results.length - passed, timeoutFallbacks, strictToolMisses, evaluationTimeoutMs: mode === "model" ? Number(process.env.SUPPORTLAB_AGENT_TIMEOUT_MS) : null } }, null, 2));
  const title = mode === "local" ? "Đánh giá Agent cục bộ" : "Đánh giá Agent dùng model";
  const description = mode === "local"
    ? "Chế độ local rule-based, không gọi model/API bên ngoài."
    : `Chế độ model thật (${process.env.OPENAI_MODEL}); các lượt fallback vẫn được ghi nhận là không đạt tiêu chí source/fallback.`;
  const lines = [`# ${title}`, "", `- Thời điểm: ${new Date().toISOString()}`, `- ${description}`, `- Kết quả: **${passed}/${results.length} ca đạt**`, "", "| Ca | Nguồn trả lời | Fallback | Kết quả | Tiêu chí chưa đạt |", "|---|---|---:|---:|---|"];
  for (const item of results as Array<{ id: string; source?: string; fallback: boolean | null; passed: boolean; criteria: Record<string, boolean> }>) {
    const failedCriteria = Object.entries(item.criteria).filter(([, value]) => !value).map(([key]) => key).join(", ") || "Không";
    lines.push(`| ${item.id} | ${item.source ?? "không có"} | ${item.fallback === null ? "không rõ" : item.fallback ? "Có" : "Không"} | ${item.passed ? "Đạt" : "Không đạt"} | ${failedCriteria} |`);
  }
  lines.push("", `- Timeout đánh giá model: ${mode === "model" ? process.env.SUPPORTLAB_AGENT_TIMEOUT_MS : "không áp dụng"} ms`, `- Fallback do timeout: ${timeoutFallbacks} ca`, `- Ca model không fallback nhưng thiếu tool theo rubric: ${strictToolMisses} ca`, "", mode === "local"
    ? "Kết quả chỉ kiểm tra Agent cục bộ có đọc trạng thái mô phỏng, dùng công cụ phù hợp và truy xuất tri thức có nguồn; không đại diện cho chất lượng model AI thật, hiệu quả học tập hoặc Windows Server thật."
    : "Kết quả này là đánh giá kỹ thuật trên các ca mô phỏng đã định nghĩa. Cần báo cáo riêng các lần timeout, fallback, chi phí, giới hạn model và không suy rộng thành hiệu quả học tập hoặc độ đúng của Windows Server thật.");
  await writeFile(join(output, "report.md"), lines.join("\n"));
  console.log(JSON.stringify({ output, total: results.length, passed, failed: results.length - passed, timeoutFallbacks, strictToolMisses, evaluationTimeoutMs: mode === "model" ? Number(process.env.SUPPORTLAB_AGENT_TIMEOUT_MS) : null }, null, 2));
  if (passed !== results.length) process.exitCode = 1;
}

void main();
