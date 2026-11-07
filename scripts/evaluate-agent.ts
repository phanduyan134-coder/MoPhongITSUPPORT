import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { POST as agentPost } from "../src/app/api/system-agent/route";
import { systemSessions } from "../src/lib/system-session";

type Case = { id: string; preset: string; device: "server" | "client"; question: string; terms: string[]; tools: string[] };
type AgentResponse = { source?: string; message?: string; revision?: number; trace?: { tool: string; input: Record<string, unknown>; status: string; origin: string }[]; sources?: unknown[]; error?: string };

const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const request = (body: unknown) => new Request("http://localhost:3000/api/system-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  process.env.SUPPORTLAB_AI_ENABLED = "false";
  const cases = JSON.parse(await readFile(join(process.cwd(), "experiments", "agent-evaluation", "cases.json"), "utf8")) as Case[];
  const results = [] as Record<string, unknown>[];
  for (const item of cases) {
    const session = systemSessions.create(item.preset);
    const response = await agentPost(request({ sessionId: session.sessionId, device: item.device, purpose: "diagnose", history: [{ role: "user", content: item.question }] }));
    const body = await response.json() as AgentResponse;
    const text = normalize(body.message ?? "");
    const missingTerms = item.terms.filter((term) => !text.includes(normalize(term)));
    const trace = body.trace ?? [];
    const traceLabels = trace.map((entry) => `${entry.tool}:${String(entry.input?.service ?? entry.input?.command ?? entry.input?.device ?? "")}`);
    const missingTools = item.tools.filter((expected) => {
      const [tool, value] = expected.split(":", 2);
      return !trace.some((entry) => entry.tool === tool && normalize(JSON.stringify(entry.input)).includes(normalize(value)));
    });
    const hasKnowledge = trace.some((entry) => entry.tool === "search_knowledge" && entry.status === "ok");
    const hasMutation = trace.some((entry) => entry.tool !== "inspect_network" && entry.tool !== "inspect_service" && entry.tool !== "inspect_system" && entry.tool !== "run_diagnostic" && entry.tool !== "search_knowledge" && entry.tool !== "read_logs");
    const passed = response.status === 200 && body.source === "local" && body.revision === 0 && missingTerms.length === 0 && missingTools.length === 0 && hasKnowledge && !hasMutation;
    results.push({ id: item.id, preset: item.preset, status: response.status, passed, source: body.source, revision: body.revision, missingTerms, missingTools, hasKnowledge, hasMutation, trace: traceLabels, rawTrace: trace, message: body.message });
  }
  const passed = results.filter((item) => item.passed).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = join(process.cwd(), "output", "evidence", "agent-evaluation", timestamp);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "results.json"), JSON.stringify({ schemaVersion: 1, mode: "local-rule-based", generatedAt: new Date().toISOString(), cases: results, summary: { total: results.length, passed, failed: results.length - passed } }, null, 2));
  const lines = ["# Đánh giá AI Agent cục bộ", "", `- Thời điểm: ${new Date().toISOString()}`, "- Chế độ: local rule-based, không gọi model/API bên ngoài", `- Kết quả: **${passed}/${results.length} ca đạt**`, "", "| Ca | Preset | Kết quả | Thiếu bằng chứng |", "|---|---|---:|---|"];
  for (const item of results as Array<{ id: string; preset: string; passed: boolean; missingTerms: string[]; missingTools: string[] }>) lines.push(`| ${item.id} | ${item.preset} | ${item.passed ? "Đạt" : "Không đạt"} | ${[...item.missingTerms, ...item.missingTools].join(", ") || "Không"} |`);
  lines.push("", "Các ca chỉ kiểm tra Agent có đọc trạng thái mô phỏng, dùng công cụ phù hợp và truy xuất tri thức có nguồn. Kết quả không đại diện cho chất lượng model AI thật, hiệu quả học tập hoặc Windows Server thật.");
  await writeFile(join(output, "report.md"), lines.join("\n"));
  console.log(JSON.stringify({ output, total: results.length, passed, failed: results.length - passed }, null, 2));
  if (passed !== results.length) process.exitCode = 1;
}

void main();
