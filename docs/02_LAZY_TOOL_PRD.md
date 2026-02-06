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

### MCP Protocol Support

The MCP spec (2025-06-18) already supports relevant primitives:
- **`tools/list` pagination** via cursor-based pagination (`nextCursor` in response)
- **`listChanged` notifications** for dynamic tool registration
- **Tool annotations** for metadata (read-only, destructive, etc.)

None of these are currently used by this server (SDK version `^1.0.4`).

## Existing Infrastructure

The codebase is well-positioned for this change:

- **Every tool already has a `category` field** — `ToolDefinition` includes `readonly category: string`, and each tool file defines `const CATEGORY = "Issues" as const` (etc.). 15 categories exist: Activity, Attachments, Calendar, Channels, Comments, Contacts, Documents, Issues, Milestones, Notifications, Projects, Search, Storage, Time Tracking, Workspace.
- **Tool registry** (`src/mcp/tools/index.ts`) aggregates all tools into a `Map<string, RegisteredTool>` with a `handleToolCall` dispatcher.
- **JSON schemas** are pre-generated at import time via `makeJsonSchema()` from Effect Schema.
- **`tools/list` handler** (`src/mcp/server.ts:72-82`) maps over `toolRegistry.definitions` to produce the response.

## Design

### Concept: Three Meta-Tools

Replace the 114-tool listing with 3 meta-tools that let the LLM discover and use tools on demand:

| Meta-Tool | Purpose | Output |
|-----------|---------|--------|
| `list_tool_categories` | Discovery — what's available? | Category names, descriptions, tool counts |
| `get_category_tools` | Browse — what tools are in a category? | Tool names + one-line descriptions (no schemas) |
| `get_tool_schema` | Prepare — how do I call this tool? | Full JSON schema for a single tool |

The actual tool invocation remains unchanged — the LLM calls the real tool name (e.g., `create_issue`) with arguments. The meta-tools are purely for discovery.

### The Key Question: How Are Real Tools Exposed?

There are two sub-approaches with different tradeoffs.

#### Approach A: All Tools Listed, Schemas Stripped

`tools/list` returns all 114 tools, but with `inputSchema: { type: "object" }` (permissive, no property definitions). Plus the 3 meta-tools. The LLM sees all tool names and descriptions upfront but calls `get_tool_schema` before using any tool.

**Tradeoffs:**
- (+) Tool names visible immediately — LLM knows `create_issue` exists without searching
- (+) No proxy needed — tools are callable directly via MCP protocol
- (+) Descriptions still aid tool selection
- (-) 114 tool entries still in context (~2-5K tokens for names + descriptions alone)
- (-) Client may validate args against the permissive schema, potentially allowing malformed calls without server-side schema enforcement (though the server already validates via Effect Schema)

#### Approach B: Only Meta-Tools Listed, Real Tools Hidden

`tools/list` returns only the 3 meta-tools. Real tools are not listed but remain callable — the `CallToolRequestSchema` handler still dispatches to them. The LLM discovers tools through meta-tools and calls them by name.

**Tradeoffs:**
- (+) Minimal initial context — 3 tools instead of 117
- (+) Maximum token savings
- (-) LLM must always start with `list_tool_categories` → `get_category_tools` → `get_tool_schema` before any tool call — 3 round-trips minimum
- (-) Some MCP clients may reject calls to tools not in the `tools/list` response (protocol compliance varies)
- (-) Tool name validation via `ToolNameSchema` (currently derived from `TOOL_DEFINITIONS` keys) would need adjustment

#### Approach C: Hybrid — Core Tools + Meta-Tools

`tools/list` returns a curated set of ~20-30 "core" tools with full schemas, plus the 3 meta-tools. Remaining tools are discoverable via meta-tools only.

**Tradeoffs:**
- (+) Common operations (list/create/update issues, search, list projects) work immediately
- (+) Long-tail tools (notification settings, workspace admin, recurring events) don't waste context
- (-) Requires maintaining a "core" list — subjective, may become stale
- (-) Inconsistent UX: some tools are immediate, some require discovery

### Recommended: Configurable Mode

An environment variable controls behavior, letting users choose based on their client:

```
TOOL_LOADING=eager   # Current behavior: all 114 tools with full schemas (default)
TOOL_LOADING=lazy    # Only meta-tools + stripped tool listings (Approach A or B)
```

This avoids breaking existing users while letting context-constrained setups opt in.

### Meta-Tool Specifications

#### `list_tool_categories`

No parameters. Returns:

```json
[
  { "category": "Issues", "toolCount": 18, "description": "Issue tracking: create, update, search, and manage issues, components, labels, and templates" },
  { "category": "Documents", "toolCount": 6, "description": "Document management: teamspaces, create/read/update documents with markdown" },
  ...
]
```

Category descriptions don't exist today — they'd be new metadata, one per category.

#### `get_category_tools`

Parameter: `category` (string). Returns:

```json
[
  { "name": "list_issues", "description": "Query Huly issues with optional filters..." },
  { "name": "get_issue", "description": "Retrieve full details for a Huly issue..." },
  ...
]
```

This is the existing `name` + `description` fields, just filtered by category.

#### `get_tool_schema`

Parameter: `toolName` (string). Returns the full `inputSchema` JSON object for that tool, exactly as currently returned in `tools/list`.

### LLM Interaction Flow

```
User: "Create an issue in HULY project for the login bug"

LLM thinks: I need issue creation tools.
  1. calls get_tool_schema("create_issue")     ← if name is already known
     OR
  1. calls list_tool_categories()               ← if exploring
  2. calls get_category_tools("Issues")
  3. calls get_tool_schema("create_issue")

LLM now has the full create_issue schema.
  4. calls create_issue({ project: "HULY", title: "Login bug", ... })
```

In practice, LLMs often know common tool names from descriptions alone, so the 3-step discovery flow is mainly for less obvious tools.

### Token Budget Impact (Estimates)

| Mode | Initial Context | Per-Tool-Use Overhead |
|------|----------------|----------------------|
| Current (eager) | ~30-60K tokens | 0 |
| Lazy (approach A) | ~5-8K tokens | ~200-500 tokens (schema fetch) |
| Lazy (approach B) | ~500 tokens | ~200-500 tokens (schema fetch + discovery) |

## Implementation Surface

Files that would change:

| File | Change |
|------|--------|
| `src/mcp/tools/registry.ts` | Add meta-tool type or integrate meta-tools as regular `RegisteredTool`s |
| `src/mcp/tools/index.ts` | New meta-tool definitions; modified `toolRegistry` to support category queries |
| `src/mcp/server.ts` | Modified `ListToolsRequestSchema` handler to respect `TOOL_LOADING` env var; `ToolNameSchema` adjustment if hiding tools |
| `src/mcp/tools/meta.ts` (new) | Meta-tool definitions and handlers |
| `src/domain/schemas/meta.ts` (new) | Schemas for meta-tool parameters |

The meta-tool handlers don't need `HulyClient` — they only read from the in-memory tool registry. A new handler factory or direct implementation would work.

### Category Metadata

Each of the 15 tool files currently defines `const CATEGORY = "..." as const`. A new mapping from category → description is needed:

```typescript
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Issues": "Issue tracking: create, update, search, manage issues, components, labels, templates",
  "Documents": "Document management: teamspaces, create/read/update documents with markdown",
  "Channels": "Messaging: channels, direct messages, thread replies",
  // ...
}
```

This could live in the meta-tools file or in a shared location.

## Open Questions

1. **Approach A vs B vs C?** Approach A (all tools listed, schemas stripped) is the safest and most compatible. Approach B (meta-tools only) gives maximum savings but may break clients that validate tool names against `tools/list`. Approach C adds maintenance burden.

2. **Should `get_tool_schema` return just the inputSchema, or the full tool definition (name + description + schema)?** Returning the full definition makes it self-contained; just the schema is more minimal.

3. **Caching hint?** Should `get_tool_schema` responses include a note like "cache this for the session" in the response text? LLMs generally keep tool call results in context, but an explicit hint could help.

4. **Should meta-tools be available in eager mode too?** Having `list_tool_categories` available even in eager mode could help LLMs navigate the 114 tools. Low cost, potentially useful.

5. **MCP SDK upgrade?** The current SDK (`^1.0.4`) may not support `tools/list` pagination or `listChanged`. Worth checking if upgrading would enable protocol-native lazy loading as a complementary mechanism.

6. **What about Claude Code's `server instructions`?** With MCP Tool Search, the server instructions field is critical for Claude Code to know when to search for tools. Should we add a recommended `serverInstructions` value to the README/docs? (This is orthogonal to server-side lazy loading but relevant for Claude Code users.)

## References

- [MCP Specification: Tools (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) — protocol spec for `tools/list`, pagination, `listChanged`
- [Claude Code Issue #11364: Lazy-load MCP tool definitions](https://github.com/anthropics/claude-code/issues/11364) — the original feature request that led to MCP Tool Search
- [Claude Code MCP Tool Search overview](https://claudefa.st/blog/tools/mcp-extensions/mcp-tool-search) — how Claude Code's client-side lazy loading works
- [VentureBeat: Claude Code MCP Tool Search launch](https://venturebeat.com/orchestration/claude-code-just-got-updated-with-one-of-the-most-requested-user-features) — coverage of the Jan 2026 release
