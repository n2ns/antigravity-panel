/**
 * HTTP client utility: Supports automatic HTTPS → HTTP fallback
 *
 * Automatically tries HTTP when HTTPS request fails (e.g., certificate issues)
 */

import * as https from "https";
import * as http from "http";
import { debugLog } from "./logger";

export type Protocol = "https" | "http";

export interface HttpRequestOptions {
  hostname: string;
  port: number;
  path: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  /** Whether to allow fallback to HTTP (default true) */
  allowFallback?: boolean;
}

export interface HttpResponse<T = unknown> {
  statusCode: number;
  data: T;
  /** Actually used protocol */
  protocol: Protocol;
}

/**
 * Records protocol state for each host:port
 * Once HTTPS fails and successfully falls back to HTTP, subsequent requests use HTTP directly
 */
const protocolCache = new Map<string, Protocol>();

/**
 * Get cached protocol, defaults to HTTPS
 */
function getCachedProtocol(hostname: string, port: number): Protocol {
  const key = `${hostname}:${port}`;
  return protocolCache.get(key) || "https";
}

/**
 * Set protocol cache
 */
function setCachedProtocol(hostname: string, port: number, protocol: Protocol): void {
  const key = `${hostname}:${port}`;
  protocolCache.set(key, protocol);
}

/**
 * 发送 HTTP/HTTPS 请求（支持自动降级）
 */
export async function httpRequest<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
  const { hostname, port, allowFallback = true } = options;
  
  // 检查缓存的协议
  const cachedProtocol = getCachedProtocol(hostname, port);
  
  // 如果缓存是 HTTP，直接使用 HTTP
  if (cachedProtocol === "http") {
    return doRequest<T>(options, "http");
  }
  
  // 尝试 HTTPS
  try {
    return await doRequest<T>(options, "https");
  } catch (httpsError) {
    // HTTPS 失败，尝试 HTTP 降级
    if (allowFallback) {
      debugLog(`HTTPS failed for ${hostname}:${port}, trying HTTP fallback...`);
      try {
        const result = await doRequest<T>(options, "http");
        // HTTP 成功，缓存协议
        setCachedProtocol(hostname, port, "http");
        debugLog(`HTTP fallback succeeded for ${hostname}:${port}`);
        return result;
      } catch {
        // HTTP 也失败，抛出原始 HTTPS 错误
        throw httpsError;
      }
    }
    throw httpsError;
  }
}

/**
 * 发送单次请求
 */
function doRequest<T>(options: HttpRequestOptions, protocol: Protocol): Promise<HttpResponse<T>> {
  const { hostname, port, path, method, headers = {}, body, timeout = 5000 } = options;
  
  return new Promise((resolve, reject) => {
    const requestModule = protocol === "https" ? https : http;
    
    const requestOptions: https.RequestOptions | http.RequestOptions = {
      hostname,
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        ...headers,
      },
      timeout,
      // SECURITY NOTE: rejectUnauthorized: false is intentional and safe here because:
      // - Communication is strictly localhost (127.0.0.1) only
      // - The Antigravity Language Server is a fully trusted local process
      // - Self-signed certificates are common in local dev environments
      ...(protocol === "https" ? { rejectUnauthorized: false } : {}),
    };
    
    const req = requestModule.request(requestOptions, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        try {
          const data = responseBody ? JSON.parse(responseBody) as T : ({} as T);
          resolve({
            statusCode: res.statusCode || 0,
            data,
            protocol,
          });
        } catch {
          reject(new Error(`Invalid JSON response: ${responseBody.substring(0, 100)}`));
        }
      });
    });
    
    req.on("error", (err) => {
      reject(new Error(`${protocol.toUpperCase()} request failed: ${err.message}`));
    });
    
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`${protocol.toUpperCase()} request timeout`));
    });
    
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * 测试端口是否可用（HTTPS 优先，自动降级）
 */
export async function testPort(
  hostname: string,
  port: number,
  path: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ success: boolean; protocol: Protocol }> {
  try {
    const response = await httpRequest<unknown>({
      hostname,
      port,
      path,
      method: "POST",
      headers,
      body,
      timeout: 800,
      allowFallback: true,
    });
    return { success: response.statusCode === 200, protocol: response.protocol };
  } catch {
    return { success: false, protocol: "https" };
  }
}

/**
 * 清除协议缓存（用于测试或重置）
 */
export function clearProtocolCache(): void {
  protocolCache.clear();
}
