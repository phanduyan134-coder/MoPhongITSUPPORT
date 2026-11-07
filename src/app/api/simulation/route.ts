import { NextResponse } from "next/server";
import { z } from "zod";
import { simulationActionSchema } from "@/lib/system-simulator";
import { readBoundedJson, SimulationSessionError, systemSessions } from "@/lib/system-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const presetId = z.string().min(1).max(80);
const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), presetId: presetId.optional() }).strict(),
  z.object({ operation: z.literal("action"), sessionId: id, expectedRevision: z.number().int().nonnegative(), action: simulationActionSchema }).strict(),
  z.object({ operation: z.literal("diagnose"), sessionId: id, device: z.enum(["server", "client"]), command: z.string().trim().min(1).max(256) }).strict(),
  z.object({ operation: z.literal("reset"), sessionId: id, presetId: presetId.optional() }).strict(),
  z.object({ operation: z.literal("export"), sessionId: id }).strict(),
]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof SimulationSessionError) return json({ error: error.message, ...error.snapshot }, error.status);
  return json({ error: "Không thể xử lý thao tác mô phỏng." }, 500);
}

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId || !id.safeParse(sessionId).success) return json({ error: "Cần mã phiên mô phỏng hợp lệ." }, 400);
    return json(systemSessions.get(sessionId));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return json({ error: "Thao tác hoặc dữ liệu mô phỏng không hợp lệ." }, 400);
    const data = parsed.data;
    switch (data.operation) {
      case "create": return json(systemSessions.create(data.presetId), 201);
      case "action": return json(systemSessions.action(data.sessionId, data.expectedRevision, data.action));
      case "diagnose": return json(systemSessions.diagnose(data.sessionId, data.device, data.command));
      case "reset": return json(systemSessions.reset(data.sessionId, data.presetId));
      case "export": return json(systemSessions.exportEvidence(data.sessionId));
    }
  } catch (error) { return failure(error); }
}
