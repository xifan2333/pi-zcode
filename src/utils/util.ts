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
