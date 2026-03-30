
const http = require('http');
const { exec } = require('child_process');
const os = require('os');

const platform = os.platform();

// ─── 动态发现语言服务器端口和 CSRF Token ─────────────────────────────────────

/**
 * 从运行中的 language_server 进程参数里提取 port 和 csrf_token。
 * Linux/macOS: ps + grep
 * Windows:     PowerShell Get-CimInstance
 */
function discoverFromProcess() {
    return new Promise((resolve) => {
        let cmd;
        if (platform === 'win32') {
            cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name like 'language_server%'\\" | Select-Object CommandLine | ConvertTo-Json"`;
        } else {
            cmd = `timeout 5s ps -eo args | grep 'language_server' | grep -v grep`;
        }

        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            const output = (stdout || '').trim();
            if (!output) return resolve(null);

            // Windows JSON 展开
            let cmdLines = [];
            if (platform === 'win32') {
                try {
                    let parsed = JSON.parse(output);
                    if (!Array.isArray(parsed)) parsed = [parsed];
                    cmdLines = parsed.map(p => p.CommandLine || '').filter(Boolean);
                } catch { return resolve(null); }
            } else {
                cmdLines = output.split('\n');
            }

            for (const line of cmdLines) {
                // 语言服务器有两组端口+CSRF：
                //   extension_server_port + extension_server_csrf_token  (用于 IDE <-> LS 通信)
                //   其他 --port / API 端口 + --csrf_token              (用于外部 HTTP 请求)
                // 优先提取 API 环境 csrf_token 和非 extension 端口
                const apiCsrf = line.match(/(?<!extension_server_)csrf_token[=\s]+([a-f0-9-]+)/i);
                const extPort = line.match(/--extension_server_port[=\s]+(\d+)/);
                const extCsrf = line.match(/--extension_server_csrf_token[=\s]+([a-f0-9-]+)/i);

                if (apiCsrf || extPort) {
                    resolve({
                        port: null,           // API 端口从 netstat 获得更可靠
                        extPort: extPort ? parseInt(extPort[1]) : null,
                        csrf: apiCsrf ? apiCsrf[1] : null,
                        extCsrf: extCsrf ? extCsrf[1] : null,
                        rawLine: line.slice(0, 200),
                    });
                    return;
                }
            }
            resolve(null);
        });
    });
}

/**
 * Linux/macOS: 用 ss/netstat 获取 127.0.0.1 上所有监听端口，
 * 排除常见系统端口，作为候选端口列表。
 * Windows: netstat -ano
 */
function discoverPortsFromNetstat() {
    return new Promise((resolve) => {
        let cmd;
        if (platform === 'win32') {
            cmd = `netstat -ano | findstr "127.0.0.1" | findstr "LISTENING"`;
        } else {
            cmd = `timeout 5s ss -tlnp 2>/dev/null || timeout 5s netstat -tlnp 2>/dev/null`;
        }

        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            const EXCLUDE = new Set([22, 80, 443, 3000, 5000, 5432, 6379, 8080, 8443, 27017]);
            const ports = [];
            const lines = (stdout || '').split('\n');

            for (const line of lines) {
                const m = line.match(/127\.0\.0\.1[:\s]+(\d{4,5})|:(\d{4,5})\s/g);
                if (!m) continue;
                for (const chunk of m) {
                    const p = parseInt(chunk.replace(/[^0-9]/g, ''));
                    if (p > 1024 && p < 65535 && !EXCLUDE.has(p)) ports.push(p);
                }
            }

            // 备选：/proc/net/tcp (Linux 无 ss 权限时)
            if (ports.length === 0 && platform === 'linux') {
                try {
                    const fs = require('fs');
                    const tcp = fs.readFileSync('/proc/net/tcp', 'utf8');
                    for (const row of tcp.split('\n').slice(1)) {
                        const cols = row.trim().split(/\s+/);
                        if (cols.length < 4) continue;
                        if (cols[3] !== '0A') continue; // 0A = LISTEN
                        const localAddr = cols[1];
                        const portHex = localAddr.split(':')[1];
                        if (!portHex) continue;
                        const p = parseInt(portHex, 16);
                        // 只要 loopback (7F000001 = 127.0.0.1)
                        if (localAddr.startsWith('0100007F') && p > 1024 && !EXCLUDE.has(p)) {
                            ports.push(p);
                        }
                    }
                } catch { /* /proc/net/tcp 不可读则跳过 */ }
            }

            resolve([...new Set(ports)].sort((a, b) => a - b));
        });
    });
}

// ─── HTTP 请求核心 ────────────────────────────────────────────────────────────

const requestBody = JSON.stringify({
    metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' },
});

function tryPort(port, csrf) {
    return new Promise((resolve) => {
        const options = {
            hostname: '127.0.0.1',
            port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
                'X-Codeium-Csrf-Token': csrf || 'unknown',
                'Connect-Protocol-Version': '1',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
            },
            timeout: 3000,
        };

        const req = http.request(options, (res) => {
            let raw = '';
            // 设置数据超时：流式接口首包后 3s 无新数据则视为完成
            let dataTimer = null;
            const resetTimer = () => {
                clearTimeout(dataTimer);
                dataTimer = setTimeout(() => { req.destroy(); resolve({ port, status: res.statusCode, raw }); }, 3000);
            };

            res.setEncoding('utf8');
            res.on('data', (chunk) => { raw += chunk; resetTimer(); });
            res.on('end', () => {
                clearTimeout(dataTimer);
                resolve({ port, status: res.statusCode, raw });
            });
            resetTimer();
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(requestBody);
        req.end();
    });
}

// ─── 结果解析 ─────────────────────────────────────────────────────────────────

function parseResponse(raw) {
    // GetUserStatus 返回的可能是 JSON 或换行分隔的多个 JSON 块（流式）
    const chunks = raw.trim().split('\n').filter(Boolean);
    const results = [];
    for (const chunk of chunks) {
        try { results.push(JSON.parse(chunk)); } catch { /* 忽略非 JSON 行 */ }
    }
    return results;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
    console.log(`🖥️  Platform: ${platform} (${os.arch()})`);
    console.log('');

    // Step 1: 从进程参数里直接读 port + csrf
    console.log('🔎 Step 1: Discovering port & CSRF from running process...');
    const fromProc = await discoverFromProcess();
    let knownCsrf = null;
    let knownExtPort = null;
    let candidatePorts = [];

    if (fromProc) {
        knownCsrf = fromProc.csrf || null;
        knownExtPort = fromProc.extPort || null;
        console.log(`   ✅ Found process:`);
        console.log(`      API  csrf_token          : ${knownCsrf || 'n/a'}`);
        console.log(`      extension_server_port    : ${knownExtPort || 'n/a'}`);
        console.log(`      extension_server_csrf    : ${fromProc.extCsrf || 'n/a'}`);
        console.log(`   CMD: ${fromProc.rawLine}`);
    } else {
        console.log('   ⚠️  No language_server process found via process list.');
    }

    // Step 2: 补充 netstat/proc 扫描的端口作为候选
    console.log('\n🔎 Step 2: Scanning localhost ports via ss/netstat//proc/net/tcp...');
    const netstatPorts = await discoverPortsFromNetstat();
    // 排除已知的 extension_server_port（那个端口用不同的 CSRF）
    const apiPorts = netstatPorts.filter(p => p !== knownExtPort);
    console.log(`   Found ${netstatPorts.length} port(s) total, ${apiPorts.length} API candidate(s): ${apiPorts.slice(0, 10).join(', ')}${apiPorts.length > 10 ? '...' : ''}`);

    candidatePorts = apiPorts;

    if (candidatePorts.length === 0) {
        console.log('\n❌ No candidate ports to try. Is the language server running?');
        console.log('💡 Run: node scripts/diagnose_processes.js  for details.');
        return;
    }

    // Step 3: 尝试连接（用 API csrf_token）
    console.log(`\n🔎 Step 3: Probing ${candidatePorts.length} port(s) for language server API...`);
    let connected = false;

    for (const port of candidatePorts) {
        process.stdout.write(`   Trying port ${port}... `);
        const result = await tryPort(port, knownCsrf);

        if (!result) {
            console.log('❌ no response');
            continue;
        }

        if (result.status === 403) {
            console.log(`⚠️  HTTP 403 (CSRF mismatch on port ${port}, skipping)`);
            continue;
        }

        console.log(`✅ responded (HTTP ${result.status})`);
        connected = true;

        const parsed = parseResponse(result.raw);
        if (parsed.length > 0) {
            console.log('\n📊 --- Language Server Response ---');
            console.log(JSON.stringify(parsed.length === 1 ? parsed[0] : parsed, null, 2));
            console.log('-----------------------------------');
        } else if (result.raw.length > 0) {
            console.log('\n📄 Raw response (non-JSON):');
            console.log(result.raw.slice(0, 500));
        } else {
            console.log('   (empty body — streaming endpoint, response may arrive asynchronously)');
        }
        break;
    }

    if (!connected) {
        console.log('\n❌ Could not connect to language server on any candidate port.');
        console.log('💡 Tips:');
        console.log('   - Reload the IDE window and try again.');
        console.log('   - Run: node scripts/diagnose_processes.js  to find the active port & CSRF.');
    }
}

main().catch(console.error);
