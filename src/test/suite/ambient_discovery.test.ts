import * as assert from "assert";
import * as sinon from "sinon";
import * as wsl from "../../shared/utils/wsl";
import * as detection from "../../shared/platform/detection_utils";
import {
  AmbientDiscovery,
  parseAmbientListeningPorts,
} from "../../shared/platform/ambient_discovery";
import type { ProcessInfo } from "../../shared/utils/types";

interface AmbientDiscoveryTestAccess {
  extractDetails(cmd: string, pid: number, ppid: number): ProcessInfo | null;
}

function extractDetails(cmd: string): ProcessInfo | null {
  const discovery = new AmbientDiscovery() as unknown as AmbientDiscoveryTestAccess;
  return discovery.extractDetails(cmd, 12345, 12000);
}

suite("AmbientDiscovery Test Suite", () => {
  test("rejects compatible processes without an Antigravity app data marker", () => {
    const result = extractDetails(
      "/opt/other/language_server --csrf_token foreign-token " +
      "--extension_server_port 49999 --workspace_id foreign-workspace",
    );

    assert.strictEqual(result, null);
  });

  test("accepts the current Antigravity IDE app data marker", () => {
    const result = extractDetails(
      "/opt/antigravity/language_server --csrf_token valid-token " +
      "--extension_server_port 45889 --app_data_dir antigravity-ide",
    );

    assert.ok(result);
    assert.strictEqual(result.extensionPort, 45889);
    assert.strictEqual(result.csrfToken, "valid-token");
  });

  test("accepts the legacy marker with quoted equals syntax", () => {
    const result = extractDetails(
      "/opt/antigravity/language_server --csrf_token valid-token " +
      "--extension_server_port=45889 --app_data_dir=\"antigravity\"",
    );

    assert.ok(result);
  });

  test("rejects app data values that only share the Antigravity prefix", () => {
    const result = extractDetails(
      "/opt/other/language_server --csrf_token foreign-token " +
      "--extension_server_port 49999 --app_data_dir antigravity-foreign",
    );

    assert.strictEqual(result, null);
  });

  test("rejects suffixes appended after a quoted Antigravity marker", () => {
    const result = extractDetails(
      "/opt/other/language_server --csrf_token foreign-token " +
      "--extension_server_port 49999 --app_data_dir \"antigravity\"-foreign",
    );

    assert.strictEqual(result, null);
  });

  test("parses current Linux ss listening-port output", () => {
    const output = [
      'LISTEN 0 4096 127.0.0.1:45151 0.0.0.0:* users:(("language_server",pid=1529,fd=8))',
      'LISTEN 0 4096 127.0.0.1:46503 0.0.0.0:* users:(("language_server",pid=1529,fd=35))',
      'LISTEN 0 4096 127.0.0.1:49999 0.0.0.0:* users:(("other_server",pid=15290,fd=9))',
    ].join("\n");

    assert.deepStrictEqual(
      parseAmbientListeningPorts(output, "linux", 1529),
      [45151, 46503],
    );
  });

  test("preserves exact-PID Windows netstat and macOS lsof parsing", () => {
    const windows = [
      "TCP 127.0.0.1:45017 0.0.0.0:0 LISTENING 1529",
      "TCP 127.0.0.1:49999 0.0.0.0:0 LISTENING 11529",
    ].join("\n");
    const macos = [
      "language 1529 user 8u IPv4 0x1 0t0 TCP 127.0.0.1:42100 (LISTEN)",
      "other 11529 user 8u IPv4 0x2 0t0 TCP 127.0.0.1:49999 (LISTEN)",
    ].join("\n");

    assert.deepStrictEqual(
      parseAmbientListeningPorts(windows, "win32", 1529),
      [45017],
    );
    assert.deepStrictEqual(
      parseAmbientListeningPorts(macos, "darwin", 1529),
      [42100],
    );
  });

  test("parses only the target PID from Linux netstat output", () => {
    const output = [
      "tcp 0 0 127.0.0.1:42100 0.0.0.0:* LISTEN 1529/language_server",
      "tcp6 0 0 :::49999 :::* LISTEN 15290/other_server",
    ].join("\n");

    assert.deepStrictEqual(
      parseAmbientListeningPorts(output, "linux", 1529),
      [42100],
    );
  });
});

suite("AmbientDiscovery WSL host IP", () => {
  const meta: ProcessInfo = { pid: 1, ppid: 0, extensionPort: 0, csrfToken: "token" };

  function probe(reachable: string[]) {
    sinon.stub(detection, "verifyServerGateway").callsFake(async (host: string) => {
      const success = reachable.includes(host);
      return { success, statusCode: success ? 200 : 0, protocol: "http" as const };
    });
    const discovery = new AmbientDiscovery() as unknown as {
      lookupPorts(pid: number): Promise<number[]>;
      probeAndEstablish(m: ProcessInfo): Promise<unknown>;
    };
    discovery.lookupPorts = async () => [4321];
    return discovery.probeAndEstablish(meta);
  }

  setup(() => {
    sinon.stub(wsl, "isWsl").returns(true);
    sinon.stub(wsl, "getWslHostIp").returns("172.28.16.1");
  });

  teardown(() => sinon.restore());

  test("returns the WSL host IP when only it answers", async () => {
    assert.deepStrictEqual(await probe(["172.28.16.1"]), { port: 4321, csrfToken: "token", host: "172.28.16.1" });
  });

  test("returns no host when localhost answers", async () => {
    assert.deepStrictEqual(await probe(["127.0.0.1"]), { port: 4321, csrfToken: "token" });
  });
});
