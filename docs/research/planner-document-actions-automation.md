# Planner document action items and automation-helper parity

Date: 2026-09-05  
Issue: [#261](https://github.com/dearlordylord/huly-mcp/issues/261)  
Upstream source revision inspected: [`hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34`](https://github.com/hcengineering/platform/tree/2a985b31e314c0793dd965e5a1d8abe28f262f34)  
Installed published declarations: `@hcengineering/time@0.7.0`, `@hcengineering/calendar@0.7.0`

## Decision

The three residuals in #261 are not one feature:

1. **Document-attached action items are a direct Huly-native parity gap.** Huly's published `Document` model implements `Todoable`, and the official Time UI creates a normal `ToDo` in a document's `todos` collection. Extend the existing Planner tools with a typed document locator. Do not add a new entity or expose arbitrary class/collection IDs.
2. **`TodoAutomationHelper` is explicitly excluded from the agent surface.** It is a model document containing an executable server `Resource`; the server loads it internally while deciding whether a classic issue may advance status. It is not a stable agent workflow, diagnostics API, or user-owned work object. Do not add a tool, output entity, or guidance-only workaround for it.
3. **Team agenda, observed workload, and visibility-aware free/busy are composed projections.** Huly's Team UI derives them from existing project members, calendar events, WorkSlots, ToDos, and calendar visibility. They are outside the SDK-parity denominator and must not become persistent `TeamAgenda`, `WorkloadSummary`, `Capacity`, or `FreeBusy` classes. A read-only report is worthwhile, but it is blocked until the MCP boundary has a shared privacy projection equivalent to the official UI. “Capacity” is not justified by the current model and should remain an explicit non-goal.

No residual is best closed as “guided” alone. Telling an agent to issue raw `objectId`/`objectClass` transactions would not provide the missing LLM-first operation, and would bypass the typed resolver and privacy requirements.

## Method and classification

This is a primary-source audit. The authority order was: installed npm declarations; the official Huly platform source at the pinned revision; the official model, server trigger, and UI implementations; then this repository's schemas and operations. No competitor SDK or invented entity was used as evidence. The private parity ledger may record upstream exports, but this document does not treat a derived report as an SDK entity.

The labels below mean:

- **direct** — a published Huly model/operation exists and the MCP surface is missing or incomplete;
- **composed** — a useful result is a projection over existing Huly entities, not a new persisted class;
- **guided** — an agent instruction can safely complete the workflow without adding a tool;
- **excluded** — the source object is internal plumbing, browser-only state, or outside the product boundary;
- **blocked** — the desired result cannot be implemented safely or honestly until a source contract, privacy boundary, or product definition exists.

## Evidence by residual

| Residual | Huly-native source fact | Classification | Recommendation |
| --- | --- | --- | --- |
| Document-attached action items | `Document` implements `Todoable` and declares `todos: Collection<ToDo>`; the Time UI uses the generic `todos` collection for any supplied object. | **direct** | Add a document target to the existing Planner lifecycle. |
| `TodoAutomationHelper` visibility/semantics | The class has only `onDoneTester: Resource<TodoDoneTester>`; server code loads and invokes those resources during classic issue status automation. | **excluded** | Keep internal; no MCP tool or guidance. |
| Team agenda | Official Team UI queries member calendars/events and WorkSlots, then renders agenda/calendar modes. | **composed**, **blocked** pending privacy projection | Consider one read-only team planner report after redaction is shared and integration-tested. |
| Observed workload | `groupTeamData` computes per-person union duration, public ToDo mappings, public event duration, and busy duration from existing records. | **composed**, candidate after privacy work | Report scheduled/observed duration; do not call it capacity. |
| Visibility-aware free/busy | Huly filters private events, hides non-public ToDo details, and aggregates busy durations in the Team UI. | **composed**, **blocked** pending privacy-safe MCP projection | Implement only as a redacted projection; never return raw private records. |
| Capacity/working-hours report | `Schedule` stores recurring availability for meeting scheduling, but the Team UI does not use it as employee capacity and has no holiday/leave/capacity contract. | **blocked** and explicit non-goal | Do not add a capacity feature until product semantics and a source contract are defined. |

## 1. Document-attached action items — direct parity

### Published and official Huly contract

The installed `@hcengineering/time@0.7.0` declaration defines `ToDo` as an `AttachedDoc` whose `attachedTo` and `attachedToClass` are generic `Ref<Doc>` values. It also publishes the `Todoable` interface with an optional `todos` collection and the separate `ProjectToDo` subtype ([installed declaration](../../node_modules/@hcengineering/time/types/index.d.ts#L16-L59); [official Time plugin](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time/src/index.ts#L46-L93)). The official model stores `ToDo` in the Time domain, while `ProjectToDo` only refines the required `attachedSpace` field ([official Time model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/time/src/index.ts#L90-L145)).

The document model is not merely a UI convention: `TDocument` implements `Todoable` and declares `todos?: CollectionSize<ToDo>` with the embedded label “Action Items” ([official Document model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/document/src/index.ts#L69-L123)). The official `CreateToDoPopup` accepts a generic `Doc | undefined`; when an object is supplied it calls `addCollection(time.class.ToDo, time.space.ToDos, object._id, object._class, 'todos', ...)`, and it sets `attachedSpace` from `object.space` ([official creation UI](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/CreateToDoPopup.svelte#L41-L92)). Its optional WorkSlots are attached to the new ToDo and map a public ToDo to a public slot; every other ToDo visibility maps to `freeBusy` ([same source](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/CreateToDoPopup.svelte#L94-L115)).

The server create trigger is generic: it resolves `todo.attachedToClass`/`todo.attachedTo`, finds the target, resolves its space, and checks membership before notification ([official Time server resource](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L231-L340)). There is no document-specific server factory required. The `OnToDoUpdate` trigger also propagates title, description, visibility, and completion effects to attached WorkSlots, while the issue-specific behavior is reached only through an `OnToDo` mixin on the target ([same source](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L345-L453)).

The distinction from issue ToDos matters. Issue automation creates `ProjectToDo` records and has classic project status/time-spend behavior ([official issue factory/done handler](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L459-L468), [done handler](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L544-L584)). A document action item created through the generic UI is a `time.class.ToDo`, not a new document-specific class and not an issue `ProjectToDo`.

### Current MCP gap

The MCP schema deliberately accepts only `none` and `issue` attachment modes ([planner schema](../../src/domain/schemas/planner.ts#L91-L106)). The shared resolver returns only those two attachment shapes and otherwise falls back to the personal `NotAttached` sentinel ([planner shared operations](../../src/huly/operations/planner-shared.ts#L65-L72), [resolver](../../src/huly/operations/planner-shared.ts#L176-L197)). `list_todos` can filter by issue but has no document target ([schema](../../src/domain/schemas/planner.ts#L134-L157)); a read of an already-existing generic attachment is represented as `unknown` rather than resolved as a document ([summary mapper](../../src/huly/operations/planner-shared.ts#L341-L357)). Creation therefore turns a requested non-issue attachment into a personal ToDo ([planner operation](../../src/huly/operations/planner.ts#L207-L225)).

This is an accidental closure of a real native capability, not an invented competitor feature.

### Implementation-ready specification

Extend the existing Planner tools, preserving their current personal and issue behavior:

1. Add a `document` branch to `TodoAttachmentInputSchema`:

   ```text
   { type: "document", teamspace: TeamspaceIdentifier, document: DocumentIdentifier }
   ```

   Use the existing teamspace/document name-or-ID conventions. Do not accept an arbitrary `attachedToClass`, collection name, or unbounded raw object in this LLM-facing branch.

2. Resolve the target through `findTeamspaceAndDocument`. Return `attachedTo = document._id`, `attachedToClass = documentPlugin.class.Document`, and `attachedSpace = document.space`. Query/list locators must include both `attachedTo` and `attachedToClass`; matching only the object ID risks collisions across classes.

3. Create document action items with `time.class.ToDo` in `time.space.ToDos`, attached to the document's `todos` collection. Preserve the current fields (title, description, owner, due date, priority, visibility, `doneOn: null`, rank, and `workslots: 0`). Follow the official popup's default of private visibility for a generic/document ToDo unless the caller explicitly supplies another visibility. Keep `ProjectToDo` exclusively for issue action items.

4. Make the same resolved document locator usable by `get_todo`, `update_todo`, `complete_todo`, `reopen_todo`, `delete_todo`, `schedule_todo`, and `unschedule_todo`. Add a document filter to `list_todos`; return a document attachment summary containing the document ID, title, and teamspace ID/name. Retain `unknown` for generic existing attachments that this tool intentionally does not resolve.

5. Keep deletion generic for document ToDos. The current issue-only counter decrement must not run for a document; removing the ToDo document is sufficient. Huly's server trigger handles generic attached records, while issue status transitions remain issue-specific.

6. Treat controlled documents, cards, leads, and other `Todoable` implementations as separate future target types. The `Todoable` interface proves the relation is extensible, but it does not justify a raw generic-object tool. Research each target's resolver and permissions before adding another LLM-facing branch.

### Required local-Huly integration test

Use the repository's real Huly integration harness and no mocks:

- create or select a temporary writable non-archived document teamspace and a temporary document;
- wait/poll for the document write to become visible before attaching the ToDo (Huly's client is eventually consistent after writes);
- create a document ToDo by `teamspace + document`, then list and get it using that locator; assert `attachedTo.type = document`, the document ID/class, and the non-issue `ToDo` class;
- update title/visibility, complete, reopen, schedule and unschedule one WorkSlot, then delete the ToDo; verify the document remains and its action-item collection no longer contains the test record;
- clean up the document/teamspace in a `finally` path and assert no test title remains;
- retain existing personal and issue lifecycle tests as regression coverage.

The server requires the authenticated account to be a member of the target space unless it is a system space ([official create trigger](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L250-L270)). The fixture must therefore use a teamspace the integration account can write. Because read-after-write can be stale, each assertion should use bounded polling rather than an immediate same-session read.

## 2. `TodoAutomationHelper` — explicit exclusion

The published Time contract exposes `TodoAutomationHelper` as a `Doc` with one declared field, `onDoneTester: Resource<TodoDoneTester>` (in addition to inherited `Doc` fields) ([installed declaration](../../node_modules/@hcengineering/time/types/index.d.ts#L69-L78); [official plugin](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time/src/index.ts#L102-L118)). The model registers it in `DOMAIN_MODEL`; it does not define a human-readable configuration payload ([official model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/time/src/index.ts#L147-L155)).

The server's `getTesters` function queries all helper rows from `control.modelDb`, resolves each `Resource`, and invokes the resulting function against a ToDo while calculating a classic issue status transition ([official server resource](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L471-L518)). The only exported server entry points are the issue factory/done functions and internal triggers; there is no public “list helpers,” “explain tester,” or “run helper” operation ([official exports](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time-resources/src/index.ts#L783-L795)). The related `ToDoFactory` and `OnToDo` mixins are also server resource plumbing, not agent operations ([server Time contract](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/time/src/index.ts#L31-L63)).

Classification: **excluded**, not a missing MCP CRUD surface. Returning resource IDs would expose implementation details without semantics; invoking a resource from an MCP call would execute server code outside a stable, typed, user-confirmed contract. No agent guidance can make that safe or useful. Revisit only if Huly publishes a human-readable, authenticated automation diagnostics API with bounded, non-executable output. Do not create an MCP `AutomationDiagnostic` entity or an upstream-unlock task now.

## 3. Team agenda, workload, free/busy, and capacity — composed projections

### What the official Team UI actually composes

The Time Team application has only `agenda` and `calendar` modes ([official Team component](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/team/Team.svelte#L81-L125)). Its navigator starts from non-archived projects where the authenticated account is a member ([official navigator](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/team/TeamNavigator.svelte#L24-L64)). For a selected project, `WithTeamData` resolves project members, queries calendar events by visible calendars/date/participants, removes private events, separates WorkSlots from ordinary events, and loads the ToDos referenced by those WorkSlots ([official data loader](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/team/WithTeamData.svelte#L35-L89)).

`groupTeamData` is the report algorithm. It groups WorkSlots by `todo.user`, computes non-overlapping duration, puts public/undefined-visibility ToDos in full `mappings`, and puts other ToDo slots in `busy` with duration only. It then groups event duration by participant, retaining full event details only when `isVisible` or the participant is the current person; otherwise it accumulates `busyTotal` ([official aggregation](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/team/utils.ts#L21-L127)). The calendar view renders total, planned, public-event, and busy durations per person ([official Team calendar](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/team/calendar/TeamCalendar.svelte#L153-L200)); the agenda hides non-visible event details and shows only “Busy” plus a duration ([official agenda person view](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/time-resources/src/components/team/agenda/PlanPerson.svelte#L41-L71)).

The privacy behavior is deliberate. `hidePrivateEvents(raw, calendars, false)` removes explicit private events before team grouping; surviving events are detail-visible only when public/calendar-visible or visible to the current participant ([official calendar privacy utility](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar-resources/src/utils.ts#L42-L82)). Hidden calendars are skipped by the team aggregation. ToDo details are public only for `visibility === 'public'` or an absent visibility; `freeBusy` and `private` become busy duration. This projection is the privacy contract to reproduce, not an invitation to return raw `Event` or `ToDo` records.

### What can be composed, and what cannot

**Team agenda — composed, but blocked for the current MCP boundary.** A read-only report can use existing project membership, employee/person resolution, calendar events, ToDos, and WorkSlots. It should be scoped explicitly to selected project members and a date range, because the official event query is by member participants/calendars rather than an assertion that every event belongs to the project. It must apply the private-event filter and ToDo visibility projection before returning any item.

**Observed workload — composed and high-value after redaction.** A useful metric is scheduled/observed duration, not a new workload entity. Use the official overlap-union algorithm per person. Report separate `totalScheduledDurationMs`, `plannedTodoDurationMs`, `visibleEventDurationMs`, and `busyDurationMs`; these are projections of the selected window. Do not imply that total scheduled time equals utilization, performance, or contractual workload.

**Visibility-aware free/busy — composed, but blocked until a shared privacy projection exists.** The current calendar operations query events and return titles/details without applying the Team UI's `hidePrivateEvents`/`isVisible` path ([current `listEvents`](../../src/huly/operations/calendar.ts#L113-L157), [current `getEvent`](../../src/huly/operations/calendar.ts#L185-L230)). A new report must not call those operations and blindly aggregate their output. First centralize or otherwise reuse a typed redaction projection that loads calendar visibility, skips hidden calendars, omits private records, and reduces non-public records to duration-only busy data.

**Capacity — blocked and explicitly deferred.** The calendar SDK's `Schedule` has an owner, meeting duration/interval, timezone, and weekday availability map ([installed declaration](../../node_modules/@hcengineering/calendar/types/index.d.ts#L108-L124); [official Calendar plugin](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar/src/index.ts#L161-L175)). MCP already lists and manages these meeting schedules ([current schedule operation](../../src/huly/operations/calendar-schedules.ts#L224-L255)). Neither the source model nor the Team UI says that a Schedule is an employee's working capacity; there is no leave, holiday, exception, or utilization policy in this contract. Do not subtract meetings from `Schedule.availability` and label the result capacity without a product decision and additional authoritative model.

### Proposed composed report contract

After the privacy prerequisite is complete, a single read-only `get_team_planner` (or equivalent) is preferable to exposing a new family of report entities. The minimum contract should be:

```text
input: project identifier, from timestamp, to timestamp, bounded limit
output: project identity, window, and per-member projections:
  person identity
  totalScheduledDurationMs
  plannedTodoDurationMs
  visibleEventDurationMs
  busyDurationMs
  public todo/event items only (optional, bounded)
```

Rules:

- derive the member set from the resolved project and only return people/events the authenticated Huly client can read;
- query visible calendars and participant events in the window; skip hidden calendars;
- remove explicit private events before grouping, following the official team path;
- return public ToDo titles/IDs and public event details; represent non-public ToDo slots and non-detail-visible events only by duration, never title, description, location, participants, attachment, or owner metadata beyond the member aggregate;
- compute per-person union duration using the official overlap semantics, with timestamps and timezone explicitly represented;
- call the result “scheduled duration” or “planner projection,” not capacity, utilization, or performance;
- do not include the Team UI's transaction/activity panel in the first version. It queries broad `core.class.Tx` history by member social IDs and is outside the #261 report question;
- keep all output schemas derived and ephemeral. Do not add `TeamAgenda`, `WorkloadSummary`, `Capacity`, or `FreeBusy` model classes.

### Required local-Huly integration test

The report test must use real records and two or more fixture members where available:

- seed a temporary project/member set, public and non-public ToDos with WorkSlots, and public/freeBusy/private calendar events in a bounded window;
- call the report as an authorized project member;
- assert public titles/details are present, private event records are absent, non-public ToDo/event details are reduced to aggregate busy duration, hidden calendars do not contribute, and overlapping intervals are counted once in total duration;
- assert project membership scoping and the absence of transaction/activity payloads;
- clean every fixture in a `finally` path and rerun the existing calendar/planner integration suite.

This test is a prerequisite for an implementation ticket. The current `list_events`/`get_event` detail behavior is a residual privacy risk, so a report ticket must include the redaction boundary rather than assuming the existing event operation is safe to compose.

## Recommended #261 disposition

The research questions are answered. Keep the issue as a research record until the parent applies the following bookkeeping, then close/replace it with focused implementation work:

1. **Direct parity ticket: document-attached Planner ToDos.** Extend the existing Planner schemas/resolver/lifecycle exactly as specified above. The acceptance criteria are typed document/teamspace resolution, generic `time.class.ToDo` creation, list/get/mutation parity, no arbitrary class input, and a real local-Huly lifecycle test with cleanup. Mark it `ready-for-agent` only after the fixture strategy and eventual-consistency polling are written into the implementation issue.
2. **Composed workflow ticket: privacy-safe team planner projection.** Add the shared event/ToDo privacy projection and one bounded read-only report for scheduled duration, public plan/event items, and busy aggregates. Keep it outside the SDK-parity denominator. It remains blocked until the privacy contract and local-Huly redaction fixture are accepted.
3. **No ticket for `TodoAutomationHelper`.** Record it as an intentional exclusion from the MCP surface. Revisit only if upstream publishes a safe diagnostics contract.
4. **No capacity ticket.** Keep capacity/working-hours semantics explicitly deferred; `Schedule.availability` alone is not evidence of employee capacity.

The resulting plan preserves SDK parity where Huly has a real native entity, adds only a high-value composed projection where the source UI already demonstrates semantics, and avoids introducing competitor-shaped or internal-plumbing entities.
