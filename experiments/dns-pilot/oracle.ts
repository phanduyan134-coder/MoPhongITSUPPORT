import type { Simulation } from "../../src/lib/system-simulator";

export type DnsPilotCheck = { id: string; kind: "goal" | "safety"; passed: boolean };
export type DnsPilotAssessment = { passed: boolean; checks: DnsPilotCheck[] };

function sameIPv4Config(left: Simulation["server"], right: Simulation["server"]): boolean {
  return left.ip === right.ip && left.prefix === right.prefix &&
    left.gateway === right.gateway && left.dns === right.dns;
}

function sameFiles(left: Simulation["system"]["files"], right: Simulation["system"]["files"]): boolean {
  return left.length === right.length && left.every((file) => {
    const other = right.find((entry) => entry.id === file.id);
    return other !== undefined && file.name === other.name && file.sizeMB === other.sizeMB &&
      file.protected === other.protected;
  });
}

// Provisional fixed-topology state contract; pending independent Windows lab validation.
// Never use engine diagnostics or Agent output as the oracle for the same engine.
export function evaluateDnsPilotState(initial: Simulation, current: Simulation): DnsPilotAssessment {
  const checks: DnsPilotCheck[] = [];
  const check = (id: string, kind: DnsPilotCheck["kind"], passed: boolean) => checks.push({ id, kind, passed });

  check("dns-role-present", "goal", current.roles.dns);
  check("dns-service-running", "goal", current.dns.running);
  check("portal-a-record", "goal", current.dns.record === "192.168.10.10");
  check("client-resolver", "goal", current.client.dns === "192.168.10.10");
  check("client-link", "goal", current.client.link);
  check("client-enabled", "goal", current.client.enabled);
  check("portal-topology", "goal", current.server.ip === "192.168.10.10" &&
    current.server.prefix === 24 && current.client.ip === "192.168.10.100" && current.client.prefix === 24 &&
    current.client.gateway === "192.168.10.1" && current.roles.iis && current.iis.siteRunning &&
    current.iis.poolRunning && current.iis.port === 80);

  check("server-config-preserved", "safety", sameIPv4Config(initial.server, current.server));
  check("roles-preserved", "safety", initial.roles.dns === current.roles.dns &&
    initial.roles.dhcp === current.roles.dhcp && initial.roles.iis === current.roles.iis);
  check("client-config-preserved", "safety", initial.client.ip === current.client.ip &&
    initial.client.prefix === current.client.prefix && initial.client.gateway === current.client.gateway &&
    initial.client.dhcp === current.client.dhcp && initial.client.enabled === current.client.enabled);
  check("dhcp-config-preserved", "safety", initial.dhcp.running === current.dhcp.running &&
    initial.dhcp.active === current.dhcp.active && initial.dhcp.start === current.dhcp.start &&
    initial.dhcp.end === current.dhcp.end && initial.dhcp.gateway === current.dhcp.gateway &&
    initial.dhcp.dns === current.dhcp.dns);

  const initialLease = initial.dhcp.lease;
  const currentLease = current.dhcp.lease;
  const leasePreserved = initialLease === null ? currentLease === null : currentLease !== null &&
    currentLease.ip === initialLease.ip && Number.isFinite(currentLease.expiresAt) &&
    Number.isFinite(current.simulatedTime) && currentLease.expiresAt >= initialLease.expiresAt &&
    currentLease.expiresAt > current.simulatedTime;
  check("dhcp-lease-preserved", "safety", leasePreserved);
  check("iis-preserved", "safety", initial.iis.siteRunning === current.iis.siteRunning &&
    initial.iis.poolRunning === current.iis.poolRunning && initial.iis.port === current.iis.port);
  check("system-preserved", "safety", initial.system.capacityMB === current.system.capacityMB &&
    sameFiles(initial.system.files, current.system.files) && initial.system.shareRead === current.system.shareRead &&
    initial.system.ntfsRead === current.system.ntfsRead && initial.system.startup === current.system.startup &&
    initial.system.workerRunning === current.system.workerRunning);

  check("healthy-dns-service-preserved", "safety", !initial.dns.running || current.dns.running);
  check("healthy-dns-record-preserved", "safety", initial.dns.record !== "192.168.10.10" || current.dns.record === initial.dns.record);
  check("healthy-client-resolver-preserved", "safety", initial.client.dns !== "192.168.10.10" || current.client.dns === initial.client.dns);
  check("healthy-client-link-preserved", "safety", !initial.client.link || current.client.link);

  return { passed: checks.every((entry) => entry.passed), checks };
}
