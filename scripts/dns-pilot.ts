import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDnsPilotCase, DNS_PILOT_CASE_IDS, type DnsPilotCaseId } from "../experiments/dns-pilot/cases";
import { runDnsPilotCase, type DnsPilotManifest } from "../experiments/dns-pilot/run";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("npm run pilot:dns [-- --case D01|D02|D03|D04|D05]");
    console.log("Offline scripted simulator smoke check only; no model, Windows lab or user experiment.");
    return;
  }
  let caseIds: readonly DnsPilotCaseId[] = DNS_PILOT_CASE_IDS;
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--case" || !DNS_PILOT_CASE_IDS.includes(args[1] as DnsPilotCaseId)) {
      throw new Error("Invalid arguments. Use npm run pilot:dns -- --help.");
    }
    caseIds = [args[1] as DnsPilotCaseId];
  }

  const root = process.cwd();
  const sourceFiles = [
    "src/lib/system-simulator.ts", "experiments/dns-pilot/cases.ts", "experiments/dns-pilot/oracle.ts",
    "experiments/dns-pilot/run.ts", "scripts/dns-pilot.ts", "package.json", "package-lock.json",
  ];
  const sourceHashes: Record<string, string> = {};
  for (const file of sourceFiles) {
    sourceHashes[file] = createHash("sha256").update(await readFile(join(root, file))).digest("hex");
  }
  const git = (args: string[]) => execFileSync("git", ["-c", `safe.directory=${root.replace(/\\/g, "/")}`, ...args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  let gitState: DnsPilotManifest["git"] = { commit: null, dirty: null };
  try {
    gitState = { commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]).length > 0 };
  } catch {
    // Source hashes still identify the tested files when Git is unavailable.
  }
  const manifest: DnsPilotManifest = {
    capturedAt: new Date().toISOString(), git: gitState, sourceHashes, nodeVersion: process.version,
  };
  const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const outputRoot = join(root, "output", "experiments", "dns-pilot");
  await mkdir(outputRoot, { recursive: true });
  const outputDirectory = join(outputRoot, batchId);
  await mkdir(outputDirectory);
  let passed = 0;
  for (const caseId of caseIds) {
    const record = runDnsPilotCase(createDnsPilotCase(caseId), { manifest });
    await writeFile(join(outputDirectory, `${caseId}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    if (record.technicalSmokePassed) passed++;
    console.log(`${caseId}: ${record.technicalSmokePassed ? "PASS" : "FAIL"} (scripted simulator check; pending lab validation)`);
  }
  console.log(`Technical checks: ${passed}/${caseIds.length}. No AI/model or Windows reference lab was run.`);
  console.log(`Records: ${outputDirectory}`);
  if (passed !== caseIds.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DNS pilot failed.");
  process.exitCode = 1;
});
