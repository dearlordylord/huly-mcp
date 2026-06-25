# PRD: Lazy Tool Loading via Meta-Tools

## Problem

This MCP server exposes 470 tools across 39 categories. When a client (Claude Desktop, Cursor, etc.) connects, it receives all 470 tool definitions — names, descriptions, and full JSON schemas — in a single `tools/list` response. The generated `tools/list` payload is about 435KB of JSON. Measured with Claude's tokenizer (via `/context` against the published `@firfi/huly-mcp` server), the tool surface is roughly **170K tokens** before any conversation begins. The common 4-chars-per-token heuristic understates this at ~109K, because JSON schemas tokenize more densely than prose.

This matters because:
- LLMs have finite context windows. ~170K tokens on tool definitions alone leaves less room for actual work.
- LLMs can miscount or lose track of tools when there are too many in context. (The motivating observation: Claude claimed 97 tools when there were 184.) Published evaluations show tool-selection accuracy degrades once a library exceeds roughly 30–50 tools; with on-demand tool search enabled on large libraries, Anthropic reports Claude Opus 4.5 improving from 79.5% to 88.1% and Opus 4 from 49% to 74%.
- Most sessions use a small fraction of available tools. A user asking about issues doesn't need calendar, notification settings, or workspace admin schemas loaded.
- Several clients hard-cap the number of MCP tools and silently truncate the rest: Cursor warns at ~40 (hard limit ~80), Windsurf's Cascade caps at 100, and GitHub Copilot at 128. At 470 tools, most of Huly's surface is not merely expensive on these clients — it is invisible, with no error surfaced to the user.

## Prior Art & Current Landscape

### Claude Code / Claude Agent SDK Tool Search

Claude's agent SDK already implements **client-side** lazy loading, enabled by default in Claude Code since January 2026. When tool search is active, tool definitions are withheld from context; the agent searches the catalog and loads the 3-5 most relevant tools on demand. `ENABLE_TOOL_SEARCH=auto` activates search when combined tool definitions exceed 10% of the context window, and tool search applies to remote MCP servers as well as custom SDK tools.

However, this is **Claude Code-specific**. Codex, opencode, and Claude Desktop load every enabled server's tools eagerly; Cursor, Windsurf, and Copilot cap the tool count and truncate. A server-side solution benefits all clients, and is the only thing that helps the non-Claude-Code clients at all.

### Claude API Tool Search Tool

The Claude API offers dedicated regex and BM25 `tool_search` tool types for API users with 10+ tools or >10K tokens of definitions. Deferred tools use `defer_loading: true`; Claude initially sees only the search tool and any non-deferred tools, then receives 3-5 `tool_reference` blocks for the matching tools.

### MCP Protocol Support

The MCP spec supports relevant primitives:
- **`tools/list` pagination** via cursor-based pagination (`nextCursor` in response)
- **`listChanged` notifications** for dynamic tool registration
- **Tool annotations** for metadata (read-only, destructive, etc.)

Stable MCP does not define a `tools/list` search or filter parameter. The draft tools spec also makes session-state-based lazy loading a poor default: the available tool set may change over time, but must not vary per connection or as a side effect of other requests on that connection. Search-induced "enable these tools for this session, then emit `tools/list_changed`" depends on exactly that kind of implicit connection state.

None of the protocol primitives are currently used by this server for on-demand discovery.

### Emerging MCP Tool Groups / Toolsets

[MCP Discussion #1567](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567) proposes primitive groups for tools, resources, and prompts. The useful part for Huly is group-level metadata: a group can have a stable name, title, and description intended for model use, distinct from individual tool descriptions. Later comments note community practice around "toolsets" such as GitHub MCP's `X-MCP-Toolsets` header/path parameter, Datadog's `toolsets` parameter, and FastMCP tag/tool filtering.

This does not change the filtering recommendation by itself. It strengthens the case for stable category/toolset metadata and for naming Huly's categories consistently with emerging ToolGroup/toolset terminology, but it is not a finalized `tools/list` filter API and does not make `tools/list_changed` reliable across clients.

The official `github/github-mcp-server` (~100+ tools) ships two static mitigations worth mirroring: toolset selection (`--toolsets` / `GITHUB_TOOLSETS`, with only `context`, `repos`, `issues`, `pull_requests`, `users` enabled by default), and per-tool selection (remote `X-MCP-Tools` header / local `--tools` flag, added December 2025). GitHub reports that loading 3–10 of the most-used tools instead of the default toolsets yields a ~60–90% context-window reduction. Both are static, request-scoped configuration — not per-session mutation — so they sidestep the `tools/list_changed` reliability problem entirely.

[MCP SEP #1888](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1888) proposes standardizing an optional `searchTools` meta-tool for progressive disclosure of typed operations. If adopted, it would give Approach E a protocol-blessed shape rather than a bespoke meta-tool surface.

### Server-Side Search / Proxy Prior Art

Several ecosystems solve large MCP/API surfaces by exposing a small model-facing search and invocation surface:

- **FastMCP Tool Search Transform**: `list_tools()` returns `search_tools` and `call_tool`; original tools are hidden from listing but remain callable. Search covers tool names, descriptions, parameter names, and parameter descriptions, with regex and BM25 modes.
- **Stainless dynamic tools**: exposes `list_api_endpoints`, `get_api_endpoint_schema`, and `invoke_api_endpoint` instead of loading an entire API schema into the model context.
- **Cloudflare Code Mode**: exposes a compact code execution surface where `codemode.search` and `codemode.describe` fetch the connector method/type information needed by the running code rather than putting the whole API in the prompt.
- **OBS competitor research**: the local OBS MCP competitor uses a two-tool `search` + `execute` surface over an internal registry. Its safety model should not be copied where it evaluates arbitrary JavaScript, but the discover-then-execute shape matches the broader pattern.
- **Anthropic "Code execution with MCP"**: presents MCP servers as a generated filesystem of code modules (one file per tool) that the agent explores on demand, instead of loading tool definitions into context. Anthropic reports a workflow dropping from ~150K to ~2K tokens (98.7%). The pattern also keeps large intermediate tool *results* out of context — a dimension the meta-tool proxy approaches here do not address — at the cost of requiring a code sandbox.
- **Notion MCP (hosted, 18 tools)**: ships exactly the recommended shape — tool scoping plus `search_tools` / `execute_tool` meta-tools for runtime discovery.

### SDK Support (v1.25.3)

The installed `@modelcontextprotocol/sdk` v1.25.3 has **full support** for dynamic tool management:
- `server.sendToolListChanged()` — sends notification to client
- `McpServer.registerTool()` / `RegisteredTool.remove()` — add/remove tools at runtime
- `RegisteredTool.enable()` / `.disable()` — show/hide tools from `tools/list`
- All of the above automatically trigger `tools/list_changed` notifications
- Notification debouncing available via `debouncedNotificationMethods` option

### Client Support for `tools/list_changed`

| Client | Status | Notes |
|--------|--------|-------|
| Claude Code | Disputed | Docs claim support, but [Issue #4118](https://github.com/anthropics/claude-code/issues/4118) (58 upvotes) reports it doesn't work mid-conversation |
| Claude Desktop | **Not supported** | Confirmed by MCP maintainer ([Discussion #76](https://github.com/orgs/modelcontextprotocol/discussions/76)) |
| GitHub Copilot (VS Code) | **Supported** | Confirmed working |
| Cursor | Reported unsupported mid-session | Community reports say `notifications/tools/list_changed` is ignored in Cursor CLI |
| Vercel AI SDK | **Not supported** | Docs confirm no notification support |

## Existing Infrastructure

The codebase is well-positioned for this change:

- **Every tool already has a `category` field** — `ToolDefinition` includes `readonly category: string`, and each tool file defines a stable category such as `issues`, `documents`, or `channels`. 39 categories currently exist.
- **Tool registry** (`src/mcp/tools/index.ts`) aggregates all tools into a `Map<string, RegisteredTool>` with a `handleToolCall` dispatcher.
- **JSON schemas** are pre-generated at import time via `makeJsonSchema()` from Effect Schema.
- **`tools/list` handler** (`src/mcp/server.ts:72-82`) maps over `toolRegistry.definitions` to produce the response.

## Approaches Evaluated

### ~~Approach A: All Tools Listed, Schemas Stripped~~ (REJECTED)

`tools/list` returns all 470 tools with `inputSchema: { type: "object" }` (no property definitions) plus 3 meta-tools for schema discovery.

**Why rejected:** Does not solve the core problem. The LLM still sees 473 tool entries in context — it saves schema payload tokens but the tool count (what causes LLMs to miscount/lose track) is unchanged. An LLM seeing `create_issue` with `inputSchema: { type: "object" }` will likely just call it directly without fetching the schema, since the server validates via Effect Schema anyway. The meta-tools become unused overhead.

### ~~Approach B: Only Meta-Tools Listed, Real Tools Hidden~~ (REJECTED as primary)

`tools/list` returns only 3 meta-tools. Real tools unlisted but callable.

**Why rejected as primary:** Some MCP clients reject calls to tools not in `tools/list`. Protocol compliance varies. However, elements of this approach survive in Approach E because all hidden calls go through a listed `invoke_tool` proxy.

### ~~Approach C: Hybrid — Core Tools + Meta-Tools~~ (REJECTED)

Curated set of ~20-30 "core" tools plus meta-tools.

**Why rejected:** Maintenance burden of curating "core" list. Inconsistent UX.

### Approach D: Dynamic Tool Loading via `tools/list_changed` (CLIENT-GATED / EXPERIMENTAL)

The MCP-native-looking pattern for tool filtering:

1. Server starts with a small listed surface: built-ins, proxy tools, and any scoped native pins
2. LLM calls `search_tools` with a query describing what it needs
3. Server enables matching tools (adds them to what `tools/list` returns)
4. Server sends `tools/list_changed` notification
5. Client calls `tools/list` to get updated tool list
6. LLM can now call the newly available tools

**Tradeoffs:**
- (+) Minimal initial context — only a few tools + search
- (+) Tools appear as first-class MCP tools once enabled (full client compatibility)
- (+) SDK already supports everything needed
- (-) Client must support `tools/list_changed` (Claude Desktop doesn't, Claude Code disputed)
- (-) Extra round-trip: search → notification → list → call (vs direct call)
- (-) Ties discovery to per-session tool state, which conflicts with the draft spec's direction that `tools/list` must not vary per connection or as a side effect of other requests on the connection
- (-) Fails silently in clients that cache the initial tool list or ignore `notifications/tools/list_changed`
- (-) Mutating the tool list mid-session invalidates the provider's prompt cache for the tools-array prefix; the resulting cache miss can cost more tokens than the deferred definitions save. The static proxy (Approach E) never mutates `tools/list`, so it keeps that prefix cacheable.

This remains useful as an opt-in mode for known-compatible stdio/session clients, but it should not be the default compatibility strategy.

### Approach E: Static Meta-Tool Proxy (RECOMMENDED DEFAULT)

A static 4-tool approach (like [Stainless dynamic tools](https://www.stainless.com/changelog/mcp-dynamic-tools)):
- `list_tool_categories` — browse categories
- `search_tools` — find tools by query
- `get_tool_schema` — fetch exact input/output schemas for selected tools
- `invoke_tool` — proxy: takes `toolName` + `args`, dispatches to real handler

This works with every client but loses native tool call UX (all calls go through `invoke_tool`).

## Two-Axis Configuration Model

The design splits two concerns that should not be coupled:

### Axis 1: Exposure Mode

`HULY_TOOL_MODE` selects how tools are presented to the MCP client:

- `native`: return native Huly tools from `tools/list`; clients that implement their own lazy loading can defer tool definitions.
- `proxy`: return a small meta-tool surface for discovery/invocation, such as `search_tools`, `get_tool_schema`, and `invoke_tool`.
- `auto` (default): choose from `clientInfo` at initialize time, with `HULY_TOOL_MODE=native` or `HULY_TOOL_MODE=proxy` as an explicit override.

Initial auto-selection rule should be conservative:

| Client match | Auto mode | Rationale |
|--------------|-----------|-----------|
| exact `claude-code` | `native` | Claude Code has client-side tool search and can defer remote MCP tools |
| `claude-ai`, including `claude-ai (via ...)` | `proxy` | Ambiguous between Claude Desktop / Claude.ai / remote bridges; do not assume Claude Code tool search |
| `cursor-vscode`, `cursor*` | `proxy` | Cursor eagerly loads/caps MCP tools |
| `windsurf*`, `cascade*` | `proxy` | Cascade/Windsurf caps MCP tools |
| `github-copilot*`, `copilot*`, `visual studio code*`, `visual-studio-code*` | `proxy` | GitHub Copilot / VS Code has finite tool limits; proxy avoids truncation |
| `codex*`, `openai-codex*` | `proxy` | Treat as eager unless/until Codex advertises client-side tool search |
| `opencode*` | `proxy` | Treat as eager unless/until opencode advertises client-side tool search |
| unknown / missing clientInfo | `proxy` | Avoid exposing a 470-tool, ~170K-token surface by default |

For protocol versions with an initialize handshake, read `params.clientInfo` from `initialize`. The SDK stores this as `server.getClientVersion()` after initialization. For the 2026 stateless HTTP path, read `_meta["io.modelcontextprotocol/clientInfo"]` on each request; the current dispatcher already validates that this field exists.

This logic should live in a dedicated typesafe module, not inline string checks:

```typescript
// src/mcp/tool-mode.ts
export const ToolExposureModeSchema = Schema.Literal("native", "proxy")
export type ToolExposureMode = Schema.Schema.Type<typeof ToolExposureModeSchema>

export const ToolModeConfigSchema = Schema.Literal("auto", "native", "proxy")
export type ToolModeConfig = Schema.Schema.Type<typeof ToolModeConfigSchema>

export const ClientKindSchema = Schema.Literal(
  "claude-code",
  "claude-ai",
  "cursor",
  "windsurf",
  "github-copilot",
  "codex",
  "opencode",
  "unknown"
)
export type ClientKind = Schema.Schema.Type<typeof ClientKindSchema>

export const DEFAULT_MODE_BY_CLIENT_KIND = {
  "claude-code": "native",
  "claude-ai": "proxy",
  cursor: "proxy",
  windsurf: "proxy",
  "github-copilot": "proxy",
  codex: "proxy",
  opencode: "proxy",
  unknown: "proxy"
} as const satisfies Record<ClientKind, ToolExposureMode>
```

The module should expose pure functions such as `classifyMcpClient(clientInfo)` and `resolveToolExposureMode({ configuredMode, clientInfo })`. Tests should cover exact matches, prefixed bridge names like `claude-ai (via mcp-remote 0.1.37)`, casing/whitespace normalization, unknown names, and env override precedence.

### Axis 2: Scope Filter

`TOOLSETS` and `TOOLS` decide which native tools are in the explicitly scoped set. This applies underneath either exposure mode.

If neither env var is set, no scope filter is applied.

If either env var is set, the selected set is the union of:

- every tool whose category/toolset is listed in `TOOLSETS`
- every exact tool name listed in `TOOLS`, including tools from categories not listed in `TOOLSETS`

Examples:

```bash
TOOLSETS=issues,projects
# selects every issues/projects tool

TOOLS=create_issue,fulltext_search
# selects exactly those tools

TOOLSETS=issues TOOLS=list_documents
# selects all issue tools plus list_documents
```

Unknown toolset/tool names should be reported in `get_huly_context` and warned to stderr. To honor "env set means filtering is active", a set-but-all-invalid scope should produce an empty scoped set rather than silently falling back to all 470 tools.

`TOOLSETS` is the primary category scope env var; `TOOLS` is the primary exact-tool scope env var.

### Scope And Proxy Strictness

In `native` mode, the scope filter is strict: `tools/list` returns the scoped native tools when a scope is active, or all native tools when no scope is active. Direct `tools/call` should only dispatch to tools in that native visible set.

In `proxy` mode, proxy meta-tools are always visible. `PROXY_OUTPUT_STRICT` controls how the axis-2 scoped set affects proxy behavior:

| `PROXY_OUTPUT_STRICT` | `tools/list` in proxy mode | Proxy search/schema/invoke candidates |
|-----------------------|----------------------------|---------------------------------------|
| `false` (default) | proxy tools plus any scoped native tools, when a scope is active | all registered Huly tools |
| `true` | proxy tools only | scoped Huly tools only when a scope is active; all Huly tools when no scope is active |

This default gives users a way to pin a small set of high-frequency tools as native first-class tools while still keeping the rest of Huly discoverable through proxy meta-tools. Strict mode turns `TOOLSETS`/`TOOLS` into a hard allow-list for proxy search results, schema lookup, and invocation.

Implementation should keep these as separate registries/views over one registry source:

- full registry: all Huly tools
- scoped registry: union from `TOOLSETS` and `TOOLS`, or full registry when scope is inactive
- native visible registry: what direct native `tools/list` and direct native `tools/call` use
- proxy candidate registry: what `search_tools`, `get_tool_schema`, and `invoke_tool` index and dispatch through

## Design: Proxy Default, Native Client-Selected

### Search Organization

The `search_tools` tool performs keyword matching against tool names, descriptions, parameter metadata, and categories:

```
Input:  { query: "create an issue" }
Output: [
  { name: "create_issue", description: "...", category: "Issues" },
  { name: "create_issue_from_template", description: "...", category: "Issues" },
  ...
]
No default side effect. In Approach D compatibility mode only, matched tools may also be enabled in `tools/list` and a notification sent.
```

Search strategy (simple, no vector DB needed):
- Tokenize query into keywords
- Score each tool: exact name match > keyword in name > keyword in description > category match
- Return top N matches (e.g., top 20) with names, descriptions, categories, and optionally compact parameter summaries
- In static proxy mode, provide `get_tool_schema` or include the selected full input schema before `invoke_tool`
- In dynamic mode only, enable matched tools and rely on `tools/list_changed`

### Proxy Tool Surface And Native Pins

The built-in `get_version` and `get_huly_context` tools remain visible in every mode.

In `proxy` mode, the proxy meta-tools are always listed:

- `list_tool_categories` (browse categories/toolsets)
- `search_tools` (find tools by query)
- `get_tool_schema` (fetch exact schema for a selected tool)
- `invoke_tool` (proxy execution)

When `proxy` mode is combined with an active scope and `PROXY_OUTPUT_STRICT=false`, the scoped native Huly tools are also listed as first-class tools. This makes `TOOLSETS=issues TOOLS=fulltext_search` behave like "pin issue tools and fulltext_search natively, but keep the full Huly surface discoverable through proxy."

When `PROXY_OUTPUT_STRICT=true`, the proxy tools are the only model-facing tools in proxy mode, and the scoped set becomes the proxy allow-list.

### Session Tool State

In the recommended static proxy mode, there is no session tool state: `tools/list` stays small and stable, and `invoke_tool` dispatches to hidden registry entries after validating arguments with the target tool's existing schema.

In optional `tools/list_changed` mode, tools enabled by `search_tools` accumulate during a session — once enabled, a tool stays enabled for the rest of the connection. This avoids the LLM losing access to tools it already discovered, but it must only be used for clients proven to re-list and expose newly enabled tools to the model.

For HTTP transport, prefer the static proxy mode. Stateless or cache-oriented clients are a bad fit for connection-local tool state.

### LLM Interaction Flow

```
User: "Create an issue in HULY project for the login bug"

tools/list returns: get_version, get_huly_context, list_tool_categories, search_tools, get_tool_schema, invoke_tool
If `TOOLSETS` or `TOOLS` is set and `PROXY_OUTPUT_STRICT=false`, the scoped native tools are also listed.

Default static proxy flow:
  1. LLM calls search_tools({ query: "create issue" })
  2. Server returns create_issue + related matches with compact metadata
  3. LLM calls get_tool_schema({ toolName: "create_issue" })
  4. LLM calls invoke_tool({ toolName: "create_issue", arguments: { project: "HULY", title: "Login bug", ... } })

Optional dynamic flow:
  1. LLM calls search_tools({ query: "issue management" })
  2. Server enables all Issues category tools, sends list_changed
  3. Client re-fetches → 18 issue tools now available with full schemas
  4. LLM picks create_issue and calls it
```

### Token Budget Impact

| Mode | Initial Context | Per-Search Overhead |
|------|----------------|---------------------|
| Current (eager) | ~170K measured tokens | 0 |
| Approach D (lazy) | ~1-2K tokens | ~500-2K tokens (search result + newly enabled tool schemas) |
| Approach E (proxy) | ~500 tokens | ~200-500 tokens per `invoke_tool` call |

### `tools/list_changed` Integration (Optional)

```typescript
// In search_tools handler:
const matches = searchTools(query, domainTools)
for (const tool of matches) {
  enabledTools.add(tool.name)
}
server.sendToolListChanged()
return createSuccessResponse(matches.map(t => ({ name: t.name, description: t.description })))

// In ListToolsRequestSchema handler:
const visibleTools = allTools.filter(t =>
  alwaysAvailableTools.has(t.name) || enabledTools.has(t.name) || t.category === META_CATEGORY
)
```

The `Server` instance (low-level API currently used in `server.ts`) exposes `sendToolListChanged()` directly.

## Implementation Surface

| File | Change |
|------|--------|
| `src/mcp/tool-mode.ts` (new) | Typesafe client classification and `HULY_TOOL_MODE=auto/native/proxy` resolution from `clientInfo` |
| `src/mcp/tool-scope.ts` (new) | Parse `TOOLSETS` and `TOOLS`; resolve the union into scoped/native/proxy registries |
| `src/mcp/server.ts` | Build the shared tool scope once at startup; pass native/proxy registry views into protocol handlers; include scope data in telemetry/context |
| `src/mcp/huly-context-tool.ts` | Replace category-only `parseToolsets` summary with scope summary including requested/enabled/ignored toolsets and tools |
| `src/mcp/tools/index.ts` | Add registry builders that filter by category union and exact tool names, while preserving the full registry for proxy non-strict mode |
| `src/mcp/protocol-handlers.ts` | Use the native visible registry for direct `tools/list`/native `tools/call`; later, route proxy meta-tools through the proxy candidate registry |
| `src/mcp/tools/meta.ts` (new, proxy phase) | `list_tool_categories`, `search_tools`, `get_tool_schema`, and `invoke_tool` definitions plus search logic and category descriptions |
| `src/domain/schemas/meta.ts` (new, proxy phase) | Schemas for meta-tool inputs and outputs |

### Category Metadata

Each tool definition already carries a category. A mapping from category → description is needed for search scoring:

```typescript
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  issues: "Issue tracking: create, update, search, manage issues, components, labels, templates",
  documents: "Document management: teamspaces, create/read/update documents with markdown",
  channels: "Messaging: channels, direct messages, thread replies",
  // ...
}
```

## Open Questions

1. **All-invalid scope behavior.** Proposed behavior is strict: if `TOOLSETS` or `TOOLS` is set but every requested entry is unknown, the scoped native set is empty and the warning/context summary explains why.

2. **Search quality.** Simple keyword matching may miss semantic connections ("bug report" → `create_issue`). Should we embed synonyms/aliases per tool? Or is keyword matching on name + description sufficient?

3. **Client auto-detection map.** The initial map should be intentionally small and env-overridable. Unknown client names should probably default to `proxy`.

4. **Approach D.** Given client and cache behavior, should `tools/list_changed` be deferred entirely, or offered only behind an explicit experimental config?

5. **HTTP transport.** Stateless and cache-oriented clients are a bad fit for connection-local tool state. HTTP should use `clientInfo` from request `_meta` for `auto`, and should not rely on session-local `tools/list_changed`.

## References

- [MCP Specification: Tools (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — protocol spec for `tools/list`, pagination, `listChanged`
- [MCP Draft Tools Spec](https://modelcontextprotocol.io/specification/draft/server/tools) — draft language about deterministic tool lists and avoiding per-connection/request-side-effect variation
- [MCP Discussion #1567: Primitive Groups for Tools, Resources, Prompts](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1567) — emerging ToolGroup/toolset metadata discussion; useful for category/search metadata, not a finalized filtering protocol
- [FastMCP Tool Search Transform](https://gofastmcp.com/servers/transforms/tool-search) — server-side `search_tools` and `call_tool` transform with regex/BM25 search
- [Cloudflare Code Mode](https://developers.cloudflare.com/agents/model-context-protocol/protocol/codemode/) — single model-facing code tool with on-demand connector method discovery
- [Claude Code Issue #4118: tools/list_changed not working](https://github.com/anthropics/claude-code/issues/4118) — 58 upvotes, reports notification not processed mid-conversation
- [MCP Discussion #76: Dynamic tool registration](https://github.com/orgs/modelcontextprotocol/discussions/76) — Claude Desktop confirmed unsupported
- [Stainless MCP Dynamic Tools](https://www.stainless.com/changelog/mcp-dynamic-tools) — static 3-meta-tool proxy pattern
- [Claude Code / Agent SDK Tool Search](https://code.claude.com/docs/en/agent-sdk/tool-search) — client-side lazy loading
- [Claude API Tool Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) — API-level tool search
- [Anthropic: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) — tool search accuracy benchmarks (Opus 4.5 79.5%→88.1%), `defer_loading`
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — servers-as-code-APIs progressive disclosure, ~150K→2K tokens
- [MCP SEP #1888: `searchTools` meta-tool](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1888) — proposed standardization of progressive-disclosure discovery
- [GitHub MCP Server: tool-specific configuration](https://github.blog/changelog/2025-12-10-the-github-mcp-server-adds-support-for-tool-specific-configuration-and-more/) — `X-MCP-Tools` header / `--tools`, ~60–90% context reduction
- [Notion MCP deep dive (StackOne)](https://www.stackone.com/blog/notion-mcp-deep-dive/) — hosted server tool scoping + `search_tools`/`execute_tool`
- [FutureSearch MCP widgets article](https://futuresearch.ai/blog/mcp-results-widget/) — observed `clientInfo.name` values: `claude-code` vs `claude-ai`
- [Claude Code issue #27159](https://github.com/anthropics/claude-code/issues/27159) — observed `claude-ai` and `claude-ai (via mcp-remote ...)` initialize payloads
- [Cursor remote MCP forum thread](https://forum.cursor.com/t/remote-mcp-is-not-available-in-the-pro-plan/139053) — observed `cursor-vscode (via mcp-remote ...)` initialize payloads
- [Cursor MCP 40-tool limit (community forum)](https://forum.cursor.com/t/mcp-server-40-tool-limit-in-cursor-is-this-frustrating-your-workflow/81627) — client-side tool cap / silent truncation
- [Windsurf Cascade MCP docs](https://docs.windsurf.com/windsurf/cascade/mcp) — 100-tool cap
