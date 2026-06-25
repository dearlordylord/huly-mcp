# Huly MCP

[![npm](https://img.shields.io/npm/v/@firfi/huly-mcp)](https://www.npmjs.com/package/@firfi/huly-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@firfi/huly-mcp)](https://www.npmjs.com/package/@firfi/huly-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Glama score](https://glama.ai/mcp/servers/@dearlordylord/huly-mcp/badges/score.svg)](https://glama.ai/mcp/servers/@dearlordylord/huly-mcp)
[![MCP Server](https://badge.mcpx.dev?type=server&features=tools)](https://github.com/dearlordylord/huly-mcp)[![cooked at Monadical](https://img.shields.io/endpoint?url=https://monadical.com/static/api/cooked-at-monadical.json)](https://monadical.com)

**Huly MCP** is a feature-complete MCP server for [Huly](https://huly.io/) integration. Published on npm as [`@firfi/huly-mcp`](https://www.npmjs.com/package/@firfi/huly-mcp).

## Installation

The standard configuration works with most MCP clients:

```json
{
  "mcpServers": {
    "huly": {
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "env": {
        "HULY_URL": "https://huly.app",
        "HULY_EMAIL": "your@email.com",
        "HULY_PASSWORD": "yourpassword",
        "HULY_WORKSPACE": "yourworkspace"
      }
    }
  }
}
```

## Tool Exposure Defaults

By default (`HULY_TOOL_MODE=auto`), Huly MCP optimizes for current MCP clients by avoiding a 470-tool eager list. Exact `claude-code` sessions receive native Huly tools. Codex, Cursor, Windsurf, Copilot, OpenCode, Claude AI/Desktop-style clients, and unknown clients receive a small proxy surface: `list_tool_categories`, `search_tools`, `get_tool_schema`, and `invoke_tool`.

Exact native tool names still dispatch when a client calls them directly, but many clients only call tools returned by `tools/list`. Set `HULY_TOOL_MODE=native` to make every Huly tool appear first-class, or use `TOOLSETS` / `TOOLS` to pin frequently used native tools while keeping proxy discovery available.

<details>
<summary>Codex</summary>

Use Codex's MCP manager:

```bash
codex mcp add huly \
  --env HULY_URL=https://huly.app \
  --env HULY_EMAIL=your@email.com \
  --env HULY_PASSWORD=yourpassword \
  --env HULY_WORKSPACE=yourworkspace \
  -- npx -y @firfi/huly-mcp@latest
```

Or add it directly to `~/.codex/config.toml`:

```toml
[mcp_servers.huly]
command = "npx"
args = ["-y", "@firfi/huly-mcp@latest"]

[mcp_servers.huly.env]
HULY_URL = "https://huly.app"
HULY_EMAIL = "your@email.com"
HULY_PASSWORD = "yourpassword"
HULY_WORKSPACE = "yourworkspace"
```

</details>

<details>
<summary>Claude Code</summary>

```bash
claude mcp add huly \
  -e HULY_URL=https://huly.app \
  -e HULY_EMAIL=your@email.com \
  -e HULY_PASSWORD=yourpassword \
  -e HULY_WORKSPACE=yourworkspace \
  -- npx -y @firfi/huly-mcp@latest
```

Or add to `~/.claude.json` using the standard config above.

</details>

<details>
<summary>Claude Desktop</summary>

Add the standard config to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

</details>

<details>
<summary>VS Code</summary>

Add with Command Palette → "MCP: Add Server", or put this in a VS Code MCP config such as `.vscode/mcp.json`. Do not commit workspace config files that contain real credentials.

```json
{
  "servers": {
    "huly": {
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "env": {
        "HULY_URL": "https://huly.app",
        "HULY_EMAIL": "your@email.com",
        "HULY_PASSWORD": "yourpassword",
        "HULY_WORKSPACE": "yourworkspace"
      }
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Add the standard config to `~/.cursor/mcp.json`, or via Settings → Tools & Integrations → New MCP Server.

</details>

<details>
<summary>Windsurf</summary>

Add the standard config to your Windsurf MCP configuration file.

</details>

<details>
<summary>OpenCode</summary>

Open the global configuration file (`~/.config/opencode/opencode.json`) and merge this entry into your config:

```json
{
  "mcp": {
    "huly": {
      "type": "local",
      "command": ["npx", "-y", "@firfi/huly-mcp@latest"],
      "environment": {
        "HULY_URL": "https://huly.app",
        "HULY_EMAIL": "your@email.com",
        "HULY_PASSWORD": "yourpassword",
        "HULY_WORKSPACE": "yourworkspace"
      }
    }
  }
}
```

</details>

## Updating

The `@latest` tag asks the package runner for the newest version. Some MCP clients keep server processes or resolved installs alive, so restart or re-add the server when updating:

| Client | How to update |
|--------|--------------|
| **Codex** | `codex mcp remove huly` then re-add with the install command above. If your password has shell-sensitive characters, edit `~/.codex/config.toml` directly instead |
| **Claude Code** | `claude mcp remove huly` then re-add with the install command above |
| **Claude Desktop** | Restart the app (it runs `npx` on startup) |
| **VS Code / Cursor** | Restart the MCP server from the command palette/configured client or reload the window |
| **OpenCode** | Restart OpenCode or start a new session after config changes |
| **npx (manual)** | `npx -y @firfi/huly-mcp@latest` — the `-y` flag auto-confirms install prompts |

## HTTP Transport

By default, the server uses stdio transport. For HTTP transport (Streamable HTTP):

```bash
HULY_URL=https://huly.app \
HULY_EMAIL=your@email.com \
HULY_PASSWORD=yourpassword \
HULY_WORKSPACE=yourworkspace \
MCP_TRANSPORT=http \
npx -y @firfi/huly-mcp@latest
```

Server listens on `http://127.0.0.1:3000/mcp` by default.

Configure with `MCP_HTTP_PORT` and `MCP_HTTP_HOST`:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=8080 MCP_HTTP_HOST=0.0.0.0 npx -y @firfi/huly-mcp@latest
```

### HTTP MCP Protocol Support

The HTTP server supports both the existing SDK initialize-compatible Streamable HTTP flow and the 2026 stateless HTTP flow at the same `/mcp` endpoint. Dispatch is per request:

- Requests with `MCP-Protocol-Version: 2026-07-28`, matching `_meta.io.modelcontextprotocol/protocolVersion`, or `server/discover` use the 2026 stateless dispatcher.
- Requests without 2026 protocol signals continue through the SDK transport for compatibility with existing clients.

The 2026 path requires one JSON-RPC message per POST, `Accept: application/json, text/event-stream`, `Mcp-Method`, method-specific `Mcp-Name`, and per-request `_meta.io.modelcontextprotocol/*` client metadata. Huly credentials are still configured separately through env vars or supported `x-huly-*` headers.

For hosted or tunneled HTTP deployments, you can require an MCP endpoint bearer token:

```bash
MCP_TRANSPORT=http \
MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
npx -y @firfi/huly-mcp@latest
```

HTTP clients must then send:

```http
Authorization: Bearer <MCP_AUTH_TOKEN>
```

`MCP_AUTH_TOKEN` protects only the MCP HTTP `/mcp` endpoint. It is unrelated to `HULY_TOKEN`, does not authenticate to Huly, and does not replace `HULY_EMAIL` / `HULY_PASSWORD` / `HULY_TOKEN`. Huly credentials are still required through process env vars or, for hosted URL deployments, the supported `x-huly-*` headers. Stdio deployments do not use `MCP_AUTH_TOKEN`.

### Hosted HTTP Header Configuration

For hosted URL deployments, keep the server process configured with `MCP_TRANSPORT=http`. A hosting layer can forward per-session Huly credentials as request headers, so one hosted server can serve different Huly workspaces without process-wide `HULY_*` env vars.

Supported v1 headers:

| Header | Required | Description |
|--------|----------|-------------|
| `x-huly-url` | Yes | Huly instance URL |
| `x-huly-workspace` | Yes | Workspace identifier |
| `x-huly-token` | Yes | Huly API token |
| `x-huly-connection-timeout` | No | Connection timeout in ms |

If any `x-huly-*` header is present, all required headers must be present. Missing values are not filled from environment variables. Email/password auth is not supported in hosted header configuration v1.

For a Smithery publish schema example, see [docs/SMITHERY_URL_PUBLISH.md](docs/SMITHERY_URL_PUBLISH.md).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HULY_URL` | Yes | Huly instance URL |
| `HULY_EMAIL` | Auth* | Account email |
| `HULY_PASSWORD` | Auth* | Account password |
| `HULY_TOKEN` | Auth* | API token (alternative to email/password) |
| `HULY_WORKSPACE` | Yes | Workspace identifier |
| `HULY_CONNECTION_TIMEOUT` | No | Connection timeout in ms. Omit to use the package default. |
| `MCP_TRANSPORT` | No | Transport type: `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | No | HTTP server port (falls back to `PORT`, then 3000) |
| `MCP_HTTP_HOST` | No | HTTP server host. Omit to bind to the package default loopback host. |
| `MCP_AUTH_TOKEN` | No | Optional bearer token required by HTTP clients for `/mcp`. This protects the MCP endpoint only; it is not a Huly API token. |
| `HULY_TOOL_MODE` | No | Tool exposure mode: `auto` (default), `native`, or `proxy`. `auto` keeps exact `claude-code` native and resolves Codex, Cursor, Windsurf, Copilot, opencode, Claude AI, and unknown clients to proxy mode. |
| `PROXY_OUTPUT_STRICT` | No | Proxy candidate strictness: `false` (default) keeps proxy discovery broad; `true` makes active `TOOLSETS` / `TOOLS` a hard allow-list for proxy search, schema lookup, and invocation. |
| `TOOLSETS` | No | Comma-separated tool categories to expose. If neither `TOOLSETS` nor `TOOLS` is set, all native Huly tools are exposed. Example: `issues,projects,search` |
| `TOOLS` | No | Comma-separated exact tool names to expose in addition to selected toolsets. Example: `list_documents,create_issue` |

*Auth: Provide either `HULY_EMAIL` + `HULY_PASSWORD` or `HULY_TOKEN`.

## Built-in Diagnostic Tools

`get_version` returns the current server version and latest npm version.

`get_huly_context` returns sanitized runtime/configuration context for the current MCP session without connecting to Huly. It reports package version, transport, auth mode, sanitized Huly URL origin/host/protocol, workspace, timeout, config sources, native tool scope filtering, and resolved native/proxy tool exposure. Tokens, passwords, email values, credential headers, URL paths, URL query strings, and URL credentials are never returned.

## MCP Resources

The server exposes read-only MCP Resources as JSON context for clients that support `resources/read`.

<!-- resources:start -->
<!-- AUTO-GENERATED from src/mcp/resources.ts resourceTemplates. Do not edit manually. Run `pnpm update-readme` to regenerate. -->
| Template | Name | Description | MIME Type |
|----------|------|-------------|-----------|
| `huly://projects/{project}` | `huly-project` | Read full details for a Huly tracker project by project identifier, for example huly://projects/HULY. | `application/json` |
| `huly://issues/{issue}` | `huly-issue` | Read full details for a Huly issue by full issue identifier, for example huly://issues/HULY-123. | `application/json` |
| `huly://projects/{project}/issues/{issue}` | `huly-project-issue` | Read full details for a Huly issue by project identifier and issue number, for example huly://projects/HULY/issues/123. | `application/json` |
<!-- resources:end -->

`resources/list` returns concrete active project resources. Issue resources are template-based: use `resources/templates/list` to discover supported issue URI templates, then read a known issue URI.

## Backlog

Feature backlog and SDK parity notes live in [docs/BACKLOG.md](docs/BACKLOG.md).

<!-- tools:start -->
<!-- AUTO-GENERATED from src/mcp/tools/ descriptions. Do not edit manually. Run `pnpm update-readme` to regenerate. -->
## Available Tools

When resolved tool exposure is `proxy`, clients see the built-in tools plus these proxy meta-tools. Native Huly tools are then discovered and invoked through the proxy candidate catalog. Exact native tool names also dispatch when a client calls them directly, subject to `PROXY_OUTPUT_STRICT` scope rules, but hidden native tools are not advertised through `tools/list`.

### Proxy Meta-Tools

| Tool | Description |
|------|-------------|
| `list_tool_categories` | Lists Huly tool categories available through this proxy. Use this first when you need a broad map of capabilities before searching for a specific Huly tool. |
| `search_tools` | Searches the current proxy-visible Huly tool catalog by tool name, category, description, and parameter names. Returns exact tool names plus required and optional parameter names for single-call follow-up with get_tool_schema or invoke_tool. |
| `get_tool_schema` | Returns the exact input and output schema for one proxy-visible Huly tool. Use this before invoke_tool when you are not certain about required argument names or result shape. |
| `invoke_tool` | Invokes one proxy-visible Huly tool by exact name with its arguments. This tool can call read or write Huly operations; check get_tool_schema and the target tool annotations when safety matters. |

**`TOOLSETS` categories:** `projects`, `issues`, `comments`, `milestones`, `documents`, `storage`, `attachments`, `contacts`, `channels`, `calendar`, `time tracking`, `search`, `associations`, `activity`, `notifications`, `workspace`, `approvals`, `boards`, `cards`, `collaborators`, `custom-fields`, `drive`, `inventory`, `labels`, `leads`, `templates`, `planner`, `preferences`, `processes`, `recruiting`, `sdk-discovery`, `spaces`, `tag-categories`, `tags`, `task-management`, `test-management`, `user-statuses`, `views`, `virtual-office`

### Projects

| Tool | Description |
|------|-------------|
| `list_project_target_preferences` | List low-level per-project tracker target preference records. These Huly ProjectTargetPreference records are attached to projects and used by tracker UI/workflows to remember target-related preference props. Omit project to list recent preferences across projects, or pass a project identifier to inspect one project's preference. Props are SDK-open key/value payloads. |
| `upsert_project_target_preference` | Create or update the low-level ProjectTargetPreference record for a project. This refreshes usedOn and merges SDK-open target preference props by key. Use for tracker SDK parity or advanced administration; ordinary project and issue workflows usually do not need this tool. |
| `list_projects` | List all Huly projects. Returns projects sorted by name. Supports filtering by archived status. |
| `get_project` | Get full details of a Huly project including its statuses. Returns project name, description, archived flag, default status, and all available statuses. |
| `list_statuses` | List all issue statuses for a Huly project with workflow category and default info. Returns status name, category, and isDefault. Use this to discover valid statuses before creating or updating issues. |
| `create_project` | Create a new Huly tracker project. Idempotent: returns existing project if one with the same identifier already exists (created=false). Identifier must be 1-5 uppercase alphanumeric chars starting with a letter. |
| `update_project` | Update a Huly project. Only provided fields are modified. Set description to null to clear it. |
| `delete_project` | Permanently delete a Huly project. All issues, milestones, and components in this project will be orphaned. This action cannot be undone. |

### Issues

| Tool | Description |
|------|-------------|
| `preview_deletion` | Preview the impact of deleting a Huly entity before actually deleting it. Shows affected sub-entities, relations, and warnings. Supports issues, projects, components, and milestones. Use this to understand cascade effects before calling a delete operation. |
| `list_components` | List components in a Huly project. Components organize issues by area/feature. Returns components sorted by modification date (newest first). |
| `get_component` | Retrieve full details for a Huly component. Use this to view component content and metadata. |
| `create_component` | Create a new component in a Huly project. Components help organize issues by area/feature. Returns the created component ID and label. |
| `update_component` | Update fields on an existing Huly component. Only provided fields are modified. |
| `set_issue_component` | Set or clear the component on a Huly issue. Pass null for component to clear it. |
| `delete_component` | Permanently delete a Huly component. This action cannot be undone. |
| `list_issues` | Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, exact workflow status name (status), Huly SDK task.statusCategory key (statusCategory: UnStarted, ToDo, Active, Won, Lost), assignee, component, and parentIssue (to list children of a specific issue). Supports searching by title substring (titleSearch) and description content (descriptionSearch). |
| `get_issue` | Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata. |
| `create_issue` | Create a new issue in a Huly project. Optionally set taskType by ID or display name; it is resolved within the target project's project type, and status is validated against that task type's workflow. Use list_task_types or get_project_type to discover valid task types and statuses. Optionally create as a sub-issue by specifying parentIssue. Description supports markdown formatting. Returns the created issue identifier. |
| `update_issue` | Update fields on an existing Huly issue. Optionally set taskType by ID or display name; it is resolved within the target project's project type, and the status is preserved only when valid for the new task type. Use list_task_types or get_project_type to discover valid task types and statuses. Only provided fields are modified. Description updates support markdown. |
| `add_issue_label` | Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project. |
| `remove_issue_label` | Remove a tag/label from a Huly issue. Detaches the label reference; does not delete the label definition. |
| `delete_issue` | Permanently delete a Huly issue. This action cannot be undone. |
| `move_issue` | Move an issue to a new parent (making it a sub-issue) or to top-level (null). Updates parent/child relationships and sub-issue counts. |
| `list_issue_templates` | List issue templates in a Huly project. Templates define reusable issue configurations. Returns templates sorted by modification date (newest first). |
| `get_issue_template` | Retrieve full details for a Huly issue template including children (sub-task templates). Use this to view template content, default values, and child template IDs. |
| `create_issue_template` | Create a new issue template in a Huly project. Templates define default values for new issues. Optionally include children (sub-task templates) that will become sub-issues when creating issues from this template. Returns the created template ID and title. |
| `create_issue_from_template` | Create a new issue from a template. Applies template defaults, allowing overrides for specific fields. If the template has children (sub-task templates), sub-issues are created automatically unless includeChildren is set to false. Returns the created issue identifier and count of children created. |
| `update_issue_template` | Update fields on an existing Huly issue template. Only provided fields are modified. |
| `delete_issue_template` | Permanently delete a Huly issue template. This action cannot be undone. |
| `add_template_child` | Add a child (sub-task) template to an issue template. The child defines default values for sub-issues created when using create_issue_from_template. Returns the child template ID. |
| `remove_template_child` | Remove a child (sub-task) template from an issue template by its child ID. Get child IDs from get_issue_template response. |
| `add_issue_relation` | Add a relation between two issues. Relation types: 'blocks' (source blocks target — pushes into target's blockedBy), 'is-blocked-by' (source is blocked by target — pushes into source's blockedBy), 'relates-to' (bidirectional link — updates both sides). targetIssue accepts cross-project identifiers like 'OTHER-42'. No-op if the relation already exists. |
| `remove_issue_relation` | Remove a relation between two issues. Mirrors add_issue_relation: 'blocks' pulls from target's blockedBy, 'is-blocked-by' pulls from source's blockedBy, 'relates-to' pulls from both sides. No-op if the relation doesn't exist. |
| `list_issue_relations` | List all relations of an issue. Returns blockedBy (issues blocking this one), blocks (issues this one blocks), relations (bidirectional issue links), and documents (linked documents with title/teamspace). |
| `link_document_to_issue` | Link a Huly document to an issue. The link appears in the issue's Relations panel in the UI. Idempotent: no-op if the document is already linked. Use list_issue_relations to see linked documents. |
| `unlink_document_from_issue` | Remove a document link from an issue. Idempotent: no-op if the document is not linked. |
| `list_related_issue_targets` | List rules that choose the default destination project for related issues. A spaceRule says related issues from one space default to targetProject. A classRule says related issues for one object class default to targetProject. targetProject is a project identifier, or null for no default destination project. |
| `set_related_issue_target` | Set the default destination project for related issues from a space or object class. For space, creates or updates a spaceRule. For objectClass, only updates an existing classRule; this tool never creates classRule targets. Pass targetProject as a project identifier, or null to clear the default destination project. |
| `delete_related_issue_space_target` | Delete the spaceRule that chooses the default destination project for related issues from one space. This only deletes spaceRule targets; classRule deletion is intentionally unsupported because class rules may be model-provided. |

### Comments

| Tool | Description |
|------|-------------|
| `list_comments` | List comments on a Huly issue. Returns comments sorted by creation date (oldest first). |
| `add_comment` | Add a comment to a Huly issue. Comment body supports markdown formatting. |
| `update_comment` | Update an existing comment on a Huly issue. Comment body supports markdown formatting. |
| `delete_comment` | Delete a comment from a Huly issue. This action cannot be undone. |

### Milestones

| Tool | Description |
|------|-------------|
| `list_milestones` | List milestones in a Huly project. Returns milestones sorted by modification date (newest first). |
| `get_milestone` | Retrieve full details for a Huly milestone. Use this to view milestone content and metadata. |
| `create_milestone` | Create a new milestone in a Huly project. Returns the created milestone ID and label. |
| `update_milestone` | Update fields on an existing Huly milestone. Only provided fields are modified. |
| `set_issue_milestone` | Set or clear the milestone on a Huly issue. Pass null for milestone to clear it. |
| `delete_milestone` | Permanently delete a Huly milestone. This action cannot be undone. |

### Documents

| Tool | Description |
|------|-------------|
| `list_document_snapshots` | List version-history snapshots for one Huly document. A snapshot is a saved point-in-time copy from the document's change history. Resolve the document by teamspace plus document title or ID. Returns snapshotId, documentId, teamspaceId, title, parentDocumentId, and timestamps; markdown content is intentionally omitted. Use get_document_snapshot with snapshotId when reading content. |
| `get_document_snapshot` | Get one point-in-time Huly document history snapshot and return markdown content. Resolve the document by teamspace plus document title or ID; resolve the snapshot by snapshotId, exact snapshot title, or exact createdOn timestamp. Prefer snapshotId from list_document_snapshots when titles or dates may collide. Restore is out of scope. |
| `list_teamspaces` | List all Huly document teamspaces. Returns teamspaces sorted by name. Supports filtering by archived status. |
| `get_teamspace` | Get details for a Huly document teamspace including document count. Finds by name or ID, including archived teamspaces. |
| `create_teamspace` | Create a new Huly document teamspace. Idempotent: returns existing teamspace if one with the same name exists. |
| `update_teamspace` | Update fields on an existing Huly document teamspace. Only provided fields are modified. Set description to null to clear it. |
| `delete_teamspace` | Permanently delete a Huly document teamspace. This action cannot be undone. |
| `list_documents` | List documents in a Huly teamspace. Returns documents sorted by modification date (newest first). Each result includes a 'url' field pointing to the document in the Huly web app. Supports searching by title substring (titleSearch) and content (contentSearch). |
| `get_document` | Retrieve full details for a Huly document including markdown content and a 'url' field pointing to the document in the Huly web app. Use this to view document content and metadata. |
| `create_document` | Create a new document in a Huly teamspace. Content is markdown and supports native Mermaid diagrams (```mermaid blocks render interactively in Huly UI). Use markdown links to current-workspace Huly browse URLs for native references; Huly browse links returned in get_document content round-trip as native references. The URL identifies the object; link text is display text; plain issue keys stay text. External URLs stay normal markdown links. Optionally pass parent as a document title or ID to create a nested child document; invalid parents fail instead of silently creating a top-level document. Returns the created document id and a 'url' field pointing to the document in the Huly web app. Use link_document_to_issue only if you also want an issue-document association. |
| `edit_document` | Edit an existing Huly document. You may rename with title and/or edit the body. Body editing has two mutually exclusive modes: (1) content replaces the entire markdown body, (2) old_text + new_text performs exact targeted search-and-replace. Use markdown links to current-workspace Huly browse URLs for native references; Huly browse links returned in get_document content round-trip as native references. The URL identifies the object; link text is display text; plain issue keys stay text. External URLs stay normal markdown links. For targeted replace, multiple matches error unless replace_all is true; empty new_text deletes matched text. Content supports native Mermaid diagrams. Returns a 'url' field pointing to the document in the Huly web app. |
| `list_inline_comments` | List inline comment threads from a Huly document. Extracts comments embedded in document content as ProseMirror marks. Each comment includes the highlighted text and thread ID. Set includeReplies=true to also fetch thread reply messages with sender names. |
| `delete_document` | Permanently delete a Huly document. This action cannot be undone. |

### Storage

| Tool | Description |
|------|-------------|
| `upload_file` | Upload a file to Huly storage. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64 - for small files only). Returns blob ID and URL for referencing the file. |

### Attachments

| Tool | Description |
|------|-------------|
| `list_attachments` | List attachments on a Huly object (issue, document, etc.). Returns attachments sorted by modification date (newest first). |
| `get_attachment` | Retrieve full details for a Huly attachment including download URL. |
| `add_attachment` | Add an attachment to a Huly object. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64). Returns the attachment ID and download URL. |
| `update_attachment` | Update attachment metadata (description, pinned status). |
| `delete_attachment` | Permanently delete an attachment. This action cannot be undone. |
| `pin_attachment` | Pin or unpin an attachment. |
| `download_attachment` | Get download URL for an attachment along with file metadata (name, type, size). |
| `add_issue_attachment` | Add an attachment to a Huly issue. Convenience method that finds the issue by project and identifier. Provide ONE of: filePath, fileUrl, or data. |
| `add_document_attachment` | Add an attachment to a Huly document. Convenience method that finds the document by teamspace and title/ID. Provide ONE of: filePath, fileUrl, or data. |
| `save_attachment` | Save/bookmark an attachment for later reference. Idempotent when already saved. |
| `unsave_attachment` | Remove an attachment from saved/bookmarks. |
| `list_saved_attachments` | List saved/bookmarked attachments for the current user. |
| `list_drawings` | List drawings attached to a raw Huly parent object. |
| `get_drawing` | Get a drawing by ID. |
| `create_drawing` | Create a drawing under a raw Huly parent object. |
| `update_drawing` | Update drawing content. Pass null content to clear it. |
| `delete_drawing` | Delete a drawing. This action cannot be undone. |

### Contacts

| Tool | Description |
|------|-------------|
| `list_persons` | List all persons in the Huly workspace. Returns persons sorted by modification date (newest first). Supports searching by name substring (nameSearch) and email substring (emailSearch). |
| `get_person` | Retrieve full details for a person including contact channels. Use personId or email to identify the person. |
| `create_person` | Create a new person in Huly. Returns the created person ID. |
| `update_person` | Update fields on an existing person. Only provided fields are modified. |
| `delete_person` | Permanently delete a person from Huly. This action cannot be undone. |
| `list_employees` | List employees (persons who are team members). Returns employees sorted by modification date (newest first). |
| `list_contact_channel_providers` | List supported contact channel provider labels for person and organization channel tools. |
| `list_person_channels` | List contact channels for a person. Person accepts person ID, exact email address, or exact Huly display name; ambiguous names fail and should be retried with email or person ID. |
| `add_person_channel` | Idempotently add a contact channel to a person. Person accepts person ID, exact email address, or exact Huly display name. Provider labels match list_contact_channel_providers. Returns added=false and the existing channel when the exact provider+value already exists. |
| `update_person_channel` | Update one contact channel on a person. Person accepts person ID, exact email, or exact display name. Identify the channel with exactly one locator: channelId, or provider plus value. Provide newProvider, newValue, or both. Updating to an existing provider+value on the same person fails with a conflict. |
| `remove_person_channel` | Remove one contact channel from a person. Person accepts person ID, exact email, or exact display name. Identify the channel with exactly one locator: channelId, or provider plus value. Returns removed=false when the locator is absent for that person. |
| `list_organizations` | List all organizations in the Huly workspace. Returns organizations sorted by modification date (newest first). |
| `create_organization` | Create a new organization in Huly. Optionally add members by person ID or email. Fails if any requested member cannot be resolved. Returns the created organization ID. |
| `get_organization` | Retrieve full details for an organization by ID or exact name when that name is unique - including city, description, member count, and modification timestamp. If multiple organizations share the same name, use the organization ID. |
| `update_organization` | Update fields on an existing organization identified by ID or exact name when that name is unique. Only provided fields are modified. Description supports multi-line plain text and is the right place to store CRM notes / revenue summaries / context. Pass null to clear city or description. If multiple organizations share the same name, use the organization ID. |
| `delete_organization` | Permanently delete an organization identified by ID or exact name when that name is unique. Use with care - this cannot be undone. Useful for cleaning up duplicate organizations after merging their data elsewhere. If multiple organizations share the same name, use the organization ID. |
| `make_organization_customer` | Apply the Customer mixin to an organization so it appears in the Huly Leads > Customers view. Idempotent - safe to call on organizations that are already customers. Takes the organization ID or exact name when that name is unique. |
| `add_organization_channel` | Idempotently add a contact channel to an organization identified by ID or exact unique name. Provider labels: email, phone, linkedin, twitter, github, facebook, telegram, homepage, whatsapp, skype, profile, viber. Returns added=false and the existing channel when the exact provider+value already exists. |
| `list_organization_channels` | List contact channels for an organization identified by ID or exact unique organization name. Returns channelId, provider label, value, and optional activity metadata. |
| `update_organization_channel` | Update one contact channel on an organization identified by ID or exact unique name. Identify the channel with exactly one locator: channelId, or provider plus value. Provide newProvider, newValue, or both. Updating to an existing provider+value on the same organization fails with a conflict. |
| `remove_organization_channel` | Remove one contact channel from an organization identified by ID or exact unique name. Identify the channel with exactly one locator: channelId, or provider plus value. Returns removed=false when the locator is absent for that organization. |
| `add_organization_member` | Link a person as a member of an organization. The person appears under the org's Members tab in Huly. Use person ID or email to identify the person. Idempotent: returns added=false if that person is already a member. |
| `list_organization_members` | List all persons who are members of an organization. Returns each member's person ID, name, and primary email (if any). When using a name instead of an ID, that name must identify exactly one organization. |
| `list_person_organizations` | List all organizations that a person is a member of. Provide personId or email. Returns each organization's ID and name. |
| `remove_organization_member` | Unlink a person from an organization's members. Reverses add_organization_member. Returns removed: false if the person was not a member. When using an organization name instead of an ID, that name must identify exactly one organization. |

### Channels

| Tool | Description |
|------|-------------|
| `list_channel_members` | List members of a Huly channel by channel name or ID. Returns each member account UUID and the workspace display name when available. |
| `add_channel_members` | Idempotently add members to a non-archived Huly channel. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full sorted member array. |
| `remove_channel_members` | Idempotently remove members from a non-archived Huly channel. Members accept account UUID, exact email, or exact person display name. Refuses removals that would leave the channel with zero members or, when owners exist, no owner among remaining members. |
| `join_channel` | Join a non-archived Huly channel as the authenticated account. Idempotent when the account is already a member. |
| `leave_channel` | Leave a non-archived Huly channel as the authenticated account. Idempotent when already absent. Refuses to leave if that would leave the channel empty or without any remaining owner. |
| `archive_channel` | Archive a Huly channel by channel name or ID. This is reversible with unarchive_channel and is idempotent when the channel is already archived. |
| `unarchive_channel` | Unarchive a Huly channel by channel name or ID. Idempotent when the channel is already active. |
| `create_group_direct_message` | Open a group direct-message conversation with at least two other workspace members. The `people` array accepts exact emails or exact display names; the authenticated account is included automatically. Idempotent by exact sorted member set: returns an existing group DM with `created: false` when one already exists. For one other person, use create_direct_message. |
| `set_conversation_starred` | Set the authenticated user's starred state for exactly one conversation. Provide either `channel` (channel name or ID) or `dm` (DM ID, or one-to-one participant display name), plus `starred`. Creates the missing notification context when needed. |
| `set_conversation_closed` | Set the authenticated user's closed/visible state for exactly one conversation. Provide either `channel` or `dm`, plus `closed`. Closing only hides the current user's notification context; it does not leave channels or remove members. |
| `list_channels` | List all Huly channels. Returns channels sorted by name. Supports filtering by archived status. Supports searching by name substring (nameSearch) and topic substring (topicSearch). |
| `get_channel` | Retrieve full details for a Huly channel including topic and member list. |
| `create_channel` | Create a new channel in Huly. Returns the created channel ID and name. |
| `update_channel` | Update fields on an existing Huly channel. Only provided fields are modified. |
| `delete_channel` | Permanently delete a Huly channel. This action cannot be undone. For reversible channel lifecycle changes, use archive_channel and unarchive_channel instead. |
| `list_channel_messages` | List messages in a Huly channel. Returns messages sorted by date (newest first). |
| `list_external_channel_messages` | List read-only messages for an external Gmail or Telegram channel by channel name or ID. The limit defaults to 50 and is capped at 200. When this build does not include a compatible Huly external-message SDK/model for the requested provider, returns supported=false, an unsupportedReason, and an empty messages array; it never sends, replies, deletes, mutates, or returns fake messages. |
| `send_channel_message` | Send a message to a Huly channel. Message body supports markdown formatting. |
| `update_channel_message` | Update a channel message. Only the body can be modified. |
| `delete_channel_message` | Permanently delete a channel message. This action cannot be undone. |
| `list_direct_messages` | List direct message conversations in Huly. Returns conversations sorted by date (newest first). |
| `create_direct_message` | Open a one-to-one direct-message conversation with a workspace member. The `person` argument accepts an email or exact display name (e.g. `Smith,Bill`). Idempotent: if a DM with that participant already exists, returns it (`created: false`); otherwise creates a new DM (`created: true`). The returned `id` can be passed as `dm` to send_dm_message, list_dm_messages, etc. |
| `list_dm_messages` | List messages in a direct-message conversation, newest first. The `dm` argument accepts either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`); a name resolves only to a one-to-one DM with the authenticated account. |
| `send_dm_message` | Send a message to a direct-message conversation. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. Message body supports markdown formatting. |
| `update_dm_message` | Update a direct-message message. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. Only the body can be modified. |
| `delete_dm_message` | Permanently delete a direct-message message. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. This action cannot be undone. |
| `list_thread_replies` | List replies in a message thread. Returns replies sorted by date (oldest first). |
| `add_thread_reply` | Add a reply to a message thread. Reply body supports markdown formatting. |
| `update_thread_reply` | Update a thread reply. Only the body can be modified. |
| `delete_thread_reply` | Permanently delete a thread reply. This action cannot be undone. |
| `list_chat_message_attachments` | List files attached directly to a Huly chat message target. target.kind supports channel_message, dm_message, and thread_reply; the tool resolves channel names and one-to-one DM participant display names for you. |
| `get_chat_message_attachment` | Get one file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target. |
| `add_chat_message_attachment` | Attach a file directly to a Huly channel message, direct-message message, or thread reply. Provide filename, contentType, and exactly one of filePath, fileUrl, or data. |
| `update_chat_message_attachment` | Update description and/or pinned state for a file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target. |
| `delete_chat_message_attachment` | Delete one file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target. |

### Calendar

| Tool | Description |
|------|-------------|
| `list_events` | List calendar events. Returns events sorted by date. Supports filtering by date range. |
| `list_calendars` | List writable, non-hidden calendars that can be used as create_event or create_recurring_event targets. Use this before creating events when you need to choose a target calendarId explicitly. |
| `get_event` | Retrieve full details for a calendar event including description. Use this to view event content and metadata. |
| `create_event` | Create a new calendar event. Description supports markdown formatting. Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID. |
| `update_event` | Update fields on an existing calendar event. Only provided fields are modified. Description updates support markdown. |
| `delete_event` | Permanently delete a calendar event. This action cannot be undone. |
| `list_schedules` | List calendar scheduling links/availability schedules. Optional owner accepts an employee/person ID, exact name, or email. |
| `get_schedule` | Retrieve one calendar schedule including owner, availability, calendar target, time zone, and room information when it is a meeting schedule. |
| `create_schedule` | Create a calendar schedule. Owner accepts an employee/person ID, exact name, or email; calendar can be targeted by calendarId or calendarName. |
| `update_schedule` | Update a calendar schedule. Supports owner, title, description, duration, interval, availability, timeZone, and calendar move by calendarId or calendarName. |
| `delete_schedule` | Delete a calendar schedule by scheduleId. |
| `list_recurring_events` | List recurring event definitions. Returns recurring events sorted by modification date (newest first). |
| `create_recurring_event` | Create a new recurring calendar event with RFC5545 RRULE rules. Description supports markdown. Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID. |
| `list_event_instances` | List instances of a recurring event. Returns instances sorted by date. Supports filtering by date range. Use includeParticipants=true to fetch full participant info (extra lookups). |

### Time Tracking

| Tool | Description |
|------|-------------|
| `log_time` | Log time spent on a Huly issue. Records a time entry with optional description. Time value is in minutes. |
| `get_time_report` | Get time tracking report for a specific Huly issue. Shows total time, estimation, remaining time, and all time entries. |
| `list_time_spend_reports` | List all time entries across issues. Supports filtering by project and date range. Returns entries sorted by date (newest first). |
| `get_detailed_time_report` | Get detailed time breakdown for a project. Shows total time grouped by issue and by employee. Supports date range filtering. |
| `list_work_slots` | List scheduled work slots created by schedule_todo, Huly UI, or other clients. Shows planned time blocks attached to ToDos. Supports filtering by employee and date range. |
| `start_timer` | Start a client-side timer on a Huly issue. Validates the issue exists and returns a start timestamp. Use log_time to record the elapsed time when done. |
| `stop_timer` | Stop a client-side timer on a Huly issue. Returns the stop timestamp. Calculate elapsed time from start/stop timestamps and use log_time to record it. |

### Search

| Tool | Description |
|------|-------------|
| `fulltext_search` | Perform a global fulltext search across all Huly content. Searches issues, documents, messages, and other indexed content. Returns matching items sorted by relevance (newest first). |

### Associations

| Tool | Description |
|------|-------------|
| `list_associations` | List Huly association definitions: class-level typed links that define which document classes may be related. Use this before create_relation to discover association IDs, source/target classes, and whether relation writes are supported. |
| `create_association` | Idempotently create one Huly association definition between two non-system classes. Use sourceClass/targetClass with sourceRole/targetRole and cardinality; returns an existing identical association by default. |
| `delete_association` | Idempotently delete one Huly association definition only when no concrete relations reference it. If relations exist, delete_relation must clean them up first; deleting an already-missing association is a successful no-op. |
| `list_relations` | List concrete Huly relation instances under an association, optionally filtered by source and target documents. Endpoint locators support raw, issue, document, and card. Requires at least one filter to avoid broad workspace scans. |
| `create_relation` | Idempotently create one concrete relation between two resolved documents for a writable association. Endpoint locators support raw, issue, document, and card. Enforces association endpoint classes, direction, duplicate handling, automation-only restrictions, and cardinality. |
| `delete_relation` | Idempotently delete one concrete relation by relation ID or by exact association/source/target triple. Triple endpoint locators support raw, issue, document, and card. Triple deletes use the same direction semantics as create_relation and fail if the selector is ambiguous. |

### Activity

| Tool | Description |
|------|-------------|
| `list_activity` | List activity messages for a Huly issue, document, channel, or raw Huly object. Prefer friendly targets: project+issueIdentifier for issues, teamspace+document for documents, or channel for channels. Advanced callers may pass objectId+objectClass directly. Returns activity sorted by date (newest first). |
| `get_activity_message` | Get a single activity message by ID, including subclass metadata when available. |
| `pin_activity_message` | Pin or unpin an activity message. Idempotent when the pin state already matches. |
| `list_activity_filters` | List configured activity filters in display order. |
| `list_activity_references` | List activity references connected to a raw Huly object. Use direction to list references from the object, to the object, or both. |
| `list_activity_replies` | List thread replies on any activity message, not only channel messages. |
| `add_activity_reply` | Add a Markdown reply to any activity message. |
| `update_activity_reply` | Update a generic activity reply body. |
| `delete_activity_reply` | Delete a generic activity reply. |
| `add_reaction` | Add an emoji reaction to an activity message. |
| `remove_reaction` | Remove an emoji reaction from an activity message. |
| `list_reactions` | List reactions on an activity message. |
| `save_message` | Save/bookmark an activity message for later reference. |
| `unsave_message` | Remove an activity message from saved/bookmarks. |
| `list_saved_messages` | List saved/bookmarked activity messages. |
| `list_mentions` | List @mentions of the current user in activity messages. |

### Notifications

| Tool | Description |
|------|-------------|
| `list_notification_providers` | List notification providers such as inbox, push, and sound. Use provider IDs from this tool when updating provider or type settings. |
| `list_notification_types` | List notification types. Use type IDs from this tool when updating provider-specific notification type settings. |
| `list_notifications` | List inbox notifications. Returns notifications sorted by modification date (newest first). Supports filtering by read/archived status. |
| `get_notification` | Retrieve full details for a notification. Use this to view notification content and metadata. |
| `mark_notification_read` | Mark a notification as read. Idempotent: returns success when the notification is already read. |
| `mark_notification_unread` | Mark a notification as unread. Idempotent: returns success when the notification is already unread. |
| `mark_all_notifications_read` | Mark all unread notifications as read. Returns the count of notifications marked. |
| `archive_notification` | Archive a notification. Archived notifications are hidden from the main inbox view. Idempotent when already archived. |
| `unarchive_notification` | Unarchive a notification so it can appear in active notification lists again. Idempotent when already active. |
| `archive_all_notifications` | Archive all notifications. Returns the count of notifications archived. |
| `delete_notification` | Permanently delete a notification. This action cannot be undone. |
| `get_notification_context` | Get notification context for an entity. Returns tracking information for a specific object. |
| `list_notification_contexts` | List notification contexts. Returns contexts sorted by last update timestamp (newest first). Supports filtering by pinned status and can include hidden contexts. |
| `pin_notification_context` | Pin or unpin a notification context. Pinned contexts are highlighted in the inbox. Idempotent when the pin state already matches. |
| `hide_notification_context` | Hide or unhide a notification context. Hidden contexts are omitted from list_notification_contexts unless includeHidden is true. Idempotent when the hidden state already matches. |
| `archive_notification_context` | Archive all inbox notifications in a notification context. Idempotent: returns count 0 when no active notifications remain. |
| `unarchive_notification_context` | Unarchive all archived inbox notifications in a notification context. Idempotent: returns count 0 when no archived notifications remain. |
| `subscribe_to_object_notifications` | Subscribe the authenticated account to notifications for a raw Huly object by adding a core collaborator row. Idempotent when already subscribed. |
| `unsubscribe_from_object_notifications` | Unsubscribe the authenticated account from notifications for a raw Huly object by removing its collaborator row. Idempotent when already absent. |
| `list_notification_settings` | List notification provider settings. Returns current notification preferences. |
| `update_notification_provider_setting` | Update notification provider setting. Enable or disable notifications for a specific provider. |
| `update_notification_type_setting` | Enable or disable one notification type for one provider. Creates the type setting only when the provider has a configurable setting in this workspace. |
| `get_unread_notification_count` | Get the count of unread notifications. |

### Workspace

| Tool | Description |
|------|-------------|
| `list_workspace_members` | List members in the current Huly workspace with their roles. Returns members with account IDs and roles. |
| `update_member_role` | Update a workspace member's role. Requires appropriate permissions. Valid roles: READONLYGUEST, DocGuest, GUEST, USER, MAINTAINER, OWNER, ADMIN. |
| `get_workspace_info` | Get information about the current workspace including name, URL, region, and settings. |
| `list_workspaces` | List all workspaces accessible to the current user. Returns workspace summaries sorted by last visit. |
| `create_workspace` | Create a new Huly workspace. Returns the workspace UUID and URL. Optionally specify a region. |
| `delete_workspace` | Permanently delete the current workspace. This action cannot be undone. Use with extreme caution. |
| `get_user_profile` | Get the current user's profile information including bio, location, and social links. |
| `update_user_profile` | Update the current user's profile. Supports bio, city, country, website, social links, and public visibility. |
| `update_guest_settings` | Update workspace guest settings. Control read-only guest access and guest sign-up permissions. |
| `create_access_link` | Create a Huly workspace access link. When role is omitted, role=GUEST. Supports anonymous reusable guest links by setting personalized=false with notBefore and expiration, and can restrict access to specific Huly space IDs via spaces. |
| `get_regions` | Get available regions for workspace creation. Returns region codes and display names. |

### Approvals

| Tool | Description |
|------|-------------|
| `list_approval_requests` | List generic Huly approval Request documents from the published @hcengineering/request SDK package. This is read-only discovery: filter by status, raw attachedTo document id, and/or raw attachedToClass class id when you know the target document. Omit filters to inspect recent approval requests across modules. |
| `get_approval_request` | Read one generic Huly approval Request document by raw request _id. Returns person refs with best-effort contact metadata plus the opaque SDK tx/rejectedTx payloads for inspection; approval mutations are intentionally not exposed by this read-only tool. |
| `add_approval_request` | Create a generic Huly approval Request attached to any target document. Provide raw attachedTo and attachedToClass from the target, requested people as Person ids or exact email/name identifiers, and a real opaque Huly SDK tx payload. Omit space to resolve it from the target; collection defaults to requests. Returns the new request id without doing an immediate stale-prone read-after-write. |
| `add_approval_request_comment` | Add a plain markdown comment to an approval Request by request _id. This does not approve, reject, cancel, or create a decision comment mixin. |
| `approve_approval_request` | Approve an active approval Request as the current Huly user. The current user's Employee/Person ref must be in the request's requested list. Optionally attach a markdown decision comment before approval. If the current user already approved it, returns changed=false. |
| `reject_approval_request` | Reject an active approval Request as the current Huly user and attach the required markdown rejection decision comment. Huly applies rejectedTx when present. |
| `cancel_approval_request` | Cancel an active approval Request created by the current Huly user. This is the safe removal-from-workflow operation; hard delete is intentionally not exposed. |

### Boards

| Tool | Description |
|------|-------------|
| `list_boards` | List Huly boards from @hcengineering/board, sorted by name. Boards are task.Project-backed spaces; this is not the separate Huly Card module. |
| `get_board` | Get one Huly board by board _id or exact board name. Returns board metadata, project type, and card count. |
| `create_board` | Create a Huly board. Idempotent by exact active board name; pass projectType by _id or exact name only when the default board project type is ambiguous. |
| `update_board` | Update a Huly board's name, description, or privacy. board accepts board _id or exact board name. |
| `archive_board` | Archive a Huly board by board _id or exact board name. This hides the board but does not delete cards. |
| `unarchive_board` | Unarchive a Huly board by board _id or exact board name. |
| `list_board_cards` | List cards on one @hcengineering/board board. board accepts board _id or exact board name; cards are sorted newest modified first. |
| `get_board_card` | Get one board card. board accepts board _id or exact board name; card accepts card _id, CARD-123, bare number 123, or exact title scoped to the board. |
| `create_board_card` | Create a board card with safe defaults. Resolves kind/status from the board project type, increments the CARD-number sequence, and stores markdown description as inline Huly Markup. |
| `update_board_card` | Update board card fields: title, markdown description, status, assignee, members, location, cover, startDate, and dueDate. Use null to clear clearable fields. |
| `archive_board_card` | Archive a board card. card accepts _id, CARD-123, bare number, or exact title scoped to the board. |
| `unarchive_board_card` | Unarchive a board card. card accepts _id, CARD-123, bare number, or exact title scoped to the board. |
| `delete_board_card` | Permanently delete an already archived board card using Huly removeCollection. Active cards are rejected; call archive_board_card first. |
| `list_board_labels` | List board label definitions. Board labels are @hcengineering/tags TagElement rows for board cards, with targetClass = @hcengineering/board Card. |
| `create_board_label` | Create a board label definition for board cards. Idempotent by exact title when one label matches; uses board.category.Other when no default category exists. |
| `update_board_label` | Update a board label definition by TagElement _id or exact title. At least one of title, color, description, or category is required. |
| `delete_board_label` | Delete one board label definition by TagElement _id or exact title. This removes the label definition, not a board card. |
| `list_board_card_labels` | List board labels attached to one board card. Resolves board by _id/name and card by _id, CARD-123, bare number, or exact title. |
| `add_board_card_label` | Attach a board label to a board card. If label is a new title, creates the board-card label definition first; repeated calls are idempotent. |
| `remove_board_card_label` | Detach a board label from one board card. Returns detached=false when the label exists but is not attached to that card. |
| `list_board_menu_pages` | Read-only list of board menu page model docs. Optional page filters by MenuPage _id, raw pageId, main/archive alias, or exact label. |
| `list_board_saved_views` | Read-only list of board saved filtered views. Queries view.class.FilteredView where attachedTo = board.app.Board and reports own/shared visibility. |
| `get_board_saved_view` | Read one board saved filtered view by FilteredView _id or exact name, scoped to attachedTo = board.app.Board. No saved-view writes are performed. |
| `list_board_viewlets` | Read-only list of board card viewlets. Queries view.class.Viewlet with attachTo = board.class.Card and includes descriptor metadata plus matching ViewletPreference configs. |
| `get_board_common_preference` | Read the CommonBoardPreference row attached to board.app.Board. Returns present=false when the preference row is absent and never creates it. |

### Cards

| Tool | Description |
|------|-------------|
| `list_card_spaces` | List all Huly card spaces. Returns card spaces sorted by name. Card spaces are containers for cards. |
| `list_master_tags` | List master tags (card types) available in a Huly card space. Master tags define the type/schema of cards that can be created in a space. |
| `list_cards` | List cards in a Huly card space. Returns cards sorted by modification date (newest first). Supports filtering by type (master tag), title substring, and content search. |
| `get_card` | Retrieve full details for a Huly card including markdown content. Use this to view card content and metadata. |
| `create_card` | Create a new card in a Huly card space. Requires a master tag (card type). Content supports markdown formatting. Returns the created card id. |
| `update_card` | Update fields on an existing Huly card. Only provided fields are modified. Content updates support markdown. |
| `delete_card` | Permanently delete a Huly card. This action cannot be undone. |

### Collaborators

| Tool | Description |
|------|-------------|
| `list_object_collaborators` | List notification collaborators on a Huly issue, document, or raw object. Prefer friendly targets: project+issueIdentifier for issues or teamspace+document for documents. Advanced callers may pass objectId+objectClass directly. |
| `add_object_collaborator` | Subscribe a workspace member to object notifications by adding a core collaborator row. Member can be an account UUID, exact employee/person name, or email. Idempotent when already subscribed. |
| `remove_object_collaborator` | Unsubscribe a workspace member from object notifications by removing its collaborator row. Member can be an account UUID, exact employee/person name, or email. Idempotent when already absent. |

### Custom-Fields

| Tool | Description |
|------|-------------|
| `list_custom_fields` | List custom field definitions in the workspace. Returns fields with their labels, types, and owner class info. Custom fields are created in the Huly UI on Card types, Issue types, or other classes. Use targetClass to filter fields for a specific class. |
| `get_custom_field_values` | Read custom field values from a document. Pass the document's ID and class (from list_cards, list_issues, etc.). Returns all custom field values found on the document with their labels and types. |
| `set_custom_field` | Set a custom field value on a document. Requires the document ID, class, field ID (from list_custom_fields), and value. Values are auto-parsed: numbers from numeric strings, booleans from 'true'/'false', strings as-is. |

### Drive

| Tool | Description |
|------|-------------|
| `list_drives` | List Huly Drive spaces. When includeArchived is omitted, includeArchived=undefined. Use this before path operations when you do not know the exact drive id or exact drive name. |
| `get_drive` | Get one Huly Drive by exact drive id or exact drive name. If an exact name is ambiguous, the error includes candidate ids so the next call can use the id. |
| `create_drive` | Idempotently create a Huly Drive space. If an active Drive with the same exact name already exists, returns it with created=false. Initial members and owners accept account UUIDs, exact emails, or exact person names; omitted lists default to the caller. |
| `update_drive` | Update safe metadata on an existing Drive: name, description, private, archived, or autoJoin. Provide at least one update field. This changes the Drive space, not files or folders inside it. |
| `delete_drive` | Permanently delete an empty Huly Drive space. The Drive must contain no files or folders; non-empty Drives fail with child count and item summaries. This is permanent deletion, not archive or trash. |
| `add_drive_members` | Idempotently add members to an existing Drive. Members accept account UUIDs, exact emails, or exact person names and resolve to Huly account UUIDs before replacing the Drive member list. |
| `remove_drive_members` | Idempotently remove members from an existing Drive. Members accept account UUIDs, exact emails, or exact person names and resolve to Huly account UUIDs before replacing the Drive member list. |
| `set_drive_owners` | Replace owners on an existing Drive. Owners accept account UUIDs, exact emails, or exact person names. By default, each owner is also ensured as a Drive member. Pass owners=[] to clear owners. |
| `list_drive_items` | List children under a folder path in a Drive. Paths are POSIX-like and normalized to absolute; '/' lists the root. Duplicate same-parent titles fail with candidate ids instead of guessing. |
| `get_drive_item` | Get one Drive folder or file by either exact itemId or path. Provide only one locator. File results include current version, size, MIME type, and download URL when available. |
| `list_drive_file_comments` | List comments on a Drive file resolved by filePath or fileId. Provide only one locator. Returns comments sorted by creation date, oldest first. |
| `add_drive_file_comment` | Add a Markdown comment to a Drive file resolved by filePath or fileId. Provide only one locator. The comment is attached directly to the file. |
| `update_drive_file_comment` | Update a comment on a Drive file resolved by filePath or fileId. Provide only one locator. Idempotent when the comment body is unchanged. |
| `delete_drive_file_comment` | Permanently delete a comment from a Drive file resolved by filePath or fileId. Provide only one locator. This deletes the comment, not the file. |
| `list_drive_file_activity` | List activity messages for a Drive file resolved by filePath or fileId. Provide only one locator. Returns activity sorted by date, newest first. |
| `create_drive_folder` | Idempotently create a Drive folder path, creating missing parents like mkdir -p. Returns created=false when the full folder path already exists. |
| `upload_drive_file` | Upload a file into Drive at a full path including filename. Provide exactly one source: filePath, fileUrl, or base64 data. By default createParents=true creates missing parent folders and reports them. |
| `upload_drive_file_version` | Upload a new version for an existing Drive file resolved by file id or file path. Provide exactly one source: filePath, fileUrl, or base64 data. This increments the file version counter and makes the uploaded version current. |
| `move_drive_item` | Move a Drive item, meaning a file or folder, to another existing folder path in the same Drive without renaming it. Idempotent when the item is already in that folder. Rejects sibling title collisions and rejects moving a folder into itself or a descendant. |
| `rename_drive_item` | Rename a Drive item, meaning a file or folder, in its current folder. Idempotent when the title is unchanged. Rejects sibling title collisions; use move_drive_item to change folders. |
| `delete_drive_item` | Permanently delete a Drive item, meaning a file or folder. Files are deleted with their version records. Folders must be empty; non-empty folders fail with child count and child summaries. This is permanent deletion, not archive or trash. |
| `list_drive_file_versions` | List versions for a Drive file resolved by file id or file path. Marks the current version and includes blob id, size, MIME type, lastModified, and download URL. |
| `restore_drive_file_version` | Restore an existing Drive file version by version id or numeric version. Idempotent when the requested version is already current and does not increment the file version counter. |

### Inventory

| Tool | Description |
|------|-------------|
| `list_inventory_product_attachments` | List files attached directly to an inventory product resolved by product ID or exact name. Pass category to disambiguate duplicate product names. |
| `get_inventory_product_attachment` | Get one file attached directly to an inventory product. The attachmentId must belong to the resolved product. |
| `add_inventory_product_attachment` | Add a file to an inventory product resolved by product ID or exact name. Provide exactly one of filePath, fileUrl, or data. |
| `update_inventory_product_attachment` | Update description and/or pinned state for a file attached directly to an inventory product. The attachmentId must belong to the resolved product. |
| `delete_inventory_product_attachment` | Permanently delete a file attached directly to an inventory product. The attachmentId must belong to the resolved product. |
| `list_inventory_product_photos` | List photos attached directly to an inventory product resolved by product ID or exact name. Pass category to disambiguate duplicate product names. |
| `get_inventory_product_photo` | Get one photo attached directly to an inventory product. The photoId must belong to the resolved product. |
| `add_inventory_product_photo` | Add a photo to an inventory product using Huly's product photos collection. Provide exactly one of filePath, fileUrl, or data. |
| `update_inventory_product_photo` | Update description and/or pinned state for a photo attached directly to an inventory product. The photoId must belong to the resolved product. |
| `delete_inventory_product_photo` | Permanently delete a photo attached directly to an inventory product. The photoId must belong to the resolved product. |
| `list_inventory_product_comments` | List comments attached directly to an inventory product resolved by product ID or exact name. Returns comments oldest first. |
| `add_inventory_product_comment` | Add a Markdown comment directly to an inventory product resolved by product ID or exact name. Pass category to disambiguate duplicate names. |
| `update_inventory_product_comment` | Update a comment attached directly to an inventory product. The commentId must belong to the resolved product. |
| `delete_inventory_product_comment` | Permanently delete a comment attached directly to an inventory product. The commentId must belong to the resolved product. |
| `list_inventory_product_activity` | List activity messages for an inventory product resolved by product ID or exact name. This is read-only audit/activity history, newest first. |
| `list_inventory_categories` | List inventory categories sorted by name. Omit parentCategory to search all categories, or pass a parent category ID/exact name/root to list direct children. query filters names case-insensitively. |
| `get_inventory_category` | Get one inventory category by ID or exact name. If the name is duplicated under different parents, pass parentCategory or use the category ID. |
| `create_inventory_category` | Create an inventory category. Defaults parentCategory to the Inventory root. Rejects duplicate category names under the same parent. |
| `update_inventory_category` | Rename and/or move an inventory category. category accepts ID or exact name; pass parentCategory when a name may be duplicated. Rejects duplicate names in the destination parent and self/descendant moves. |
| `delete_inventory_category` | Delete an empty inventory category by ID or exact name. Refuses categories that still contain child categories or products; this action does not cascade. |
| `list_inventory_products` | List inventory products sorted by name. Optionally scope to category by ID/exact name and filter product names with query. |
| `get_inventory_product` | Get one inventory product by ID or exact product name. If product names are duplicated, pass category or use the product ID. |
| `create_inventory_product` | Create an inventory product in a category resolved by ID or exact name. Rejects duplicate product names in the same category. |
| `update_inventory_product` | Rename and/or move an inventory product. product accepts ID or exact name; pass category when a name may be duplicated. Rejects duplicate names in the destination category. |
| `delete_inventory_product` | Delete an inventory product by ID or exact name. Refuses products with variants, photos, attachments, or comments; this action does not cascade. |
| `list_inventory_variants` | List inventory variants/SKUs sorted by name. Optionally scope to product by ID/exact name; category can disambiguate product names. query filters variant names and SKUs. |
| `get_inventory_variant` | Get one inventory variant by ID, exact variant name, or exact SKU. If the name/SKU is duplicated, pass product or use the variant ID. |
| `create_inventory_variant` | Create an inventory variant/SKU under a product resolved by ID or exact name. Rejects duplicate variant names or SKUs in the same product. |
| `update_inventory_variant` | Rename and/or change the SKU of an inventory variant. variant accepts ID, exact name, or exact SKU; pass product when needed. Rejects duplicate names or SKUs in the same product. |
| `delete_inventory_variant` | Delete one inventory variant/SKU by ID, exact variant name, or exact SKU. This action does not delete its product. |

### Labels

| Tool | Description |
|------|-------------|
| `list_labels` | List label/tag definitions in the workspace. Labels are global (not project-scoped). Returns labels for tracker issues sorted by modification date (newest first). |
| `create_label` | Create a new label/tag definition in the workspace. Labels are global and can be attached to any issue. Returns existing label if one with the same title already exists (created=false). Use add_issue_label to attach a label to a specific issue. |
| `update_label` | Update a label/tag definition. Accepts label ID or title. Only provided fields are modified. |
| `delete_label` | Permanently delete a label/tag definition. Accepts label ID or title. This action cannot be undone. |

### Leads

| Tool | Description |
|------|-------------|
| `list_funnels` | List all Huly sales funnels (lead pipelines). Returns each funnel's stable ID and display name, sorted by name. Supports filtering by archived status. |
| `list_leads` | Query Huly leads in a funnel with optional filters. Pass the funnel ID returned by list_funnels, or a funnel name for convenience lookup. Returns leads sorted by modification date (newest first). Supports filtering by status, assignee, and title search. |
| `get_lead` | Retrieve full details for a Huly lead including markdown description, customer name, funnel ID and funnel name, and status. Lead identifiers follow the upstream Huly format like 'LEAD-1'. |

### Templates

| Tool | Description |
|------|-------------|
| `list_message_template_categories` | List global Huly message template categories. Categories group reusable message templates across the workspace. Returns category IDs, names, descriptions, archived/private flags, and timestamps. |
| `list_message_templates` | List global Huly message templates. Optionally filter by category ID or exact category name, and search template titles by substring. Returns each template ID, title, category summary, timestamps, and placeholderFieldIds parsed from dollar-brace tokens. Match placeholderFieldIds to list_message_template_fields.id for labels and resource IDs. |
| `get_message_template` | Retrieve one global Huly message template by template ID or exact title. If a title is ambiguous, pass category as category ID or exact category name. Returns the full message converted to Markdown plus placeholderFieldIds parsed from dollar-brace tokens. Match placeholderFieldIds to list_message_template_fields.id for labels and resource IDs. |
| `render_message_template` | Render one global Huly message template by template ID or exact title. Substitutes only caller-provided values for matching dollar-brace placeholder field IDs from placeholderFieldIds; does not execute Huly TemplateField provider resources. Unresolved placeholders remain in renderedMessage and are reported in unresolvedFieldIds. |
| `list_message_template_fields` | List Huly message template fields/placeholders without executing provider resources or rendering templates. Optionally filter by field category ID or exact raw label string, and search raw field labels by substring. Returns field IDs, labels, category summaries, and provider resource IDs. |

### Planner

| Tool | Description |
|------|-------------|
| `list_todos` | List Huly Planner ToDos. Empty input returns up to 50 ToDos in planner order with all completion states. Use owner, issue, title, due date, priority, visibility, or completion filters to narrow results. |
| `get_todo` | Get one Planner ToDo by raw todoId or by human locator such as issue + title + owner. Returns stable ToDo fields, owner, attachment context, description, labels count, and work slot count. |
| `create_todo` | Create a Planner ToDo. Omit attachedTo for a personal ToDo, or pass attachedTo.type=issue with project and identifier for an issue action item. Omit owner to use the authenticated user. |
| `update_todo` | Update a Planner ToDo by human locator or raw todoId. Supports title, markdown description, owner, dueDate including null to clear, priority, and visibility. |
| `complete_todo` | Complete a Planner ToDo by setting doneOn. Huly may trim future work slots and run issue automation when the ToDo is attached to an issue. |
| `reopen_todo` | Reopen a completed Planner ToDo by clearing doneOn. Human locators search completed ToDos by default; raw todoId locators target that exact ToDo. |
| `delete_todo` | Delete a Planner ToDo. This is destructive; deleting the last open issue ToDo can cause Huly classic issue status automation. |
| `schedule_todo` | Schedule a Planner ToDo by raw todoId or human locator, creating a work slot with ToDo title, description, and visibility metadata. |
| `unschedule_todo` | Remove ToDo work slots. Pass either workSlotId to remove one slot, locator with scope=all, or locator with scope=future and optional from. |

### Preferences

| Tool | Description |
|------|-------------|
| `list_space_preferences` | List low-level Huly SpacePreference records. These generic preference rows are attached to spaces and the published SDK exposes only the attached space link, so this tool is read-only discovery. Omit space to list recent rows across spaces, or pass a space _id/exact name with optional class/type narrowing to inspect one space. |
| `get_space_preference` | Read the low-level Huly SpacePreference record attached to one space. Accepts a space _id or exact name with optional class/type narrowing. Returns present=false when the space exists but no generic SpacePreference row exists; use module-specific preference tools for writable preference payloads. |

### Processes

| Tool | Description |
|------|-------------|
| `list_processes` | List read-only Huly Process workflow definitions. Optionally filter by the master tag/card type that workflows attach to. Returns process IDs, names, attached card type, automation flags, and state/transition counts. |
| `get_process` | Get one Huly Process workflow definition by process ID or exact display name. If a name is ambiguous, the tool returns a typed error with candidate IDs instead of guessing. |
| `list_process_executions` | List read-only Huly Process workflow executions. Supports filters by process ID/name, card/document ID/title, and status. Rows are enriched with process name, card title, and current state title when available. |
| `start_process` | Start a new active Huly Process workflow execution on a card/document. Accepts process ID or exact process name, and card/document ID or exact title; ambiguous names or titles fail with candidate IDs. This is not idempotent: each successful call creates a new execution unless the process forbids parallel active executions for the same card, in which case the existing active execution ID is returned in a typed error. |
| `cancel_execution` | Idempotently cancel one Huly Process execution by execution ID. Active executions are marked cancelled; already-cancelled executions succeed with cancelled=false; completed executions fail without changing history. |

### Recruiting

| Tool | Description |
|------|-------------|
| `list_recruiting_applicant_matches` | List read-only generated Recruiting applicant matches. ApplicantMatch fields are generated by Huly; this tool only reads them. Filter by candidate, complete state, vacancy/summary query, and limit. |
| `get_recruiting_applicant_match` | Get one read-only generated Recruiting applicant match by raw applicant-match _id. Returns candidate, complete state, generated vacancy text, summary, response markdown, and timestamps. |
| `list_recruiting_reviews` | List Recruiting reviews/interviews as stable refs. Filter by candidate, application, date range, title/verdict/location query, and limit. Review locators use raw _id, RVE-<number>, number, or exact title. |
| `get_recruiting_review` | Get one Recruiting review by raw _id, RVE-<number>, bare number, or exact title. Optional candidate/application disambiguate. Returns schedule, markdown description, verdict, participant refs, company, application, and opinion count. |
| `create_recruiting_review` | Create a Recruiting review/interview like the Huly UI: increments RVE sequence, attaches to the candidate reviews collection, stores markdown description as Huly markup, defaults dueDate to 30 minutes after date, and recruit-enables the person if needed. |
| `update_recruiting_review` | Update a Recruiting review. review accepts raw _id, RVE-<number>, number, or exact title; candidate/applicationContext only disambiguate. Pass null for description, verdict, application, company, or location to clear. |
| `delete_recruiting_review` | Delete a Recruiting review with Huly removeCollection. review accepts raw _id, RVE-<number>, number, or exact title; candidate/application can disambiguate. |
| `list_recruiting_opinions` | List Recruiting opinions for one review. review accepts raw _id, RVE-<number>, bare number, or exact title. Opinion refs include OPE-<number>, parent review ref, and opinion value. |
| `get_recruiting_opinion` | Get one Recruiting opinion by raw _id, OPE-<number>, or bare number. Pass review to disambiguate. Returns value, markdown description, comments/attachments counts, parent review ref, and timestamps. |
| `create_recruiting_opinion` | Create a Recruiting opinion on one review. Increments the OPE sequence, attaches to the review opinions collection, and stores markdown description as Huly markup. |
| `update_recruiting_opinion` | Update a Recruiting opinion value and/or markdown description. opinion accepts raw _id, OPE-<number>, or number; review can disambiguate. Pass null for description to clear it. |
| `delete_recruiting_opinion` | Delete a Recruiting opinion with Huly removeCollection. opinion accepts raw _id, OPE-<number>, or number; review can disambiguate. |
| `list_recruiting_comments` | List comments attached directly to a Recruiting vacancy, candidate, applicant, review, or opinion target. The target locator resolves friendly Recruiting identifiers and returns the resolved target ref. |
| `add_recruiting_comment` | Add a Markdown comment directly to a Recruiting vacancy, candidate, applicant, review, or opinion target resolved by the shared target locator. |
| `update_recruiting_comment` | Update one comment attached directly to a Recruiting vacancy, candidate, applicant, review, or opinion. The commentId must belong to the resolved target. |
| `delete_recruiting_comment` | Delete one comment attached directly to a Recruiting vacancy, candidate, applicant, review, or opinion. The commentId must belong to the resolved target. |
| `list_recruiting_attachments` | List files attached directly to a Recruiting vacancy, candidate, applicant, or opinion target. Review attachments are intentionally unsupported unless the model exposes that collection. |
| `get_recruiting_attachment` | Get one file attached directly to a Recruiting vacancy, candidate, applicant, or opinion. The attachmentId must belong to the resolved target. |
| `add_recruiting_attachment` | Attach a file to a Recruiting vacancy, candidate, applicant, or opinion target. Provide exactly one of filePath, fileUrl, or data, plus filename and contentType. |
| `update_recruiting_attachment` | Update description and/or pinned state for a file attached directly to a Recruiting vacancy, candidate, applicant, or opinion. The attachmentId must belong to the resolved target. |
| `delete_recruiting_attachment` | Delete one file attached directly to a Recruiting vacancy, candidate, applicant, or opinion. The attachmentId must belong to the resolved target. |
| `list_recruiting_activity` | List read-only activity messages for a Recruiting vacancy, candidate, applicant, or review target resolved by friendly Recruiting identifiers. Opinions are intentionally unsupported. |
| `list_recruiting_related_issues` | List tracker issues whose Huly Related Issues entries (`Issue.relations`) point at a Recruiting vacancy, candidate, or applicant target. |
| `add_recruiting_related_issue` | Idempotently add a Huly Related Issues entry (`Issue.relations`) from a tracker issue to a Recruiting vacancy, candidate, or applicant target. |
| `remove_recruiting_related_issue` | Idempotently remove a Huly Related Issues entry (`Issue.relations`) from a tracker issue to a Recruiting vacancy, candidate, or applicant target. |
| `list_recruiting_vacancy_types` | List Huly Recruiting vacancy workflow types. Use the returned type ID or exact type name in create_recruiting_vacancy. Defaults vacancy creation to Huly's Default vacancy type when omitted. |
| `list_recruiting_vacancy_statuses` | List applicant workflow statuses for one vacancy. vacancy accepts raw _id, VCN-<number>, bare number, or exact name. Statuses are read from the vacancy's ProjectType; they are workspace data, not hardcoded names. |
| `list_recruiting_vacancies` | List Recruiting vacancies as stable refs. Supports includeArchived, name query, type ID/name, company organization ID/name, and limit. Vacancy refs include both raw id and derived VCN-<number> identifier. |
| `get_recruiting_vacancy` | Get one Recruiting vacancy by raw _id, VCN-<number>, bare number, or exact name. Returns descriptions, type, company, location, due date, privacy, archive state, and existing counts. |
| `create_recruiting_vacancy` | Create a Recruiting vacancy like the Huly UI: increments the vacancy sequence, stores fullDescription as markdown-backed collaborative markup, defaults members/owners to the current account, and creates vacancy type-data mixin {}. |
| `update_recruiting_vacancy` | Update mutable Recruiting vacancy fields. vacancy accepts raw _id, VCN-<number>, bare number, or exact name. Provide at least one field. Pass null for fullDescription, company, location, or dueTo to clear. |
| `archive_recruiting_vacancy` | Archive a Recruiting vacancy by raw _id, VCN-<number>, bare number, or exact name. |
| `unarchive_recruiting_vacancy` | Unarchive a Recruiting vacancy by raw _id, VCN-<number>, bare number, or exact name. |
| `list_recruiting_candidates` | List persons that already have the Recruiting Candidate mixin. Use set_recruiting_candidate_profile, add_recruiting_candidate_skill, or create_recruiting_applicant to recruit-enable an existing person. |
| `get_recruiting_candidate` | Get one Recruiting candidate by person _id, email, or exact display name. Returns profile fields, skills, application/review counts, and primary email when available. |
| `set_recruiting_candidate_profile` | Create or update the Recruiting Candidate profile mixin on an existing person. candidate accepts person _id, email, or exact display name. Provide at least one of title, source, onsite, remote. |
| `list_recruiting_skills` | List Recruiting skill tag definitions. Skills are Huly tags scoped to targetClass recruit:mixin:Candidate; use returned titles or IDs with candidate skill tools. |
| `list_recruiting_candidate_skills` | List skill tag references attached to one Recruiting candidate by person _id, email, or exact name. |
| `add_recruiting_candidate_skill` | Attach a skill to a candidate. candidate accepts person _id, email, or exact name. skill accepts title or tag ID; missing skill titles are created. Optional category/color apply only to newly created skill tags. |
| `remove_recruiting_candidate_skill` | Detach a Recruiting skill from a candidate by skill title or tag ID. Idempotent when the skill is absent. |
| `list_recruiting_applicants` | List Recruiting applicants. Optionally filter by vacancy, candidate, and status. vacancy accepts raw _id/VCN-number/number/name; candidate accepts person _id/email/exact name. |
| `get_recruiting_applicant` | Get one Recruiting applicant by raw _id, APP-<number>, or bare number. Pass vacancy and/or candidate when an APP number could be ambiguous. |
| `create_recruiting_applicant` | Create an applicant linking one vacancy and candidate. Rejects duplicate vacancy/candidate pairs, increments APP sequence, resolves status from that vacancy workflow, and recruit-enables the person if needed. |
| `update_recruiting_applicant` | Update applicant status, assignee, startDate, and/or dueDate. applicant accepts raw _id, APP-<number>, or number; vacancy/candidate only disambiguate. Pass null to clear assignee, startDate, or dueDate. |
| `delete_recruiting_applicant` | Delete an applicant with Huly removeCollection. applicant accepts raw _id, APP-<number>, or number; vacancy/candidate can disambiguate APP numbers. |

### Sdk-Discovery

| Tool | Description |
|------|-------------|
| `list_huly_classes` | Discover Huly model class, interface, and mixin IDs visible in this workspace. Use this before raw-object, generic association, custom field, or model-backed work when you need exact class IDs instead of guessing. |
| `get_huly_class` | Read one Huly class/interface/mixin by exact ID and return its inheritance chain plus model attributes. Use this when you need fields, ref targets, enum IDs, or hints about purpose-built MCP tool categories for the class. |
| `list_huly_attributes` | Discover Huly model attributes across the workspace or directly on one class/mixin. Returns attribute IDs, owner classes, labels, type families, ref targets, enum IDs, and custom-field markers. |
| `list_huly_enums` | Discover Huly enum model documents and their valid values. Use enum IDs from get_huly_class or list_huly_attributes to inspect allowed enum values before writing or interpreting enum fields. |
| `list_huly_plugin_configurations` | List read-only Huly plugin configuration records from core.class.PluginConfiguration. Returns plugin id, label, enabled/beta flags, and transaction count so an LLM can see installed model plugin gates without mutating configuration. |
| `list_huly_domain_index_configurations` | List read-only Huly domain index configuration records from core.class.DomainIndexConfiguration. Returns each domain plus disabled, skip, and enabled-index summaries while preserving SDK-open index/filter/config payloads as typed metadata. |
| `list_huly_sequences` | List read-only Huly sequence counters from core.class.Sequence and core.class.CustomSequence. Returns sequence id, attached class id, current non-negative integer value, and custom prefix when present. |
| `describe_huly_space_type_capabilities` | Describe one Huly SpaceType by id or exact name in a single read-only call. Returns descriptor metadata, base/target classes, roles, role permissions, default members, autoJoin, and the stored role-assignment shape. |

### Spaces

| Tool | Description |
|------|-------------|
| `list_spaces` | List generic Huly spaces across modules. When includeArchived is omitted, includeArchived=undefined. Returns raw space id, class, type, privacy, archived, autoJoin, member count, and owner count so module-specific tools can reuse the result. |
| `get_space` | Get one generic Huly space by raw space _id or exact space name. Resolution tries _id first, then exact name. If a name matches multiple spaces, pass class and/or type to narrow; ambiguous errors include matching ids/classes/types. |
| `list_space_types` | List configured Huly SpaceType records. Returns descriptor id, base class, target class, default members, autoJoin, and role count for discovering typed-space configuration. |
| `get_space_type` | Get one Huly SpaceType by raw SpaceType _id or exact name, including descriptor metadata, role definitions, role permission ids/labels, and available permissions. |
| `list_space_permissions` | List core Huly Permission records for space/workspace access control discovery. Filter by scope, objectClass, or search text. This is read-only and does not assign permissions. |
| `update_space` | Update safe common metadata on an existing Huly space: name, description, private, archived, and autoJoin. Does not create/delete spaces or mutate module-specific required fields. |
| `add_space_members` | Idempotently add members to an existing Huly space. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full members array. |
| `remove_space_members` | Idempotently remove members from an existing Huly space. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full members array. |
| `set_space_owners` | Replace owners on an existing Huly space. Owners accept account UUID, exact email, or exact person display name. By default, owners are also ensured in members. |
| `set_space_role_members` | Replace members assigned to one role on a typed Huly space while preserving all other role assignments. Role accepts a raw role _id or exact role name from the space's SpaceType. Members accept account UUID, exact email, or exact person display name; pass members=[] to clear this role. |
| `add_space_role_members` | Idempotently add members to one role on a typed Huly space while preserving all other role assignments. Role accepts a raw role _id or exact role name from the space's SpaceType. Members accept account UUID, exact email, or exact person display name. |
| `remove_space_role_members` | Idempotently remove members from one role on a typed Huly space while preserving all other role assignments. Role accepts a raw role _id or exact role name from the space's SpaceType. Members accept account UUID, exact email, or exact person display name. |

### Tag-Categories

| Tool | Description |
|------|-------------|
| `list_tag_categories` | List tag/label categories in the workspace. Categories group labels (e.g., 'Priority Labels', 'Type Labels'). Omit targetClass to include all classes. |
| `create_tag_category` | Create a new tag/label category. Idempotent: returns existing category if one with the same label and targetClass already exists (created=false). Defaults targetClass to tracker issues. |
| `update_tag_category` | Update a tag/label category. Accepts category ID or label name. Only provided fields are modified. |
| `delete_tag_category` | Permanently delete a tag/label category. Accepts category ID or label name. Labels in this category will be orphaned (not deleted). This action cannot be undone. |

### Tags

| Tool | Description |
|------|-------------|
| `list_tags` | List generic Huly tag definitions for one SDK target class. Use this for SDK-level tags such as recruiting skills or document labels. For Tracker issue labels, prefer list_labels. |
| `create_tag` | Create a generic Huly tag definition for one targetClass. Idempotent by targetClass + title. This exposes the SDK tags model; for Tracker issue labels, prefer create_label. |
| `update_tag` | Update a generic Huly tag definition. The tag argument accepts a tag ID or exact title, resolved within targetClass. |
| `delete_tag` | Delete a generic Huly tag definition by ID or exact title, resolved within targetClass. This deletes the tag definition, not only one object's tag reference. |
| `list_attached_tags` | List generic Huly TagReference rows attached to one raw object collection. Requires objectId, objectClass, space, and collection because this is an SDK-level tool. |
| `attach_tag` | Attach a generic Huly tag to one raw object collection. Requires targetClass for the tag definition and objectId/objectClass/space/collection for the TagReference. Idempotent for the same object, collection, and tag. |
| `detach_tag` | Detach a generic Huly tag from one raw object collection. Requires targetClass and objectId/objectClass/space/collection. Returns detached=false when the tag is not attached. |

### Task-Management

| Tool | Description |
|------|-------------|
| `list_project_types` | List Huly tracker project types/workflow templates. Returns ID, display name, descriptor, task type count, status count, and whether the type appears to be the default Classic tracker type. |
| `get_project_type` | Inspect one Huly tracker project type in a single call. Accepts projectType as ID or display name; when omitted, uses the unambiguous Classic tracker type. Returns task types, statuses, categories, and task-type-to-status mappings. |
| `list_task_types` | List Huly issue/task types. Optionally filter by projectType ID or display name. Returns task type identity, parent project type, kind, issue class, and available status count. |
| `create_task_type` | Add a Huly issue/task type to a project type idempotently by normalized name. Copies required workflow configuration from an existing template task type unless templateTaskType is supplied. Returns created, IDs, affected task type IDs, and a workspace-level workflow warning. |
| `create_issue_status` | Add a Huly issue workflow status idempotently by normalized name within a project type and task type scope. Accepts category as a Huly SDK task.statusCategory key: UnStarted, ToDo, Active, Won, Lost; taskType may be ID or display name, and omission applies the status to every task type in the project type. |

### Test-Management

| Tool | Description |
|------|-------------|
| `list_test_projects` | List test management projects. Returns test projects sorted by name. These are separate from tracker projects. |
| `list_test_suites` | List test suites in a test project. Accepts project ID or name. Optional parent filter for nested suites. |
| `get_test_suite` | Get a single test suite by ID or name within a test project. Returns suite details and test case count. |
| `create_test_suite` | Create a test suite in a test project. Idempotent: returns existing suite if one with the same name exists (created=false). Optional parent for nesting. |
| `update_test_suite` | Update a test suite. Accepts suite ID or name. Only provided fields are modified. |
| `delete_test_suite` | Permanently delete a test suite. Accepts suite ID or name. This action cannot be undone. |
| `list_test_cases` | List test cases in a test project. Optional filters: suite (ID or name), assignee (name or email). |
| `get_test_case` | Get a single test case by ID or name within a test project. |
| `create_test_case` | Create a test case attached to a suite. Requires project and suite. Defaults: type=functional, priority=medium, status=draft. |
| `update_test_case` | Update a test case. Accepts test case ID or name. Only provided fields are modified. Set assignee to null to unassign. |
| `delete_test_case` | Permanently delete a test case. Accepts test case ID or name. This action cannot be undone. |
| `list_test_plans` | List test plans in a test management project. Returns plan names and IDs. Requires project ID or name. |
| `get_test_plan` | Get test plan details including its items (test cases). Accepts plan ID or name within a project. |
| `create_test_plan` | Create a test plan in a project. Idempotent: returns existing plan if one with the same name exists (created=false). |
| `update_test_plan` | Update a test plan's name or description. Only provided fields are modified. Pass description=null to clear. |
| `delete_test_plan` | Permanently delete a test plan. This does not delete associated test runs. Cannot be undone. |
| `add_test_plan_item` | Add a test case to a test plan. Resolves test case by ID or name. Optionally assign a person by email or name. |
| `remove_test_plan_item` | Remove a test case from a test plan by item ID. Get item IDs from get_test_plan. |
| `list_test_runs` | List test runs in a test management project. Returns run names, IDs, and due dates. |
| `get_test_run` | Get test run details including all results. Accepts run ID or name within a project. |
| `create_test_run` | Create a test run in a project. For bulk creation from a plan, use run_test_plan instead. |
| `update_test_run` | Update a test run's name, description, or due date. Only provided fields are modified. Pass null to clear optional fields. |
| `delete_test_run` | Permanently delete a test run. This does not delete associated test results. Cannot be undone. |
| `list_test_results` | List test results in a test run. Returns result names, statuses, and assignees. |
| `get_test_result` | Get test result details. Accepts result ID or name. |
| `create_test_result` | Create a test result in a run. Resolves test case by ID or name. Status defaults to 'untested'. |
| `update_test_result` | Update a test result's status, assignee, or description. Status values: untested, blocked, passed, failed. |
| `delete_test_result` | Permanently delete a test result. Cannot be undone. |
| `run_test_plan` | Execute a test plan: creates a test run and one test result per plan item. Returns the run ID and count of results created. Optionally name the run and set a due date. |

### User-Statuses

| Tool | Description |
|------|-------------|
| `list_user_statuses` | List Huly user presence records. Returns account UUIDs, online status, and last modified timestamp. Use this to check who is currently connected; presence is maintained by Huly server sessions. Filter by online or account UUID. |

### Views

| Tool | Description |
|------|-------------|
| `list_filtered_views` | List saved filtered views from @hcengineering/view. Use attachedTo to scope by raw app/resource string such as board:app:Board; omit attachedTo to discover saved views across modules. Reports own/shared visibility from the current account's users membership. |
| `get_filtered_view` | Get one saved filtered view by FilteredView _id or exact name. Pass attachedTo, such as board:app:Board, when an exact name may exist in more than one module. Read-only; no saved-view writes are performed. |
| `list_viewlets` | List viewlets from @hcengineering/view model metadata. Use attachTo with a Huly class id such as board:class:Card to scope by rendered document class; use list_huly_classes when you need class ids. The optional viewlet locator accepts a Viewlet _id, exact title, exact variant, or descriptor _id; descriptor ids may return multiple viewlets. Includes descriptor metadata and matching ViewletPreference configs. |

### Virtual-Office

| Tool | Description |
|------|-------------|
| `list_office_floors` | List virtual office floors. |
| `get_office_floor` | Get one virtual office floor by floorId. |
| `list_office_rooms` | List virtual office rooms, including access mode, type, floor, floor-plan position/size, language, and recording/transcription defaults. |
| `get_office_room` | Get one virtual office room by roomId, including description when readable. |
| `list_offices` | List personal office rooms and their assigned people when readable. |
| `get_office` | Get one personal office room by roomId, including assigned person and description when readable. |
| `list_active_room_info` | List transient active room occupancy summaries. |
| `list_active_room_participants` | List transient active virtual-office participants and positions, optionally filtered by roomId. |
| `list_meeting_minutes` | List meeting notes/transcript records (minutes) by optional attachment target and created-on range. |
| `get_meeting_minutes` | Get one meeting notes/transcript record (minutes) by meetingMinutesId, including description when readable. |
| `list_device_preferences` | List readable virtual-office media device preferences. |
| `list_office_defaults` | List room-level language, default recording, and default transcription settings. |

<!-- tools:end -->

## Troubleshooting

### Passwords with special characters

If your Huly password contains characters like `*`, `%`, `!`, or `#`, passing it via CLI environment flags such as `-e` or `--env` may fail because the shell interprets these characters before they reach the process.

**Solution**: Edit your MCP config file directly instead of passing the password through the shell:

- Codex: `~/.codex/config.toml`
- Claude Code: `~/.claude.json` (user scope) or `.mcp.json` (project scope)
- Claude Desktop: `claude_desktop_config.json` in the location listed in the installation section
- VS Code and Cursor: use the client config location from the installation section; avoid committing workspace files that contain real credentials
- Windsurf: edit your Windsurf MCP configuration file directly
- OpenCode: `~/.config/opencode/opencode.json`

For Claude JSON config, the shell-sensitive characters above can be written directly. JSON-reserved characters such as `"` and `\` still need normal JSON escaping:

```json
{
  "mcpServers": {
    "huly": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@firfi/huly-mcp@latest"],
      "env": {
        "HULY_URL": "https://your-huly-instance.com",
        "HULY_EMAIL": "you@example.com",
        "HULY_PASSWORD": "p@ss*w0rd!#%",
        "HULY_WORKSPACE": "your-workspace"
      }
    }
  }
}
```

Alternatively, use `HULY_TOKEN` instead of email/password to bypass password auth entirely (see [Environment Variables](#environment-variables)).

### MCP client shows "Failed to reconnect"

After changing MCP configuration, some clients (including Claude Code) require a full restart — not just a reconnect. Exit the application completely and reopen it.

You can verify the connection works independently with:
```bash
claude mcp list  # Should show "Connected"
```

### Self-hosted Huly: account locked after failed login attempts

Huly locks password login after 5 failed API authentication attempts. This commonly happens during initial setup when the password is misconfigured. The lock persists in the database across service restarts.

**Symptoms**: `PasswordLoginLocked` error from the MCP server, and the Huly web UI shows "Password login is locked due to too many failed attempts. Please use an OTP login method to unlock your account." (OTP won't work without SMTP configured.)

**Fix** — reset the lock counter in CockroachDB:

```bash
# Find your account UUID and check lock status
docker exec -e PGPASSWORD=<your_cockroach_password> <cockroach_container> \
  cockroach sql --host=localhost --user=<db_user> --database=defaultdb --insecure \
  -e "SELECT uuid, failed_login_attempts FROM global_account.account;"

# Reset the counter
docker exec -e PGPASSWORD=<your_cockroach_password> <cockroach_container> \
  cockroach sql --host=localhost --user=<db_user> --database=defaultdb --insecure \
  -e "UPDATE global_account.account SET failed_login_attempts = 0 WHERE uuid = '<your_account_uuid>';"
```

The CockroachDB credentials can be found in your Huly `compose.yml` or via `docker exec <cockroach_container> env | grep COCKROACH`.

### Windows-specific notes

- **Bash wrapper scripts** (sourcing `.env` files) may not work reliably when launched by MCP clients on Windows. Prefer setting env vars directly in the MCP config JSON.
- **Docker pulls over SSH** may fail on Windows due to credential manager issues. Pull images from the server desktop if needed.
