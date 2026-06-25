# @firfi/huly-mcp

## 0.43.0

### Minor Changes

- dca1b27: Add generic approval request tools backed by `@hcengineering/request`: `list_approval_requests`, `get_approval_request`, `add_approval_request`, `add_approval_request_comment`, `approve_approval_request`, `reject_approval_request`, and `cancel_approval_request`.

## 0.42.0

### Minor Changes

- 7b5b9ea: Add read-only SpacePreference discovery tools.

## 0.41.0

### Minor Changes

- bf0a1b1: Add generic read-only view discovery tools for saved filtered views and viewlets.
- 0badb25: Add `render_message_template` for read-only rendering of Huly message templates with caller-provided placeholder values.

## 0.40.1

### Patch Changes

- e8fb789: Update the resolved Effect dependency set to 3.21.4.

## 0.40.0

### Minor Changes

- 4bf0ec8: Add board label management plus read-only board menu page, saved view, viewlet, and common preference discovery tools.

### Patch Changes

- 7aed739: Allow Glama registry stdio inspection to start without Huly configuration by defaulting lazy environment validation when `GLAMA_VERSION` is present.

## 0.39.3

### Patch Changes

- 9dd3b77: Keep MCP resource discovery available during registry inspection when Huly config validation fails, including empty placeholder environment variables.

## 0.39.2

### Patch Changes

- fbffc2f: Fix HTTP/Docker registry inspection by preserving typed Huly configuration failures in HTTP client resolution, allowing unauthenticated no-config `resources/list` calls to return an empty resource list. Add HTTP and Docker smoke coverage for the no-config inspection path.

## 0.39.1

### Patch Changes

- e90ac6d: Fix Glama and registry-builder compatibility by correcting npm executable metadata and allowing unauthenticated `resources/list` inspection to return an empty list when no Huly configuration has been supplied.

## 0.39.0

### Minor Changes

- 6c95da4: Lead with "Huly MCP" branding in the README, website, and registry metadata.

### Patch Changes

- ff26b6c: Hoist nested JSON Schema definitions when advertising MCP tool schemas so strict clients can resolve all local `$ref` values from the schema root.
- 748fd1c: Enable stricter indexed-access type checking across the TypeScript harness, replacing unchecked array/object reads with explicit assertions or domain error branches while preserving ambiguous-entity errors in Huly resolvers.

## 0.38.0

### Minor Changes

- c749440: Add Huly board and board card MCP tools for board discovery, safe board updates, card creation/update/archive, and archived-card deletion.

## 0.37.0

### Minor Changes

- abf8736: Add read-only global Huly message template discovery tools for categories, templates, template details, and template fields.

## 0.36.0

### Minor Changes

- 7a35384: Add LLM-first chat message attachment wrappers for channel messages, direct-message messages, and thread replies.

## 0.35.0

### Minor Changes

- a2485f1: Extend first-class Recruiting MCP tools with applicant matches, review and opinion workflows, Recruiting comments, attachments, activity, and related issues.

## 0.34.0

### Minor Changes

- a2485f1: Add first-class Recruiting MCP tools for vacancy workflows, vacancies, candidates, candidate skills, and applicants.

## 0.33.1

### Patch Changes

- 1f40ccf: Fix MCP tool registration for root-composition input schemas and remove raw unknown input JSON Schema fragments.

## 0.33.0

### Minor Changes

- 42141be: Add inventory product attachment, photo, comment, and activity wrapper tools.

## 0.32.0

### Minor Changes

- 2ff8b8c: Add first-class inventory CRUD MCP tools for categories, products, and variants/SKUs.

## 0.31.1

### Patch Changes

- f324916: Add typed-space role member mutation tools for setting, adding, and removing role members.

## 0.31.0

### Minor Changes

- 24e744f: Add `list_external_channel_messages` for bounded read-only external Gmail and Telegram channel visibility, returning explicit unsupported results when no compatible Huly provider SDK is installed.
- c4eab9c: Add model-backed workflow status metadata fallback for workspaces where Huly status document lookups fail or return incomplete data. Affected project, issue, task-management, lead, and resource reads now try local model status metadata before degrading to ref-derived status names.

  When fallback metadata is still incomplete, surface explicit agent-visible MCP warnings instead of silently returning degraded status names/categories. Error envelopes remain schema-valid by omitting `structuredContent`, while successful degraded results include warnings in the documented warning channel.

## 0.30.1

### Patch Changes

- 1579508: Delete thread replies through Huly collection transactions so parent reply metadata stays in sync.

## 0.30.0

### Minor Changes

- 0f2a641: Add first-class person and organization contact channel management tools, including provider discovery, list/add/update/remove workflows, idempotent adds, labeled channel summaries, and channel IDs on contact reads.

## 0.29.0

### Minor Changes

- 573b975: Add core chat conversation lifecycle tools for channel members, reversible channel archive state, group direct-message creation, and per-user conversation starred/closed state.

## 0.28.0

### Minor Changes

- Add the next SDK parity release with expanded Drive, SDK discovery, tracker document, and planning coverage.

  This release adds Drive administration and file operation tools, Drive file comments and activity coverage, SDK discovery phase two surfaces, tracker document closeout support, and the issue 99 chat/channel integration pre-plan.

## 0.27.0

### Minor Changes

- Add safe typed MCP surfaces for Huly notification preferences, object notification subscriptions, generic object collaborators, activity messages and replies, saved attachments, attachment media subclasses, and drawings.

  This release closes the installed-SDK parity gap while keeping rating/star tools deferred until a typed published `@hcengineering/rating` package is available. It also strengthens the new schemas with branded domain values for attachment filenames, byte sizes, URLs, drawing content, activity markup, and notification metadata.

## 0.26.0

### Minor Changes

- Add reversible notification controls for unread/archive/context state.

  This release adds `mark_notification_unread`, `unarchive_notification`, and
  `hide_notification_context`, plus hidden-context listing support through
  `list_notification_contexts.includeHidden`. It also expands notification
  integration coverage so reversible notification mutations run against a real
  two-member local Huly fixture when available.

## 0.25.0

### Minor Changes

- bd5db5b: Add Drive MCP tools for listing and getting drives, browsing Drive paths, creating folders idempotently, uploading files with parent-folder creation, listing file versions, and restoring an existing file version.

  This also adds the temporary typed Drive SDK boundary needed while the published Drive package lacks compatible declarations, plus Drive registry metadata, README/parity documentation, integration coverage, and LLM-facing schema default cleanup.

## 0.24.0

### Minor Changes

- Add calendar schedule tools, broader calendar event parity, and read-only Huly virtual office discovery.

  Calendar events now support stable SDK fields such as participants, external participants, reminders, access, time zone, block-time behavior, and calendar moves by ID or name. The release also adds schedule CRUD tools with owner/calendar locators and room-aware schedule summaries.

  Virtual office support adds read-only discovery for floors, rooms, offices, active room occupancy, participants, meeting notes/transcript records (minutes), device preferences, and room-level recording/transcription defaults.

## 0.23.0

### Minor Changes

- 0d7b7ee: Add Planner ToDo MCP tools for listing, reading, creating, updating, completing, reopening, deleting, scheduling, and unscheduling Huly ToDos.

  Planner scheduling now uses `schedule_todo`, which accepts either a raw `todoId` locator or human-friendly ToDo locators. The older low-level `create_work_slot` tool is removed from the MCP surface; use `schedule_todo` to create work slots and `list_work_slots` to inspect scheduled slots.

## 0.22.2

### Patch Changes

- Align `titleRegex` and `nameRegex` with Huly SDK `$regex` semantics. Regex filters now pass through to Huly's backend `SIMILAR TO` implementation instead of using JavaScript regex post-filtering, with tool descriptions and integration coverage documenting whole-field, case-sensitive matching.

## 0.22.1

### Patch Changes

- Update the locked `effect` dependency from 3.21.2 to 3.21.3.

## 0.22.0

### Minor Changes

- f888a71: Add a uniform `null` clear contract for clearable update fields across spaces, channels, calendar events, issues, issue templates, components, milestones, tags, labels, and cards.
- 1c389e5: Add the generic `spaces` MCP toolset for safe Huly space discovery, metadata updates, member/owner administration, and space type/role/permission reads.

  This release also centralizes shared count/list-total schema contracts, adds reusable update-field coverage helpers, enforces property-test file placement in the lint harness, and documents the deferred follow-ups for generic space creation, role assignment mutations, role/permission definition writes, and module-specific wrappers.

### Patch Changes

- Fix card master-tag resolution so `create_card`, `list_cards`, and `list_master_tags` support derived child card types by label or ID.

## 0.21.1

### Patch Changes

- Write native Huly document references as editor-compatible leaf nodes so the Huly UI renders and preserves them.

## 0.21.0

### Minor Changes

- 59a5da3: Add native Huly reference round-tripping for document content. Markdown links to current-workspace Huly browse URLs now write as native references through `create_document` and `edit_document`, then read back through `get_document` content as normal markdown links while external URLs remain normal links.

## 0.20.1

### Patch Changes

- Preserve Huly browse URLs in document markdown writes as plain links instead of auto-converting them to native Huly reference nodes.

## 0.20.0

### Minor Changes

- Add SDK object discovery tools, 2026 stateless HTTP MCP support, and request-scoped hosted HTTP configuration coverage.

  Fix corrupted Huly document content handling so unreadable stored markup reports a clear typed error and can be repaired by `edit_document`.

  Harden the release gate with import-cycle detection, package smoke coverage, property-based tests, full transport integration coverage, and 99% coverage thresholds.

## 0.19.0

### Minor Changes

- 76d3e65: Add generic Huly tag tools and reuse the SDK tag model for tracker labels.

## 0.18.2

### Patch Changes

- 50ba72e: Refresh the bundled Effect runtime dependency.

## 0.18.1

### Patch Changes

- Fix markdown conversion for Huly documents containing inline-comment marks.

  Document markdown output now preserves the commented text while omitting Huly's inline-comment metadata until upstream markdown serialization supports that mark directly.

## 0.18.0

### Minor Changes

- Add card endpoint locators for generic association relations.

  Card locators now work with `list_relations`, `create_relation`, and `delete_relation`, including global card ID resolution, card-space-scoped title lookup, typed endpoint validation, and integration coverage.

## 0.17.2

### Patch Changes

- Normalize workflow status reference arrays on read and write so repeated status and task-type operations do not amplify duplicate Huly workflow metadata.

## 0.17.1

### Patch Changes

- Restore npm executable metadata so `npx @firfi/huly-mcp@latest` resolves the server binary.

## 0.17.0

### Minor Changes

- Add MCP context diagnostics, read-only resources for Huly projects and issues, streamable HTTP transport support, and optional bearer-token protection for hosted MCP deployments.

## 0.16.0

### Minor Changes

- Add generic association write tools for creating and deleting Huly association definitions and concrete relations.

## 0.15.1

### Patch Changes

- 65fe7eb: Advertise MCP tool schemas without root-level JSON Schema composition so bulk-loading clients can load all tools.

## 0.15.0

### Minor Changes

- #54 Add generic association tools for Huly's relation model.

  New MCP tools expose read-side association discovery and relation listing through `list_associations` and `list_relations`, including typed filters, class labels, raw document IDs, pagination totals, cap warnings, endpoint hydration, and explicit typed errors. Relation mutation entrypoints remain guarded until writable association allowlists are validated.

- #62 Add process write tools.

  New `start_process` and `cancel_execution` tools allow agents to start Huly process executions and cancel cancellable executions, with schemas, typed errors, docs, operation tests, and integration coverage.

- #63 Add `list_user_statuses`.

  The new read-only user-status tool exposes Huly presence records with optional account UUID and online-state filters.

- #61 Add hosted URL/header configuration for HTTP deployments.

  Hosted HTTP mode can now receive Huly URL configuration through request headers while preserving local stdio environment behavior. This includes Smithery URL-mode documentation and integration coverage.

- #57 Reject identifier-only update calls instead of treating them as successful no-ops.

  Update tools now require at least one actual update field in both their advertised JSON schemas and runtime guards. The MCP server reports omitted required argument objects before initializing Huly clients, and document editing rejects invalid mode combinations such as mixing full-content replacement with search-and-replace fields.

- #57 Tighten generic relation endpoint validation.

  `list_relations` with `direction: "either"` now validates endpoint classes for association filters so invalid source/target combinations fail explicitly.

- 3393b74 Expose MCP tool output schemas.

  Tool listings now advertise a default output schema, and `get_version` advertises its version response schema.

- Add deployment and registry metadata support.

  This release adds Cloud Run/Docker packaging files, Smithery configuration/docs, homepage assets, and automated registry metadata synchronization.

## 0.14.0

### Minor Changes

- 6f80f93: Add read-only Huly Process workflow definition and execution tools.

  The Process plugin classes are available on current Huly servers but are not published
  in this repository's pinned SDK type set yet, so the MCP tools use a small local type
  shim and the existing generic client read APIs until upstream types are available.

- cdcb544: Add `taskType` support to `create_issue` and `update_issue`.

### Patch Changes

- ea3498c: Fix `list_issue_relations` so the `blocks` result queries Huly by the stored `blockedBy` related-document shape.
- c5ee2b6: Add a strict Huly query helper for relation lookups so accidental dot-key query fields fail typechecking.
- 39b2910: Apply the strict Huly query helper convention across high-risk issue, document, label, relation, and task-management lookups.

## 0.13.0

### Minor Changes

- 19dc313: Improve LLM-first discovery for activity and issue relations: `list_activity` now accepts issue, document, and channel identifiers, and `list_issue_relations` now returns both `blockedBy` and `blocks`.

## 0.12.0

### Minor Changes

- Add the `create_direct_message` tool for idempotently opening one-to-one Huly direct-message conversations by exact workspace-member email or display name.
- Harden direct-message creation by rejecting self-DMs, ignoring group DMs during one-to-one reuse checks, surfacing ambiguous person matches, and resolving email identities through both SocialIdentity and email Channel records.

## 0.11.0

### Minor Changes

- Add the `create_access_link` workspace tool for creating Huly access links, including anonymous reusable guest links with second-based validity windows and optional space restrictions.

## 0.10.3

### Patch Changes

- Rebuild the published package artifact so contact responses include workbench URLs.

## 0.10.2

### Patch Changes

- Expose Huly workbench URLs on contact person, employee, and organization responses.

## 0.10.1

### Patch Changes

- Harden direct-message operations by enforcing authenticated-account membership, resolving participant names only for one-to-one DMs, mapping DM lookup errors to invalid params, and resolving DM message senders through social identities.

## 0.10.0

### Minor Changes

- Add writable calendar discovery and explicit calendar targeting for event creation.

  Event creation now resolves the authenticated user's primary personal calendar by default instead of selecting an arbitrary calendar. `create_event` and `create_recurring_event` accept an optional `calendarId`, and `list_calendars` returns writable calendar targets for agents that need to choose one explicitly.

## 0.9.3

### Patch Changes

- Allow `list_leads` assignee filters to accept person display names as well as email addresses.
- Omit empty reaction creator IDs from `list_reactions` output so freshly added reactions encode cleanly.

## 0.9.2

### Patch Changes

- Make `create_issue_status` tolerate failures from the broad existing-status recovery lookup reported on older self-hosted Huly instances, while preserving idempotency for statuses already linked to the selected project type.

## 0.9.1

### Patch Changes

- Document the `create_document` `parent` option in the MCP tool description and generated README so agents can discover nested document creation from the tool list.

## 0.9.0

### Minor Changes

- Add task-management workflow tools for discovering project/task types and safely extending tracker configuration.

  New MCP tools:

  - `list_project_types`
  - `get_project_type`
  - `list_task_types`
  - `create_task_type`
  - `create_issue_status`

  The create tools are idempotent, recover partially linked workspace configuration, validate status category mismatches, and include integration coverage against a live Huly workspace.

## 0.8.0

### Minor Changes

- fa2133b: Add `update_channel_message` and `delete_channel_message` tools so edits to channel posts (e.g. fixing a bad link after send) no longer require a second message stacked on top. Mirrors the existing thread-reply edit/delete surface, reuses the existing `MessageNotFoundError` and `ChannelNotFoundError` error classes, and places the operations in `channels-messages.ts` alongside the pattern used by `documents-edit.ts`.
- 91ec770: Include a `url` field (typed as `UrlString`) on every document result (`list_documents`, `get_document`, `create_document`, `edit_document`) pointing directly at the document in the Huly web app. The URL is built from the connected workspace's `WorkspaceLoginInfo.workspaceUrl` slug and a title-derived path segment (`<baseUrl>/workbench/<workspaceUrl>/document/<title-slug>-<id>`), matching the links Huly itself produces. This removes a common failure mode where callers constructed URLs from the raw `WorkspaceUuid` and hit the login-loop page instead of the document.

## 0.7.0

### Minor Changes

- Prepare the next minor release from the four merged PRs since `v0.6.3`.

  - Add nested document creation with `create_document(parent)` for creating children under an existing document.
  - Fix markup conversion to use workspace-aware URL configuration so generated links and asset references resolve correctly for the active workspace.
  - Add lead and funnel tools with stronger SDK parity, deterministic funnel name resolution, and integration coverage for real workspace lead reads.
  - Add organization CRM and customer-management tools, including organization CRUD, customer mixin support, organization channels, member linking, ambiguity-safe lookup, idempotent membership operations, and cleanup-safe integration coverage.

## 0.6.3

### Patch Changes

- dbd3aea: Fix assignee resolution for workspace members whose email exists only as a SocialIdentity by moving the lookup into the shared person resolver and prioritizing it ahead of Channel-based lookups.

## 0.6.2

### Patch Changes

- Fix assignee resolution for workspace members whose email exists only as a SocialIdentity (no Channel doc). Adds SocialIdentity email lookup as the first step in findPersonByEmailOrName, benefiting all person-resolving operations.

## 0.6.1

### Patch Changes

- Fix local-release script to rebuild dist before publish, preventing stale version string in bundle

## 0.6.0

### Minor Changes

- ef56789: Add custom fields support with auto-discovery: `list_custom_fields`, `get_custom_field_values`, and `set_custom_field`. The server now discovers field definitions from Huly's Attribute system without manual configuration and supports Cards, Issues, and other classes with custom fields.

  Harden typed outputs for the new custom-fields, issue-relations, time, and workspace tool surfaces. These tools now validate and encode their MCP responses through Effect schemas at the boundary so branded internal domain values are converted to stable wire output and invalid result shapes fail fast instead of leaking through the transport layer.

## 0.5.4

### Patch Changes

- chore: add pre-publish version string verification to prevent stale dist

## 0.5.3

### Patch Changes

- fix: bake correct version string into published dist

## 0.5.2

### Patch Changes

- fix: add uploadMarkup for milestone collaborative documents (#18), consistent guard and dual-write comment

## 0.5.1

### Patch Changes

- 335a5fa: Fix Markup conversion for issue templates and milestones — descriptions now render markdown formatting correctly in Huly UI. Extract shared markup conversion helpers into dedicated module.
- 3fb294d: fix: consistent uploadMarkup guard and dual-write comment for milestone descriptions

## 0.5.0

### Minor Changes

- 81c6ab2: Add custom fields support with auto-discovery: list_custom_fields, get_custom_field_values, set_custom_field tools. Auto-discovers field definitions from Huly's Attribute system without manual configuration. Works for Cards, Issues, and any class with custom fields.

## 0.4.0

### Minor Changes

- d81267c: feat: add dueDate and estimation support for issue creation and updates

## 0.3.2

### Patch Changes

- fix: move bundled dependencies to devDependencies to fix npx install

## 0.3.1

### Patch Changes

- Pin @hcengineering/\* dependencies to exact versions to avoid broken 0.7.382 release with unresolved workspace: protocol

## 0.3.0

### Minor Changes

- feat: add get_version tool returning current and latest npm version

## 0.2.0

### Minor Changes

- Add link_document_to_issue and unlink_document_from_issue tools for associating documents with tracker issues. Enhance list_issue_relations to return linked documents with resolved titles and teamspace names.

## 0.1.62

### Patch Changes

- feat: add `list_statuses` and `list_inline_comments` tools

  - `list_statuses`: returns project statuses with isDone, isCanceled, isDefault flags — useful for LLMs to pick valid statuses when creating/updating issues
  - `list_inline_comments`: extracts inline comment threads from document markup with optional thread reply fetching including sender names

## 0.1.61

### Patch Changes

- Remove unnecessary browser polyfills (fake-indexeddb, window, navigator) — all @hcengineering packages guard these with typeof checks. The window mock was actively harmful, defeating browser-detection guards.

## 0.1.60

### Patch Changes

- chore: bump tsconfig lib to ES2023, ban type assertions, add review rules

## 0.1.59

### Patch Changes

- lint: ban Date.now() and new Date(), use Effect Clock.currentTimeMillis

## 0.1.58

### Patch Changes

- ac18b40: chore(deps): bump @modelcontextprotocol/sdk from 1.26.0 to 1.27.1

## 0.1.57

### Patch Changes

- Add author field, format/check-format/check-all scripts, prepublishOnly safety gate, and init changesets for versioning
