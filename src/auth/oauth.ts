import { randomBytes } from "node:crypto";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { ZCodeProviderSource } from "../types/enums.js";
import type { ZCodeOAuthCredentials } from "../types/types.js";
import {
  DEFAULT_BIGMODEL_ENDPOINT,
  DEFAULT_ZAI_ENDPOINT,
  DEFAULT_ZCODE_APP_ENDPOINT,
} from "../client/client.js";
import { zcodeFetch } from "../utils/http.js";
import { redactSecrets } from "../utils/security.js";

const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface OAuthCliInitResponse {
  code: number;
  msg?: string;
  data?: {
    flow_id: string;
    authorize_url: string;
    expires_at: number;
    poll_interval_sec: number;
  };
}

interface OAuthCliPollResponse {
  code: number;
  msg?: string;
  data?: {
    status: "pending" | "ready" | "failed";
    user?: {
      user_id?: string;
      name?: string;
      email?: string;
      avatar?: string;
    };
    zai?: {
      access_token?: string;
      refresh_token?: string;
    };
    bigmodel?: {
      access_token?: string;
      refresh_token?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    token?: string; // ZCode JWT Token
  };
}

/**
 * Handle standalone OAuth login flow for ZCode.
 */
export async function loginZCode(callbacks: OAuthLoginCallbacks): Promise<ZCodeOAuthCredentials> {
  const method = await callbacks.onSelect({
    message: "Select OAuth account provider:",
    options: [
      { id: "bigmodel", label: "BigModel (China)" },
      { id: "zai", label: "Z.ai (Global)" },
    ],
  });

  if (!method) {
    throw new Error("Login cancelled");
  }

  const providerSource =
    method === "bigmodel" ? ZCodeProviderSource.BIGMODEL : ZCodeProviderSource.ZAI;

  return await runOAuthPollingFlow(providerSource, callbacks);
}

/**
 * Exchange OAuth token for a permanent project API key.
 */
async function resolveProjectApiKey(
  host: string,
  rawOauthToken: string,
): Promise<{
  fullApiKey: string;
  bizToken: string;
  userId?: string;
  email?: string;
  name?: string;
}> {
  // Step 1: Exchange OAuth token for business access token
  let bizToken = rawOauthToken;
  try {
    const loginUrl = `${host}/api/auth/z/login`,
      loginRes = await zcodeFetch(loginUrl, {
        body: JSON.stringify({ token: rawOauthToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 10000,
      });
    if (loginRes.ok) {
      const loginData = (await loginRes.json()) as {
        data?: { access_token?: string; accessToken?: string };
      };
      if (loginData.data?.access_token || loginData.data?.accessToken) {
        bizToken = loginData.data.access_token || loginData.data.accessToken || bizToken;
      }
    }
  } catch {
    // Continue with raw token
  }

  // Step 2: Fetch customer info to identify default organization & project
  const infoUrl = `${host}/api/biz/customer/getCustomerInfo`,
    infoRes = await zcodeFetch(infoUrl, {
      headers: { Authorization: `Bearer ${bizToken}` },
      method: "GET",
      timeoutMs: 10000,
    });

  if (!infoRes.ok) {
    return {
      bizToken,
      fullApiKey: bizToken,
    };
  }

  const infoData = (await infoRes.json()) as {
      data?: {
        id?: number;
        email?: string;
        phoneNumber?: string;
        customerName?: string;
        nickName?: string;
        organizations?: {
          organizationId?: string;
          id?: string;
          projects?: { projectId?: string; id?: string }[];
        }[];
      };
    },
    { organizations } = infoData.data || {},
    org = organizations?.[0],
    orgId = org?.organizationId || org?.id,
    proj = org?.projects?.[0],
    projId = proj?.projectId || proj?.id || "default";

  if (!orgId) {
    return {
      bizToken,
      email: infoData.data?.email || "",
      fullApiKey: bizToken,
      name: infoData.data?.nickName || infoData.data?.customerName || infoData.data?.phoneNumber,
      userId: String(infoData.data?.id || ""),
    };
  }

  // Step 3: Fetch or create zcode-api-key
  const keysUrl = `${host}/api/biz/v1/organization/${orgId}/projects/${projId}/api_keys`;
  let apiKeyId = "",
    secretKey = "";

  try {
    const keysRes = await zcodeFetch(keysUrl, {
      headers: { Authorization: `Bearer ${bizToken}` },
      method: "GET",
      timeoutMs: 10000,
    });

    if (keysRes.ok) {
      const keysData = (await keysRes.json()) as {
        data?: { name?: string; apiKey?: string; id?: string; secretKey?: string }[];
      };
      let keyItem = keysData.data?.find((k) => k.name === "zcode-api-key") || keysData.data?.[0];

      if (!keyItem) {
        const createRes = await zcodeFetch(keysUrl, {
          body: JSON.stringify({ name: "zcode-api-key" }),
          headers: {
            Authorization: `Bearer ${bizToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          timeoutMs: 10000,
        });
        if (createRes.ok) {
          const createData = (await createRes.json()) as {
            data?: { apiKey?: string; id?: string; secretKey?: string };
          };
          keyItem = createData.data;
        }
      }

      if (keyItem?.apiKey || keyItem?.id) {
        apiKeyId = keyItem.apiKey || keyItem.id || "";
        const { secretKey: rawSecret } = keyItem || {};
        if (rawSecret && !rawSecret.includes("*")) {
          secretKey = rawSecret;
        } else {
          // Copy secret
          const copyUrl = `${keysUrl}/copy/${encodeURIComponent(apiKeyId)}`,
            copyRes = await zcodeFetch(copyUrl, {
              headers: { Authorization: `Bearer ${bizToken}` },
              method: "GET",
              timeoutMs: 10000,
            });
          if (copyRes.ok) {
            const copyData = (await copyRes.json()) as {
                data?: { secretKey?: string; secret?: string };
              },
              { secretKey: sKey, secret } = copyData.data || {};
            secretKey = sKey || secret || "";
          }
        }
      }
    }
  } catch {
    // Ignore key extraction error
  }

  const fullApiKey = apiKeyId && secretKey ? `${apiKeyId}.${secretKey}` : bizToken;

  return {
    bizToken,
    email: infoData.data?.email || "",
    fullApiKey,
    name: infoData.data?.nickName || infoData.data?.customerName || infoData.data?.phoneNumber,
    userId: String(infoData.data?.id || ""),
  };
}

/**
 * Run the CLI OAuth Polling authorization flow.
 */
async function runOAuthPollingFlow(
  provider: ZCodeProviderSource,
  callbacks: OAuthLoginCallbacks,
): Promise<ZCodeOAuthCredentials> {
  const pollToken = randomBytes(32).toString("hex"),
    initUrl = `${DEFAULT_ZCODE_APP_ENDPOINT}/api/v1/oauth/cli/init`;

  callbacks.onProgress?.("Initializing OAuth session…");

  const initRes = await zcodeFetch(initUrl, {
    body: JSON.stringify({ provider }),
    headers: {
      Authorization: `Bearer ${pollToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    timeoutMs: 15000,
  });

  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => "");
    throw new Error(`OAuth initialization failed (${initRes.status}): ${redactSecrets(errText)}`);
  }

  const initData = (await initRes.json()) as OAuthCliInitResponse;
  if (initData.code !== 0 || !initData.data?.flow_id || !initData.data?.authorize_url) {
    throw new Error(initData.msg || "OAuth initialization returned an invalid response");
  }

  const { flow_id: flowId, authorize_url: authorizeUrl } = initData.data,
    pollIntervalMs = Math.max(1000, (initData.data.poll_interval_sec || 2) * 1000),
    expiresAtMs = initData.data.expires_at
      ? initData.data.expires_at * 1000
      : Date.now() + DEFAULT_AUTH_TIMEOUT_MS;

  // Open browser for user authorization
  callbacks.onAuth({
    instructions: "Complete sign-in in your browser.",
    url: authorizeUrl,
  });

  callbacks.onProgress?.("Waiting for browser authorization…");

  const pollUrl = `${DEFAULT_ZCODE_APP_ENDPOINT}/api/v1/oauth/cli/poll/${encodeURIComponent(flowId)}`;

  // Polling loop
  while (Date.now() < expiresAtMs) {
    if (callbacks.signal?.aborted) {
      throw new Error("Login cancelled");
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    if (callbacks.signal?.aborted) {
      throw new Error("Login cancelled");
    }

    try {
      const pollRes = await zcodeFetch(pollUrl, {
        headers: {
          Authorization: `Bearer ${pollToken}`,
        },
        method: "GET",
        timeoutMs: 10000,
      });

      if (!pollRes.ok) {
        continue;
      }

      const pollData = (await pollRes.json()) as OAuthCliPollResponse;
      if (pollData.code !== 0 || !pollData.data) {
        continue;
      }

      const { status } = pollData.data;
      if (status === "pending") {
        continue;
      }

      if (status === "failed") {
        throw new Error(pollData.msg || "Authorization failed or cancelled by user");
      }

      if (status === "ready") {
        const d = pollData.data,
          rawAccess =
            provider === ZCodeProviderSource.ZAI
              ? d.zai?.access_token
              : d.bigmodel?.access_token || d.bigmodel?.accessToken,
          rawRefresh =
            provider === ZCodeProviderSource.ZAI
              ? d.zai?.refresh_token || rawAccess
              : d.bigmodel?.refresh_token || d.bigmodel?.refreshToken || rawAccess,
          jwtToken = d.token,
          oauthAccessToken = rawAccess || jwtToken;

        if (!oauthAccessToken) {
          throw new Error("OAuth completed but no access token was returned");
        }

        callbacks.onProgress?.("Resolving API credentials…");

        const host =
            provider === ZCodeProviderSource.BIGMODEL
              ? DEFAULT_BIGMODEL_ENDPOINT
              : DEFAULT_ZAI_ENDPOINT,
          keyInfo = await resolveProjectApiKey(host, oauthAccessToken),
          effectiveApiKey = keyInfo.fullApiKey || oauthAccessToken,
          { user } = d,
          email = keyInfo.email || user?.email,
          name = keyInfo.name || user?.name || email || user?.user_id;

        return {
          access: effectiveApiKey,
          avatar: user?.avatar,
          businessAccessToken: keyInfo.bizToken,
          email,
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
          name,
          providerSource: provider,
          refresh: rawRefresh || effectiveApiKey,
          type: "oauth",
          userId: keyInfo.userId || user?.user_id,
          zcodeJwtToken: jwtToken,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Login cancelled")) {
        throw error;
      }
      // Continue polling on transient network errors
    }
  }

  throw new Error("OAuth authorization timed out. Please try again.");
}

/**
 * Refresh expired access token.
 */
export async function refreshZCodeToken(
  credentials: OAuthCredentials,
  signal?: AbortSignal,
): Promise<OAuthCredentials> {
  const customCreds = credentials as ZCodeOAuthCredentials;
  if (!credentials.refresh) {
    return credentials;
  }

  try {
    const tokenUrl = `${DEFAULT_ZCODE_APP_ENDPOINT}/api/v1/oauth/token`,
      res = await zcodeFetch(tokenUrl, {
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: credentials.refresh,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal,
        timeoutMs: 15000,
      });

    if (!res.ok) {
      return credentials;
    }

    const data = (await res.json()) as {
        access_token?: string;
        token?: string;
        expires_in?: number;
        refresh_token?: string;
      },
      newRawAccess = data.access_token || data.token || credentials.access,
      newRefresh = data.refresh_token || credentials.refresh,
      expiresIn = data.expires_in || 365 * 24 * 3600,
      host =
        customCreds.providerSource === ZCodeProviderSource.BIGMODEL
          ? DEFAULT_BIGMODEL_ENDPOINT
          : DEFAULT_ZAI_ENDPOINT,
      keyInfo = await resolveProjectApiKey(host, newRawAccess);

    return {
      ...customCreds,
      access: keyInfo.fullApiKey || newRawAccess,
      businessAccessToken: keyInfo.bizToken,
      expires: Date.now() + expiresIn * 1000,
      refresh: newRefresh,
    };
  } catch {
    return credentials;
  }
}

/**
 * Extract active API key / token from OAuth credentials.
 */
export function getZCodeApiKey(credentials: OAuthCredentials): string {
  const custom = credentials as ZCodeOAuthCredentials;
  if (custom.access) {
    return JSON.stringify({
      access: custom.access,
      businessAccessToken: custom.businessAccessToken,
      providerSource: custom.providerSource,
      zcodeJwtToken: custom.zcodeJwtToken,
    });
  }
  return credentials.access || "";
}
