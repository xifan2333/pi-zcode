const SENSITIVE_KEY_PATTERN =
    /(?:access_token|refresh_token|zcodejwttoken|apiKey|authorization|token|secret)\s*[:=]\s*["']?(?<secret>[^"',\s]+)/gi,
  JWT_PATTERN = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  BEARER_PATTERN = /Bearer\s+[a-zA-Z0-9._-]+/gi;

/**
 * Mask sensitive tokens and secrets from strings and logs.
 */
export function redactSecrets(text: string): string {
  if (!text) {
    return "";
  }
  return text
    .replace(JWT_PATTERN, "[JWT_REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(SENSITIVE_KEY_PATTERN, (_match, token: string) => {
      const masked = token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : "[REDACTED]";
      return _match.replace(token, masked);
    });
}

/**
 * Safe error message converter with secret redaction.
 */
export function safeError(error: unknown): string {
  if (error instanceof Error) {
    return redactSecrets(error.message);
  }
  return redactSecrets(String(error));
}

/**
 * Validate that an API base URL is a valid http(s) URL.
 */
export function assertSafeApiBaseUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid base URL protocol: ${parsed.protocol}`);
  }
  return parsed.origin;
}
