# CLI Mechanical Expansion Plan

## Baseline

The first CLI subset is committed on `codex/cli-first-subset` at `0d12efa`:

- `@firfi/huly-cli` is a separate package and binary.
- The CLI calls the shared operation registry directly.
- Commands are generated from catalog metadata with `@effect/cli`.
- Schema-derived options, `--input-json`, `--input-file`, file helpers, `--yes`, and attachment output are already centralized.
- Catalog sync assertions force every MCP registry tool to be either implemented or explicitly ignored.

Current registry counts:

- Implemented CLI tools: 39
- Ignored MCP tools: 431
- Ignored read-only/read-like tools: 183
  - Core: 12
  - Collaboration: 62
  - Business: 83
  - Platform: 26

## Mechanical Criteria

Treat a command as mechanical when it can be added by:

1. Adding one `cliCommandCatalog` entry.
2. Removing the MCP tool name from one ignored-tools file.
3. Adding only obvious positional fields already present in the schema.
4. Adding simple metadata already supported by the runner:
   - `confirmation.requires-yes`
   - `fileInput.fields`
   - `fileOutput.attachment-download`
5. Adding smoke tests that assert command-tree presence, input merging, and one local-Huly integration path per command family.

Do not include commands that require new UX semantics, new output transport, new prompt flows, query languages, bulk confirmation design, or object-targeting abstractions.

## Phase 1: Read-Only Sweep

Add every currently ignored `list_*`, `get_*`, and `describe_*` MCP tool as a generated CLI command, unless implementation uncovers a hidden transport behavior not represented by the schema.

This is the largest low-design batch because it does not mutate Huly state and should not need `--yes`, file upload, download, or body editor behavior.

Planned command families:

- `huly attachments saved list`
- `huly drawings get|list`
- `huly documents snapshots get|list`
- `huly issues templates get|list`
- `huly issues related-targets list`
- `huly projects target-preferences list`
- `huly task-types list`
- `huly project-types get|list`
- `huly activity get|list|filters|references|replies|mentions|reactions|saved`
- `huly approvals get|list`
- `huly boards get|list`, plus board cards, labels, saved views, menu pages, viewlets, common preference
- `huly channels get|list`, plus members, messages, attachments, direct messages, thread replies, external messages
- `huly collaborators list`
- `huly contacts organizations|persons|employees|channels|providers list|get`
- `huly notifications get|list|contexts|providers|settings|types|unread-count`
- `huly spaces get|list|types|permissions`
- `huly tags categories|attached|list`
- `huly templates get|list|categories|fields`
- `huly calendar events|instances|recurring|schedules|calendars get|list`
- `huly cards get|list|spaces|master-tags`
- `huly drive get|list|items|versions|comments|activity`
- `huly inventory categories|products|variants|attachments|photos|comments|activity get|list`
- `huly leads funnels|leads get|list`
- `huly planner todos get|list`
- `huly recruiting candidates|applicants|matches|vacancies|reviews|opinions|skills|attachments|comments|activity|related-issues get|list`
- `huly tests cases|plans|runs|results|suites|projects get|list`
- `huly time reports|work-slots get|list`
- `huly office offices|floors|rooms|active-room-info|participants|devices|meeting-minutes get|list`
- `huly platform associations|relations|custom-fields|preferences|processes|sdk|user-statuses|views|workspace read-only commands`

Expected scale: about 180 commands.

Implementation notes:

- Generate paths mechanically from the existing domain buckets, not by inventing a new taxonomy.
- Keep existing generic human rendering unless a renderer is already obvious and shared.
- Use catalog positionals only for stable primary identifiers like `board`, `card`, `channel`, `notificationId`, `project`, `testCase`.
- Leave all advanced filtering as schema-derived options.

Verification:

- Unit tests: catalog sync, command-tree render for representative deep paths, global option placement.
- Integration smoke: one `list` and one `get` per broad domain where local Huly data exists; pure empty-list assertions are acceptable for domains without fixtures.
- Full gate: `pnpm check-all` and `scripts/integration_test_full.sh` with container URL override.

## Phase 2: Simple Non-Destructive Mutations

Add write commands that do not delete records, do not need binary transport, and map cleanly to already-supported metadata.

Candidate families:

- Save/pin/toggle:
  - attachments save/unsave/pin
  - activity save/unsave/pin
  - notifications mark read/unread, pin/unpin context, archive/unarchive single notification/context
  - channels join/leave/archive/unarchive
  - boards archive/unarchive board/card
- Comments and replies:
  - activity replies add/update
  - approval request comments add
  - channel/thread/DM messages send/update
  - drive file comments add/update
  - inventory product comments add/update
  - recruiting comments add/update
- Simple create/update administration:
  - labels create/update
  - milestones create/update
  - components create/update
  - projects create/update
  - teamspaces create/update
  - boards create/update
  - board labels create/update
  - channels create/update
  - persons/organizations create/update
  - tags/tag categories create/update
  - cards create/update
  - inventory categories/products/variants create/update
  - planner todos create/update/schedule/reopen/complete
  - test cases/plans/runs/suites/results create/update

Expected scale: about 90 to 130 commands, depending on whether channel/chat sends are kept in this phase or delayed.

Implementation notes:

- Add `fileInput.fields` for `body`, `description`, `content`, and similarly named large text fields.
- Use generic `requires-yes` only for commands that are semantically destructive; this phase should mostly avoid deletes.
- Keep output generic unless a shared renderer naturally improves whole command families.

## Phase 3: Mechanical Destructive Pass

Add delete/remove/cancel commands whose only extra behavior is `--yes`.

Candidate families:

- Delete records in already-added command families:
  - document, teamspace, issue, issue template
  - label, milestone, component, project
  - activity reply, approval request cancellation
  - board card/label
  - channel messages, thread replies, DM messages
  - contacts, notifications, spaces membership, tags
  - calendar events/schedules
  - cards, drive items/comments
  - inventory records/media/comments
  - recruiting records/comments/attachments/reviews/opinions
  - test-management records
  - process execution cancellation

Expected scale: about 70 to 100 commands.

Implementation notes:

- Use a consistent generated confirmation message: `<path> requires --yes.`
- Keep deletes after read-only and non-destructive writes so integration tests can create then clean up fixtures in the same domain.

## Deliberately Not Mechanical Yet

Do not include these until a small design pass happens:

- Binary upload/download surfaces beyond the existing attachment download path.
- Drive file upload/version upload/download path UX.
- Calendar recurrence creation/editing UX.
- Generic associations/relations and custom-field setters that need object-targeting conventions.
- Workspace/account administration that affects users, roles, regions, access links, or workspace lifecycle.
- SDK discovery tools if the CLI is intended for humans rather than LLM exploration.
- Bulk notification actions such as archive-all or mark-all-read unless confirmation policy adds bulk-action wording.

## Recommended Next Implementation Slice

Start with Phase 1 read-only sweep. It is large enough to prove the catalog generator scales and low-risk enough to keep design judgment out of the implementation.

Success condition:

- CLI implemented count increases from 39 to roughly 220.
- Ignored lists shrink by about 180 tools.
- No new command-generation architecture is needed.
- No new special runner behavior is needed.
- Full `pnpm check-all` and local Huly integration pass.
