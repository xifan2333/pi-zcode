export enum ZCodeProviderSource {
  ZAI = "zai",
  BIGMODEL = "bigmodel",
}

export enum ZCodePlan {
  START_PLAN = "start-plan",
  INDIVIDUAL_PLAN = "individual-plan",
}

export enum ZCodePlanStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  UNKNOWN = "unknown",
}

export enum ThinkingEffort {
  OFF = "off",
  MINIMAL = "minimal",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  XHIGH = "xhigh",
  MAX = "max",
}

export enum StopReason {
  STOP = "stop",
  TOOL_CALLS = "tool_calls",
  LENGTH = "length",
  ERROR = "error",
  ABORTED = "aborted",
}
