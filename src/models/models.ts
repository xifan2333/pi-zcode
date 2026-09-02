import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { ZCodePlan } from "../types/enums.js";
import { buildZCodeSourceHeaders, parseApiKey, resolveBaseHost } from "../client/client.js";
import { ZCODE_API } from "../types/types.js";
import { zcodeFetch } from "../utils/http.js";

export const PROVIDER_ID = "zcode";
export const PROVIDER_BASE = "zcode"; // Internal namespace; per-plan providers are ZCodePlan-<plan>

export const DEFAULT_THINKING_LEVEL_MAP = {
  high: "high",
  low: "low",
  medium: "medium",
  minimal: "low",
  xhigh: "high",
};

export const PROVIDER_ID_START_PLAN = "zcode-start-plan";
export const PROVIDER_ID_INDIVIDUAL_PLAN = "zcode-individual-plan";

export function providerIdForPlan(plan: ZCodePlan): string {
  switch (plan) {
    case ZCodePlan.START_PLAN: {
      return PROVIDER_ID_START_PLAN;
    }
    case ZCodePlan.INDIVIDUAL_PLAN: {
      return PROVIDER_ID_INDIVIDUAL_PLAN;
    }
    default: {
      return PROVIDER_ID_START_PLAN;
    }
  }
}

interface RemoteModelMeta {
  modelId: string;
  name?: string;
  contextWindow?: number;
  maxCompletionTokens?: number;
  capabilities?: Record<string, unknown>;
  reasoning?: {
    levels?: Record<string, unknown>;
    defaultLevel?: string;
  };
  modalities?: {
    input?: string[];
  };
}

interface ClientConfigsResponse {
  code: number;
  data?: {
    builtinModels?: RemoteModelMeta[];
  };
}

/**
 * Infer model attributes when upstream metadata is unavailable.
 */
export function buildModelConfig(rawId: string, remote?: RemoteModelMeta): ProviderModelConfig {
  const id = rawId.trim(),
    lower = id.toLowerCase(),
    remoteInput = remote?.modalities?.input || [],
    isVision =
      remoteInput.includes("image") ||
      remoteInput.includes("video") ||
      lower.includes("flash") ||
      lower.includes("v") ||
      lower.includes("5.3") ||
      lower.includes("5.1"),
    reasoning = remote?.reasoning as Record<string, unknown> | undefined,
    isReasoning =
      reasoning != undefined ||
      !lower.includes("flash") ||
      lower.includes("5.3-flash") ||
      lower.includes("4.5-air"),
    isLongContext = lower.includes("5.3") || lower.includes("long");

  let contextWindow = 128_000;
  if (remote?.contextWindow) {
    contextWindow = remote.contextWindow;
  } else if (isLongContext) {
    contextWindow = 1_000_000;
  } else if (lower.includes("5") || lower.includes("4.7") || lower.includes("4.6")) {
    contextWindow = 200_000;
  }

  let maxTokens = 4096;
  if (remote?.maxCompletionTokens) {
    maxTokens = remote.maxCompletionTokens;
  } else if (lower.includes("5.3") || lower.includes("5.1") || lower === "glm-5") {
    maxTokens = 16_384;
  } else if (lower.includes("4.7") || lower.includes("4.6") || lower.includes("flash")) {
    maxTokens = 8192;
  }

  return {
    api: ZCODE_API,
    contextWindow,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    id,
    input: isVision ? ["text", "image"] : ["text"],
    maxTokens,
    name: remote?.name || id.toUpperCase().replace("GLM-", "GLM-"),
    reasoning: isReasoning,
    thinkingLevelMap: isReasoning ? DEFAULT_THINKING_LEVEL_MAP : undefined,
  };
}

/**
 * Fetch the model metadata catalog from ZCode client configs.
 */
export async function fetchModelCatalog(token?: string): Promise<RemoteModelMeta[]> {
  try {
    const url = `${"https://zcode.z.ai"}/api/v1/client/configs`,
      headers = buildZCodeSourceHeaders();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await zcodeFetch(url, {
      headers,
      method: "GET",
      timeoutMs: 6000,
    });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as ClientConfigsResponse;
    if (body.code !== 0) {
      return [];
    }
    return body.data?.builtinModels || [];
  } catch {
    return [];
  }
}

/**
 * Build a provider model list from a set of model IDs, enriched with remote metadata.
 */
export function buildModelsForPlan(
  modelIds: string[],
  catalog: RemoteModelMeta[],
): ProviderModelConfig[] {
  const catalogById = new Map<string, RemoteModelMeta>();
  for (const meta of catalog) {
    catalogById.set(meta.modelId.toLowerCase(), meta);
  }

  return modelIds
    .map((id) => {
      const remote = catalogById.get(id.toLowerCase());
      return buildModelConfig(id, remote);
    })
    .filter((m) => m.id.trim());
}

/**
 * Resolve the model IDs for a plan by querying the appropriate upstream source.
 * For Start Plan, models come from entitlement balance capabilities. For
 * Individual Plan, from the coding paas models list.
 */
export async function fetchModelIdsForPlan(
  plan: ZCodePlan,
  rawApiKey?: string,
  modelIds?: string[],
): Promise<string[]> {
  if (modelIds && modelIds.length > 0) {
    return modelIds;
  }

  const auth = parseApiKey(rawApiKey),
    host = resolveBaseHost(auth),
    headers = buildZCodeSourceHeaders();
  if (auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  try {
    if (plan === ZCodePlan.INDIVIDUAL_PLAN) {
      const url = `${host}/api/coding/paas/v4/models`,
        res = await zcodeFetch(url, { headers, method: "GET", timeoutMs: 6000 });
      if (res.ok) {
        const body = (await res.json()) as { data?: { id: string }[] };
        if (Array.isArray(body.data) && body.data.length > 0) {
          return body.data.map((m) => m.id);
        }
      }
    }

    // Fallback to standard paas models
    const url = `${host}/api/paas/v4/models`,
      res = await zcodeFetch(url, { headers, method: "GET", timeoutMs: 6000 });
    if (res.ok) {
      const body = (await res.json()) as { data?: { id: string }[] };
      if (Array.isArray(body.data) && body.data.length > 0) {
        return body.data.map((m) => m.id);
      }
    }
  } catch {
    // Ignore
  }

  return [];
}

export const ZCODE_MODELS: ProviderModelConfig[] = [];
export const PROVIDER_NAMES: Record<ZCodePlan, string> = {
  [ZCodePlan.START_PLAN]: "ZCode Start Plan",
  [ZCodePlan.INDIVIDUAL_PLAN]: "ZCode Individual Plan",
};
