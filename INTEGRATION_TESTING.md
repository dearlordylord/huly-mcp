# Integration Testing Guide

## Prerequisites

```bash
pnpm build
```

## Local Docker Setup Notes (OrbStack)

The `.huly-local/docker-compose.override.yml` applies two fixes required on OrbStack:

**nginx port 80**: `/etc/hosts` maps `nginx → 127.0.0.1`. Huly's `config.json` returns `http://nginx/_accounts` (internal Docker hostname) as `ACCOUNTS_URL`. Without port 80 exposed, `http://nginx` from the host hits `127.0.0.1:80` → connection refused. The override adds `"80:80"`.

**redpanda tmpfs + mem_limit**: OrbStack's VM uses btrfs. Redpanda sets `abort_on_allocation_failure=true` and without a cgroup memory limit it sees the full ~15GB VM RAM, hits OOM at startup, and dies silently (exit 137). The override caps it at 1g and uses tmpfs to avoid the btrfs path.

`HOST_ADDRESS=nginx` in `huly_v7.conf` is intentional — Docker-internal services construct URLs from it (`ACCOUNTS_URL=http://nginx/_accounts`). Do not change it to `localhost:8087`; that breaks internal container-to-container routing.

## Environment Variables

```bash
# Local Docker Huly (preferred):
set -a && source .env.local && set +a

# Remote Huly (only when explicitly needed):
# set -a && source .env.production && set +a

# Required: HULY_URL, HULY_WORKSPACE, and either HULY_TOKEN or (HULY_EMAIL + HULY_PASSWORD)

# Optional for DM message integration:
# HULY_TEST_DM_ID=<existing direct-message conversation id>
# If unset, the suite uses the first conversation returned by list_direct_messages.
```

## Running from a Container (e.g., Claude Code devcontainer)

When the test environment runs inside a container, `localhost:8087` is unreachable. Huly's `/config.json` also returns internal URLs pointing to `localhost:8087` (`ACCOUNTS_URL`, `COLLABORATOR_URL`, etc.), so simply changing `HULY_URL` isn't enough.

**Fix**: Connect this container to the Huly Docker network and use a CJS preload patch that rewrites `localhost:8087` → `nginx` (the Docker service name) for both `fetch` and `ws` (WebSocket).

### One-time setup

```bash
# From the HOST — find your container and the Huly network, then connect them:
docker network ls | grep huly           # e.g., huly_v7_huly_net
docker ps --format '{{.ID}} {{.Names}}' # find your devcontainer
docker network connect <huly_network> <container_id>
```

### Running tests from the container

```bash
set -a && source .env.local && set +a
NODE_OPTIONS="-r ./scripts/container-patch.cjs" bash scripts/integration_test_full.sh
```

The patch (`scripts/container-patch.cjs`) rewrites `localhost:8087` → `nginx` in all `fetch` and `ws` calls at runtime. `.env.local` stays unchanged — same `HULY_URL=http://localhost:8087` as on the host.

### Running the full suite over HTTP

The same full integration suite can exercise the HTTP MCP transport instead of stdio:

```bash
pnpm build
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" \
  INTEGRATION_TRANSPORT=http \
  bash scripts/integration_test_full.sh
```

By default, this starts `node dist/index.cjs` with `MCP_TRANSPORT=http` and lets the server resolve Huly credentials from process environment variables. This tests HTTP transport parity with local stdio configuration.

To test hosted URL header configuration, provide a Huly API token and run the same suite with credentials sent as request headers:

```bash
pnpm build
set -a && source .env.local && set +a
export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
export HULY_TOKEN=...
INTEGRATION_TRANSPORT=http \
  INTEGRATION_HTTP_CONFIG=headers \
  bash scripts/integration_test_full.sh
```

`INTEGRATION_HTTP_CONFIG=headers` starts the MCP server without `HULY_*` process env vars and sends `x-huly-url`, `x-huly-workspace`, `x-huly-token`, and optional `x-huly-connection-timeout` on each HTTP tool call. Header mode requires `HULY_TOKEN`; email/password headers are intentionally not supported.

## Quick Smoke Test

```bash
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}
' | MCP_AUTO_EXIT=true node dist/index.cjs 2>&1 | grep '"id":2'
```

Expected: JSON with `"projects": [...]`

**Note**: `MCP_AUTO_EXIT=true` makes the server exit when stdin closes (testing only).

## Resource Read Smoke Tests

MCP Resources are read-only JSON context. `resources/list` is intentionally empty in v1; discover templates with `resources/templates/list`.

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' \
'{"jsonrpc":"2.0","method":"resources/templates/list","id":2}' \
'{"jsonrpc":"2.0","method":"resources/list","id":3}' \
'{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"huly://projects/HULY"},"id":4}' \
  | MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep -E '"id":[234]'
```

For HTTP header mode, send the same JSON-RPC methods to `/mcp` with `x-huly-url`, `x-huly-workspace`, and `x-huly-token` headers. Resource reads use the same request-scoped header config as tool calls.

## Full Integration Test Suite

**Coverage**: 120+ tool calls across 21 domains. Self-cleaning: all created entities are deleted at the end of each section. Tools that would leak data (no delete counterpart) are skipped. Run time: ~3 minutes.

**Last verified**: 2026-05-26 — 195 passed, 0 failed, 38 skipped (of 233 total).

### How to Run

```bash
pnpm build
set -a && source .env.local && set +a
bash scripts/integration_test_full.sh
```

The script requires `jq` for JSON parsing.

### What It Tests

The full suite tests CRUD lifecycles with cleanup for all domains:

| Section | Tools Tested | Notes |
|---------|-------------|-------|
| 1r. MCP Resources | resources/templates/list, resources/list, resources/read project, resources/read created issue | Read-only JSON resources over the same stdio or HTTP transport |
| 1. Projects | list, get, list_statuses | create/update/delete skipped (pollutes workspace) |
| 2. Issues | create, get, list, update, delete, sub-issues, move, relations (add/list/remove), labels (add/remove), comments (add/list/update/delete), activity, time tracking (log/report/detailed), preview_deletion | Full lifecycle with all issue-related operations |
| 3. Components | create, list, get, update, delete, set_issue_component | CRUD + assignment |
| 4. Milestones | create, list, get, update, delete, set_issue_milestone | CRUD + assignment |
| 5. Templates | create, list, get, update, delete, add_template_child, remove_template_child, create_issue_from_template | Full lifecycle including children |
| 6. Labels & Tags | create/list/update/delete tag_category, create/list/update/delete label | Full CRUD for both |
| 7. Documents | list_teamspaces, create/list/get/update/delete document, list_inline_comments | Full CRUD + inline comments |
| 8. Teamspaces | create, get, update, delete | Full CRUD |
| 9. Channels | list, get, messages, DMs, DM messages (list/send/update/delete), create channel, send_message, thread replies (add/list/update/delete), reactions (add/list/remove), save/unsave, update/delete channel | Channel messaging in temp channel (deleted at end); DM message test cleans up its own message and requires `HULY_TEST_DM_ID` or at least one existing DM |
| 10. Contacts | list_persons, list_employees, list_organizations, get_user_profile, create/update/delete person | CRUD (create_organization skipped — no delete tool) |
| 11. Calendar | list events/work_slots/time_reports/recurring, create/get/update/delete event, start/stop timer | Lifecycle (create_recurring_event skipped — no delete tool) |
| 12. Notifications | list, count, contexts, settings, get, mark_read | Read operations (+ mutation if notifications exist) |
| 13. Search | fulltext_search | Uses `searchFulltext` API |
| 13b. Generic Associations | list_associations, create_association, delete_association, list_relations, create_relation, delete_relation | Disposable association + relation lifecycle, including idempotency, in-use association delete rejection, public association cleanup, and cardinality violation |
| 14. Cards | list_card_spaces, list_master_tags, list_cards | Read operations with cardSpace |
| 15. Activity | list_mentions, list_saved_messages | Read operations |
| 16. Workspace | get_workspace_info, list_workspace_members | Read-only (management tools skipped) |
| 17. Attachments | add_issue_attachment, list/get/pin/update/download/delete attachment | Full CRUD (upload_file standalone skipped — no blob delete) |
| 18. Test Management | Full suite/case/plan/run/result lifecycle | Requires TM project in Huly UI |
| 19. Processes | list_processes, get_process, list_process_executions, start_process, cancel_execution | Read/write; write checks run only when the workspace has a process with an initial state and a matching safe card fixture, then cancel the created execution |
| 20. User Statuses | list_user_statuses | Read-only presence records; filtered call runs when at least one row exists |

### Intentionally Skipped (22 fixed + up to 14 conditional)

**Always skipped (22):**
- **create/update/delete_project** (3): Would pollute workspace
- **Workspace management** (6): list_workspaces, create/delete_workspace, get_regions, update_member_role, update_guest_settings — dangerous
- **update_user_profile** (1): Would modify test user
- **create_organization** (1): No delete tool — would leak data
- **create_recurring_event, list_event_instances** (2): No delete tool — would leak data
- **upload_file(standalone)** (1): No blob delete tool — would leak data
- **create_work_slot** (1): Requires existing planner task (todoId)
- **get_person** (1): Covered by create+update cycle
- **Cards CRUD** (4): create/get/update/delete_card — requires master tag setup
- **add_attachment, add_document_attachment** (2): Covered by add_issue_attachment

**Conditionally skipped (up to 15):**
- **Notification mutations** (7-9): Skipped based on whether notifications exist at test time
- **Event get/update/delete** (3): Skipped if create_event returns no eventId
- **Documents** (1): Skipped if no teamspace found
- **test_management** (1): Skipped if no TM project exists in workspace
- **list_user_statuses(filtered)** (1): Skipped if no user status rows exist in workspace

### Response Field Reference

Key response fields used by the test script for entity IDs:

| Tool | ID Field |
|------|----------|
| create_issue | `.identifier` (e.g., "HULY-1"), `.issueId` (object ID) |
| create_component/milestone/teamspace/document | `.id` |
| create_issue_template | `.id` |
| add_template_child | `.id` |
| create_event | `.eventId` |
| add_comment | `.commentId` |
| add_issue_attachment | `.attachmentId` |
| run_test_plan | `.runId` |
| create_label | `.id` |
| create_tag_category | `.id` |
| create_person | `.id` |
| send_channel_message | `.id` |
| add_thread_reply | `.id` |

## MCP_AUTO_EXIT and In-Flight Request Draining

`MCP_AUTO_EXIT=true` causes the server to exit when stdin closes. The server **drains in-flight tool calls before shutting down** — i.e., if a tool handler is mid-execution when stdin closes, the server waits (up to 30s) for it to complete and write its response before proceeding with shutdown.

This matters for operations that make HTTP round-trips to Huly's collaborator service (e.g., `edit_document` with content changes calls `updateMarkup`). Without draining, the stdin-close event would race against the HTTP call, and the response would be lost even though the mutation succeeded on the server.

**For script authors**: the standard `printf '%s\n%s\n' | node` pattern works correctly for all tools, including slow ones. No need for `sleep` workarounds.

**Implementation**: `src/mcp/server.ts` — `createMcpServer` tracks in-flight requests with a counter. The `cleanup` handler (stdin close / SIGINT / SIGTERM) calls `drainInflight()` before resuming the shutdown fiber.

## Eventual Consistency

Huly REST API is eventually consistent. Reads immediately after writes may return stale data. The full test suite avoids read-after-write verification within the same entity (each tool call is a separate connection). For manual testing with update-then-read:

```bash
# Update, then wait, then read in separate connections
printf '...update...' | MCP_AUTO_EXIT=true node dist/index.cjs
sleep 2
printf '...get...' | MCP_AUTO_EXIT=true node dist/index.cjs
```

## Individual Tool Test Pattern

```bash
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'

printf '%s\n%s\n' "$INIT" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"TOOL_NAME","arguments":ARGS},"id":2}' \
  | MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'
```

## Checking Results

```bash
# Filter response
... | grep '"id":2'

# Check for errors
... | grep '"isError":true'

# Pretty print
... | grep '"id":2' | jq -r '.result.content[0].text' | jq .
```
