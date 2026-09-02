import os from "node:os";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Read environment variable with prefix fallback.
 */
export function zcodeEnv(key: string): string | undefined {
  return (
    process.env[`ZCODE_${key}`] ||
    process.env[`ZHIPU_${key}`] ||
    process.env[`ZAI_${key}`] ||
    process.env[`BIGMODEL_${key}`] ||
    process.env[key]
  );
}

/**
 * Resolve standard OS cache directory adhering to XDG / macOS / Windows standards.
 */
export function getZCodeCacheDir(): string {
  const custom = zcodeEnv("CACHE_DIR");
  if (custom?.trim()) {
    return path.resolve(custom.trim());
  }

  // Linux / POSIX (XDG specification)
  if (process.platform === "linux") {
    const xdgCache = process.env.XDG_CACHE_HOME;
    return xdgCache
      ? path.join(xdgCache, "pi-zcode")
      : path.join(os.homedir(), ".cache", "pi-zcode");
  }

  // macOS
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "pi-zcode");
  }

  // Windows
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "pi-zcode", "Cache");
  }

  // Fallback inside Pi agent directory
  try {
    return path.join(getAgentDir(), "cache", "zcode");
  } catch {
    return path.join(os.homedir(), ".cache", "pi-zcode");
  }
}

/**
 * Resolve persistent state directory respecting Pi's agent environment.
 */
export function getZCodeDataDir(): string {
  try {
    return path.join(getAgentDir(), "zcode");
  } catch {
    return path.join(os.homedir(), ".pi", "agent", "zcode");
  }
}

/**
 * Check if a value is a non-null object record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce an unknown value to a string or undefined.
 */
export function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/**
 * Escape regular expression special characters.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Format relative time or timestamp.
 */
export function formatResetTime(timestampOrStr?: number | string | null): string {
  if (!timestampOrStr) {
    return "unknown";
  }
  const ms = typeof timestampOrStr === "number" ? timestampOrStr : Date.parse(timestampOrStr);
  if (isNaN(ms)) {
    return String(timestampOrStr);
  }

  const diffMs = ms - Date.now();
  if (diffMs <= 0) {
    return "resets soon";
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000)),
    hours = Math.floor(totalMinutes / 60),
    minutes = totalMinutes % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
