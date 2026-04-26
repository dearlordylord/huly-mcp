# SDK Coverage Backlog

> Status: unvalidated backlog candidates. These are not accepted implementation scope until each item has a small PRD or issue with an integration-test strategy.

These candidate gaps came from a local comparison of current MCP tools, installed Huly SDK/plugin types, and `.reference/huly-examples/platform-api`. They are not yet validated against live Huly behavior, user demand, permissions, or SDK write semantics.

## 1. Direct Message Writes

- [ ] Not completed: direct-message creation and direct-message send/update/delete tools. Current tools list direct message conversations, but message write coverage is channel-focused.

**Context**

Current coverage includes `list_direct_messages` plus channel message write tools in `src/domain/schemas/channels.ts`, `src/huly/operations/channels.ts`, `src/huly/operations/channels-messages.ts`, and `src/mcp/tools/channels.ts`. The installed `@hcengineering/chunter` SDK exposes `DirectMessage extends ChunterSpace` and `ChatMessage extends ActivityMessage`; current channel message writes are implemented against `chunter.class.ChatMessage` scoped by channel space.

**Evaluation**

This is likely a real coverage gap, but the main unknown is direct-message space lifecycle. Sending into an existing direct-message space may be similar to sending into a channel, but creating a direct-message conversation likely requires correct members/owners, space identity, notification behavior, and possibly Huly UI conventions that are not captured by local examples.

**Validation**

- Inspect a live workspace direct-message document and compare it with channel documents.
- Confirm whether a DM can be created with `createDoc(chunter.class.DirectMessage, ...)` or requires a higher-level SDK/UI flow.
- Verify whether `ChatMessage` writes into a direct-message space behave like channel message writes.
- Add cleanup-safe integration tests for creating a temporary DM, sending, updating, deleting a message, then removing the DM if creation is supported.

**Recommendation**

Prioritize read/write operations for existing DM conversations before creation. A safe first slice is `send_direct_message`, `update_direct_message`, and `delete_direct_message` using a `directMessageId` returned by `list_direct_messages`. Defer `create_direct_message` until live workspace behavior proves the correct creation protocol.

## 2. Saved Documents

- [ ] Not completed: saved document tools, such as save document, unsave document, and list saved documents.

**Context**

The installed `@hcengineering/document` SDK exposes `SavedDocument extends Preference` with `attachedTo: Ref<Document>`. Current document tools cover teamspaces, document CRUD, content edit, inline comments, and deletion. Activity already has saved-message operations backed by a preference-like `SavedMessage` flow, so there is an existing module pattern for save/list/unsave semantics.

**Evaluation**

This looks like a small, likely useful read/write gap. The risk is moderate because preference documents often depend on account/user scoping and may have uniqueness rules. The operation should avoid duplicate saved preferences and should be idempotent.

**Validation**

- Confirm the class ref for `SavedDocument` from the document plugin runtime export.
- Inspect whether saved documents are stored in a fixed preference space or in the current user/account context.
- Validate duplicate behavior by saving the same document twice in a local Huly workspace.
- Add tests for list, idempotent save, idempotent unsave, and encoded output schemas.

**Recommendation**

Good candidate for the next small feature PR. Build `save_document`, `unsave_document`, and `list_saved_documents` as one vertical slice with schema-backed inputs, encoded outputs, and idempotent behavior. Use existing document resolution helpers instead of requiring callers to pass raw refs.

## 3. Document Snapshots And History

- [ ] Not completed: document snapshot/history tools using `DocumentSnapshot`.

**Context**

The installed `@hcengineering/document` SDK exposes `DocumentSnapshot extends Doc` with `title`, `content: MarkupBlobRef`, and `parent: Ref<Document>`. Current document operations already know how to fetch markup blob content for documents, but no current tool lists or reads snapshot documents.

**Evaluation**

Read-only snapshot listing and reading may be useful, but write/restore behavior is not validated. Snapshot retention, creation triggers, ordering, and restore semantics are unclear from local examples. A restore tool would be higher risk because it could overwrite current document content.

**Validation**

- Inspect live snapshot documents after editing a document multiple times.
- Confirm the relation from `DocumentSnapshot.parent` to `Document._id`, and whether snapshots share the document teamspace.
- Verify whether `content` can be fetched with the same markup fetch path as document content.
- Define whether history output should include full content by default or require a specific snapshot read call.

**Recommendation**

Start with read-only tools only: `list_document_snapshots` and `get_document_snapshot`. Do not add `restore_document_snapshot` until there is a PRD covering overwrite behavior, conflict handling, and integration cleanup.

## 4. Calendar Management

- [ ] Not completed: calendar management tools for `Calendar`, `ExternalCalendar`, `Schedule`, and `PrimaryCalendar` objects.

**Context**

Current calendar tools cover one-time events, recurring events, and recurring instances. The installed `@hcengineering/calendar` SDK also exposes `Calendar`, `ExternalCalendar`, `PrimaryCalendar extends Preference`, and `Schedule`. Calendar events already reference a calendar, but current params do not expose calendar selection or calendar CRUD.

**Evaluation**

This is a mixed backlog item. Listing calendars and primary calendar preference is likely useful and low risk. Creating/updating external calendars and schedules is more complex because it may intersect integration configuration, CalDAV behavior, public schedule URLs, ownership, access levels, and user-specific preferences.

**Validation**

- Inspect calendar documents in a live workspace for current user-owned calendars and external calendars.
- Confirm whether `PrimaryCalendar` preferences are user-scoped and how missing primary calendar is represented.
- Validate schedule document required fields, especially `owner`, `availability`, `meetingDuration`, `meetingInterval`, `timeZone`, and optional calendar ref.
- Confirm whether external calendar creation is safe without integration handlers.

**Recommendation**

Split into two PRs. First, add read-oriented `list_calendars`, `get_calendar`, and `get_primary_calendar`, plus optional `calendarId` support on event create/list/get if safe. Second, evaluate schedule management separately. Do not implement external calendar writes until integration behavior is validated.

## 5. Richer Attachment And Media Classes

- [ ] Not completed: richer attachment/media tools for SDK classes such as `Embedding`, `Drawing`, and `Photo`.

**Context**

Current attachment tools manage generic `Attachment` documents, uploads, metadata, pinning, deletion, download URLs, and convenience issue/document attachment creation. The installed `@hcengineering/attachment` SDK exposes `Embedding extends Attachment`, `Photo extends Attachment`, `Drawing extends Doc`, and `SavedAttachments extends Preference`.

**Evaluation**

Generic attachment coverage may already handle many `Photo` and `Embedding` cases if those classes are stored like attachments, but class-specific semantics are not known. `Drawing` is structurally different: it is a document with `parent`, `parentClass`, and optional `content`, not an `AttachedDoc` attachment.

**Validation**

- Inspect live examples of photo, embedding, drawing, and saved attachment documents.
- Confirm whether generic `Attachment` queries return subclass documents or whether separate class queries are needed.
- Determine whether creating `Photo`/`Embedding` requires class-specific blobs or metadata.
- Determine whether drawing content is raw JSON/string, markup, or another serialized format.

**Recommendation**

Do not add write tools yet. First add read-only classification to existing attachment output if subclass documents are returned, or add `list_media_assets` if separate queries are required. Treat drawing creation/editing as a separate design because it is not the same module shape as attachment upload.

## 6. Social Identity And Contact Channel Inspection

- [ ] Not completed: social identity and contact channel inspection tools for lower-level contact/account debugging.

**Context**

Current contact tools cover persons, employees, organizations, organization members, and adding organization channels. Existing helper code already queries `SocialIdentity` and `Channel` internally for person resolution and email matching. The installed `@hcengineering/contact` SDK exposes `SocialIdentity`, `SocialIdentityProvider`, `Channel`, `ChannelProvider`, `ChannelItem`, `PersonSpace`, and related contact/account structures.

**Evaluation**

This is a useful debugging gap, especially when identity resolution fails. The risk is privacy: social identities and contact channels expose emails, phone numbers, external handles, and provider IDs. Write tools for these classes could also create duplicate or inconsistent identity state.

**Validation**

- Confirm which fields are safe to expose by default and whether output should redact or filter sensitive providers.
- Verify access behavior for listing channels/identities across contacts in a live workspace.
- Determine whether account UUID, person ID, and social identity ID should all be returned or only stable domain IDs.
- Add tests using dependency-injected client stubs, not mocks, covering provider filters and redaction decisions.

**Recommendation**

Build read-only inspection first: `list_contact_channels`, `list_social_identities`, and possibly `get_person_identity_map`. Avoid write tools until there is a clear data-governance decision. Make filters required or strongly encouraged so agents do not dump all contact channels accidentally.

## 7. Card Preferences, Roles, Sections, And View Defaults

- [ ] Not completed: card favorites, card roles, card sections, and card view defaults/extensions.

**Context**

Current card tools cover card spaces, master tags, card list/get/create/update/delete. The installed `@hcengineering/card` SDK exposes `FavoriteCard extends Preference`, `Role`, `CardSection`, `CardViewDefaults`, `MasterTagEditorSection`, and create/edit extension metadata. Current `list_master_tags` returns only ID/name and does not expose roles, sections, defaults, or preference state.

**Evaluation**

This item combines user preferences with model/configuration metadata. Favorites are likely user-facing and low risk if idempotent. Roles, sections, and defaults are more model-level; they may be mostly read-only for MCP and unsafe to mutate without understanding Huly UI expectations.

**Validation**

- Inspect master tags with roles and view defaults in a live workspace.
- Confirm whether `FavoriteCard` preferences are scoped by account and application string.
- Determine if card sections are static model documents or workspace-customized records.
- Validate whether card roles affect permissions or are just display/config metadata.

**Recommendation**

Split favorites from model metadata. Implement `favorite_card`, `unfavorite_card`, and `list_favorite_cards` only after preference scoping is confirmed. Add read-only `get_card_type_metadata` for roles/sections/defaults if agents need to understand card behavior. Avoid write tools for roles/sections/defaults until a product need is proven.

## 8. Project And Task Descriptor Management

- [ ] Not completed: project/task descriptor management beyond the safe project type, task type, and issue status tools already implemented.

**Context**

Current task-management tools already cover `list_project_types`, `get_project_type`, `list_task_types`, `create_task_type`, and `create_issue_status`. The installed `@hcengineering/task` SDK also exposes `ProjectTypeDescriptor`, `TaskTypeDescriptor`, `TaskTypeClass`, `ProjectTypeClass`, `TaskStatusFactory`, and lower-level project-type configuration. Existing write tools intentionally copy configuration from known task types rather than exposing raw descriptor edits.

**Evaluation**

This remains high risk. Descriptor writes can affect workspace-wide model behavior, available task types, status categories, target classes, and UI/editor configuration. The current safe tools are already a deep module: they hide required Huly workflow details behind narrow LLM-first operations.

**Validation**

- Identify concrete user workflows not covered by current safe tools.
- Inspect descriptor documents and class/mixin relationships in a live workspace.
- Prove any write operation can be made idempotent and reversible in integration tests.
- Confirm whether descriptor updates require migrations or cache refreshes in Huly clients.

**Recommendation**

Do not build generic descriptor management. Keep deep, high-level operations only. If a real need appears, add one constrained tool at a time, such as cloning a project type from a known descriptor, and require integration tests against a disposable workspace.

## 9. Constrained Raw Read-Only SDK Inspection

- [ ] Not completed: a carefully constrained raw read-only SDK inspection tool. This should remain read-only unless a separate safety design is approved.

**Context**

Current global inspection is `fulltext_search`, which returns indexed search results, not arbitrary SDK document reads. The `HulyClient` service exposes typed `findAll`/`findOne`, but no MCP tool allows callers to query an arbitrary class. Existing architecture favors LLM-first high-level tools and schema-backed domain modules rather than raw SDK access.

**Evaluation**

This could speed debugging and SDK exploration, but it is also the most likely tool to violate the LLM-first design principle if exposed too broadly. Risks include accidental bulk data exfiltration, unstable raw class names, untyped JSON output, privacy leaks, and callers depending on internal Huly storage shapes.

**Validation**

- Define an allowlist of classes that are safe for raw read-only inspection.
- Define a strict query shape, fixed limit cap, redaction rules, and encoded output schema.
- Confirm whether returned raw docs should include all fields or a safe subset.
- Add audit-style tests proving forbidden classes, large limits, write-like operators, and sensitive fields are rejected or redacted.

**Recommendation**

Keep this as a last-resort developer/debug tool, not a product tool. If implemented, name it explicitly as inspection-only, require class allowlisting, cap limits aggressively, redact sensitive contact fields by default, and never add raw write operations.

## Shared Validation Checklist

Apply this checklist before promoting any backlog candidate into accepted scope:

- [ ] Confirm the SDK class shape and required fields from local examples, SDK types, or live workspace inspection.
- [ ] Decide whether the tool is LLM-first and safer as a single high-level operation rather than raw SDK access.
- [ ] Define cleanup-safe integration coverage, or explicitly document why only read-only integration is safe.
- [ ] Add schema-backed inputs and encoded output validation.
- [ ] Run `pnpm check-all`.
