# Agent Tool-Discovery Checklist

Per-agent survey of how each MCP client handles the published `@firfi/huly-mcp`
default surface (**472 native tools, native mode, `clientInfo` ignored**), and what
the tool-scope PR's auto-mode resolves to for that client.

## Rubric

A client has a **tool-discovery problem** at 472 tools if either:

- **Eager**: it loads all 472 definitions into model context at connect (context bloat), or
- **Cap**: it truncates to N tools and the rest become undiscoverable.

Both are equally bad. A client is **problem-free only if** it defers tool definitions
*and can still discover all 472 on demand* (client-side tool search). Problem-free → `native`
is fine; otherwise → `proxy`.

## What can actually break the PR

Auto-mode keys solely off `clientInfo.name` via `classifyMcpClient` (`src/mcp/tool-mode.ts`).
The classifier emits `native` **only** on exact `claude-code`; every other name resolves to
`proxy` (matched name or `unknown`). So the failure direction is one-sided:

- A **false `native`** would hide the discovery fix from an agent that needs it — only
  reachable via literal `claude-code`, which is the one agent that wants native.
- A **false `proxy`** only costs a native-capable agent the nicer UX; discovery still works.

Therefore the only regression risk is an agent that gains client-side tool search yet is
**not** named `claude-code` (would get proxy instead of native) — currently none.

## Auto-mode map (from `classifyMcpClient`)

Matched prefixes → `proxy`: `claude-ai`, `cursor*`, `windsurf*`/`cascade*`,
`github-copilot*`/`copilot*`/`visual studio code*`/`visual-studio-code*`, `codex*`/`openai-codex*`, `opencode*`.
Exact `claude-code` → `native`. Everything else → `unknown` → `proxy`.
A `(via …)` remote suffix is stripped before matching (so `claude-code (via mcp-remote)` → `unknown` → proxy).

## Per-agent matrix

`clientInfo.name` strings are from the apify `mcp-client-capabilities` registry unless noted.
Verify empirically on first connect (column = Status).

| Agent | `clientInfo.name` | 472-tool behavior | Problem? | PR auto-mode | Correct? | Status |
|---|---|---|---|---|---|---|
| Claude Code | `claude-code` (exact) | Client-side tool search; defers defs, discovers all | **No** | `native` | yes | Verify tool search still on for remote MCP |
| Claude Desktop / Claude.ai | `claude-ai`, `claude-ai (via mcp-remote …)` | Eager, no tool search | Yes (eager) | `proxy` | yes | docs/PRD |
| Cursor | `cursor-vscode` | Cap ~40 (hard ~80), silent truncate | Yes (cap) | `proxy` | yes | docs/forum |
| Windsurf / Cascade | `Windsurf`, `windsurf-client` | Cap 100 | Yes (cap) | `proxy` | yes | docs |
| GitHub Copilot CLI | `github-copilot-developer` | Cap 128 | Yes (cap) | `proxy` | yes | docs |
| Copilot agent in VS Code | `Visual Studio Code` / `Visual-Studio-Code` | Cap 128 | Yes (cap) | `proxy` (github-copilot) | yes | |
| OpenAI Codex | `Codex`, `codex-mcp-client` | Eager | Yes (eager) | `proxy` | yes | Confirm no tool search |
| ChatGPT (connectors) | `ChatGPT` | Eager/limited | Yes | `proxy` (unknown) | yes | low priority |
| Cline | `Cline` | No cap → eager all 472 | Yes (eager) | `proxy` (unknown) | yes | runs in VS Code |
| Roo Code | `Roo-Code` | Cline fork → eager | Yes (eager) | `proxy` (unknown) | yes | |
| Kilo Code | `Kilo-Code` | Cline-family → eager | Yes (eager) | `proxy` (unknown) | yes | |
| opencode | `opencode` (v1.14.33, verified) | Eager-loads all 472 (verified: connected, 472 tools served) | Yes (eager) | `proxy` | yes | verified here against 0.43.0 |
| Gemini CLI | `gemini-cli-mcp-client` | Loads all (<512 fn-decl hard cap); eager | Yes (eager, near 512 ceiling) | `proxy` (unknown) | yes | installed but no creds here |
| Google Antigravity | `antigravity-client` | Hard `MAX_LIMIT=100` → **blocks load** at 472 | Yes (block) | `proxy` (unknown) | yes | severe |
| goose | `goose` (v1.0.24, verified) | Connects, **no** schema rejection (unlike opencode); full tool-load unconfirmed (anthropic credits exhausted mid-turn) | Yes (eager, inferred) | `proxy` (unknown) | yes | clientInfo verified here |
| Kiro (IDE/CLI) | unverified (likely `kiro-cli`) | Warns >50, eager into context | Yes (eager + soft cap) | `proxy` (unknown, assumed) | yes if name unmatched | **Capture real name** |
| Zed | `Zed` | Eager | Yes (eager) | `proxy` (unknown) | yes | |
| Continue CLI | `continue-cli-client` | Eager | Yes (eager) | `proxy` (unknown) | yes | |
| Amazon Q Dev CLI | `Q-DEV-CLI` | Eager | Yes (eager) | `proxy` (unknown) | yes | |
| JetBrains AI Assistant | `JetBrains-*-copilot-intellij` | Eager/cap | Yes | `proxy` (unknown) | yes | |
| AmpCode | `amp-mcp-client` | Eager | Yes | `proxy` (unknown) | yes | |
| Crush | `crush` | Eager | Yes | `proxy` (unknown) | yes | |
| Raycast | `com.raycast.macos` | Eager | Yes | `proxy` (unknown) | yes | |

Conclusion: at 472 tools **every agent except Claude Code has a discovery problem**, so the
`proxy`-by-default / `native`-only-for-`claude-code` policy is correct under the rubric.

## Server-side schema note: duplicate `$id:/schemas/unknown`

Observed against published `@firfi/huly-mcp@0.43.0`. The generated `tools/list` payload emits
inline `{"$id":"/schemas/unknown","title":"unknown"}` (Effect Schema's encoding of
`Schema.Unknown`/`Schema.Any`) plus `/schemas/{}` for empty structs, in ~24 of 472 tools
(1 input: `add_approval_request.tx`; ~23 outputs, e.g. `list_inventory_product_attachments`).
Reusing one `$id` across distinct inline nodes is invalid per JSON Schema (`$id` must be unique
in scope), so a strict `$id`/`$ref` resolver *can* reject the aggregated tool set.

Reproduction status: **not a confirmed client failure.** opencode (v1.14.33) loads all 472 tools
fine with these ids present (verified: connected, two successful `tools/list` calls). A single
earlier "failed to get tools — `/schemas/unknown` resolves to more than one schema" coincided with
a transient Huly first-connect race ("no document found, failed to apply model transaction") and
did not reproduce on warm reconnect. Treat the duplicate `$id` as spec-correctness hardening for
strict clients, not as a fix for a known outage.

## Notes on classifier rules

- **VS Code** is matched by `visual studio code` / `visual-studio-code` (its real
  `clientInfo.name`), classified as `github-copilot`. Cline/Roo/Kilo running *inside* VS Code
  send their own names, not the editor's, so they classify as `unknown`.
- **Named proxy matches are redundant with `unknown → proxy`** for outcome; they exist to make
  the decision explicit in telemetry/context rather than to change the resulting mode.
- The only name that changes outcome vs the default is exact `claude-code` (→ native).

## Test procedure (per agent, published 0.43.0 baseline)

Goal: record (a) the literal `clientInfo.name`, (b) tool count the agent actually exposes,
(c) whether it eager-loads or caps, (d) whether all 472 remain discoverable.

1. Configure the agent's MCP config to run the published server:
   ```json
   { "command": "npx", "args": ["-y", "@firfi/huly-mcp@0.43.0"],
     "env": { "HULY_URL": "…", "HULY_EMAIL": "…", "HULY_PASSWORD": "…", "HULY_WORKSPACE": "…" } }
   ```
2. Capture `clientInfo.name`: connect once and read it from the agent's MCP trace/logs
   (e.g. Kiro: `KIRO_LOG_LEVEL=trace`), or point the agent at a JSON-RPC stdio process whose
   only job is to echo the `initialize` params to stderr.
3. In the agent, list available MCP tools and record the count. Compare to 472.
   - Count ≈ 472 and visible in context → **eager** (problem).
   - Count < 472 with no way to reach the rest → **cap** (problem).
   - Few tools listed but a search/discovery affordance reaches all 472 → **tool search** (ok → native).
4. Record the row in the matrix: name, behavior, problem?, and whether the PR auto-mode matches.

## Open empirical items

- [ ] Kiro: capture real MCP `clientInfo.name`; confirm it does not start with a matched prefix
      (`cursor`/`windsurf`/`cascade`/`copilot`/`github-copilot`/`visual studio code`/`codex`/`opencode`).
- [ ] Claude Code: confirm client-side tool search is on by default for **remote** MCP servers
      (so `native` is genuinely problem-free, not eager).
- [ ] opencode / Codex / Gemini CLI: confirm none has added client-side tool search (else they'd
      warrant `native` but currently get `proxy`).
- [x] opencode emits `opencode`; goose emits `goose` (verified here against 0.43.0).
- [ ] Gemini CLI: not verifiable in this environment (no Google credentials configured).
