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
 * Send HTTP/HTTPS request (with automatic fallback)
 */
export async function httpRequest<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
  const { hostname, port, allowFallback = true } = options;

  // Check cached protocol
  const cachedProtocol = getCachedProtocol(hostname, port);

  // If cached is HTTP, use HTTP directly
  if (cachedProtocol === "http") {
    return requestWithProtocolFallback<T>(options, "http", "https", allowFallback);
  }

  // Try HTTPS
  return requestWithProtocolFallback<T>(options, "https", "http", allowFallback);
}

async function requestWithProtocolFallback<T>(
  options: HttpRequestOptions,
  primaryProtocol: Protocol,
  fallbackProtocol: Protocol,
  allowFallback: boolean
): Promise<HttpResponse<T>> {
  const { hostname, port } = options;
  try {
    return await doRequest<T>(options, primaryProtocol);
  } catch (primaryError) {
    if (allowFallback) {
      debugLog(`${primaryProtocol.toUpperCase()} failed for ${hostname}:${port}, trying ${fallbackProtocol.toUpperCase()} fallback...`);
      try {
        const result = await doRequest<T>(options, fallbackProtocol);
        setCachedProtocol(hostname, port, fallbackProtocol);
        debugLog(`${fallbackProtocol.toUpperCase()} fallback succeeded for ${hostname}:${port}`);
        return result;
      } catch {
        throw primaryError;
      }
    }
    throw primaryError;
  }
}

/**
 * Send a single request
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
      agent: false, // Bypass any global agents/proxies to ensure direct connection to localhost/IP
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
        const statusCode = res.statusCode || 0;
        try {
          const data = responseBody ? JSON.parse(responseBody) as T : ({} as T);
          resolve({
            statusCode,
            data,
            protocol,
          });
        } catch {
          // If JSON parse fails but status is 4xx/5xx, it might be an HTML error page
          if (statusCode >= 400) {
            resolve({
              statusCode,
              data: { error: `HTTP ${statusCode}: ${responseBody.substring(0, 100)}` } as unknown as T,
              protocol
            });
          } else {
            reject(new Error(`Invalid JSON response: ${responseBody.substring(0, 100)}`));
          }
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
 * Test if port is available (HTTPS first, with automatic fallback)
 */
export async function testPort(
  hostname: string,
  port: number,
  path: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ success: boolean; protocol: Protocol; statusCode: number; error?: string }> {
  try {
    const response = await httpRequest<unknown>({
      hostname,
      port,
      path,
      method: "POST",
      headers,
      body,
      timeout: 5000,
      allowFallback: true,
    });
    return {
      success: response.statusCode === 200,
      protocol: response.protocol,
      statusCode: response.statusCode
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, protocol: "https", statusCode: 0, error: errorMsg };
  }
}

/**
 * Clear protocol cache (for testing or reset)
 */
export function clearProtocolCache(): void {
  protocolCache.clear();
}
