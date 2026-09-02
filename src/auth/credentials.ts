import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ZCodeParsedApiKey } from "../types/types.js";
import { parseApiKey } from "../client/client.js";

const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");

let cached: ZCodeParsedApiKey | undefined = undefined,
  loadedAt = 0;

const CACHE_TTL_MS = 60 * 1000;

/**
 * Read the stored `zcode` credentials from Pi's auth store directly. This keeps the
 * per-plan providers independent from re-login while reusing the single login entry.
 */
export function readStoredZCodeCredentials(force = false): ZCodeParsedApiKey | undefined {
  if (!force && cached && Date.now() - loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    if (!existsSync(AUTH_FILE)) {
      return undefined;
    }
    const auth = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Record<string, unknown>,
      zcode = auth.zcode as Record<string, unknown> | undefined;
    if (!zcode) {
      return undefined;
    }
    // Reconstruct the JSON form used by getZCodeApiKey.
    const token = zcode.access as string | undefined,
      parsed = parseApiKey(
        JSON.stringify({
          access: token,
          businessAccessToken: zcode.businessAccessToken,
          providerSource: zcode.providerSource,
          zcodeJwtToken: zcode.zcodeJwtToken,
        }),
      );
    cached = parsed;
    loadedAt = Date.now();
    return parsed;
  } catch {
    return undefined;
  }
}

export function setStoredZCodeCredentials(creds: ZCodeParsedApiKey): void {
  cached = creds;
  loadedAt = Date.now();
}
