import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as cliDiscovery from "../../shared/platform/cli_discovery";
import {
    parseCliLogHead,
    listCliServerCandidates,
    discoverCliServer,
    type CliDiscoveryDeps,
} from "../../shared/platform/cli_discovery";
import { ProcessFinder } from "../../shared/platform/process_finder";

// Startup lines as written by agy 1.5.9
function cliLog(pid: number, httpsPort: number, httpPort: number): string {
    return [
        `I1116 12:31:32.276265      67 server.go:2543] Starting language server process with pid ${pid}`,
        "I1116 12:31:32.278432      67 server.go:2602] Language server version: 1.5.9",
        "I1116 12:31:32.278443      67 server.go:1269] Language server will attempt to listen on host localhost",
        `I1116 12:31:32.303272      67 server.go:1284] Language server listening on random port at ${httpsPort} for HTTPS (gRPC)`,
        `I1116 12:31:32.313530      67 server.go:1292] Language server listening on random port at ${httpPort} for HTTP`,
        "I1116 12:31:32.371909      67 server.go:3949] initialized server successfully in 94.996168ms",
    ].join("\n");
}

function makeDeps(
    logs: Record<string, { text: string; mtimeMs: number }>,
    alivePids: number[],
    acceptedPorts: number[] = [],
): CliDiscoveryDeps & { probed: number[] } {
    const logDir = path.join("home", ".gemini", "antigravity-cli", "log");
    const probed: number[] = [];
    return {
        logDir,
        probed,
        readdir: () => Object.keys(logs),
        statMtimeMs: (filePath) => logs[path.basename(filePath)].mtimeMs,
        readHead: (filePath) => logs[path.basename(filePath)].text,
        isPidAlive: (pid) => alivePids.includes(pid),
        probe: async (port) => {
            probed.push(port);
            return { success: acceptedPorts.includes(port), protocol: "https" as const };
        },
    };
}

suite("agy CLI discovery", () => {
    test("parses PID and both ports from the CLI log head", () => {
        assert.deepStrictEqual(parseCliLogHead(cliLog(59116, 45619, 44881)), {
            pid: 59116,
            httpsPort: 45619,
            httpPort: 44881,
        });
    });

    test("rejects logs without a server PID or ports", () => {
        assert.strictEqual(parseCliLogHead("I1116 cli.go:1] something else"), null);
        assert.strictEqual(
            parseCliLogHead("I1116 server.go:2543] Starting language server process with pid 1"),
            null,
        );
    });

    test("lists only running servers, newest log first", () => {
        const deps = makeDeps({
            "cli-old.log": { text: cliLog(100, 1001, 1002), mtimeMs: 1 },
            "cli-dead.log": { text: cliLog(200, 2001, 2002), mtimeMs: 3 },
            "cli-new.log": { text: cliLog(300, 3001, 3002), mtimeMs: 2 },
            "other.txt": { text: cliLog(400, 4001, 4002), mtimeMs: 4 },
        }, [100, 300, 400]);

        assert.deepStrictEqual(
            listCliServerCandidates(deps).map((c) => c.pid),
            [300, 100],
        );
    });

    test("finds an idle session behind many newer short-command logs", () => {
        const logs: Record<string, { text: string; mtimeMs: number }> = {
            "cli-session.log": { text: cliLog(100, 1001, 1002), mtimeMs: 1 },
        };
        for (let i = 0; i < 15; i++) {
            logs[`cli-short-${i}.log`] = { text: cliLog(1000 + i, 2000 + i, 3000 + i), mtimeMs: 10 + i };
        }
        const deps = makeDeps(logs, [100]);

        assert.deepStrictEqual(listCliServerCandidates(deps).map((c) => c.pid), [100]);
    });

    test("returns no candidates when the CLI log directory is missing", () => {
        const deps = makeDeps({}, []);
        deps.readdir = () => { throw new Error("ENOENT"); };
        assert.deepStrictEqual(listCliServerCandidates(deps), []);
    });

    test("connects over HTTPS first and falls back to the HTTP port", async () => {
        const deps = makeDeps({ "cli-a.log": { text: cliLog(300, 3001, 3002), mtimeMs: 1 } }, [300], [3002]);
        const info = await discoverCliServer("token-1", deps);
        assert.deepStrictEqual(info, { port: 3002, csrfToken: "token-1", protocol: "https" });
        assert.deepStrictEqual(deps.probed, [3001, 3002]);
    });

    test("skips a newer server that rejects the token (started outside the injected terminal)", async () => {
        const deps = makeDeps({
            "cli-new.log": { text: cliLog(300, 3001, 3002), mtimeMs: 2 },
            "cli-old.log": { text: cliLog(100, 1001, 1002), mtimeMs: 1 },
        }, [100, 300], [1001]);
        const info = await discoverCliServer("token-1", deps);
        assert.deepStrictEqual(info, { port: 1001, csrfToken: "token-1", protocol: "https" });
    });

    test("returns null when no running server accepts the token", async () => {
        const deps = makeDeps({ "cli-a.log": { text: cliLog(300, 3001, 3002), mtimeMs: 1 } }, [300]);
        assert.strictEqual(await discoverCliServer("token-1", deps), null);
    });
});

suite("ProcessFinder agy CLI fallback", () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    type Probe = ProcessFinder & { tryDetect(): Promise<unknown> };

    test("prefers the IDE backend over the CLI", async () => {
        const ide = { port: 1, csrfToken: "ide" };
        sandbox.stub(ProcessFinder.prototype as unknown as { detectIdeBackend: () => Promise<unknown> }, "detectIdeBackend").resolves(ide);
        const cli = sandbox.stub(cliDiscovery, "discoverCliServer").resolves({ port: 2, csrfToken: "cli", protocol: "https" });

        const finder = new ProcessFinder({ cliCsrfToken: "cli" }) as Probe;
        assert.deepStrictEqual(await finder.tryDetect(), ide);
        assert.ok(cli.notCalled);
    });

    test("falls back to the CLI with the injected token and clears the failure reason", async () => {
        sandbox.stub(ProcessFinder.prototype as unknown as { detectIdeBackend: () => Promise<unknown> }, "detectIdeBackend").callsFake(async function (this: ProcessFinder) {
            this.failureReason = "no_process";
            return null;
        });
        const cli = sandbox.stub(cliDiscovery, "discoverCliServer").resolves({ port: 2, csrfToken: "cli", protocol: "http" });

        const finder = new ProcessFinder({ cliCsrfToken: "cli" }) as Probe;
        assert.deepStrictEqual(await finder.tryDetect(), { port: 2, csrfToken: "cli" });
        assert.ok(cli.calledOnceWith("cli"));
        assert.strictEqual(finder.failureReason, null);
        assert.strictEqual(finder.protocolUsed, "http");
    });

    test("does not try the CLI without a token", async () => {
        sandbox.stub(ProcessFinder.prototype as unknown as { detectIdeBackend: () => Promise<unknown> }, "detectIdeBackend").resolves(null);
        const cli = sandbox.stub(cliDiscovery, "discoverCliServer").resolves({ port: 2, csrfToken: "cli", protocol: "https" });

        const finder = new ProcessFinder() as Probe;
        assert.strictEqual(await finder.tryDetect(), null);
        assert.ok(cli.notCalled);
    });
});
