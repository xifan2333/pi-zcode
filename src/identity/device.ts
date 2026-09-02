import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

function getConfigDir(): string {
  try {
    return join(getAgentDir(), "zcode");
  } catch {
    return join(process.env.HOME || "", ".pi", "agent", "zcode");
  }
}

interface DeviceConfig {
  deviceMid: string;
  createdAt: number;
}

/**
 * Resolve a stable device identifier, generating and persisting one on first use.
 * The same `X-Device-Mid` must be reused across all requests — rotating it can
 * trigger ZCode risk control (3012 / unusual activity).
 */
export function getDeviceMid(): string {
  const configDir = getConfigDir();
  const configFile = join(configDir, "device.json");

  try {
    if (existsSync(configFile)) {
      const config = JSON.parse(readFileSync(configFile, "utf8")) as DeviceConfig;
      if (typeof config.deviceMid === "string" && config.deviceMid.trim()) {
        return config.deviceMid.trim();
      }
    }
  } catch {
    // Fall through to regenerate
  }

  const deviceMid = randomUUID();
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const config: DeviceConfig = { createdAt: Date.now(), deviceMid };
    writeFileSync(configFile, JSON.stringify(config, undefined, 2), "utf8");
  } catch {
    // Ignore filesystem errors; still return the generated id for this session.
  }
  return deviceMid;
}
