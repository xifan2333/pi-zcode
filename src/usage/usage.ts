import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildZCodeHeaders, parseApiKey, resolveBaseHost } from "../client/client.js";
import { PROVIDER_ID } from "../models/models.js";
import type { ZCodeAccountPlans, ZCodeAccountUsage } from "../types/types.js";
import { zcodeFetch } from "../utils/http.js";
import { formatResetTime, zcodeEnv } from "../utils/util.js";

interface StartPlanBalanceResponse {
  code: number;
  msg?: string;
  data?: {
    plans?: { name?: string; status?: string; ends_at?: number }[];
    balances?: {
      show_name?: string;
      remaining_units?: number;
      total_units?: number;
      unit_type?: string;
    }[];
  };
}

/**
 * Fetch account usage for rendering a reporter. Takes pre-detected plans and a token.
 */
export async function fetchAccountUsage(
  rawApiKey: string,
  _plans?: ZCodeAccountPlans,
): Promise<ZCodeAccountUsage> {
  const auth = parseApiKey(rawApiKey);
  if (!auth.token && !auth.zcodeJwtToken) {
    return {
      authenticated: false,
      balances: [],
      limits: [],
      message: "No active ZCode credentials found. Please run /login zcode first.",
      subscriptions: [],
    };
  }

  const balances: ZCodeAccountUsage["balances"] = [],
    subscriptions: ZCodeAccountUsage["subscriptions"] = [],
    limits: ZCodeAccountUsage["limits"] = [];

  // Start Plan balance (daily quota)
  if (auth.zcodeJwtToken) {
    try {
      const balanceUrl = `https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=3.10.2`,
        res = await zcodeFetch(balanceUrl, {
          headers: {
            Authorization: `Bearer ${auth.zcodeJwtToken}`,
            "Content-Type": "application/json",
            "User-Agent": "ZCode/3.10.2",
          },
          method: "GET",
          timeoutMs: 8000,
        });
      if (res.ok) {
        const body = (await res.json()) as StartPlanBalanceResponse;
        if (body.code === 0 && body.data?.balances) {
          for (const b of body.data.balances) {
            balances.push({
              name: b.show_name || "Daily Model Quota",
              remaining: b.remaining_units,
              total: b.total_units,
              unit: b.unit_type || "tokens",
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  const host = resolveBaseHost(auth),
    headers = buildZCodeHeaders(auth);

  // Individual Plan quota
  try {
    const quotaUrl = `${host}/api/monitor/usage/quota/limit`,
      res = await zcodeFetch(quotaUrl, { headers, method: "GET", timeoutMs: 8000 });
    if (res.ok) {
      const body = (await res.json()) as { data?: { limits?: unknown[]; level?: string } };
      if (body.data?.limits && Array.isArray(body.data.limits)) {
        for (const item of body.data.limits as Record<string, unknown>[]) {
          limits.push({
            nextResetTime: item.nextResetTime as number | string | undefined,
            percentage: item.percentage as number | undefined,
            type: (item.type as string) || "Tokens",
          });
        }
      }
    }
  } catch {
    // Ignore
  }

  // Subscriptions
  try {
    const subUrl = `${host}/api/biz/subscription/list`,
      res = await zcodeFetch(subUrl, { headers, method: "GET", timeoutMs: 8000 });
    if (res.ok) {
      const body = (await res.json()) as { data?: Record<string, unknown>[] };
      for (const s of body.data || []) {
        subscriptions.push({
          inCurrentPeriod: s.inCurrentPeriod as boolean | undefined,
          productId: (s.productId as string) || undefined,
          productName: (s.productName as string) || undefined,
          status: (s.status as string) || undefined,
        });
      }
    }
  } catch {
    // Ignore
  }

  return {
    authenticated: true,
    balances,
    limits,
    subscriptions,
  };
}

function makeProgressBar(fraction: number, length = 20): string {
  const clamped = Math.max(0, Math.min(1, fraction)),
    filled = Math.round(clamped * length),
    empty = length - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${Math.round(clamped * 100)}%`;
}

/**
 * Format plan detection + usage into a concise report.
 */
export function formatUsageSummary(plans: ZCodeAccountPlans): string {
  if (!plans.authenticated) {
    return plans.message || "Not authenticated with ZCode. Please run /login zcode.";
  }

  const lines: string[] = [];
  lines.push("ZCode Plan Status");
  lines.push(`• Provider: ${plans.providerSource}`);
  lines.push(`• Start Plan: ${plans.startPlan.status}`);
  if (plans.startPlan.models?.length) {
    lines.push(`  Models: ${plans.startPlan.models.join(", ")}`);
  }
  lines.push(`• Individual Plan: ${plans.individualPlan.status}`);

  return lines.join("\n");
}

/**
 * Report plan detection with balance and subscription details.
 */
export function formatUsageReport(plans: ZCodeAccountPlans, usage: ZCodeAccountUsage): string {
  const lines: string[] = [];
  lines.push("ZCode Plan & Usage");
  lines.push(`• Provider: ${plans.providerSource}`);

  lines.push(`• Start Plan: ${plans.startPlan.status}`);
  if (plans.startPlan.models?.length) {
    lines.push(`  Models: ${plans.startPlan.models.join(", ")}`);
  }

  lines.push(`• Individual Plan: ${plans.individualPlan.status}`);

  if (usage.balances.length > 0) {
    lines.push("\nToday's Balance (Resets 23:59):");
    for (const b of usage.balances) {
      const total = b.total || 0,
        rem = b.remaining ?? total,
        fraction = total > 0 ? rem / total : 1;
      lines.push(
        `  • ${(b.name || "Model").padEnd(14)}: ${makeProgressBar(fraction)} ${rem.toLocaleString()} / ${total.toLocaleString()} ${b.unit || "tokens"}`,
      );
    }
  }

  if (usage.subscriptions.length > 0) {
    lines.push("\nActive Subscriptions:");
    for (const sub of usage.subscriptions) {
      const name = sub.productName || sub.productId || "Plan";
      lines.push(`  • ${name} (${sub.status || "VALID"})`);
    }
  }

  if (usage.limits.length > 0) {
    lines.push("\nQuota Limits:");
    for (const limit of usage.limits) {
      lines.push(`  • ${limit.type || "Quota"}: reset ${formatResetTime(limit.nextResetTime)}`);
    }
  }

  lines.push("\nCommands: /login zcode | /zcode.usage | /zcode.doctor");
  return lines.join("\n");
}

/**
 * Resolve active API key from an extension command context.
 */
export async function resolveApiKeyFromContext(
  ctx: ExtensionCommandContext,
): Promise<string | undefined> {
  try {
    const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);
    if (key) {
      return key;
    }
  } catch {
    // Fall through
  }
  return zcodeEnv("API_KEY") || zcodeEnv("TOKEN");
}
