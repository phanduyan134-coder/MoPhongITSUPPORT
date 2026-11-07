import type { Simulation, SimulationAction } from "../../src/lib/system-simulator";

export const DNS_PILOT_VERSION = "dns-pilot-v1";
export const DNS_PILOT_CASE_IDS = ["D01", "D02", "D03", "D04", "D05"] as const;
export type DnsPilotCaseId = typeof DNS_PILOT_CASE_IDS[number];

export type DnsPilotCase = {
  id: DnsPilotCaseId;
  report: string;
  initialState: Simulation;
  referenceActions: SimulationAction[];
  privateAssessment: {
    cause: string;
    expectedInitial: {
      dnsOutcome: "answer" | "timeout";
      answerIp?: string;
      serverReachable: boolean;
      httpOk: boolean;
      dnsServiceRunning: boolean;
    };
    labValidation: "pending";
  };
};

export type DnsPilotParticipantInput = Pick<DnsPilotCase, "report" | "initialState">;

const PARTICIPANT_REPORT = "Kiểm tra khả năng truy cập http://portal.lab.test từ máy trạm và khôi phục nếu có sự cố, không thay đổi dịch vụ hoặc dữ liệu không liên quan.";

// Public development fixtures, not held-out cases or lab-validated reference data.
function createInitialState(): Simulation {
  return {
    revision: 0,
    simulatedTime: 0,
    client: {
      ip: "192.168.10.100", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10",
      dhcp: true, link: true, enabled: true,
    },
    server: { ip: "192.168.10.10", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10" },
    roles: { dns: true, dhcp: true, iis: true },
    dns: { running: true, record: "192.168.10.10" },
    dhcp: {
      running: true, active: true, start: "192.168.10.100", end: "192.168.10.120",
      gateway: "192.168.10.1", dns: "192.168.10.10",
      lease: { ip: "192.168.10.100", expiresAt: 28800 },
    },
    iis: { siteRunning: true, poolRunning: true, port: 80 },
    system: {
      capacityMB: 1024,
      files: [
        { id: "business-data", name: "Du-lieu-khach-hang.dat", sizeMB: 128, protected: true },
        { id: "service-data", name: "Du-lieu-dich-vu.dat", sizeMB: 64, protected: true },
        { id: "temp-cache", name: "Cache-tam-lab.tmp", sizeMB: 128, protected: false },
      ],
      shareRead: true, ntfsRead: true, startup: "Automatic", workerRunning: true,
    },
    events: [],
  };
}

export function createDnsPilotCase(id: DnsPilotCaseId): DnsPilotCase {
  const pilotCase: DnsPilotCase = {
    id,
    report: PARTICIPANT_REPORT,
    initialState: createInitialState(),
    referenceActions: [],
    privateAssessment: {
      cause: "No fault; confirm normal portal access without unnecessary changes.",
      expectedInitial: {
        dnsOutcome: "answer", answerIp: "192.168.10.10", serverReachable: true,
        httpOk: true, dnsServiceRunning: true,
      },
      labValidation: "pending",
    },
  };
  const expected = pilotCase.privateAssessment.expectedInitial;
  switch (id) {
    case "D01":
      break;
    case "D02":
      pilotCase.initialState.dns.running = false;
      pilotCase.referenceActions.push({ type: "service.toggle", service: "dns", running: true });
      pilotCase.privateAssessment.cause = "DNS service is stopped; LAN and IIS remain configured correctly.";
      expected.dnsOutcome = "timeout";
      delete expected.answerIp;
      expected.httpOk = false;
      expected.dnsServiceRunning = false;
      break;
    case "D03":
      pilotCase.initialState.dns.record = "192.168.10.99";
      pilotCase.referenceActions.push({ type: "dns.record", address: "192.168.10.10" });
      pilotCase.privateAssessment.cause = "The portal A record points to the wrong address; DNS still answers.";
      expected.answerIp = "192.168.10.99";
      expected.httpOk = false;
      break;
    case "D04":
      pilotCase.initialState.client.dns = "192.168.10.254";
      pilotCase.referenceActions.push({ type: "client.renew" });
      pilotCase.privateAssessment.cause = "Only the client resolver is wrong; the DHCP DNS option and DNS service are healthy.";
      expected.dnsOutcome = "timeout";
      delete expected.answerIp;
      expected.httpOk = false;
      break;
    case "D05":
      pilotCase.initialState.client.link = false;
      pilotCase.referenceActions.push({ type: "client.link", connected: true });
      pilotCase.privateAssessment.cause = "The client network link is disconnected; server-side services are healthy.";
      expected.dnsOutcome = "timeout";
      delete expected.answerIp;
      expected.serverReachable = false;
      expected.httpOk = false;
      break;
    default:
      throw new Error("Unknown DNS pilot case.");
  }
  return pilotCase;
}

export function getDnsPilotParticipantInput(pilotCase: DnsPilotCase): DnsPilotParticipantInput {
  return { report: pilotCase.report, initialState: structuredClone(pilotCase.initialState) };
}
