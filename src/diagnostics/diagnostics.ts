import type { ZCodeDiagnosticsSnapshot } from "../types/types.js";
import { safeError } from "../utils/security.js";

let lastDiagnostics: ZCodeDiagnosticsSnapshot = {};

export function setLastDiagnostics(diagnostics: Partial<ZCodeDiagnosticsSnapshot>): void {
  lastDiagnostics = { ...lastDiagnostics, ...diagnostics };
}

export function getLastDiagnostics(): ZCodeDiagnosticsSnapshot {
  return { ...lastDiagnostics };
}

export function setLastEndpoint(endpoint?: string): void {
  lastDiagnostics.endpoint = endpoint;
}

export function setLastStatus(status?: number): void {
  lastDiagnostics.status = status;
}

export function setLastLatencyMs(latencyMs?: number): void {
  lastDiagnostics.latencyMs = latencyMs;
}

export function setLastError(error?: unknown): void {
  lastDiagnostics.error = error ? safeError(error) : undefined;
}

export function setLastRequestId(requestId?: string): void {
  lastDiagnostics.requestId = requestId;
}

export function setLastResolvedRuntimeModel(model?: string): void {
  lastDiagnostics.resolvedRuntimeModel = model;
}

/**
 * Execute an async operation while capturing diagnostics metrics.
 */
export async function runWithDiagnostics<T>(
  fn: () => Promise<T>,
  meta?: { endpoint?: string; model?: string },
): Promise<T> {
  if (meta?.endpoint) {
    setLastEndpoint(meta.endpoint);
  }
  if (meta?.model) {
    setLastResolvedRuntimeModel(meta.model);
  }

  const start = Date.now();
  try {
    const result = await fn();
    setLastLatencyMs(Date.now() - start);
    setLastError(undefined);
    return result;
  } catch (error) {
    setLastLatencyMs(Date.now() - start);
    setLastError(error);
    throw error;
  }
}
