# Issue 94: Planner and ToDos Pre-Plan

GitHub issue: https://github.com/dearlordylord/huly-mcp/issues/94
Worktree: `.worktrees/issue-94-planner-todos`
Branch: `issue-94-planner-todos`

## Goal

Expose Huly Planner/ToDo lifecycle as first-class MCP tools with LLM-first inputs. The feature should cover stable `@hcengineering/time` ToDo and ProjectToDo fields, avoid raw class/collection requirements, and integrate with the existing time/calendar surface.

## Pre-Research Findings

- Existing MCP coverage is only partial:
  - `src/mcp/tools/time.ts` has `list_work_slots` and `create_work_slot`.
  - `src/huly/operations/time.ts` can list and create `WorkSlot`, but `create_work_slot` still requires a raw `todoId`.
  - There is no ToDo CRUD, completion, lookup, owner filtering, or scheduling by ToDo locator.
- Huly time SDK model fields:
  - `ToDo`: `attachedTo`, `attachedToClass`, `workslots`, `title`, `description`, `dueDate`, `priority`, `visibility`, `doneOn`, `user`, optional `attachedSpace`, optional `labels`, `rank`.
  - `ProjectToDo`: extends `ToDo` and requires `attachedSpace`.
  - `WorkSlot`: extends calendar `Event` and is attached to `ToDo` through collection `workslots`.
  - `TodoAutomationHelper`: model doc containing `onDoneTester`; useful for read-only automation visibility, not direct lifecycle mutation.
- Priority enum names should be exposed as LLM-friendly strings:
  - `no-priority`, `low`, `medium`, `high`, `urgent`.
  - Huly enum order is `High`, `Medium`, `Low`, `NoPriority`, `Urgent`; string mapping must not depend on enum ordinal intuition.
- Visibility should reuse calendar-style values where possible:
  - Huly uses `public`, `freeBusy`, `private`.
  - For ToDos, server resources map non-public ToDo visibility into `freeBusy` on work slots.
- Huly server-time automation matters:
  - Issue ToDos can be auto-created for classic projects when issues are assigned or moved into active/todo statuses.
  - Completing a ToDo updates future/current work slots and can advance issue status through `OnToDo`.
  - Removing the final open issue ToDo can move classic issues back to an unstarted status.
  - Updating title, description, or visibility propagates into work slots.
- Creation patterns seen in Huly source:
  - Issue-derived ProjectToDos are created with `addCollection`/collection CUD semantics under issue collection `todos`.
  - Process ToDos are direct `createDoc`-style writes in `time.space.ToDos` with `attachedTo`, `attachedToClass`, and `collection: "todos"`.
  - Manual MCP writes should prefer `client.addCollection` when attaching to a concrete object so Huly collection fields and triggers stay coherent.
- Labels are generic `TagReference` rows in collection `labels`; existing `tags-shared.ts` helpers can be reused if ToDo labels are included in create/update.
- Query safety:
  - New direct Huly query literals should use `hulyQuery<T>()` or `StrictDocumentQuery<T>`.
  - ToDo lookups need careful query typing because `DocumentQuery<T>` accepts arbitrary keys.
- Testing constraints:
  - Unit tests must use `HulyClient.testLayer` or explicit Effect service/ports stubs, not mocks/monkey-patching.
  - Scheduling/date completion behavior must use `Effect.Clock` when "now" is needed.
  - Integration tests are required for lifecycle writes, and `create_work_slot` can become testable once ToDos can be created and deleted.

## Proposed Tool Surface

Add a new `planner` category instead of expanding the `time tracking` category. Keep `WorkSlot` tools in `time` for now unless a later cleanup moves them.

1. `list_todos`
   - Filters: `owner`, `attachedTo`, `project`, `issue`, `document`, `person`, `dueFrom`, `dueTo`, `completionState`, `priority`, `visibility`, `titleSearch`, `limit`.
   - Returns compact summaries plus enough locator context to act on results.

2. `get_todo`
   - Accepts a ToDo locator, not only raw ID.
   - Locator forms: raw `todoId`, `title` with optional owner/project/attached object disambiguators, issue locator, document locator, person locator.
   - Returns full stable fields, resolved owner info, attachment summary, labels, and workslot count.

3. `create_todo`
   - Creates a personal or attached ToDo.
   - Inputs: `title`, optional `description`, `owner`, `dueDate`, `priority`, `visibility`, optional labels, optional `attachedTo`.
   - `attachedTo` should support:
     - issue by `{ project, identifier }`
     - document by `{ teamspace, document }`
     - project by `{ project }`
     - person by `{ person }`
     - raw object fallback only if needed, with explicit class/space.
   - Default owner: authenticated user only if this is reliably discoverable; otherwise require `owner` for creation.

4. `update_todo`
   - Partial update of stable user-editable fields: `title`, `description`, `owner`, `dueDate` including clear, `priority`, `visibility`, labels add/remove/set.
   - Uses existing update guard pattern requiring at least one update field.

5. `complete_todo`
   - Sets `doneOn` to provided timestamp or `Clock.currentTimeMillis`.
   - May trigger workslot trimming/removal and issue automation in Huly.

6. `reopen_todo`
   - Sets `doneOn` to null.
   - Should be explicit that reopening may not reverse all downstream automation Huly performed on completion.

7. `delete_todo`
   - Removes the ToDo with `removeDoc`.
   - Description must warn that removing the last open issue ToDo can trigger classic issue status changes.
   - If integration testing shows hard removal is not appropriate for some attached classes, document unsupported cases and expose a safer `cancel_todo`/complete-style operation instead.

8. `schedule_todo`
   - Supersedes raw `create_work_slot` for LLM usage.
   - Accepts ToDo locator plus `date`, `dueDate`, optional title/visibility.
   - Returns workslot ID.

9. `unschedule_todo`
   - Removes a specific workslot by ID, or all/future workslots for a ToDo locator.
   - Must be destructive-hinted if removing slots.

10. `list_todo_automation_helpers`
    - Read-only list of `TodoAutomationHelper` docs and resolved tester resource IDs where possible.
    - This satisfies helper visibility without pretending to mutate automation.

## Locator Design

Use a structured union named `TodoLocator`:

- `{ todoId }`
- `{ title, owner?, attachedTo? }`
- `{ issue: { project, identifier }, title?, owner?, completionState? }`
- `{ document: { teamspace, document }, title?, owner?, completionState? }`
- `{ person: { person }, title?, completionState? }`

Use a separate `TodoAttachmentInput` for creation:

- `{ type: "issue", project, identifier }`
- `{ type: "document", teamspace, document }`
- `{ type: "project", project }`
- `{ type: "person", person }`
- `{ type: "none" }`

The raw fallback should be avoided initially unless integration testing proves a supported Huly attachment class cannot be covered otherwise.

## Implementation Plan

1. Schema layer
   - Add `src/domain/schemas/planner.ts`.
   - Add branded `TodoId` reuse from shared schemas and new result schemas.
   - Add `ToDoPrioritySchema`, `TodoVisibilitySchema`, `TodoLocatorSchema`, `TodoAttachmentInputSchema`.
   - Export through `src/domain/schemas/index.ts`.

2. Operation shared helpers
   - Add `src/huly/operations/planner-shared.ts`.
   - Implement priority and visibility mappings.
   - Implement owner resolution through existing contact helpers.
   - Implement attachment resolution for issue/document/project/person.
   - Implement `findTodo` with ambiguity errors.

3. Domain errors
   - Add `errors-planner.ts` with `TodoNotFoundError`, `TodoIdentifierAmbiguousError`, `TodoAttachmentUnsupportedError`, and `TodoOwnerRequiredError` if needed.
   - Re-export and include in `HulyDomainError`.

4. Planner operations
   - Add `src/huly/operations/planner.ts`.
   - Implement list/get/create/update/complete/reopen/delete/schedule/unschedule/helper-list.
   - Reuse `client.uploadMarkup`/`fetchMarkup` for descriptions if ToDo descriptions behave like other markup fields in integration tests; otherwise keep plain markup string handling consistent with platform examples.
   - Reuse `attachTagReference`/`detachTagReference` for labels.

5. MCP tools
   - Add `src/mcp/tools/planner.ts`.
   - Register in `src/mcp/tools/index.ts`.
   - Tool descriptions must explicitly say that callers can use human-oriented locators and do not need Huly class IDs.

6. Existing work-slot compatibility
   - Keep `list_work_slots` and `create_work_slot`.
   - Add descriptions pointing LLM callers to `schedule_todo` when they do not already have a raw ToDo ID.
   - Consider adding ToDo locator filters to `list_work_slots` in a follow-up if line count/complexity grows.

7. Tests
   - Add schema tests for locator unions, update-field requirement, priority and visibility values.
   - Add operation unit tests using `HulyClient.testLayer`, no `vi.mock`/spies.
   - Add property tests only if useful for pure locator/priority roundtrip helpers, in `*.property.test.ts`.
   - Extend MCP registry tests if needed for no-arg/read/write/destructive hints.
   - Extend integration test script so ToDo create/get/list/update/schedule/complete/reopen/unschedule/delete run against local Huly.

8. Verification
   - Run focused tests while developing.
   - Run `pnpm check-all` before completion.
   - Run local Huly integration tests for lifecycle writes before considering the feature done.

## Open Risks And Research Follow-Ups

- Authenticated-user default owner: I have not yet verified a reliable local helper for "current employee" from Huly client context. If unavailable, `create_todo.owner` should be required.
- Description storage: source models mark `description` as `Markup`; integration testing should confirm whether direct string creation is accepted or upload/update markup is required.
- Document action items: Huly has generic ToDos attached to arbitrary docs, but no obvious document-specific ToDo factory in the inspected source. Manual attached ToDos should work if `addCollection` is accepted by the target document's `todos` collection; integration tests must prove this.
- Project-attached ToDos: `ProjectToDo.attachedSpace` is clear for issue-derived ToDos. A project-level ToDo not attached to an issue may need `attachedTo` set to the project/space itself and class `tracker.class.Project` or `task.class.Project`; this needs integration proof.
- Delete semantics: server-time `OnToDoRemove` has side effects for issue-attached ToDos. The tool can still expose delete, but its description and tests must capture that behavior.
- Rank ordering: Huly uses `makeRank` before the first open ToDo for a user. The MCP implementation should either copy that behavior or document rank as derived/unsupported.

## Current Design Stance

No user design input is required before implementing the first vertical slice. The issue acceptance criteria already decide the broad product shape, and the uncertain parts are Huly API behavior that should be resolved by integration tests rather than preference questions.

Recommended first vertical slice:

1. Add schemas and read-only `list_todos`/`get_todo` with owner, issue, title, due date, completion, priority, and visibility filters.
2. Add `create_todo`, `complete_todo`, `reopen_todo`, and `delete_todo` for issue-attached and personal ToDos.
3. Add `schedule_todo`/`unschedule_todo` so workslot integration tests no longer need a pre-existing planner task.
4. Expand to document/project/person attachment after the first integration pass proves the collection semantics.
