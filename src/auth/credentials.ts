import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { ZCodeParsedApiKey } from "../types/types.js";
import { parseApiKey } from "../client/client.js";

let cached: ZCodeParsedApiKey | undefined = undefined;
let loadedAt = 0;

const CACHE_TTL_MS = 60 * 1000;

/**
 * Read the stored `zcode` credentials using Pi's official `readStoredCredential` API.
 * This keeps the per-plan providers independent while reusing the single login entry.
 */
export function readStoredZCodeCredentials(force = false): ZCodeParsedApiKey | undefined {
  if (!force && cached && Date.now() - loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const cred = readStoredCredential("zcode") as Record<string, unknown> | undefined;
    if (!cred) {
      return undefined;
    }

    const token = (cred.access as string | undefined) || (cred.key as string | undefined);
    const parsed = parseApiKey(
      JSON.stringify({
        access: token,
        businessAccessToken: cred.businessAccessToken,
        providerSource: cred.providerSource,
        zcodeJwtToken: cred.zcodeJwtToken,
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
