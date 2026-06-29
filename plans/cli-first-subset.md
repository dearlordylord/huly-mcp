# Huly CLI First Subset Plan

## Worktree

- Worktree: `/workspace/typescript/hulymcp/.worktrees/cli-first-subset`
- Branch: `codex/cli-first-subset`
- Base: current `HEAD` of `codex/tool-scope-filtering`
- Local resources bootstrapped: `node_modules`, `.reference`, `.env.local`, `CLAUDE.local.md`

## Product Decision

Build the CLI as a second frontend over the same schema-owned application operations used by MCP. The CLI must not call the MCP server, JSON-RPC, or `tools/call`.

The CLI should be a separately publishable package in this repository, not a second binary added to `@firfi/huly-mcp`.

Recommended package shape:

```text
packages/huly-cli/
  package.json
  src/
    index.ts
    catalog.ts
    runner.ts
    render.ts
    commands/
      issues.ts
      documents.ts
      comments.ts
      attachments.ts
      projects.ts
      search.ts
```

Initial package name candidate: `@firfi/huly-cli`. Final npm name availability should be checked before release.

The CLI package can bundle shared source from the repository at build time. That keeps the first release small and avoids a large immediate extraction to a third `core` package. If reuse pressure grows, extract shared schemas, operations, config, and client layers into a later `@firfi/huly-core` package.

## First Command Subset

The CLI UX should use noun/verb command names while each command records the MCP tool it corresponds to. This keeps terminal UX natural without losing catalog parity.

### Issues

| CLI command | MCP tool |
| --- | --- |
| `huly issues list` | `list_issues` |
| `huly issues get` | `get_issue` |
| `huly issues create` | `create_issue` |
| `huly issues update` | `update_issue` |
| `huly issues labels add` | `add_issue_label` |
| `huly issues labels remove` | `remove_issue_label` |
| `huly issues milestone set` | `set_issue_milestone` |
| `huly issues component set` | `set_issue_component` |
| `huly issues relations add` | `add_issue_relation` |
| `huly issues relations remove` | `remove_issue_relation` |
| `huly issues relations list` | `list_issue_relations` |
| `huly issues move` | `move_issue` |

### Discovery For Issue Writes

| CLI command | MCP tool |
| --- | --- |
| `huly projects list` | `list_projects` |
| `huly projects get` | `get_project` |
| `huly projects statuses` | `list_statuses` |
| `huly labels list` | `list_labels` |
| `huly milestones list` | `list_milestones` |
| `huly milestones get` | `get_milestone` |
| `huly components list` | `list_components` |
| `huly components get` | `get_component` |

### Comments

| CLI command | MCP tool |
| --- | --- |
| `huly comments list` | `list_comments` |
| `huly comments add` | `add_comment` |
| `huly comments update` | `update_comment` |
| `huly comments delete` | `delete_comment` |

### Attachments

| CLI command | MCP tool |
| --- | --- |
| `huly attachments list` | `list_attachments` |
| `huly attachments get` | `get_attachment` |
| `huly attachments download` | `download_attachment` |
| `huly attachments add-to-issue` | `add_issue_attachment` |
| `huly attachments add-to-document` | `add_document_attachment` |

`huly attachments download` should call the shared `download_attachment` operation to resolve metadata and URL. It should print the URL by default and support `--output <path>` to fetch bytes to disk as CLI-only presentation behavior.

### Documents

| CLI command | MCP tool |
| --- | --- |
| `huly documents list` | `list_documents` |
| `huly documents get` | `get_document` |
| `huly documents create` | `create_document` |
| `huly documents edit` | `edit_document` |
| `huly documents comments` | `list_inline_comments` |
| `huly teamspaces list` | `list_teamspaces` |
| `huly teamspaces get` | `get_teamspace` |
| `huly issues documents link` | `link_document_to_issue` |
| `huly issues documents unlink` | `unlink_document_from_issue` |

### Search

| CLI command | MCP tool |
| --- | --- |
| `huly search` | `fulltext_search` |

## Catalog Sync Contract

The catalog sync must be compile-time enforced. Runtime tests may be added for nicer diagnostics, but they are not the source of truth.

### Step 1: Preserve MCP Tool Name Literal Types

Refactor the MCP registry types so `defineTool` preserves the literal `name` field:

```ts
export interface ToolDefinition<Name extends string = string> {
  readonly name: Name
  ...
}

export interface RegisteredTool<Name extends string = string> extends ToolDefinition<Name> {
  ...
}

interface ToolSpec<Name extends string, S extends ResultSchema> {
  readonly name: Name
  ...
}

export const defineTool = <const Name extends string, P, S extends ResultSchema>(
  spec: ToolSpec<Name, S>,
  ...
): RegisteredTool<Name> => ...
```

Then update tool arrays from `ReadonlyArray<RegisteredTool>` annotations to literal-preserving arrays:

```ts
export const projectTools = [
  defineTool({ name: "list_projects", ... }, ...),
  ...
] as const satisfies ReadonlyArray<RegisteredTool>
```

Do this for every MCP tool group so the central registry can expose:

```ts
export const allTools = [
  ...projectTools,
  ...
] as const satisfies ReadonlyArray<RegisteredTool>

export type McpToolName = typeof allTools[number]["name"]
```

### Step 2: CLI Catalog With Explicit Ignored List

In `packages/huly-cli/src/catalog.ts`:

```ts
import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const cliCommands = {
  list_issues: defineCliCommand(...),
  get_issue: defineCliCommand(...),
  ...
} satisfies Partial<Record<McpToolName, CliCommand>>

export const ignoredMcpTools = [
  "delete_issue",
  "create_label",
  ...
] as const satisfies ReadonlyArray<McpToolName>
```

The ignored list starts as every MCP tool not implemented by the first CLI subset. When adding a CLI command later, remove that tool name from `ignoredMcpTools`.

### Step 3: Type-Level Exhaustiveness Checks

Add type assertions that fail `tsc` when:

- MCP adds a tool that is neither implemented nor ignored.
- CLI references a tool that does not exist in MCP.
- The ignored list contains a stale tool name.
- A tool exists in both CLI commands and ignored list.

Sketch:

```ts
type CliToolName = keyof typeof cliCommands
type IgnoredMcpToolName = typeof ignoredMcpTools[number]

type MissingFromCliCatalog = Exclude<McpToolName, CliToolName | IgnoredMcpToolName>
type UnknownCliTool = Exclude<CliToolName, McpToolName>
type UnknownIgnoredTool = Exclude<IgnoredMcpToolName, McpToolName>
type ImplementedAndIgnored = Extract<CliToolName, IgnoredMcpToolName>

type IsNever<T> = [T] extends [never] ? true : false
type Assert<T extends true> = T

type _NoMissingFromCliCatalog = Assert<IsNever<MissingFromCliCatalog>>
type _NoUnknownCliTool = Assert<IsNever<UnknownCliTool>>
type _NoUnknownIgnoredTool = Assert<IsNever<UnknownIgnoredTool>>
type _NoImplementedAndIgnored = Assert<IsNever<ImplementedAndIgnored>>
```

This makes sync a typecheck gate rather than a convention.

## Implementation Phases

### Phase 1: Workspace And Package Skeleton

- Add `pnpm-workspace.yaml` for root plus `packages/*`.
- Add `packages/huly-cli/package.json` with a separate publish target.
- Add CLI build script using esbuild into `packages/huly-cli/dist/index.cjs`.
- Keep CLI package publish files limited to `dist/index.cjs`, README, license, and package metadata.
- Add root scripts so `pnpm check-all` includes the CLI package.

### Phase 2: MCP Catalog Type Spine

- Genericize `ToolDefinition`, `RegisteredTool`, and `ToolSpec` by tool name.
- Convert MCP tool group arrays to literal-preserving definitions.
- Export `McpToolName`.
- Add catalog type assertions with a temporary ignored list containing all MCP tools.

### Phase 3: CLI Runtime Foundation

- Use Effect-aware CLI construction. Before writing this code, consult `effect-solutions show cli services-and-layers config error-handling`.
- Reuse existing config parsing and Huly client layers.
- Create a shared CLI runner that:
  - parses flags and arguments,
  - calls schema parsers and shared operations directly,
  - provides `HulyClient`, `HulyStorageClient`, `WorkspaceClient` where needed,
  - maps typed domain errors to terminal messages and exit codes,
  - supports `--json` on every command.
- Default output should be concise human text or tables. JSON output should encode the same schema-owned result shape returned by the operation.

### Phase 4: Read-Only Commands First

Implement and test:

- `list_projects`, `get_project`, `list_statuses`
- `list_issues`, `get_issue`
- `list_comments`
- `list_attachments`, `get_attachment`, `download_attachment`
- `list_documents`, `get_document`
- `list_teamspaces`, `get_teamspace`
- `fulltext_search`
- `list_labels`, `list_milestones`, `get_milestone`, `list_components`, `get_component`
- `list_issue_relations`, `list_inline_comments`

This proves config, services, rendering, and catalog sync before writes.

### Phase 5: Write Commands

Implement:

- `create_issue`, `update_issue`, `move_issue`
- `add_issue_label`, `remove_issue_label`
- `set_issue_milestone`, `set_issue_component`
- `add_issue_relation`, `remove_issue_relation`
- `add_comment`, `update_comment`, `delete_comment`
- `add_issue_attachment`, `add_document_attachment`
- `create_document`, `edit_document`
- `link_document_to_issue`, `unlink_document_from_issue`

For destructive commands such as `delete_comment`, require `--yes` unless stdin is non-interactive and `--json` is used with explicit arguments.

### Phase 6: Documentation And Release

- Add `packages/huly-cli/README.md` with installation, config env vars, and command examples.
- Add package-level changeset for the new package.
- Add release script support after the package name is finalized.

## Verification

Required before merge:

```bash
pnpm check-all
```

Required for this feature because it adds a new frontend:

```bash
pnpm build
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh
```

Add CLI integration coverage against local Huly for:

- config/auth smoke test via `huly projects list --json`,
- issue create/get/update/list,
- comment add/list,
- document create/get/edit/list,
- attachment metadata/download URL,
- fulltext search smoke,
- catalog sync typecheck.

## Open Decisions

- Final package name: `@firfi/huly-cli` is the safe working name; npm availability must be checked before publish.
- CLI parser library: prefer Effect CLI if it fits the repo and current Effect version after consulting the guide.
- Attachment download behavior: plan supports both URL output and `--output` file download; implementation must avoid logging credentials or signed URLs beyond the requested command output.
- Core package extraction: defer until the CLI has enough surface area to justify a separate shared package.
