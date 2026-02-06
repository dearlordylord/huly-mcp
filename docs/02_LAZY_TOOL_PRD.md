# PRD: Lazy Tool Loading via Meta-Tools

## Problem

This MCP server exposes 114 tools across 15 categories. When a client (Claude Desktop, Cursor, etc.) connects, it receives all 114 tool definitions — names, descriptions, and full JSON schemas — in a single `tools/list` response. Estimated payload: 100-150KB of JSON, translating to roughly 30-60K tokens of LLM context consumed before any conversation begins.

This matters because:
- LLMs have finite context windows (200K tokens for Claude). 30-60K tokens on tool definitions alone leaves less room for actual work.
- LLMs can miscount or lose track of tools when there are too many in context. (The motivating observation: Claude claimed 97 tools when there were 184.)
- Most sessions use a small fraction of available tools. A user asking about issues doesn't need calendar, notification settings, or workspace admin schemas loaded.

## Prior Art & Current Landscape

### Claude Code's MCP Tool Search (Jan 2026, v2.1.7+)

Claude Code already implements **client-side** lazy loading. When MCP tool descriptions exceed 10% of context (~10K tokens), Claude Code replaces the full tool definitions with a lightweight search index and a `MCPSearch` meta-tool. Tools load on demand. Internal benchmarks show 85% token reduction and accuracy improvements (Opus 4: 49% → 74% on MCP evals).

However, this is **Claude Code-specific**. Claude Desktop, Cursor, and other MCP clients don't have this. A server-side solution benefits all clients.

### Claude API Tool Search Tool

The Claude API offers a dedicated `tool_search` tool type for API users with 10+ tools or >10K tokens of definitions. Supports Sonnet 4.0+ and Opus 4.0+ only.

### MCP Protocol Support

The MCP spec (2025-06-18) supports relevant primitives:
- **`tools/list` pagination** via cursor-based pagination (`nextCursor` in response)
- **`listChanged` notifications** for dynamic tool registration
- **Tool annotations** for metadata (read-only, destructive, etc.)

None of these are currently used by this server.

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
| Cursor | Unknown | Unverified claims of support |
| Vercel AI SDK | **Not supported** | Docs confirm no notification support |

## Existing Infrastructure

The codebase is well-positioned for this change:

- **Every tool already has a `category` field** — `ToolDefinition` includes `readonly category: string`, and each tool file defines `const CATEGORY = "Issues" as const` (etc.). 15 categories exist: Activity, Attachments, Calendar, Channels, Comments, Contacts, Documents, Issues, Milestones, Notifications, Projects, Search, Storage, Time Tracking, Workspace.
- **Tool registry** (`src/mcp/tools/index.ts`) aggregates all tools into a `Map<string, RegisteredTool>` with a `handleToolCall` dispatcher.
- **JSON schemas** are pre-generated at import time via `makeJsonSchema()` from Effect Schema.
- **`tools/list` handler** (`src/mcp/server.ts:72-82`) maps over `toolRegistry.definitions` to produce the response.

## Approaches Evaluated

### ~~Approach A: All Tools Listed, Schemas Stripped~~ (REJECTED)

`tools/list` returns all 114 tools with `inputSchema: { type: "object" }` (no property definitions) plus 3 meta-tools for schema discovery.

**Why rejected:** Does not solve the core problem. The LLM still sees 117 tool entries in context — it saves schema payload tokens but the tool count (what causes LLMs to miscount/lose track) is unchanged. An LLM seeing `create_issue` with `inputSchema: { type: "object" }` will likely just call it directly without fetching the schema, since the server validates via Effect Schema anyway. The meta-tools become unused overhead.

### ~~Approach B: Only Meta-Tools Listed, Real Tools Hidden~~ (REJECTED as primary)

`tools/list` returns only 3 meta-tools. Real tools unlisted but callable.

**Why rejected as primary:** Some MCP clients reject calls to tools not in `tools/list`. Protocol compliance varies. However, elements of this approach survive in Approach D.

### ~~Approach C: Hybrid — Core Tools + Meta-Tools~~ (REJECTED)

Curated set of ~20-30 "core" tools plus meta-tools.

**Why rejected:** Maintenance burden of curating "core" list. Inconsistent UX.

### Approach D: Dynamic Tool Loading via `tools/list_changed` (RECOMMENDED)

The MCP-native pattern for tool filtering:

1. Server starts with a small set of always-available tools + 1 `search_tools` meta-tool
2. LLM calls `search_tools` with a query describing what it needs
3. Server enables matching tools (adds them to what `tools/list` returns)
4. Server sends `tools/list_changed` notification
5. Client calls `tools/list` to get updated tool list
6. LLM can now call the newly available tools

**Tradeoffs:**
- (+) Minimal initial context — only a few tools + search
- (+) Uses MCP-native primitives, not custom workarounds
- (+) Tools appear as first-class MCP tools once enabled (full client compatibility)
- (+) SDK already supports everything needed
- (-) Client must support `tools/list_changed` (Claude Desktop doesn't, Claude Code disputed)
- (-) Extra round-trip: search → notification → list → call (vs direct call)

### Fallback: Static Meta-Tool Proxy (for incompatible clients)

For clients that don't support `tools/list_changed`, a static 3-tool approach (like [Stainless dynamic tools](https://www.stainless.com/changelog/mcp-dynamic-tools)):
- `list_tool_categories` — browse categories
- `search_tools` — find tools by query
- `invoke_tool` — proxy: takes `toolName` + `args`, dispatches to real handler

This works with every client but loses native tool call UX (all calls go through `invoke_tool`).

## Design: Approach D

### Search Organization

The `search_tools` tool performs keyword matching against tool names, descriptions, and categories:

```
Input:  { query: "create an issue" }
Output: [
  { name: "create_issue", description: "...", category: "Issues" },
  { name: "create_issue_from_template", description: "...", category: "Issues" },
  ...
]
Side effect: matched tools enabled in tools/list, notification sent
```

Search strategy (simple, no vector DB needed):
- Tokenize query into keywords
- Score each tool: exact name match > keyword in name > keyword in description > category match
- Enable top N matches (e.g., top 20)
- Return matched tools with names + descriptions (no schemas — those come via `tools/list`)

### Always-Available Tools

A small set of high-frequency tools always listed in `tools/list`:
- `search_tools` (the meta-tool)
- `list_projects` (nearly every session needs this)
- `fulltext_search` (general-purpose discovery)

Possibly also: `list_issues`, `create_issue`, `get_issue` (the most common operations).

The exact set should be determined by usage data. Configurable via env var:
```
ALWAYS_AVAILABLE_TOOLS=list_projects,fulltext_search,list_issues,create_issue,get_issue
```

### Session Tool State

Tools enabled by `search_tools` accumulate during a session — once enabled, a tool stays enabled for the rest of the connection. This avoids the LLM losing access to tools it already discovered.

For HTTP transport (stateless, new server per request), all tools are always available (lazy loading doesn't apply since there's no persistent session).

### LLM Interaction Flow

```
User: "Create an issue in HULY project for the login bug"

tools/list returns: search_tools, list_projects, fulltext_search
LLM sees 3 tools.

Option A (tool name already known):
  1. LLM calls search_tools({ query: "create issue" })
  2. Server enables create_issue + related tools, sends list_changed
  3. Client re-fetches tools/list → now includes create_issue with full schema
  4. LLM calls create_issue({ project: "HULY", title: "Login bug", ... })

Option B (exploring):
  1. LLM calls search_tools({ query: "issue management" })
  2. Server enables all Issues category tools, sends list_changed
  3. Client re-fetches → 18 issue tools now available with full schemas
  4. LLM picks create_issue and calls it
```

### Token Budget Impact

| Mode | Initial Context | Per-Search Overhead |
|------|----------------|---------------------|
| Current (eager) | ~30-60K tokens | 0 |
| Approach D (lazy) | ~1-2K tokens | ~500-2K tokens (search result + newly enabled tool schemas) |
| Static proxy fallback | ~500 tokens | ~200-500 tokens per invoke_tool call |

### `tools/list_changed` Integration

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
| `src/mcp/server.ts` | Modified `ListToolsRequestSchema` to filter by enabled tools; `search_tools` handler; `tools/list_changed` notification; session state for enabled tools |
| `src/mcp/tools/meta.ts` (new) | `search_tools` definition, search logic, category descriptions |
| `src/domain/schemas/meta.ts` (new) | Schema for search_tools parameters |
| `src/mcp/tools/index.ts` | Export meta-tools, expose tool search index |

### Category Metadata

Each of the 15 tool files defines `const CATEGORY = "..." as const`. A mapping from category → description is needed for search scoring:

```typescript
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Issues": "Issue tracking: create, update, search, manage issues, components, labels, templates",
  "Documents": "Document management: teamspaces, create/read/update documents with markdown",
  "Channels": "Messaging: channels, direct messages, thread replies",
  // ...
}
```

## Open Questions

1. **Which tools are "always available"?** Need usage data or a reasonable starting set. Configurable via env var mitigates the decision.

2. **Search quality.** Simple keyword matching may miss semantic connections ("bug report" → `create_issue`). Should we embed synonyms/aliases per tool? Or is keyword matching on name + description sufficient?

3. **Client compatibility strategy.** Given that Claude Desktop doesn't support `tools/list_changed` and Claude Code's support is disputed, should we:
   - Default to eager mode and only enable lazy for confirmed-compatible clients?
   - Auto-detect client capabilities from the `initialize` handshake?
   - Provide the static proxy fallback (`invoke_tool`) alongside?

4. **Tool accumulation limit.** If `search_tools` is called many times, enabled tools grow unbounded. Should there be a cap or LRU eviction?

5. **HTTP transport.** Stateless HTTP transport creates a new server per request — lazy loading is meaningless. Should HTTP always use eager mode?

## References

- [MCP Specification: Tools (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) — protocol spec for `tools/list`, pagination, `listChanged`
- [Claude Code Issue #4118: tools/list_changed not working](https://github.com/anthropics/claude-code/issues/4118) — 58 upvotes, reports notification not processed mid-conversation
- [MCP Discussion #76: Dynamic tool registration](https://github.com/orgs/modelcontextprotocol/discussions/76) — Claude Desktop confirmed unsupported
- [Stainless MCP Dynamic Tools](https://www.stainless.com/changelog/mcp-dynamic-tools) — static 3-meta-tool proxy pattern
- [Claude Code MCP Tool Search](https://claudefa.st/blog/tools/mcp-extensions/mcp-tool-search) — client-side lazy loading
- [Claude API Tool Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) — API-level tool search
