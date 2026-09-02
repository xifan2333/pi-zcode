# pi-zcode

[![license](https://img.shields.io/npm/l/pi-zcode)](LICENSE)

**pi-zcode** is a standalone [Pi Coding Agent](https://pi.dev) provider extension that connects Pi directly to ZCode / Z.AI / BigModel services and GLM models.

---

## Features

- **Pure Standalone**: Direct HTTP/SSE connection without local ZCode desktop app or CLI dependencies.
- **Auto Plan Detection & Provider Registration**:
  - Automatically identifies **Start Plan** and **Individual Plan** entitlements.
  - Dynamically registers `zcode`, `zcode-start-plan`, and `zcode-individual-plan` providers with models discovered from upstream APIs.
- **In-Process Headless CAPTCHA Solver**:
  - Pure in-memory DOM simulation (`happy-dom`) solving Aliyun CAPTCHA in background in <1s.
  - 100% automated; zero browser popups or interruptions during agent runs.
- **Extended Reasoning & Thinking**: Native support for `reasoning_content` and Anthropic thinking blocks.
- **Structured Tool Calling**: Streaming function/tool calls with live argument assembly.
- **Diagnostics & Quota Monitoring**: `/zcode.usage` and `/zcode.doctor`.

---

## Quick Start

1. Install into Pi:
   ```bash
   pi install /path/to/pi-zcode
   ```
2. Sign in via Pi OAuth:
   ```text
   /login zcode
   ```
3. Switch model using Pi's native model selector:
   ```text
   /model zcode/glm-5.3-flash
   ```
   or flagship:
   ```text
   /model zcode/glm-5.3
   ```

---

## Slash Commands

| Command         | Description                                                      |
| :-------------- | :--------------------------------------------------------------- |
| `/login zcode`  | Sign in via browser OAuth flow.                                  |
| `/model`        | Pi's native model selector (shows all active ZCode plan models). |
| `/zcode.usage`  | View detected plans, quota, daily balance, and reset times.      |
| `/zcode.doctor` | View connection status, latency, endpoint, and diagnostic logs.  |

---

## License

MIT
