# Integration Testing Guide

## Prerequisites

```bash
pnpm build
```

## Environment Variables

```bash
# Local Docker Huly (preferred):
set -a && source .env.local && set +a

# Remote Huly (only when explicitly needed):
# set -a && source .env.production && set +a

# Required: HULY_URL, HULY_WORKSPACE, and either HULY_TOKEN or (HULY_EMAIL + HULY_PASSWORD)
```

## Quick Smoke Test

```bash
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}
' | MCP_AUTO_EXIT=true node dist/index.cjs 2>&1 | grep '"id":2'
```

Expected: JSON with `"projects": [...]`

**Note**: `MCP_AUTO_EXIT=true` makes the server exit when stdin closes (testing only).

## Full Integration Test Suite

**Coverage**: 106 tool calls across 18 domains. Self-cleaning: all created entities are deleted at the end of each section. Tools that would leak data (no delete counterpart) are skipped. Run time: ~3 minutes.

**Last verified**: 2026-03-04 — 106 passed, 0 failed, 32 skipped (of 138 total).

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
| 1. Projects | list, get, list_statuses | create/update/delete skipped (pollutes workspace) |
| 2. Issues | create, get, list, update, delete, sub-issues, move, relations (add/list/remove), labels (add/remove), comments (add/list/update/delete), activity, time tracking (log/report/detailed), preview_deletion | Full lifecycle with all issue-related operations |
| 3. Components | create, list, get, update, delete, set_issue_component | CRUD + assignment |
| 4. Milestones | create, list, get, update, delete, set_issue_milestone | CRUD + assignment |
| 5. Templates | create, list, get, update, delete, add_template_child, remove_template_child, create_issue_from_template | Full lifecycle including children |
| 6. Labels & Tags | create/list/update/delete tag_category, create/list/update/delete label | Full CRUD for both |
| 7. Documents | list_teamspaces, create/list/get/update/delete document, list_inline_comments | Full CRUD + inline comments |
| 8. Teamspaces | create, get, update, delete | Full CRUD |
| 9. Channels | list, get, messages, DMs, create channel, send_message, thread replies (add/list/update/delete), reactions (add/list/remove), save/unsave, update/delete channel | All messaging in temp channel (deleted at end) |
| 10. Contacts | list_persons, list_employees, list_organizations, get_user_profile, create/update/delete person | CRUD (create_organization skipped — no delete tool) |
| 11. Calendar | list events/work_slots/time_reports/recurring, create/get/update/delete event, start/stop timer | Lifecycle (create_recurring_event skipped — no delete tool) |
| 12. Notifications | list, count, contexts, settings, get, mark_read | Read operations (+ mutation if notifications exist) |
| 13. Search | fulltext_search | Uses `searchFulltext` API |
| 14. Cards | list_card_spaces, list_master_tags, list_cards | Read operations with cardSpace |
| 15. Activity | list_mentions, list_saved_messages | Read operations |
| 16. Workspace | get_workspace_info, list_workspace_members | Read-only (management tools skipped) |
| 17. Attachments | add_issue_attachment, list/get/pin/update/download/delete attachment | Full CRUD (upload_file standalone skipped — no blob delete) |
| 18. Test Management | Full suite/case/plan/run/result lifecycle | Requires TM project in Huly UI |

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

**Conditionally skipped (up to 14):**
- **Notification mutations** (7-9): Skipped based on whether notifications exist at test time
- **Event get/update/delete** (3): Skipped if create_event returns no eventId
- **Documents** (1): Skipped if no teamspace found
- **test_management** (1): Skipped if no TM project exists in workspace

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
