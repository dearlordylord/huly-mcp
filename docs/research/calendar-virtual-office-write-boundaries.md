# Calendar and virtual-office write boundaries

Research date: 2026-09-05  
Issues: [#262](https://github.com/dearlordylord/huly-mcp/issues/262), [#263](https://github.com/dearlordylord/huly-mcp/issues/263)  
Upstream source revision inspected: hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34  
Published Huly packages inspected: @hcengineering/calendar@0.7.0, @hcengineering/love@0.7.0, and the installed transitive @hcengineering/setting@0.7.0

## Decision summary

Issues #262 and #263 are useful research umbrellas, but neither is a safe single implementation task. The evidence supports a small durable administration slice and several explicit non-goals:

1. **Calendar administration can become implementation-ready as a narrow task.** Read the caller's calendars, update local visibility settings, and set the caller's primary calendar through an LLM-facing wrapper. The wrapper must validate current-user ownership/writability and hide provider identifiers. It must not create, rename, delete, or rewrite provider-owned ExternalCalendar records.
2. **Calendar provider lifecycle, calendar deletion, and attendee RSVP should stay excluded or blocked.** The published SDK has no provider disconnect operation on the Calendar document model and no RSVP field or operation. Disconnect is an account/provider integration action, not deletion of a Calendar document.
3. **Virtual-office durable metadata has a bounded implementation slice.** Room/Floor creation and selected Room fields have official document write paths. Meeting/MeetingSchedule room assignment is a composed operation that must hide love.mixin.* mechanics. Meeting-minutes title and description are ordinary edits; meeting lifecycle and status are server/provider-owned.
4. **Transient office state and LiveKit/AI/recording operations must not be exposed as ordinary CRUD.** ParticipantInfo and RoomInfo are transient projections maintained by server triggers. Join/leave, transcription, and recording combine document mutations with external services and asynchronous callbacks; their safe MCP contract is not present.
5. **OfficeSettings is blocked by the dependency boundary.** The local runtime has the class, and the upstream UI has a singleton workspace setting, but the installed @hcengineering/setting@0.7.0 declarations do not export OfficeSettings. Do not invent a local class/type bridge or depend on a raw class identifier.

Recommended bookkeeping is to close each research umbrella only after creating narrow follow-up tasks for the implementation-ready slices and recording the blocked/excluded decisions in the issue. Neither issue should be marked ready-for-agent in its current broad form.

## Method and classification vocabulary

The comparison uses only primary evidence: the installed npm declarations, the checked-out official Huly source at the revision above, the current hulymcp implementation, and read-only probes against the local deployment. “Official UI writes field X” is evidence that the Huly document client accepts the field in that workflow; it is not evidence that every caller may write it or that the field is provider-independent.

Classifications in this document mean:

| Classification | Meaning for an MCP operation |
| --- | --- |
| **Direct** | One stable, published Huly document/preference operation with a bounded field contract and no provider or transient lifecycle hidden behind it. |
| **Composed** | A safe LLM-facing operation that owns multiple native document operations (for example, base document plus a typed mixin) and validates/cleans up as one unit. Raw mixin transactions remain internal. |
| **Guided** | The underlying capability exists, but safe use depends on an explicit user workflow, deployment/provider state, or sequencing that should not be disguised as a generic write. |
| **Excluded** | Deliberately not exposed: a provider-owned identifier, transient projection, unsupported entity, or semantic surface outside the product's original contract. |
| **Blocked** | A plausible capability whose required published type, runtime endpoint, authorization rule, or deterministic test contract is missing. |

## Installed SDK boundary

The installed Calendar package exports Calendar, ExternalCalendar, PrimaryCalendar, Event, and Schedule. The declarations make the ownership split visible: Calendar has name, hidden, visibility, user, and access; ExternalCalendar adds default, externalId, and externalUser; PrimaryCalendar is a preference pointing at a Calendar; events contain participants and external participant email strings but no attendee response/status; and schedules contain only scheduling fields plus an optional Calendar target ([installed Calendar declarations](../../node_modules/@hcengineering/calendar/types/index.d.ts#L11-L32), [events and schedules](../../node_modules/@hcengineering/calendar/types/index.d.ts#L66-L124)).

The installed Love package exports Room/Floor/Office, transient ParticipantInfo/RoomInfo, the Meeting and MeetingSchedule mixins, DevicesPreference, and MeetingMinutes. Meeting minutes expose title, description, status, meeting end, and collection counts; there is no recording entity and no transcript text field in this package ([installed Love declarations](../../node_modules/@hcengineering/love/types/types.d.ts#L15-L87)).

The installed setting package is present only transitively at 0.7.0 and has no OfficeSettings declaration. The official source does define that class and interface, but importing or encoding it is not SDK parity with the current dependency graph. This is a real publication/dependency blocker, not a reason to hand-write a type ([installed setting declarations](../../node_modules/.pnpm/@hcengineering+setting@0.7.0/node_modules/@hcengineering/setting/types/index.d.ts), [official interface](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/setting/src/index.ts#L150-L165)).

The current MCP implementation already exposes Calendar event/schedule CRUD and a **narrow** list_calendars that returns only writable, non-hidden targets ([Calendar tools](../../src/mcp/tools/calendar.ts#L72-L204), [calendar target resolution](../../src/huly/operations/calendar-shared.ts#L104-L177)). It exposes read-only Floor/Room/Office, active transient state, MeetingMinutes, device preferences, and room defaults ([virtual-office tools](../../src/mcp/tools/virtual-office.ts#L57-L192), [virtual-office operations](../../src/huly/operations/virtual-office.ts#L224-L404)). Schedule reads already inspect a MeetingSchedule mixin, while current schedule create/update only writes the base Calendar Schedule ([schedule room lookup](../../src/huly/operations/calendar-schedules.ts#L164-L185), [schedule writes](../../src/huly/operations/calendar-schedules.ts#L318-L360)).

## Issue #262 — Calendar, ExternalCalendar, and PrimaryCalendar

### Ownership facts

The official Calendar model registers Calendar and ExternalCalendar as ordinary Calendar-domain documents, PrimaryCalendar as a preference, and Event/Schedule as separate models. The model source does not provide a user-facing Calendar deletion or provider-disconnect operation ([official Calendar models](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/calendar/src/index.ts#L80-L192)).

The official Calendar settings UI queries Calendars belonging to the current account's social IDs. It updates hidden and visibility; it disables the hidden toggle for the internal Huly Calendar; and it creates or updates the singleton PrimaryCalendar preference ([CalendarSettings.svelte](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar-resources/src/components/CalendarSettings.svelte#L16-L79)). The selector separately filters to hidden false and access of Writer or Owner, matching the current MCP's target-resolution guard ([CalendarSelector.svelte](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar-resources/src/components/CalendarSelector.svelte#L15-L63), [current resolver](../../src/huly/operations/calendar-shared.ts#L104-L177)).

Primary selection is not a boolean stored on the Calendar. Huly resolves it in this order: an existing preference target; a non-hidden provider ExternalCalendar whose provider set default is true; and finally the authenticated account's internal account UUID plus _calendar fallback ([getPrimaryCalendar](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar/src/utils.ts#L432-L450)). This fallback is why changing ExternalCalendar.default in MCP would be wrong: it would alter provider sync semantics rather than the user's local preference.

The local Google sync service creates ExternalCalendars from provider calendar-list entries. It owns externalId, externalUser, provider default, initial visibility, user, and provider access; on later sync it updates provider-derived name/access, but not local hidden state or the provider identifiers ([Google Calendar sync](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/calendar/pod-calendar/src/sync.ts#L601-L705)). The integration UI only updates an external calendar's local hidden flag ([integration calendar settings](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar-resources/src/components/IntegrationConfigure.svelte#L25-L45)).

Provider disconnect is a different operation. Huly calls the account integration client to remove an integration or connection and then calls the provider's sign-out endpoint; it does not remove ExternalCalendar documents ([calendar integration API](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/calendar-resources/src/api.ts#L35-L68)). No official cleanup contract was found that deletes stale ExternalCalendar documents while preserving events and references. Therefore Calendar-document deletion must not be inferred from disconnect.

### Operation decisions for #262

| Operation or field | Authority and safe boundary | Classification | Decision |
| --- | --- | --- | --- |
| List the caller's calendars, including hidden/provider-backed rows | Calendar documents; filter to the authenticated user's social IDs and return stable Calendar metadata. Current list_calendars intentionally returns only writable, non-hidden targets. | **Direct** (read) | Add a separate administration read if needed. It may return id, name, class kind, hidden, visibility, access, and computed isPrimary; do not return externalId/externalUser as ordinary workflow data. |
| Read the computed primary calendar | getPrimaryCalendar plus a caller-scoped Calendar set. | **Direct** (read) | Reuse the existing helper, but ensure the input list is caller-scoped and the result is not merely an inaccessible preference target. |
| Set the caller's primary calendar | Create/update PrimaryCalendar.attachedTo in Workspace space. The UI does exactly this. | **Composed** | Add a high-level set_primary_calendar-style operation: resolve an explicit current-user Calendar, require it to be non-hidden and Writer/Owner, then create/update the preference. Never set ExternalCalendar.default. |
| Change visibility on a caller-owned Calendar | Official Calendar settings writes client.update(calendar,{visibility}); values are public, freeBusy, private. | **Direct** | Safe narrow write, subject to current-user/ACL checks. Do not use it to claim provider ACL changes. |
| Hide/unhide an external Calendar | Official integration/settings UI writes only hidden; this is a local presentation choice. | **Direct** | Safe narrow write for a caller-owned ExternalCalendar. Do not allow hiding the internal Huly Calendar; after hiding, primary resolution must use the documented fallback behavior. |
| Hide/unhide the internal Huly Calendar | CalendarSettings disables this control. The internal calendar is the fallback target. | **Excluded** | Do not add a generic hidden write that can strand the default calendar. |
| Change Calendar name, user, or access | These are model fields, but official settings does not provide a user workflow for changing them. External name/access are refreshed from the provider. | **Guided / excluded** | Read them when authorized. Do not expose general updates until Huly supplies an ownership/ACL contract for each class. |
| Create an internal Calendar | The SDK has a class, but the product's supported user workflow is to use calendars provisioned by Huly. | **Excluded** | Do not manufacture extra Calendar entities; this would violate the original product surface and primary-calendar invariants. |
| Create/update ExternalCalendar | Provider sync creates and refreshes these records from provider calendar-list state. externalId, externalUser, default, and provider access are not MCP-owned. | **Excluded** | Never expose raw ExternalCalendar CRUD. A future provider adapter may synchronize it, but that is not a Calendar administration tool. |
| Delete a Calendar or ExternalCalendar | No official user-facing Calendar deletion/cleanup contract was found. Events point at Calendar refs; provider disconnect is account/integration state. | **Blocked** (and **excluded** from current scope) | Do not implement. Need an upstream cleanup contract covering event references, primary preference repair, provider mapping, and stale sync rows. |
| Disconnect Google/CalDAV integration | Account integration client plus provider sign-out, not a Calendar document transaction. | **Guided / blocked** | Do not wrap it as Calendar deletion. Only implement as a separately researched provider/account feature with its own published account-client contract. |
| Attendee RSVP/response state | Event contains Huly Contact refs and external participant email strings. Calendar sync maps attendee identities but does not persist response status; no SDK field or operation exists. | **Excluded** (currently **blocked** by upstream contract) | Do not add RSVP entities or infer status from participant membership. Reopen only when a published provider-neutral RSVP field and update/read API exist. |

### Calendar write contract if split into a task

The implementation-ready slice should be deliberately small:

- list_calendar_settings: caller-scoped Calendar rows, with a class discriminator and isPrimary computed from the same validated set used by selection;
- set_primary_calendar: explicit Calendar ID/name resolution, requiring current-user ownership/social identity, hidden false, and Owner/Writer access; create or update the one PrimaryCalendar preference;
- update_calendar_settings: allow only visibility for any caller-owned row and hidden for ExternalCalendar rows; reject internal-calendar hiding and all provider-owned fields.

The operation should use the published Calendar types and existing resolveCalendarRef/getPrimaryCalendar logic. It should not expose a generic update_calendar with an open-ended field map. Integration coverage must exercise primary preference creation, replacement, a stale preference target, the provider-default fallback, an internal-calendar hidden rejection, and external hidden/visibility updates, with cleanup that restores or removes only the test preference.

## Issue #263 — Virtual office and meeting write boundaries

### Durable versus transient model facts

The official Love model places Room, Office, and Floor in the durable love domain. Room name/description, language, and recording/transcription defaults are modeled fields; floor is explicitly @ReadOnly, and Office.person is explicitly @ReadOnly. ParticipantInfo and RoomInfo are in DOMAIN_TRANSIENT. DevicesPreference is a preference. Meeting and MeetingSchedule are mixins over Calendar Event and Schedule. MeetingMinutes is a durable meeting-minutes document, but its attachment target, status, start, and end are read-only/server-owned ([official Love models](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/love/src/index.ts#L84-L236)).

The source annotations are a stronger boundary than the fact that the generic client can technically submit a transaction. A direct document update can trigger server behavior or corrupt a projection. The Love server triggers create/remove ParticipantInfo, maintain RoomInfo, create active MeetingMinutes, add collaborators, reset empty-room access, assign offices to employees, and finish meetings ([Love server triggers](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/love-resources/src/index.ts#L75-L363)).

### Durable office administration

The official Add Room UI creates Floors and Room/Office documents with a type-specific initial data set, a free floor-plan position, and (for video rooms) workspace defaults. It creates offices with person null ([AddRoomPopup.svelte](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/components/AddRoomPopup.svelte#L40-L93)). Room configuration explicitly updates a room name and removes a room only when no active participant occupies it; office assignment also moves transient participants ([RoomConfigure.svelte](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/components/RoomConfigure.svelte#L30-L73)). Access and room-level auto-start defaults have explicit UI writes ([RoomAccessPopup.svelte](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/components/RoomAccessPopup.svelte#L7-L56), [RoomTranscriptionSettings.svelte](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/components/RoomTranscriptionSettings.svelte#L15-L53)). These paths establish a bounded room-administration contract, but not a blanket update for every field in the TypeScript interface.

| Operation or field | Authority and safe boundary | Classification | Decision |
| --- | --- | --- | --- |
| List/get Floor | Durable love.class.Floor, currently exposed read-only. | **Direct** (read) | Keep. |
| Create Floor with a name | Official UI creates a Workspace Floor document. | **Direct** | Implementation-ready if needed; validate nonblank name and use the normal Workspace class/ACL. |
| Rename/delete Floor | A Floor name exists, but no focused official rename/delete workflow or room-reference cleanup contract was found. | **Guided / blocked** | Do not add until room reassignment and deletion semantics are proven. |
| List/get Room or Office | Durable Room/Office fields, currently exposed read-only. | **Direct** (read) | Keep. |
| Create a Room/Office | Official UI chooses one of video/audio/reception/office types, computes a free position, initializes access/language/defaults, and creates the proper class. | **Composed** | Implementation-ready as one high-level create operation. Hide getFreePosition, class choice, default lookup, and raw transaction details. Require a Floor and a supported type. |
| Rename a non-special Room | Official UI updates name. | **Direct** | Implementation-ready; do not make it an open-ended document update. |
| Update Room description | Room description is a collaborative markup field and is a normal durable property. | **Direct** | Implementation-ready if the MCP adds a focused description operation using the existing markup boundary. |
| Update Room access | Official UI writes access; allowed values differ for offices (Knock/DND) and non-offices (Open/Knock/DND). | **Direct** | Implementation-ready with type-specific enum constraints and ACL checks. |
| Update startWithTranscription / startWithRecording | Official RoomTranscriptionSettings writes exactly these booleans. | **Direct** | Implementation-ready as durable defaults only. The operation must not claim to start/stop an active provider session. |
| Update Room language | SDK exposes a language field, but it is @Hidden; the active meeting language is also sent to the Love/AI services. The UI language editor is currently disabled. | **Guided / blocked** | Do not expose until a stable language write contract distinguishes a room default from an active session. |
| Move/resize Room (floor, x, y, width, height) | Floor is @ReadOnly; geometry is floor-plan UI state and the create path computes placement. | **Guided / excluded** | Do not expose raw layout writes in the first administration slice. If later needed, provide one validated layout operation with bounds and collision rules, not five generic fields. |
| Assign Office.person | Model field is @ReadOnly; OnEmployee triggers automatically assign/unassign free offices and RoomConfigure also moves ParticipantInfo. | **Excluded** (or **guided** through a future employee workflow) | Never expose a direct person assignment. It can race server allocation and transient participant moves. |
| Delete Room/Office | UI permits deletion only when the room has no ParticipantInfo; server-owned MeetingMinutes and room references still need consideration. | **Guided / blocked** | A future high-level delete may prove occupancy and dependent-document policy first. Do not expose generic remove. |

### Meetings and schedules

Meeting room assignment is a typed mixin, not an extra standalone entity. The official create hook creates a love.mixin.Meeting on every recurring Event sharing the event ID, then updates the event location with an invite link. The schedule hook creates a love.mixin.MeetingSchedule after the base Calendar Schedule exists ([Love create hooks](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/utils.ts#L312-L360)). The official edit components update the Meeting mixin across all recurring Event siblings and update the schedule mixin through the typed class reference ([meeting room edit](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/components/EditMeetingData.svelte#L23-L41), [schedule room edit](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/components/EditMeetingScheduleData.svelte#L23-L40)).

Current hulymcp reads these mixins but its create_schedule writes only the base Schedule and accepts no room; this is a genuine parity gap, not a reason to expose raw createMixin to the model ([current schedule create/update](../../src/huly/operations/calendar-schedules.ts#L318-L360)).

| Operation | Classification | Decision |
| --- | --- | --- |
| Create Calendar Event with an optional meeting room | **Composed** | Extend the existing event create shape with an optional room reference only if the operation can create the typed Meeting mixin for all recurring siblings and preserve the current event/calendar validation. Keep the mixin class internal. |
| Change a meeting Event's room | **Composed** | Resolve a current readable Room, find all Event siblings by eventId, and update the Meeting mixin on each. Reject ordinary Events without the mixin rather than silently creating a meeting. |
| Create Calendar Schedule with an optional meeting room | **Composed** | Extend create_schedule or add a clearly named high-level meeting-schedule operation. Create the base Schedule, then attach the typed MeetingSchedule mixin; clean up the base Schedule if mixin creation fails and the client can prove the cleanup. |
| Change a MeetingSchedule room | **Composed** | Update the existing typed mixin by schedule ID. Do not put a room property in the base Schedule payload. |
| Direct raw Meeting/MeetingSchedule mixin CRUD | **Excluded** | It is an implementation mechanic, not an original LLM-facing entity. |
| Delete Event/Schedule with a meeting mixin | **Guided / blocked** | Existing event/schedule deletion is available, but no source-backed cleanup contract proves invite-link, recurring-sibling, and mixin cleanup semantics. Do not expand deletion in this research task. |

### Meeting minutes, transcript, recording, and device preferences

Meeting minutes are created as part of the join workflow, not as arbitrary notes. The official workflow finds an active MeetingMinutes for the Room or creates one with attachedTo, status Active, a generated title, and the meetings collection; server triggers add collaborators and finish active minutes when a room empties ([join/leave workflow](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/meetings.ts#L22-L105), [meeting document creation](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/meetings.ts#L141-L183), [finish trigger](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/love-resources/src/index.ts#L306-L328)). The model marks attachedTo, status, createdOn, and meetingEnd read-only, while title and description are writable ([MeetingMinutes model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/love/src/index.ts#L183-L232)).

| Operation or surface | Authority and evidence | Classification | Decision |
| --- | --- | --- | --- |
| List/get MeetingMinutes metadata | Durable love.class.MeetingMinutes; current MCP already returns title, attachment target, status, timestamps, and collection counts. | **Direct** (read) | Keep. Do not present collection counts as transcript/recording content. |
| Edit MeetingMinutes title/description | Official editor writes title; description is a collaborative document field. | **Direct** | Implementation-ready as focused edits. Do not permit status/attachment target/end edits. |
| Create an active MeetingMinutes | Join/invite workflow plus server triggers create it and collaborators. | **Composed / guided** | Do not add arbitrary create_meeting_minutes. A future join operation may own this composition. |
| Change MeetingMinutes status/end/attachedTo | Server trigger and model @ReadOnly fields. | **Excluded** | Never expose as document updates. |
| Delete MeetingMinutes | No safe deletion/retention contract was found for generated meeting records, transcript collections, or attachments. | **Blocked** | Keep unavailable until upstream defines cleanup semantics. |
| Read transcript text | Transcript is a collection of chunter.class.ChatMessage documents attached through MeetingMinutes.transcription; the Love SDK exposes only a collection count. AI bot appends text asynchronously to that collection ([AI transcript append](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/ai-bot/pod-ai-bot/src/workspace/love.ts#L201-L231)). | **Blocked** | A future read adapter must use a published Chunter/communication collection contract and schema-decode message content. Do not infer transcript text from the count or create a Love-specific transcript entity. |
| Start/stop transcription | Browser code calls the AI-bot love/connect/love/disconnect endpoint; the AI bot calls the Love service and maintains in-memory connected-room state ([AI requests](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/ai-bot-resources/src/requests.ts#L96-L145), [AI Love controller](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/ai-bot/pod-ai-bot/src/workspace/love.ts#L135-L176)). | **Blocked / excluded** | No published SDK or deterministic MCP endpoint. Do not mutate Room metadata and claim transcription has started. |
| Read/start/stop recording | Love service starts LiveKit egress and returns before the asynchronous webhook stores a Drive file and attaches it to MeetingMinutes. There is no recording entity in @hcengineering/love ([Love service](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/love/src/main.ts#L104-L250), [Drive attachment callback](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/love/src/workspaceClient.ts#L57-L100)). | **Blocked** | Keep provider operations out of the MCP SDK surface. A later composed read may use a proven Drive/Attachment link, but it needs an authoritative recording marker and async completion contract. |
| Read/write DevicesPreference | Preference fields are published. The write is a caller preference, not a LiveKit device command; the active browser session owns camera/mic state. | **Direct** (persisted preference) / **guided** (active device) | A current-account-only preference tool is implementation-ready if desired. Never list or edit another account's preference and never report a persisted toggle as a live device state change. |
| Read/write OfficeSettings workspace defaults | Official setting UI creates/updates a singleton OfficeSettings with two default booleans ([OfficeSettings UI](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/setting-resources/src/components/OfficeSettings.svelte#L20-L75)); local runtime class discovery sees the class, but installed setting declarations do not export it. | **Blocked** | Wait for a compatible published setting package and add it as an explicit dependency. Do not use a hand-written interface, untyped class ID, or TypeAny workaround. |

### Join, leave, and transient participant state

Joining is not a document-only operation. The browser checks room access, may send a join request, moves/creates the current ParticipantInfo, obtains a provider token, connects to LiveKit, and opens the MeetingMinutes view. Leaving moves or removes participant state, may kick other participants from an office, disconnects LiveKit, and relies on triggers to update room projections/finish minutes ([Love meetings workflow](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/meetings.ts#L22-L171), [LiveKit client](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/love-resources/src/liveKitClient.ts#L45-L175)).

ParticipantInfo and RoomInfo are transient model documents. The server creates/removes them from user presence and reacts to their mutations; directly creating, moving, or deleting them from MCP would bypass the provider session and invoke side effects in an order the MCP cannot guarantee ([transient model and triggers](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/love/src/index.ts#L146-L176), [server trigger lifecycle](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/server-plugins/love-resources/src/index.ts#L95-L363)).

| Operation | Classification | Decision |
| --- | --- | --- |
| List active occupancy/participants | **Direct** (read) | Keep as discovery only; label results transient and do not imply a durable membership record. |
| Create/update/remove ParticipantInfo or RoomInfo | **Excluded** | Never expose raw transient CRUD. |
| Join/leave a room or meeting | **Blocked** (conceptually **composed**) | A future operation would need an authenticated LiveKit/AI/provider port, current-user session identity, access-request behavior, idempotency, timeout/error semantics, and deterministic cleanup. The Huly document client alone is insufficient. |
| Start/stop camera, microphone, screen, or provider session | **Excluded / blocked** | These are LiveKit client state, not server-side Huly documents. |

## Runtime evidence from this deployment

Read-only probes used the documented container URL override (HULY_URL=http://host.docker.internal:8087) and normal credentials. They are availability evidence, not a substitute for a write contract:

- list_huly_classes found the Love classes Room, Office, Floor, MeetingMinutes, DevicesPreference, ParticipantInfo, RoomInfo, and the Meeting/MeetingSchedule mixins.
- get_huly_class confirmed the live Room and MeetingMinutes fields/projections and confirmed that setting:class:OfficeSettings exists at runtime, while the installed package still lacks its declaration.
- list_calendars returned only internal writable, non-hidden calendars in this workspace and marked one computed primary. It did not prove that an external provider is configured.
- The live workspace had one Floor, no active RoomInfo/ParticipantInfo rows, no MeetingMinutes rows, and no DevicePreferences rows at probe time. Room listing returned an unexpected runtime error, so this report does not treat room-list success as certified.
- list_office_defaults returned current room-level default flags. This shows that the existing read path can observe durable Room defaults; it does not establish that workspace OfficeSettings is safely writable through the installed SDK.

The probes were read-only. No Calendar, ExternalCalendar, PrimaryCalendar, Room, Floor, MeetingMinutes, preference, transient document, provider session, recording, or transcript was created or mutated.

## Deterministic integration-test boundary

The local integration suite can safely cover durable document paths without pretending to test browser/provider state:

1. **Calendar:** create/update/remove only temporary primary preference state; test caller-scoped calendar filtering, writable/non-hidden validation, primary replacement, stale preference fallback, internal-calendar hidden rejection, and external hidden/visibility updates where an external fixture exists. Never create provider ExternalCalendars in the suite unless a provider-owned fixture is already present.
2. **Room/Floor:** create a disposable Floor and Room through the high-level contract, assert type-specific defaults and field updates, and remove only an empty test Room/Floor after eventual-consistency checks. Do not use direct ParticipantInfo writes as setup or cleanup.
3. **Meeting/MeetingSchedule:** create a disposable base Event/Schedule through the composed API, assert the typed room mixin is present, update the room through the wrapper, and clean up base plus mixin using an implementation-owned cleanup port. Do not make raw mixin mechanics part of MCP input.
4. **MeetingMinutes:** test title/description edits only on a fixture created by the supported meeting workflow. Assert status and attachment target are read-only. Avoid manufacturing a fake transcript/recording collection.
5. **Preferences:** test current-account DevicesPreference persistence separately from active LiveKit state. OfficeSettings tests remain blocked until a compatible package is installed.
6. **Provider operations:** test only an explicit unsupported/capability result until a first-party authenticated Love/AI/LiveKit test service can provide deterministic start/stop, timeout, and cleanup behavior. Do not make the normal local suite depend on LiveKit, S3, AI-bot, or asynchronous recording webhooks.

All writes need finally cleanup and must account for Huly's eventual consistency. A successful document transaction is not evidence that an external provider operation completed, and an HTTP 200 from /startRecord is not evidence that a recording attachment exists.

## Recommended issue/task disposition

### #262

Keep the research conclusions, then replace the broad issue with a narrow implementation task for caller-scoped Calendar settings: list settings, set the primary preference, and update only local visibility/hidden fields with the invariants above. Mark that follow-up implementation-ready after its contract and cleanup integration tests are written. Keep provider-created ExternalCalendar CRUD, provider disconnect, Calendar deletion, and RSVP explicitly excluded/blocked; they should not be bundled into the implementation task.

### #263

Split the broad issue into at most these original-product follow-ups:

- durable virtual-office Room/Floor administration with bounded fields and empty-room cleanup;
- composed room assignment for Calendar meetings and schedules, keeping love.mixin.Meeting and love.mixin.MeetingSchedule private;
- optional current-account DevicesPreference persistence if there is a concrete user need;
- optional MeetingMinutes title/description edits, separate from meeting lifecycle.

Keep OfficeSettings blocked behind a compatible published @hcengineering/setting artifact. Keep join/leave, LiveKit device/session state, transcription, recording, arbitrary MeetingMinutes creation/deletion, transcript message reads, and transient participant/room-info writes blocked or excluded. Do not mark the umbrella issue ready-for-agent; close it only after the narrow tasks and the explicit non-goals are recorded.

## Conclusion

The gaps are not “all fields missing from the TypeScript interfaces.” Huly intentionally divides these surfaces into local durable preferences/documents, provider-owned synchronization records, server-maintained projections, and external real-time services. SDK parity therefore means preserving those original boundaries:

- add only the narrow Calendar and durable Room/meeting compositions whose authority is documented;
- guide or block workflows whose correctness depends on account/provider state;
- explicitly exclude transient/proprietary entities and invented RSVP/recording models;
- do not let a technically writable generic transaction turn a server-owned field into an MCP feature.

