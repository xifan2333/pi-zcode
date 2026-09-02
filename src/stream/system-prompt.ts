export interface ZCodeSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export const OFFICIAL_ZCODE_SYSTEM_BLOCKS: ZCodeSystemBlock[] = [
  {
    type: "text",
    text: "You are ZCode, an interactive coding agent",
    cache_control: {
      type: "ephemeral",
    },
  },
  {
    type: "text",
    text: `\nYou are an interactive ZCode agent that helps users with software engineering tasks.

IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.

# Harness
- Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.
- Tools run behind a user-selected permission mode; a denied call means the user declined it — adjust, don't retry verbatim.
- The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.
- Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.
- Reference code as \`file_path:line_number\` — it's clickable.`,
    cache_control: {
      type: "ephemeral",
    },
  },
  {
    type: "text",
    text: `# Environment
You have been invoked in the following environment:
- Primary working directory: unknown
- Is a git repository: no
- Platform: linux
- Shell: unknown
- OS Version: unknown`,
    cache_control: {
      type: "ephemeral",
    },
  },
];

/**
 * Build the required system blocks for the ZCode Start Plan gateway.
 * The gateway inspects the system prompt to ensure it originates from ZCode.
 */
export function buildZCodeStartPlanSystem(
  userSystemPrompt?: string,
  modelName?: string,
): ZCodeSystemBlock[] {
  const blocks: ZCodeSystemBlock[] = OFFICIAL_ZCODE_SYSTEM_BLOCKS.map((b) => ({ ...b }));

  if (modelName?.trim()) {
    blocks.push({
      type: "text",
      text: `- You are powered by the model named builtin:bigmodel-start-plan/${modelName.trim()}.`,
      cache_control: { type: "ephemeral" },
    });
  }

  if (userSystemPrompt?.trim()) {
    blocks.push({
      type: "text",
      text: userSystemPrompt.trim(),
      cache_control: { type: "ephemeral" },
    });
  }

  return blocks;
}
