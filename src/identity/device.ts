import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pi", "zcode"),
  CONFIG_FILE = join(CONFIG_DIR, "device.json");

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
  try {
    if (existsSync(CONFIG_FILE)) {
      const config = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as DeviceConfig;
      if (typeof config.deviceMid === "string" && config.deviceMid.trim()) {
        return config.deviceMid.trim();
      }
    }
  } catch {
    // Fall through to regenerate
  }

  const deviceMid = randomUUID();
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const config: DeviceConfig = { createdAt: Date.now(), deviceMid };
    writeFileSync(CONFIG_FILE, JSON.stringify(config, undefined, 2), "utf8");
  } catch {
    // Ignore filesystem errors; still return the generated id for this session.
  }
  return deviceMid;
}
