import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { ZCodePlan, ZCodePlanStatus, ZCodeProviderSource } from "./enums.js";

/** Resolved plan detection result: which plan, its status, and models if active. */
export interface ZCodePlanResult {
  plan: ZCodePlan;
  status: ZCodePlanStatus;
  models?: string[];
}

export const ZCODE_API = "zcode-stream";

export interface ZCodeOAuthCredentials extends OAuthCredentials {
  businessAccessToken?: string;
  zcodeJwtToken?: string;
  providerSource?: ZCodeProviderSource | string;
  email?: string;
  name?: string;
  userId?: string;
  avatar?: string;
}

export interface ZCodeParsedApiKey {
  token: string;
  businessAccessToken?: string;
  zcodeJwtToken?: string;
  providerSource?: ZCodeProviderSource | string;
  isOAuth?: boolean;
}

export interface ZCodeDiagnosticsSnapshot {
  endpoint?: string;
  status?: number;
  latencyMs?: number;
  error?: string;
  resolvedRuntimeModel?: string;
  requestId?: string;
  providerSource?: string;
  plan?: string;
}

export interface ZCodeQuotaLimitItem {
  limit?: number;
  used?: number;
  remaining?: number;
  percentage?: number;
  nextResetTime?: number | string;
  type?: string;
}

export interface ZCodeSubscriptionItem {
  productId?: string;
  productName?: string;
  status?: string;
  inCurrentPeriod?: boolean;
  startTime?: string | number;
  endTime?: string | number;
}

export interface ZCodeBalanceItem {
  name?: string;
  remaining?: number;
  total?: number;
  unit?: string;
  entitlementId?: string;
  capabilities?: string[];
}

/** Aggregate detection result for a provider account. */
export interface ZCodeAccountPlans {
  providerSource: ZCodeProviderSource | string;
  startPlan: ZCodePlanResult;
  individualPlan: ZCodePlanResult;
  authenticated: boolean;
  message?: string;
}

export interface ZCodeAccountUsage {
  authenticated: boolean;
  username?: string;
  email?: string;
  providerSource?: string;
  level?: string;
  remainingPercentage?: number;
  nextResetTime?: string;
  limits: ZCodeQuotaLimitItem[];
  subscriptions: ZCodeSubscriptionItem[];
  balances: ZCodeBalanceItem[];
  message?: string;
}

export interface ZCodeStreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: {
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }[];
}

export interface ZCodeStreamChoice {
  index: number;
  delta?: ZCodeStreamDelta;
  finish_reason?: string | null;
}

export interface ZCodeStreamChunk {
  id?: string;
  choices?: ZCodeStreamChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
    code?: string | number;
    type?: string;
  };
}
