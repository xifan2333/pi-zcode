import { release } from "node:os";
import { assertSafeApiBaseUrl } from "../utils/security.js";
import { zcodeEnv } from "../utils/util.js";
import { ZCodeProviderSource } from "../types/enums.js";
import { getDeviceMid } from "../identity/device.js";
import type { ZCodeParsedApiKey } from "../types/types.js";

export const DEFAULT_ZAI_ENDPOINT = "https://api.z.ai";
export const DEFAULT_BIGMODEL_ENDPOINT = "https://open.bigmodel.cn";
export const DEFAULT_ZCODE_APP_ENDPOINT = "https://zcode.z.ai";
export const DEFAULT_ZCODE_PLAN_ENDPOINT = "https://zcode.z.ai/api/v1/zcode-plan";

export const APP_VERSION = "3.10.2";
export const PLATFORM = `${process.platform}-${process.arch}`;
export const OS_CATEGORY =
  process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";

export const ENDPOINT_FALLBACKS = [
  DEFAULT_ZAI_ENDPOINT,
  DEFAULT_BIGMODEL_ENDPOINT,
  DEFAULT_ZCODE_APP_ENDPOINT,
];

export function endpointCandidates(): string[] {
  const explicit = zcodeEnv("BASE_URL")?.trim();
  return explicit ? [assertSafeApiBaseUrl(explicit)] : ENDPOINT_FALLBACKS;
}

export const DEFAULT_ENDPOINT = endpointCandidates()[0] || DEFAULT_ZAI_ENDPOINT;

/**
 * Resolve the appropriate base host depending on user's authentication source.
 */
export function resolveBaseHost(auth?: ZCodeParsedApiKey): string {
  const explicit = zcodeEnv("BASE_URL")?.trim();
  if (explicit) {
    return assertSafeApiBaseUrl(explicit);
  }
  if (
    auth?.providerSource === ZCodeProviderSource.BIGMODEL ||
    auth?.providerSource === "bigmodel"
  ) {
    return DEFAULT_BIGMODEL_ENDPOINT;
  }
  return DEFAULT_ZAI_ENDPOINT;
}

/**
 * Prewarm TLS connection to minimize initial request latency.
 */
export function prewarmConnection(endpoint = DEFAULT_ENDPOINT): void {
  if (process.env.ZCODE_NO_PREWARM === "1") {
    return;
  }
  try {
    const url = new URL(endpoint);
    fetch(url.origin, { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(() => {});
  } catch {
    // Ignore prewarm failures
  }
}

/**
 * The set of source headers ZCode injects on every request. Omitting them —
 * especially X-Device-Mid — can trigger `3001 parameter error`.
 */
export function buildZCodeSourceHeaders(referer = "https://zcode.z.ai"): Record<string, string> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    "HTTP-Referer": referer,
    "User-Agent": `ZCode/${APP_VERSION}`,
    "X-Client-Language": "en-US",
    "X-Client-Timezone": timezone,
    "X-Device-Mid": getDeviceMid(),
    "X-Os-Category": OS_CATEGORY,
    "X-Os-Version": release(),
    "X-Platform": PLATFORM,
    "X-Release-Channel": "stable",
    "X-Title": "Z Code@pi-zcode",
    "X-ZCode-App-Version": APP_VERSION,
  };
}

/**
 * Build headers for the ZCode shared planning / entitlement endpoints.
 */
export function buildZCodePlanHeaders(
  auth: ZCodeParsedApiKey,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers = {
    ...buildZCodeSourceHeaders(),
    ...(auth.zcodeJwtToken ? { Authorization: `Bearer ${auth.zcodeJwtToken}` } : {}),
    ...extra,
  };
  return headers;
}

/**
 * Parse an API key or stored OAuth credential string.
 */
export function parseApiKey(apiKeyOrToken: string | undefined): ZCodeParsedApiKey {
  if (!apiKeyOrToken) {
    return { token: "" };
  }

  const trimmed = apiKeyOrToken.trim();

  // If JSON encoded
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as {
          access?: string;
          token?: string;
          businessAccessToken?: string;
          zcodeJwtToken?: string;
          providerSource?: string;
          key?: string;
        },
        token = parsed.access || parsed.token || parsed.key || "";
      return {
        businessAccessToken: parsed.businessAccessToken,
        isOAuth: Boolean(parsed.access || parsed.zcodeJwtToken),
        providerSource: parsed.providerSource,
        token,
        zcodeJwtToken: parsed.zcodeJwtToken,
      };
    } catch {
      // Fall through to plain token
    }
  }

  return {
    isOAuth: trimmed.startsWith("eyJ"),
    token: trimmed,
  };
}

/**
 * Build standard headers for ZCode business / model API requests.
 */
export function buildZCodeHeaders(
  auth: ZCodeParsedApiKey,
  customHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...buildZCodeSourceHeaders(),
    ...customHeaders,
  };

  if (auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  if (auth.zcodeJwtToken) {
    headers["X-Zcode-Token"] = auth.zcodeJwtToken;
  }

  return headers;
}

/**
 * Headers required for Start Plan / ZCode Plan inference requests.
 */
export function buildStartPlanHeaders(
  auth: ZCodeParsedApiKey,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    ...buildZCodePlanHeaders(auth, extra),
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
}
