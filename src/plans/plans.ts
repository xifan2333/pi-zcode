import {
  APP_VERSION,
  DEFAULT_ZCODE_PLAN_ENDPOINT,
  buildZCodeHeaders,
  buildZCodePlanHeaders,
  parseApiKey,
  resolveBaseHost,
} from "../client/client.js";
import { ZCodePlan, ZCodePlanStatus, ZCodeProviderSource } from "../types/enums.js";
import type { ZCodeAccountPlans, ZCodeParsedApiKey, ZCodePlanResult } from "../types/types.js";
import { zcodeFetch } from "../utils/http.js";

interface StartPlanBalanceData {
  plans?: {
    plan_id?: string;
    name?: string;
    status?: string;
  }[];
  balances?: {
    show_name?: string;
    remaining_units?: number;
    total_units?: number;
    unit_type?: string;
    entitlement_id?: string;
    capabilities?: string[];
  }[];
}

interface StartPlanBalanceResponse {
  code: number;
  msg?: string;
  data?: StartPlanBalanceData;
}

interface SubscriptionListResponse {
  code: number;
  msg?: string;
  data?: {
    productId?: string;
    productName?: string;
    status?: string;
    inCurrentPeriod?: boolean;
  }[];
}

interface QuotaLimitResponse {
  code: number;
  msg?: string;
  data?: {
    level?: string;
    limits?: unknown[];
  };
}

function isSuccessfulEnvelope(
  body: { code?: number; success?: boolean } | null | undefined,
): boolean {
  if (!body) {
    return false;
  }
  if (body.success === false) {
    return false;
  }
  return body.code === undefined || body.code === 0 || body.code === 200;
}

function hasActiveStartPlan(plans: StartPlanBalanceData["plans"]): boolean {
  return (plans || []).some((plan: { plan_id?: string; name?: string; status?: string }) => {
    const status = plan.status?.trim().toLowerCase() || "",
      identity = `${plan.plan_id || ""} ${plan.name || ""}`.toLowerCase(),
      isStart =
        !plan.plan_id && !plan.name
          ? true
          : identity.includes("start-plan") || identity.includes("start plan");
    return status === "active" && isStart;
  });
}

function extractModelsFromBalances(balances: StartPlanBalanceData["balances"]): string[] {
  const ids = new Set<string>();
  for (const b of balances || []) {
    for (const cap of b.capabilities || []) {
      if (cap.toLowerCase().startsWith("model:")) {
        const modelId = cap.slice(6).trim();
        if (modelId) {
          ids.add(modelId);
        }
      }
    }
    if (b.show_name) {
      ids.add(b.show_name.toLowerCase());
    }
  }
  return [...ids];
}

function hasActiveCodingSubscription(subs: SubscriptionListResponse["data"]): boolean {
  return (subs || []).some((sub) => {
    const identity = `${sub.productId || ""} ${sub.productName || ""}`.toLowerCase(),
      active = sub.inCurrentPeriod === true || sub.status === "VALID";
    return active && identity.includes("coding");
  });
}

function classifyAuthError(status: number): ZCodePlanResult {
  if (status === 401 || status === 403) {
    return { plan: ZCodePlan.START_PLAN, status: ZCodePlanStatus.INACTIVE };
  }
  return { plan: ZCodePlan.START_PLAN, status: ZCodePlanStatus.UNKNOWN };
}

/**
 * Detect Start Plan entitlement from the ZCode shared billing/balance endpoint.
 * Returns active/inactive/unknown plus the models the plan grants when active.
 */
export async function detectStartPlan(auth: ZCodeParsedApiKey): Promise<ZCodePlanResult> {
  const url = `${DEFAULT_ZCODE_PLAN_ENDPOINT}/billing/balance?app_version=${APP_VERSION}`;
  try {
    const res = await zcodeFetch(url, {
      headers: buildZCodePlanHeaders(auth),
      method: "GET",
      timeoutMs: 8000,
    });

    if (!res.ok) {
      return classifyAuthError(res.status);
    }

    const body = (await res.json()) as StartPlanBalanceResponse;
    if (!isSuccessfulEnvelope(body)) {
      // Code not 0/200 (e.g. 3001 parameter error) => unknown, not "no plan"
      return { plan: ZCodePlan.START_PLAN, status: ZCodePlanStatus.UNKNOWN };
    }

    if (hasActiveStartPlan(body.data?.plans)) {
      return {
        models: extractModelsFromBalances(body.data?.balances),
        plan: ZCodePlan.START_PLAN,
        status: ZCodePlanStatus.ACTIVE,
      };
    }

    return { plan: ZCodePlan.START_PLAN, status: ZCodePlanStatus.INACTIVE };
  } catch {
    return { plan: ZCodePlan.START_PLAN, status: ZCodePlanStatus.UNKNOWN };
  }
}

/**
 * Detect Individual Plan entitlement from subscription + quota endpoints.
 */
export async function detectIndividualPlan(auth: ZCodeParsedApiKey): Promise<ZCodePlanResult> {
  const host = resolveBaseHost(auth);
  let codingSubscription = false,
    quotaOk = false;

  // Check subscriptions
  try {
    const subUrl = `${host}/api/biz/subscription/list`,
      res = await zcodeFetch(subUrl, {
        headers: buildZCodeHeaders(auth),
        method: "GET",
        timeoutMs: 8000,
      });
    if (res.ok) {
      const body = (await res.json()) as SubscriptionListResponse;
      if (isSuccessfulEnvelope(body)) {
        codingSubscription = hasActiveCodingSubscription(body.data);
      }
    }
  } catch {
    // Ignore
  }

  // Check quota
  try {
    const quotaUrl = `${host}/api/monitor/usage/quota/limit`,
      res = await zcodeFetch(quotaUrl, {
        headers: buildZCodeHeaders(auth),
        method: "GET",
        timeoutMs: 8000,
      });
    if (res.ok) {
      const body = (await res.json()) as QuotaLimitResponse;
      if (isSuccessfulEnvelope(body) && Array.isArray(body.data?.limits)) {
        quotaOk = true;
      }
    }
  } catch {
    // Ignore
  }

  if (codingSubscription || quotaOk) {
    return { plan: ZCodePlan.INDIVIDUAL_PLAN, status: ZCodePlanStatus.ACTIVE };
  }

  return { plan: ZCodePlan.INDIVIDUAL_PLAN, status: ZCodePlanStatus.INACTIVE };
}

/**
 * Aggregate plan detection for a provider (Z.ai or BigModel).
 */
export async function detectAccountPlans(rawApiKey: string): Promise<ZCodeAccountPlans> {
  const auth = parseApiKey(rawApiKey);
  if (!auth.token && !auth.zcodeJwtToken) {
    return {
      authenticated: false,
      individualPlan: { plan: ZCodePlan.INDIVIDUAL_PLAN, status: ZCodePlanStatus.INACTIVE },
      message: "No credentials found. Run /login zcode first.",
      providerSource: auth.providerSource || "unknown",
      startPlan: { plan: ZCodePlan.START_PLAN, status: ZCodePlanStatus.INACTIVE },
    };
  }

  const [startPlan, individualPlan] = await Promise.all([
      detectStartPlan(auth),
      detectIndividualPlan(auth),
    ]),
    providerSource = auth.providerSource || resolveProviderSourceFromAuth(auth);

  return {
    authenticated: true,
    individualPlan,
    providerSource,
    startPlan,
  };
}

function resolveProviderSourceFromAuth(auth: ZCodeParsedApiKey): string {
  if (auth.providerSource) {
    return auth.providerSource;
  }
  // Infer from which business endpoint authenticates
  return ZCodeProviderSource.ZAI;
}
