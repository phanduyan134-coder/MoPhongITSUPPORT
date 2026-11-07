import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { compareWithSimulator, loadReferenceEvidence, REFERENCE_MANIFEST_SHA256, REFERENCE_RUN, sha256 } from "../experiments/dns-reference/compare";

async function main() {
  if (process.argv.length > 2) throw new Error("This runner takes no arguments and uses the pinned local reference run.");
  const root = process.cwd();
  const evidence = await loadReferenceEvidence(join(root, "output/evidence/windows-dns", REFERENCE_RUN));
  const results = compareWithSimulator(evidence.phases);
  const sourceFiles = ["experiments/dns-reference/compare.ts", "scripts/compare-dns-reference.ts", "src/lib/system-simulator.ts", "src/lib/system-verification.ts", "src/lib/system-evidence.ts"];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, sha256(await readFile(join(root, file)))])));
  const createdAt = new Date().toISOString();
  const directory = join(root, "output/experiments/dns-reference", `${createdAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  const record = {
    schemaVersion: 1, kind: "captured-windows-dns-regression", createdAt,
    reviewStatus: "agent-reviewed-awaiting-supervisor", technicalRegressionPassed: results.every((entry) => entry.passed),
    execution: { simulator: "current-source-offline", windowsLab: "previously-captured-not-rerun", model: "not-run", userStudy: "not-run" },
    reference: { runLabel: REFERENCE_RUN, directory: relative(root, evidence.root).replaceAll("\\", "/"), manifestSha256: REFERENCE_MANIFEST_SHA256,
      observationHashesPinned: true, rawFilesChecked: evidence.rawFilesChecked, observations: evidence.observations },
    sourceHashes, nodeVersion: process.version, results,
    limitations: [
      "Technical regression against a single previously captured Windows pair; no new Windows experiment or human approval.",
      "Only DNS-service stopped/restored behavior and DNS/IIS same-LAN outcomes are compared; other pilot cases, DHCP, routing and system failures are not validated.",
      "Simulator uses DHCP/gateway .1; reference uses static IPv4 and no gateway. Only compared local behaviors are supported.",
      "nslookup exit 0 is not success proof; resolver UnKnown/initial timeout can precede a valid A answer.",
      "Real curl resolving timeout is exit 28; simulator simplifies error strings, timing and HTML content. Exact output and performance equivalence is not claimed.",
      "No real AI/model quality or learning-effectiveness evaluation was performed.",
    ],
  };
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  await writeFile(join(directory, "comparison.json"), JSON.stringify(record, null, 2) + "\n");
  const rows = results.map(({ phase, reference, simulated, passed }) => `| ${phase} | ${Object.values(reference.outcomes).map(Number).join(" / ")} | ${Object.values(simulated.outcomes).map(Number).join(" / ")} | ${passed ? "Khớp" : "Sai khác"} |`).join("\n");
  await writeFile(join(directory, "README.md"), `# Đối chiếu hồi quy DNS với kết quả máy ảo đã lưu\n\nThời điểm: ${createdAt}. Trạng thái rà: agent-reviewed-awaiting-supervisor.\n\n${record.technicalRegressionPassed ? "Đạt" : "Chưa đạt"} đối chiếu kỹ thuật trong phạm vi DNS/IIS cùng LAN của ca D02. Đây là lượt chạy mô phỏng hiện tại, đọc lại lab ngày 02/11/2026; **không chạy lại Windows hoặc model AI**.\n\nĐã kiểm hash manifest, sáu observation JSON được ghim và ${evidence.rawFilesChecked} tệp stdout/stderr gốc. Không thay đổi hồ sơ cũ.\n\nThứ tự các cột kết quả: ping IP / DNS Running / A đúng / HTTP theo tên / HTTP theo IP; 1 là đạt, 0 là không đạt.\n\n| Pha | Lab đã lưu | Mô phỏng hiện tại | Đối chiếu |\n| --- | --- | --- | --- |\n${rows}\n\nCả kết quả DNS có cấu trúc và việc bảo toàn cấu hình không liên quan đều được kiểm tra. JSON kèm theo giữ đầu ra mô phỏng, revision, hash nguồn và liên kết observation.\n\n## Giới hạn\n\n${record.limitations.map((entry) => `- ${entry}`).join("\n")}\n\nBằng chứng tham chiếu: ${record.reference.directory}. File này không đổi trạng thái pilot cũ và chưa phải xác nhận của giảng viên.\n`);
  console.log(JSON.stringify({ directory: relative(root, resolve(directory)), technicalRegressionPassed: record.technicalRegressionPassed, rawFilesChecked: evidence.rawFilesChecked, phases: results.map(({ phase, passed }) => ({ phase, passed })) }, null, 2));
  if (!record.technicalRegressionPassed) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "DNS comparison failed"); process.exitCode = 1; });
