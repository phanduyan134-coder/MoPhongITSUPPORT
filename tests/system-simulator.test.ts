import test from "node:test";
import assert from "node:assert/strict";
import {
  applySimulationAction, createSimulation, freeSpaceMB, getPortalFlow, runSimulationDiagnostic, runSimulationDiagnosticResult,
  simulationActionSchema, simulationPresets, type Simulation, type SimulationAction,
} from "../src/lib/system-simulator";

const apply = (state: Simulation, action: SimulationAction) => applySimulationAction(state, action).state;
const diagnose = (state: Simulation, command: string) => runSimulationDiagnostic(state, "client", command);

test("all advertised presets create independent states with no hidden answer in logs", () => {
  assert.equal(new Set(simulationPresets.map((preset) => preset.id)).size, simulationPresets.length);
  for (const preset of simulationPresets) {
    const state = createSimulation(preset.id);
    assert.equal(state.revision, 0);
    assert.deepEqual(state.events, []);
    assert.equal(state.server.ip, "192.168.10.10");
  }
  const first = createSimulation();
  first.client.link = false;
  first.system.files.pop();
  assert.equal(createSimulation().client.link, true);
  assert.equal(createSimulation().system.files.length, 3);
  assert.throws(() => createSimulation("not-a-preset"));
  for (const id of ["unconfigured", "dhcp-stopped"]) {
    const apipa = createSimulation(id);
    assert.equal(apipa.client.prefix, 16);
    assert.match(apipa.client.ip, /^169\.254\./);
  }
});

test("healthy client can resolve, use IIS, reach LAN and the routed test device", () => {
  const state = createSimulation();
  assert.equal(state.dhcp.end, "192.168.10.120");
  assert.match(runSimulationDiagnostic(state, "server", "ipconfig"), /SRV-01/);
  assert.match(diagnose(state, "nslookup portal.lab.test"), /Address: 192\.168\.10\.10/);
  assert.match(diagnose(state, "curl http://portal.lab.test"), /200 OK/);
  for (const ip of ["192.168.10.1", "192.168.10.10", "192.168.20.10"]) {
    assert.match(diagnose(state, `ping ${ip}`), /Received = 4/);
  }
  assert.match(diagnose(state, "ping 192.168.10.77"), /100% loss/);
});

test("portal flow visual state follows the same DNS and IIS conditions as the simulated website", () => {
  const healthy = getPortalFlow(createSimulation());
  assert.deepEqual(healthy, {
    network: true, dns: true, record: true, iis: true,
    message: "Luồng truy cập portal.lab.test đang hoạt động trong mô phỏng.",
  });
  const dnsStopped = getPortalFlow(createSimulation("dns-stopped"));
  assert.equal(dnsStopped.network, true);
  assert.equal(dnsStopped.dns, false);
  assert.match(dnsStopped.message, /DNS/);
  const wrongRecord = getPortalFlow(createSimulation("dns-record"));
  assert.equal(wrongRecord.record, false);
  const iisStopped = getPortalFlow(createSimulation("iis-site"));
  assert.equal(iisStopped.record, true);
  assert.equal(iisStopped.iis, false);
});

test("actions are immutable, revisions advance and events contain actions, not fixture answers", () => {
  const original = createSimulation("dns-stopped");
  const snapshot = structuredClone(original);
  const next = apply(original, { type: "service.toggle", service: "dns", running: true });
  assert.deepEqual(original, snapshot);
  assert.equal(next.revision, 1);
  assert.equal(next.simulatedTime, 1);
  assert.equal(next.events[0].message, "Dịch vụ DNS: Running.");
  assert.match(diagnose(next, "nslookup portal.lab.test"), /Address: 192\.168\.10\.10/);
});

test("DNS timeout is distinct from NXDOMAIN and a wrong record is observable", () => {
  const stopped = createSimulation("dns-stopped");
  assert.match(diagnose(stopped, "ping 192.168.10.10"), /Received = 4/);
  assert.match(diagnose(stopped, "nslookup portal.lab.test"), /timed out/);
  assert.doesNotMatch(diagnose(stopped, "nslookup portal.lab.test"), /NXDOMAIN/);
  const missing = createSimulation(); missing.dns.record = null;
  assert.match(diagnose(missing, "nslookup portal.lab.test"), /NXDOMAIN/);
  assert.match(diagnose(createSimulation(), "nslookup missing.lab.test"), /NXDOMAIN/);
  let wrong = createSimulation("dns-record");
  assert.match(diagnose(wrong, "nslookup portal.lab.test"), /192\.168\.10\.99/);
  assert.match(diagnose(wrong, "curl http://portal.lab.test"), /timed out/);
  wrong = apply(wrong, { type: "dns.record", address: "192.168.10.10" });
  assert.match(diagnose(wrong, "curl http://portal.lab.test"), /200 OK/);
});

test("explicit nslookup returns an immutable DNS trace from the same query and revision as its output", () => {
  const state = apply(createSimulation(), { type: "client.link", connected: true });
  const original = structuredClone(state);
  const command = "  NSLOOKUP  PORTAL.LAB.TEST.  ";
  const result = runSimulationDiagnosticResult(state, "client", command);
  assert.equal(result.output, runSimulationDiagnostic(state, "client", command));
  assert.equal(result.revision, 1);
  assert.deepEqual(result.dnsTrace, {
    revision: 1, device: "client", sourceIp: "192.168.10.100", resolverIp: "192.168.10.10",
    queryName: "portal.lab.test", queryType: "A", resolverDevice: "server", transport: "network",
    reachability: "reachable", outcome: "answer", answerIp: "192.168.10.10",
  });
  assert.deepEqual(state, original);
});

test("DNS trace preserves wrong answers instead of showing a repaired destination", () => {
  const state = createSimulation("dns-record");
  const result = runSimulationDiagnosticResult(state, "client", "nslookup portal.lab.test");
  assert.equal(result.dnsTrace?.outcome, "answer");
  assert.equal(result.dnsTrace?.answerIp, "192.168.10.99");
  assert.match(result.output, /Address: 192\.168\.10\.99/);
});

test("DNS NXDOMAIN traces require an actual response and do not include an answer address", () => {
  for (const name of ["missing.lab.test", "portal.lab.test"]) {
    const state = createSimulation();
    if (name === "portal.lab.test") state.dns.record = null;
    const result = runSimulationDiagnosticResult(state, "client", `nslookup ${name}`);
    assert.equal(result.dnsTrace?.outcome, "nxdomain");
    assert.equal(result.dnsTrace?.reachability, "reachable");
    assert.equal(result.dnsTrace?.answerIp, undefined);
    assert.match(result.output, /NXDOMAIN/);
  }
});

test("DNS timeout traces distinguish host reachability without declaring a stopped service", () => {
  const stopped = runSimulationDiagnosticResult(createSimulation("dns-stopped"), "client", "nslookup portal.lab.test");
  assert.equal(stopped.dnsTrace?.outcome, "timeout");
  assert.equal(stopped.dnsTrace?.reachability, "reachable");
  assert.equal(stopped.dnsTrace?.answerIp, undefined);
  assert.doesNotMatch(JSON.stringify(stopped), /Stopped|dừng|running|roles/);
  for (const preset of ["network-link", "network-disabled", "network-subnet", "dhcp-stopped"]) {
    const state = createSimulation(preset);
    const result = runSimulationDiagnosticResult(state, "client", "nslookup portal.lab.test 192.168.10.10");
    assert.equal(result.dnsTrace?.outcome, "timeout");
    assert.equal(result.dnsTrace?.resolverDevice, "server");
    assert.equal(result.dnsTrace?.reachability, "unreachable");
    assert.match(result.output, /timed out/);
  }
});

test("unmodeled DNS resolvers never imply request delivery or invent a reply", () => {
  const state = createSimulation("dhcp-options");
  for (const command of ["nslookup portal.lab.test", "nslookup portal.lab.test 8.8.8.8", "nslookup portal.lab.test 127.0.0.1"]) {
    const result = runSimulationDiagnosticResult(state, "client", command);
    assert.equal(result.dnsTrace?.outcome, "timeout");
    assert.equal(result.dnsTrace?.resolverDevice, null);
    assert.equal(result.dnsTrace?.reachability, "unknown");
    assert.equal(result.dnsTrace?.answerIp, undefined);
    assert.match(result.output, /timed out/);
  }
  const explicit = runSimulationDiagnosticResult(state, "client", "nslookup portal.lab.test 192.168.10.10");
  assert.equal(explicit.dnsTrace?.resolverIp, "192.168.10.10");
  assert.equal(explicit.dnsTrace?.outcome, "answer");
  assert.equal(state.client.dns, "192.168.10.254", "explicit lookup does not change configured DNS");
});

test("server DNS self-queries use a local path, including loopback", () => {
  const state = createSimulation("network-link");
  for (const resolver of ["127.0.0.1", "192.168.10.10"]) {
    const result = runSimulationDiagnosticResult(state, "server", `nslookup portal.lab.test ${resolver}`);
    assert.equal(result.dnsTrace?.transport, "local");
    assert.equal(result.dnsTrace?.sourceIp, resolver);
    assert.equal(result.dnsTrace?.resolverDevice, "server");
    assert.equal(result.dnsTrace?.reachability, "reachable");
    assert.equal(result.dnsTrace?.outcome, "answer");
  }
  state.dns.running = false;
  const stopped = runSimulationDiagnosticResult(state, "server", "nslookup portal.lab.test 127.0.0.1");
  assert.equal(stopped.dnsTrace?.transport, "local");
  assert.equal(stopped.dnsTrace?.reachability, "reachable");
  assert.equal(stopped.dnsTrace?.outcome, "timeout");
});

test("only validated explicit nslookup commands produce a standalone DNS trace", () => {
  const state = createSimulation();
  const original = structuredClone(state);
  for (const command of [
    "", "nslookup", "nslookup portal.lab.test 999.1.2.3", "nslookup portal.lab.test 1.2.3.4 extra",
    "nslookup portal.lab.test && whoami", "nslookup portal.lab.test\nwhoami", "nslookup portal.lab.test | cmd",
    "nslookup portal.lab.test; whoami", "nslookup portal.lab.test > file", "nslookup https://portal.lab.test",
    "nslookup " + "a".repeat(241), "ipconfig /all", "ping portal.lab.test", "curl http://portal.lab.test",
  ]) {
    const result = runSimulationDiagnosticResult(state, "client", command);
    assert.equal(result.dnsTrace, undefined, command);
    assert.equal(result.output, runSimulationDiagnostic(state, "client", command));
    assert.equal(result.revision, state.revision);
  }
  assert.deepEqual(state, original);
});

test("DHCP stopped preserves an unexpired lease, but no-lease renew gives APIPA", () => {
  let state = apply(createSimulation(), { type: "service.toggle", service: "dhcp", running: false });
  const response = applySimulationAction(state, { type: "client.renew" });
  assert.match(response.message, /giữ lease còn hạn/);
  assert.equal(response.state.client.ip, "192.168.10.100");
  assert.match(diagnose(response.state, "curl http://portal.lab.test"), /200 OK/);
  state = createSimulation("dhcp-stopped");
  state = apply(state, { type: "client.renew" });
  assert.equal(state.client.ip, "169.254.10.100");
  assert.equal(state.client.prefix, 16);
  assert.match(diagnose(state, "ping 192.168.10.10"), /100% loss/);
  state = apply(state, { type: "service.toggle", service: "dhcp", running: true });
  assert.equal(state.client.ip, "169.254.10.100", "starting service alone does not change the client");
  state = apply(state, { type: "client.renew" });
  assert.equal(state.client.ip, "192.168.10.100");
  assert.equal(state.client.prefix, 24);
  assert.match(diagnose(state, "curl http://portal.lab.test"), /200 OK/);
});

test("expired lease cannot keep a previous address after failed DHCP renewal", () => {
  let state = createSimulation();
  state.simulatedTime = 28800; state.dhcp.running = false;
  state = apply(state, { type: "client.renew" });
  assert.equal(state.dhcp.lease, null);
  assert.equal(state.client.ip, "169.254.10.100");
});

test("changing DHCP DNS option requires renewal and preserves static client settings", () => {
  let state = createSimulation("dhcp-options");
  assert.match(diagnose(state, "nslookup portal.lab.test"), /timed out/);
  state = apply(state, { type: "dhcp.configure", config: {
    start: state.dhcp.start, end: state.dhcp.end, gateway: state.dhcp.gateway, dns: "192.168.10.10", active: true,
  } });
  assert.equal(state.client.dns, "192.168.10.254");
  state = apply(state, { type: "client.renew" });
  assert.match(diagnose(state, "nslookup portal.lab.test"), /Address: 192\.168\.10\.10/);
  state = apply(state, { type: "client.configure", config: {
    ip: "192.168.10.101", prefix: 24, gateway: "192.168.10.1", dns: "192.168.10.10", dhcp: false,
  } });
  assert.throws(() => apply(state, { type: "client.renew" }), /IP tĩnh/);
});

test("DHCP scope option diagnostic reads server options rather than stale client values", () => {
  let state = createSimulation("network-gateway");
  const command = "Get-DhcpServerv4OptionValue -ScopeId 192.168.10.0";
  const original = structuredClone(state);
  assert.equal(runSimulationDiagnostic(state, "server", command), "ScopeId: 192.168.10.0\nOptionId Name          Value\n3        Router        192.168.10.1\n6        DNS Servers   192.168.10.10");
  assert.equal(state.client.gateway, "192.168.10.254");
  assert.deepEqual(state, original);
  assert.doesNotMatch(runSimulationDiagnostic(state, "client", command), /OptionId Name/);
  assert.doesNotMatch(runSimulationDiagnostic(state, "server", command.replace("192.168.10.0", "192.168.20.0")), /OptionId Name/);
  for (const invalid of ["Get-DhcpServerv4OptionValue", `${command} -All`, command.replace("-ScopeId", "-Scope"), command.replace("192.168.10.0", "999.1.2.3")]) {
    assert.doesNotMatch(runSimulationDiagnostic(state, "server", invalid), /OptionId Name/);
  }
  state = apply(state, { type: "dhcp.configure", config: { start: state.dhcp.start, end: state.dhcp.end, gateway: "192.168.10.254", dns: "192.168.10.20", active: true } });
  assert.match(runSimulationDiagnostic(state, "server", command.toLowerCase()), /3\s+Router\s+192\.168\.10\.254\n6\s+DNS Servers\s+192\.168\.10\.20/);
  assert.doesNotMatch(runSimulationDiagnostic(createSimulation("dhcp-stopped"), "server", command), /OptionId Name/);
  assert.doesNotMatch(runSimulationDiagnostic(createSimulation("unconfigured"), "server", command), /OptionId Name/);
});

test("DHCP scope validates bounds, subnet and excludes server/router allocation", () => {
  const state = createSimulation();
  for (const [start, end] of [["192.168.10.200", "192.168.10.100"], ["192.168.20.100", "192.168.20.200"], ["192.168.10.0", "192.168.10.10"]]) {
    assert.throws(() => apply(state, { type: "dhcp.configure", config: { start, end, gateway: "192.168.10.1", dns: "192.168.10.10", active: true } }));
  }
  let narrow = apply(state, { type: "dhcp.configure", config: {
    start: "192.168.10.10", end: "192.168.10.11", gateway: "192.168.10.1", dns: "192.168.10.10", active: true,
  } });
  narrow = apply(narrow, { type: "client.renew" });
  assert.equal(narrow.client.ip, "192.168.10.11");
});

test("fresh server supports installing roles and configuring services end to end", () => {
  let state = createSimulation("unconfigured");
  assert.throws(() => apply(state, { type: "dns.record", address: "192.168.10.10" }), /role/);
  assert.throws(() => apply(state, { type: "service.toggle", service: "dhcp", running: true }), /Role/);
  assert.throws(() => apply(state, { type: "iis.configure", config: { siteRunning: true, poolRunning: true, port: 80 } }), /role/);
  for (const role of ["dns", "dhcp", "iis"] as const) state = apply(state, { type: "role.install", role });
  state = apply(state, { type: "dns.record", address: "192.168.10.10" });
  state = apply(state, { type: "dhcp.configure", config: {
    start: "192.168.10.100", end: "192.168.10.120", gateway: "192.168.10.1", dns: "192.168.10.10", active: true,
  } });
  state = apply(state, { type: "iis.configure", config: { siteRunning: true, poolRunning: true, port: 80 } });
  state = apply(state, { type: "client.renew" });
  assert.match(diagnose(state, "curl http://portal.lab.test"), /200 OK/);
});

test("IIS distinguishes a stopped site, stopped pool and a different binding port", () => {
  assert.match(diagnose(createSimulation("iis-site"), "curl http://portal.lab.test"), /connection refused/);
  assert.doesNotMatch(diagnose(createSimulation("iis-site"), "curl http://portal.lab.test"), /503/);
  assert.match(diagnose(createSimulation("iis-pool"), "curl http://portal.lab.test"), /503 Service Unavailable/);
  let state = createSimulation("iis-port");
  assert.match(diagnose(state, "curl http://portal.lab.test"), /connection refused/);
  assert.match(diagnose(state, "curl http://192.168.10.10:8080"), /200 OK/);
  state = apply(state, { type: "iis.configure", config: { port: 80, siteRunning: true, poolRunning: true } });
  assert.match(diagnose(state, "curl http://portal.lab.test"), /200 OK/);
  assert.match(diagnose(state, "curl http://192.168.10.10:8080"), /connection refused/);
});

test("wrong gateway only breaks routed connectivity, not DNS or the local website", () => {
  let state = createSimulation("network-gateway");
  assert.match(diagnose(state, "ping 192.168.10.10"), /Received = 4/);
  assert.match(diagnose(state, "curl http://portal.lab.test"), /200 OK/);
  assert.match(diagnose(state, "ping 192.168.20.10"), /100% loss/);
  assert.equal(state.client.dhcp, true);
  assert.equal(state.dhcp.gateway, "192.168.10.1");
  state = apply(state, { type: "client.renew" });
  assert.equal(state.client.dhcp, true);
  assert.equal(state.client.gateway, state.dhcp.gateway);
  assert.match(diagnose(state, "ping 192.168.20.10"), /Received = 4/);
});

test("link, interface and subnet failures remain separate and server checks are independent", () => {
  for (const preset of ["network-link", "network-disabled", "network-subnet"]) {
    const state = createSimulation(preset);
    assert.match(diagnose(state, "ping 192.168.10.10"), /100% loss/);
    assert.match(runSimulationDiagnostic(state, "server", "curl http://portal.lab.test"), /200 OK/);
    assert.match(runSimulationDiagnostic(state, "server", "ping 192.168.20.10"), /Received = 4/);
  }
  const state = createSimulation();
  state.client.prefix = 25;
  assert.match(diagnose(state, "ping 192.168.10.10"), /Received = 4/);
  state.client.ip = "192.168.10.200";
  assert.match(diagnose(state, "ping 192.168.10.10"), /100% loss/);
  state.client.ip = "192.168.10.100"; state.client.prefix = 16;
  assert.match(diagnose(state, "ping 192.168.20.10"), /100% loss/, "incorrect on-link route cannot reach routed test destination");
});

test("Get-Volume reports volume capacity without file inventory or deletion advice", () => {
  let state = createSimulation("disk-full");
  const output = runSimulationDiagnostic(state, "server", "Get-Volume");
  assert.equal(output, "DriveLetter: D\nFileSystem: NTFS\nSize: 1024 MB\nSizeRemaining: 4 MB");
  for (const file of state.system.files) assert.equal(output.includes(file.name), false);
  assert.doesNotMatch(output, /protected|temporary|removable/);
  assert.doesNotMatch(runSimulationDiagnostic(state, "client", "Get-Volume"), /DriveLetter:/);
  state = apply(state, { type: "file.delete", id: "temp-cache" });
  assert.match(runSimulationDiagnostic(state, "server", "Get-Volume"), /SizeRemaining: 832 MB/);
  state = apply(state, { type: "file.write" });
  assert.match(runSimulationDiagnostic(state, "server", "Get-Volume"), /SizeRemaining: 822 MB/);
});

test("disk cleanup preserves protected files and write probe does not grow without bound", () => {
  let state = createSimulation("disk-full");
  assert.equal(freeSpaceMB(state), 4);
  let result = applySimulationAction(state, { type: "file.write" });
  assert.match(result.message, /thất bại/);
  assert.equal(result.state.system.files.length, 3);
  assert.throws(() => apply(state, { type: "file.delete", id: "business-data" }), /bảo vệ/);
  assert.throws(() => apply(state, { type: "file.delete", id: "missing" }), /Không tìm thấy/);
  state = apply(state, { type: "file.delete", id: "temp-cache" });
  assert.equal(freeSpaceMB(state), 832);
  result = applySimulationAction(state, { type: "file.write" });
  assert.match(result.message, /thành công/);
  state = result.state;
  for (let count = 0; count < 5; count += 1) state = apply(state, { type: "file.write" });
  assert.equal(freeSpaceMB(state), 822);
  assert.equal(state.system.files.filter((file) => file.id === "write-probe").length, 1);
  assert.equal(state.system.files.find((file) => file.id === "business-data")?.sizeMB, 128);
});

test("both share and NTFS must permit tech while outsider remains denied", () => {
  for (const preset of ["share-ntfs", "share-permission"]) {
    let state = createSimulation(preset);
    assert.match(diagnose(state, "Test-Share tech"), /Access denied/);
    state = apply(state, { type: "share.configure", config: { shareRead: true, ntfsRead: true } });
    assert.match(diagnose(state, "Test-Share tech"), /Read successful: tech đọc được \\\\SRV-01\\SupportShare/);
    assert.match(diagnose(state, "Test-Share outsider"), /Access denied/);
    assert.match(runSimulationDiagnostic(state, "server", "Get-SmbShareAccess"), /Read: Allow/);
    assert.match(runSimulationDiagnostic(state, "server", "icacls D:\\SupportShare"), /\(R\) Allow/);
    assert.match(runSimulationDiagnostic(state, "server", "icacls D:\\Share"), /D:\\SupportShare/);
  }
  assert.match(diagnose(createSimulation("network-link"), "Test-Share tech"), /Không kết nối/);
});

test("worker startup fix is confirmed by reboot, not merely manual start", () => {
  let state = createSimulation("worker-disabled");
  assert.throws(() => apply(state, { type: "worker.configure", config: { startup: "Disabled", running: true } }), /Disabled/);
  state = apply(state, { type: "worker.configure", config: { startup: "Manual", running: true } });
  assert.equal(state.system.workerRunning, true);
  state = apply(state, { type: "server.reboot" });
  assert.equal(state.system.workerRunning, false);
  state = apply(state, { type: "worker.configure", config: { startup: "Automatic", running: false } });
  state = apply(state, { type: "server.reboot" });
  assert.equal(state.system.workerRunning, true);
  assert.match(runSimulationDiagnostic(state, "server", "Get-Service LabWorker"), /Running\s+Automatic/);
  assert.equal(state.simulatedTime, 124);
});

test("strict action schemas reject injection, invalid IPv4, extra fields and bounds", () => {
  const healthy = createSimulation();
  for (const ip of ["1.2.3", "999.1.2.3", "01.2.3.4", "1.2.3.4;cmd", ""]) {
    assert.equal(simulationActionSchema.safeParse({ type: "dns.record", address: ip }).success, false);
  }
  for (const port of [0, 65536, 80.5]) {
    assert.equal(simulationActionSchema.safeParse({ type: "iis.configure", config: { port, siteRunning: true, poolRunning: true } }).success, false);
  }
  assert.equal(simulationActionSchema.safeParse({ type: "server.reboot", command: "whoami" }).success, false);
  assert.equal(simulationActionSchema.safeParse({ type: "client.configure", config: { ip: "192.168.10.100", prefix: 33, gateway: "192.168.10.1", dns: "192.168.10.10", dhcp: false } }).success, false);
  for (const command of ["ping 192.168.10.10 && whoami", "Get-Service; whoami", "curl http://localhost:3000", "whoami", "Get-Volume\nwhoami", "curl https://example.com", "curl http://portal.lab.test/private", "ping 192.168.10.10 | cmd"]) {
    assert.doesNotMatch(diagnose(healthy, command), /200 OK|Received = 4/);
  }
  assert.equal(healthy.revision, 0);
});

test("event history stays bounded and diagnostics never mutate simulation", () => {
  let state = createSimulation();
  for (let index = 0; index < 105; index += 1) state = apply(state, { type: "client.link", connected: true });
  assert.equal(state.events.length, 100);
  assert.equal(state.events[0].id, 6);
  const original = structuredClone(state);
  for (const command of ["help", "ipconfig /all", "ping 192.168.10.10", "nslookup portal.lab.test", "Get-Service", "Get-Volume", "Get-WinEvent", "Test-Share outsider"]) {
    runSimulationDiagnostic(state, "server", command);
  }
  assert.deepEqual(state, original);
});
