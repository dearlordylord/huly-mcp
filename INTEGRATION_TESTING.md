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

# Employee position lifecycle fixture (required by the full suite):
# HULY_EMPLOYEE_ID=<active Employee/Person id> is preferred; otherwise set
# HULY_EMPLOYEE_EMAIL=<exact email returned by list_employees>. Password-based
# runs may use HULY_EMAIL as the fallback employee email. The suite fails if
# this selector does not resolve to exactly one active employee; it does not skip
# the lifecycle. The original position is restored after set + clear verification.

# Optional for DM message integration:
# HULY_TEST_DM_ID=<existing direct-message conversation id>
# If unset, the suite uses the first conversation returned by list_direct_messages.
```

## Local Workspace Bootstrap Status

The current local fixture is not a complete from-scratch test bootstrap. The
checked-in instructions start Huly and point the suite at an existing
`test-workspace`, but they do not yet create every data condition needed for
zero-skip integration coverage.

Known incomplete fixture:

- The local account service persists employee invitations but its configured mail
  provider can reject delivery. Employee lifecycle coverage accepts only the
  typed `EmployeeInvitationPartialFailureError` for that provider boundary,
  then verifies the persisted Person/SocialIdentity/Employee transitions through
  fresh sessions and deletes the unique disposable Person. This certifies safe
  retry and lifecycle state, but a successful outbound delivery requires a
  configured local mail sink.
- A cleanup-safe kick needs a disposable accepted account with credentials. The
  inverse account operation, `assignWorkspace`, is service-token-only; owner
  credentials cannot restore a kicked member. Do not run kick coverage against
  the owner, actor, or reviewer fixtures until automated invite consumption and
  post-test membership restoration are available.

- A second workspace member is needed to deterministically test notification
  write tools. Huly does not normally create inbox notifications for actions
  performed by the same account that later reads the inbox, so a one-member
  workspace leaves notification mutations skipped.
- Two non-self workspace members are needed to deterministically test
  `create_group_direct_message`, because that tool intentionally requires at
  least two other participants and automatically includes the authenticated
  account.

Manual setup that works for the first non-self member:

1. Open `http://localhost:8087`.
2. Log in as the owner from `.env.local` (`agent@local.dev` in the default local fixture).
3. Use the Huly UI to invite a workspace member.
4. Open the invite link in a private/incognito browser session.
5. Join as:

   ```bash
   HULY_TEST_ACTOR_EMAIL=actor@local.dev
   HULY_TEST_ACTOR_PASSWORD=actor123
   ```

6. Confirm `list_workspace_members` returns both the owner and actor accounts.
7. Create one cross-user notification by acting as `actor@local.dev` in the UI
   (for example, assign/comment/mention the owner on an issue) before expecting
   notification mutation checks to run.

Attempted automation paths on the local self-host image:

- `AccountClient.signUp(...)` can create a standalone local account such as
  `actor@local.dev`.
- `AccountClient.assignWorkspace(...)` with the workspace owner token returns
  `Forbidden`; it appears to require service/admin privileges.
- `AccountClient.createInviteLink(...)` with the workspace owner token returns
  `Forbidden`.
- `AccountClient.createAccessLink(...)` succeeds, but consuming the returned
  token through `signUpJoin`, `joinByToken`, `checkAutoJoin`, or `checkJoin`
  returns `InternalServerError` on the current local image.
- Temporarily enabling `allowGuestSignUp` as the owner does not let the actor
  account join/select the workspace; `selectWorkspace` returns `Forbidden` and
  `checkAutoJoin` returns `InternalServerError`.

Once the actor account is present, set these local-only values in `.env.local`
so future harness changes can seed cross-user notifications directly:

```bash
HULY_TEST_ACTOR_EMAIL=actor@local.dev
HULY_TEST_ACTOR_PASSWORD=actor123
```

Manual setup for the second group-DM participant:

1. While logged in as the owner, invite another workspace member from the same
   Members/Invite UI.
2. Open the invite link in a fresh private/incognito browser session, or fully
   log out of the actor session before accepting it.
3. Join as:

   ```bash
   HULY_TEST_REVIEWER_EMAIL=reviewer@local.dev
   HULY_TEST_REVIEWER_PASSWORD=reviewer123
   ```

4. Confirm the workspace has at least three accepted members:

   ```bash
   set -a && source .env.local && set +a
   printf '%s\n%s\n' \
   '{"jsonrpc":"2.0","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":1}' \
   '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspace_members","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":2}' \
     | HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | grep '"id":2'
   ```

5. Confirm `list_employees` shows the owner plus two non-self employees with
   unique exact names. Email channels are not required for chat integration
   tests; the harness resolves channel members and group-DM participants by
   exact display name when email is absent.

Do not mark the local setup as fully automated until a documented host-side
command or script can create that second workspace member from a clean Huly
deployment.

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

### Tool Scope Matrix

Use the dedicated scope matrix when changing MCP tool discovery, client mode mapping, or `TOOLSETS` / `TOOLS` behavior:

```bash
pnpm build
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" pnpm integration:tool-scope
```

The matrix exercises stdio discovery with multiple representative clients and env permutations: default `auto` proxy exposure for Codex, exact `claude-code` native exposure, explicit `HULY_TOOL_MODE` overrides, `TOOLSETS` / `TOOLS` scoped native pins in non-strict proxy mode, `PROXY_OUTPUT_STRICT=true` allow-listing, and all-invalid active strict scope. It asserts visible and hidden tools through `tools/list`, `get_huly_context`, proxy meta-tools, and representative `tools/call` results.

The full integration suite below exercises direct native Huly tools. `scripts/integration_test_full.sh` therefore exports `HULY_TOOL_MODE=native` when the variable is unset and exits early if it is explicitly set to `auto` or `proxy`. Keep proxy exposure assertions in this dedicated tool-scope matrix.

### Running the full suite over HTTP

The same full integration suite can exercise the HTTP MCP transport instead of stdio:

```bash
pnpm build
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" \
  INTEGRATION_TRANSPORT=http \
  bash scripts/integration_test_full.sh
```

This starts `node dist/index.cjs` with `MCP_TRANSPORT=http` and lets the server resolve Huly credentials from process environment variables. The suite sends the released MCP `2026-07-28` request envelope and required HTTP headers. Both transports also retain SDK-owned MCP `2025-06-18` compatibility, covered by focused transport tests rather than a separate integration-harness mode.

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
printf '{"jsonrpc":"2.0","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":2}
' | HULY_TOOL_MODE=native node dist/index.cjs 2>&1 | grep '"id":2'
```

Expected: JSON with `"projects": [...]`

**Note**: The stdio server exits whenever stdin closes; no lifecycle environment flag is required.

## API-token certification preparation

The opt-in certification harness exercises the built MCP server with an operator-supplied token through both
stdio environment configuration and request-scoped HTTP `x-huly-*` headers. The token must be supplied only
through `HULY_TOKEN`; do not put it in command arguments or redirect raw process output to an artifact.

Build and run the active phase against the currently supported legacy-token flow:

```bash
pnpm build
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" \
  pnpm certify:api-token --phase active
```

Set `HULY_CERT_PROJECT` when the disposable issue should use a project other than `HULY`. The active phase
performs representative core read/create/update, account-service read, attachment upload/download, and
collaborative document create/edit operations. It removes every resource whose identifier was confirmed. Each
confirmed cleanup is attempted once. The summary records one lifecycle for each disposable issue, attachment, and
document: `NotCreated`, `WriteUncertain`, or `Confirmed` with a cleanup outcome of `cleaned`, `uncertain`, or
`failed`. The harness does not guess an identifier or retry a destructive call.

After an operator independently revokes a credential, run the revoked phase with existing, non-secret fixture
identifiers. These fixtures must remain readable before revocation and must not be disposable artifacts from the
active phase, because that phase cleans up its own writes:

```bash
set -a && source .env.local && set +a
export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
export HULY_CERT_ATTACHMENT_ID="<existing attachment id>"
export HULY_CERT_TEAMSPACE="<existing teamspace id or exact name>"
export HULY_CERT_DOCUMENT="<existing document id or exact title>"
pnpm certify:api-token --phase revoked
```

The structured report keeps `core-rest`, `account`, `storage-file`, and `collaborator-markup` outcomes separate.
Revoked-phase statuses are deliberately neutral: `call-succeeded`, `call-failed`, or `uncertain`. A call failure is
not labeled as proof of revocation because validation, fixture, authorization, and service failures may look alike
at this boundary. Captured process output and successful or failed MCP responses are scanned in memory for the
supplied token, retained diagnostics are immediately sanitized, and the summary reports the number of captured
artifacts checked plus whether the secret was detected. A detected secret or uncertain result fails the command
without printing the credential.

**Last verified**: 2026-08-10 — the active legacy-token phase passed all four service surfaces over stdio and
request-scoped HTTP, each transport reported `Confirmed` with `cleanup=cleaned` for its issue, attachment, and
document, and all 77 captured artifacts were checked with `secretDetected=false`.

This harness certifies only that the preparation works with the legacy-token flow. Personal API-token
compatibility remains **uncertified** until #205–#208 are completed against a published Huly Platform release
containing PR #10624. The harness does not mint, decode, revoke, print, or persist tokens.

## Resource Read Smoke Tests

MCP Resources are read-only JSON context. `resources/list` is intentionally empty in v1; discover templates with `resources/templates/list`.

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":1}' \
'{"jsonrpc":"2.0","method":"resources/templates/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":2}' \
'{"jsonrpc":"2.0","method":"resources/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":3}' \
'{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"huly://projects/HULY","_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":4}' \
  | node dist/index.cjs 2>/dev/null | grep -E '"id":[234]'
```

For HTTP header mode, send the same JSON-RPC methods to `/mcp` with `x-huly-url`, `x-huly-workspace`, and `x-huly-token` headers. Resource reads use the same request-scoped header config as tool calls.

## Full Integration Test Suite

**Coverage**: 800+ tool calls across 22 domains. Self-cleaning: all created entities are deleted at the end of each section. Tools that would leak data (no delete counterpart) are skipped.

**Last verified**: 2026-08-13 — native stdio passed 1095, failed 0, and skipped 27;
HTTP environment and request-header modes each passed 1091, failed 0, and skipped
31 (of 1122 total per surface). The focused packed CLI passed all 123 labeled
checks, and its full mirror passed 1095, failed 0, and skipped 27 of 1122.

### How to Run

```bash
pnpm build
set -a && source .env.local && set +a
pnpm integration:mcp:full
```

The script requires `jq` for JSON parsing.

The script is a native-tool lifecycle suite, not a proxy exposure suite. It selects `HULY_TOOL_MODE=native` by default so the documented command works with the new `auto` default, where unknown or generic clients resolve to proxy mode.

## CLI Integration Test Suites

The standalone CLI has its own live integration suite. This is required before publishing `@firfi/huly-cli`, the same way the MCP full suite is required before publishing MCP changes.

```bash
pnpm build
pnpm verify-cli-integration-coverage
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" pnpm integration:cli
HULY_URL="${HULY_URL/localhost/host.docker.internal}" pnpm integration:cli:full
```

Both CLI suites build, pack, and install `@firfi/huly-cli` into a temporary project before invoking it; they do not exercise the source tree as a substitute for the published artifact.

`scripts/integration_test_cli.sh` is the focused CLI adapter and safety suite. It verifies native argument parsing, output conventions, confirmation boundaries, representative risks, and self-cleaning lifecycles.

`scripts/integration_test_cli_full.sh` runs the same lifecycle program, fixtures, tool payloads, result assertions, and cleanup as `scripts/integration_test_full.sh`, but routes every `tools/call` through the installed CLI command catalog. The adapter normalizes CLI JSON, warnings, errors, and image files into the MCP result envelope consumed by the shared assertions. This makes a passing MCP run and a passing full CLI run direct behavioral evidence for the same tested operations, rather than two independently maintained approximations.

MCP resource discovery and `huly://` resource reads are protocol-only. The CLI mirror explicitly substitutes native command discovery plus `list_projects`, `get_project`, and `get_issue`; it does not claim that MCP resources are CLI commands.

`pnpm verify-cli-integration-coverage` is the static drift gate for the focused suite's reviewed live risk decisions. The full mirror additionally exposes `--list-tool-cases` on both entrypoints, and its unit contract requires identical inventories (currently more than 700 invocations across more than 400 unique tools).

`scripts/local_release.sh` reruns `pnpm verify-cli-integration-coverage` when the CLI package needs publishing, but it intentionally does not depend on a live Huly workspace. Run this live CLI suite on the clean release-candidate commit immediately before publishing; after it passes, `pnpm local-release` remains the single version-and-publish command.

### What It Tests

The full suite tests CRUD lifecycles with cleanup for all domains:

| Section | Tools Tested | Notes |
|---------|-------------|-------|
| 1r. MCP Resources | resources/templates/list, resources/list, resources/read project, resources/read created issue | Read-only JSON resources over the same stdio or HTTP transport |
| 1. Projects | list, get, list_statuses | create/update/delete skipped (pollutes workspace) |
| 1a. Task Management | list_project_types, get_project_type, list_task_types, create_task_type, create_issue_status | Creates a disposable task type/status and removes matching workflow refs/docs on exit |
| 2. Issues | create, get, list, update, delete, sub-issues, move, relations (add/list/remove), labels (add/remove), comments (add/list/update/delete), activity, time tracking (log/report/detailed), preview_deletion | Full lifecycle with all issue-related operations |
| 3. Components | create, list, get, update, delete, set_issue_component | CRUD + assignment |
| 4. Milestones | create, list, get, update, delete, set_issue_milestone | CRUD + assignment |
| 5. Templates | create, list, get, update, delete, add_template_child, remove_template_child, create_issue_from_template | Full lifecycle including children |
| 6. Labels & Tags | create/list/update/delete tag_category, create/list/update/delete label | Full CRUD for both |
| 7. Documents | list_teamspaces, create/list/get/update/delete document, list_inline_comments | Full CRUD + inline comments |
| 8. Teamspaces | create, get, update, delete | Full CRUD |
| 9. Channels | list, get, messages, DMs, DM messages (list/send/update/delete), create channel, send_message, thread replies (add/list/update/delete), reactions (add/list/remove), save/unsave, update/delete channel | Channel messaging in temp channel (deleted at end); DM message test cleans up its own message and requires `HULY_TEST_DM_ID` or at least one existing DM |
| 10. Contacts | list_persons, list_employees, list_organizations, get_user_profile, create/update/delete person | CRUD (create_organization skipped — no delete tool) |
| 11. Calendar, Time, Planner | list events/work_slots/time_reports/recurring, create/get/update/delete event, create/list/get/update/complete/reopen/delete ToDo, schedule/unschedule ToDo, create_work_slot, start/stop timer | Event + Planner lifecycle; create_work_slot is covered through a disposable ToDo (create_recurring_event skipped — no delete tool) |
| 12. Notifications | list, count, contexts, settings, get, mark_read | Read operations (+ mutation if notifications exist) |
| 13. Search | fulltext_search | Uses `searchFulltext` API |
| 13a. SDK Discovery | list_huly_classes, get_huly_class, list_huly_attributes, list_huly_enums | Read-only model discovery for class IDs, attributes, inherited fields, purpose-built tool hints, and enum totals |
| 13b. Spaces | list_spaces, get_space, list_space_types, get_space_type, list_space_permissions, update_space, add_space_members, remove_space_members, set_space_owners, set_space_role_members, add_space_role_members, remove_space_role_members | Generic space discovery plus safe metadata/member/owner updates against a disposable teamspace, and typed role-member updates against a restorable role fixture verified through get_space |
| 13c. Generic Associations | list_associations, create_association, delete_association, list_relations, create_relation, delete_relation | Disposable association + relation lifecycle, including idempotency, in-use association delete rejection, public association cleanup, cardinality violation, and card endpoint locators by ID and title |
| 13d. Security Administration | create/update/delete_huly_permission, set_space_role_permissions, get/set/delete_class_collaborator_metadata | Guarded permission lifecycle, restorable typed-space role permission mutation, and disposable direct class collaborator metadata |
| 14. Cards | list_card_spaces, list_master_tags, list_cards, create_card, get_card, delete_card | Read operations plus derived master-tag create/get/delete coverage with cardSpace |
| 15. Activity | list_mentions, list_saved_messages | Read operations |
| 16. Workspace | get_workspace_info, list_workspace_members | Read-only (management tools skipped) |
| 17. Attachments | add_issue_attachment, list/get/pin/update/download/delete attachment | Full CRUD (upload_file standalone skipped — no blob delete) |
| 18. Test Management | Full suite/case/plan/run/result lifecycle | Requires TM project in Huly UI |
| 19. Processes | list_processes, get_process, list_process_executions, start_process, cancel_execution | Read/write; write checks run only when the workspace has a process with an initial state and a matching safe card fixture, then cancel the created execution |
| 20. User Statuses | list_user_statuses | Read-only presence records; filtered call runs when at least one row exists |

### Intentionally Skipped (18 fixed + up to 15 conditional)

**Always skipped (18):**
- **create/update/delete_project** (3): Would pollute workspace
- **Workspace management** (6): list_workspaces, create/delete_workspace, get_regions, update_member_role, update_guest_settings — dangerous
- **update_user_profile** (1): Would modify test user
- **create_organization** (1): No delete tool — would leak data
- **create_recurring_event, list_event_instances** (2): No delete tool — would leak data
- **upload_file(standalone)** (1): No blob delete tool — would leak data
- **get_person** (1): Covered by create+update cycle
- **update_card** (1): Card update lifecycle is skipped; create/get/delete_card are exercised by the derived master-tag card lifecycle and the generic association card locator smoke
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

## Stdio EOF and In-Flight Request Draining

The stdio server always exits when stdin closes; `MCP_AUTO_EXIT` is no longer needed and cannot disable connection ownership. The server **drains in-flight tool calls before shutting down**: if a tool handler is mid-execution when stdin closes, it gets up to five seconds to complete and write its response. Wire and resource cleanup share the remainder of one ten-second global deadline.

This matters for operations that make HTTP round-trips to Huly's collaborator service (e.g., `edit_document` with content changes calls `updateMarkup`). Without draining, the stdin-close event would race against the HTTP call, and the response would be lost even though the mutation succeeded on the server.

**For script authors**: the standard `printf '%s\n%s\n' | node` pattern works correctly for all tools, including slow ones. No need for `sleep` workarounds.

**Implementation**: `src/mcp/server.ts` routes stdin EOF/close, SIGINT/SIGTERM, and programmatic stop through one idempotent shutdown coordinator. New requests are rejected after quiescing, and request completion notifications release the drain without polling timers.

## Eventual Consistency

Huly REST API is eventually consistent. Reads immediately after writes may return stale data. The full test suite avoids read-after-write verification within the same entity (each tool call is a separate connection). For manual testing with update-then-read:

```bash
# Update, then wait, then read in separate connections
printf '...update...' | node dist/index.cjs
sleep 2
printf '...get...' | node dist/index.cjs
```

## Individual Tool Test Pattern

```bash
META='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}'

printf '%s\n' \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"TOOL_NAME\",\"arguments\":ARGS,$META},\"id\":2}" \
  | HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | grep '"id":2'
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
