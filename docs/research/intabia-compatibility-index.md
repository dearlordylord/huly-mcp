# Intabia compatibility index

Validated 2026-09-13 against Intabia `0.8.33` / model `0.8.4` in the disposable `mcp-compat` workspace. This index accounts for every tool in the 601-tool registry snapshot from the reviewed build. It combines the broad integration run, fixture-complete document/messaging and Test Management reruns, and focused follow-up probes.

Tracking ticket: [GitHub issue #279](https://github.com/dearlordylord/huly-mcp/issues/279).

## Interpretation

- **Passed** means at least one explicit successful live call or assertion exists. An empty successful list proves its query and output path, not populated-record mapping.
- **Mixed** means at least one variant passed and another failed.
- **Failed** means the exercised live path failed and no successful invocation of that exact tool is recorded.
- **Skipped** means the operation was intentionally not called, usually because it was destructive or lacked a cleanup path.
- **Unverified** means no successful or failed invocation is recorded. The reason is listed below.

These are tool-level evidence labels, not percentages of product support. One successful call does not prove every parameter combination, permissions, error path, concurrency behavior, or deployment version.

## Evidence summary

- Registry: 601 tools.
- Existing full runner: 1,045 call sites naming 521 unique tools.
- Broad run: 1,187 passed, 26 failed, 39 skipped assertions.
- Fixture-complete document/messaging rerun: 226 passed, 0 failed, 0 skipped assertions; overlaps the broad run.
- Native UI fixtures enabled the Test Management and Controlled Documents modules and added Test Management, document-template, Drive-version, and meeting-minute records.
- Fixture follow-up: 32 Test Management assertions passed and 1 failed after correcting malformed integration-runner arguments; `run_test_plan` proved one result was created from one retained plan item, and the generated result and run were explicitly deleted before the remaining cleanup. The retained Drive version restore passed and was restored to its original current version.
- Original Huly control with the same corrected runner and reviewed MCP: 1,431 passed, 9 failed and 32 skipped assertions. Huly's task-management `kind` contract passed. Eight unresolved failures belong to one custom-sequence retry/update scenario and one to a full-content document-replacement timeout; the remaining exercised families passed their recorded assertions. Test Management remained skipped because the Huly workspace has no Test Management project.
- Tool ledger: 502 passed, 7 mixed, 17 failed, 22 skipped, 53 unverified.
- Reviewed source quality gate: 337 test files / 4,862 tests passed; coverage above 99% in every category.

## Category summary

<!-- category-summary:start -->
| Category | Total | Passed | Mixed | Failed | Skipped | Unverified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| activity | 16 | 8 | 1 | 0 | 0 | 7 |
| approvals | 7 | 7 | 0 | 0 | 0 | 0 |
| associations | 6 | 4 | 0 | 1 | 0 | 1 |
| attachments | 18 | 16 | 0 | 0 | 2 | 0 |
| boards | 25 | 7 | 0 | 4 | 0 | 14 |
| calendar | 17 | 13 | 1 | 1 | 2 | 0 |
| cards | 12 | 12 | 0 | 0 | 0 | 0 |
| channels | 39 | 39 | 0 | 0 | 0 | 0 |
| collaborators | 3 | 3 | 0 | 0 | 0 | 0 |
| comments | 4 | 4 | 0 | 0 | 0 | 0 |
| contacts | 43 | 42 | 0 | 1 | 0 | 0 |
| custom-fields | 3 | 3 | 0 | 0 | 0 | 0 |
| documents | 17 | 16 | 0 | 0 | 0 | 1 |
| drive | 23 | 23 | 0 | 0 | 0 | 0 |
| hr | 30 | 30 | 0 | 0 | 0 | 0 |
| inventory | 30 | 30 | 0 | 0 | 0 | 0 |
| issues | 31 | 31 | 0 | 0 | 0 | 0 |
| labels | 4 | 4 | 0 | 0 | 0 | 0 |
| leads | 26 | 3 | 1 | 1 | 0 | 21 |
| mail | 1 | 0 | 0 | 1 | 0 | 0 |
| milestones | 6 | 6 | 0 | 0 | 0 | 0 |
| model-administration | 6 | 6 | 0 | 0 | 0 | 0 |
| notifications | 23 | 12 | 1 | 1 | 6 | 3 |
| planner | 13 | 13 | 0 | 0 | 0 | 0 |
| preferences | 2 | 2 | 0 | 0 | 0 | 0 |
| processes | 5 | 2 | 0 | 0 | 3 | 0 |
| projects | 8 | 6 | 0 | 0 | 1 | 1 |
| recruiting | 48 | 46 | 0 | 0 | 0 | 2 |
| sdk-discovery | 8 | 8 | 0 | 0 | 0 | 0 |
| search | 1 | 1 | 0 | 0 | 0 | 0 |
| security-administration | 8 | 8 | 0 | 0 | 0 | 0 |
| sequence-administration | 3 | 3 | 0 | 0 | 0 | 0 |
| spaces | 15 | 15 | 0 | 0 | 0 | 0 |
| storage | 1 | 0 | 0 | 0 | 1 | 0 |
| support | 1 | 1 | 0 | 0 | 0 | 0 |
| tag-categories | 4 | 4 | 0 | 0 | 0 | 0 |
| tags | 7 | 7 | 0 | 0 | 0 | 0 |
| task-management | 5 | 2 | 0 | 3 | 0 | 0 |
| templates | 5 | 3 | 0 | 0 | 0 | 2 |
| test-management | 29 | 27 | 1 | 1 | 0 | 0 |
| time tracking | 7 | 7 | 0 | 0 | 0 | 0 |
| user-statuses | 1 | 1 | 0 | 0 | 0 | 0 |
| views | 3 | 3 | 0 | 0 | 0 | 0 |
| virtual-office | 15 | 10 | 1 | 3 | 0 | 1 |
| workbench | 1 | 0 | 1 | 0 | 0 | 0 |
| workflow-statuses | 10 | 10 | 0 | 0 | 0 | 0 |
| workspace | 11 | 4 | 0 | 0 | 7 | 0 |
<!-- category-summary:end -->

## Known failures and mixed behavior

The root-cause ticket must treat these separately: confirmed model differences, unsupported modules, fixture gaps, and unresolved failures are not interchangeable.

<!-- problems:start -->
| Area/tools | Evidence | Classification | Next work |
| --- | --- | --- | --- |
| `get_project_type`, `list_task_types`, `create_task_type` | Intabia `TaskType` uses root/parent fields instead of Huly's required `kind` projection. | Confirmed model-contract mismatch | Design a faithful cross-model projection; do not invent `kind`. Re-enable custom task-type issue tests. |
| `get_funnel` and downstream lead tools | Default Lead task target class fails our workflow check. `create_lead` produced no stdio response in one run, although a later `get_lead` found the record. | Confirmed workflow mismatch plus unresolved response behavior | Inspect Intabia Lead task type/target classes, then rerun the complete lead lifecycle with reconciliation. |
| `list_activity` | Most calls passed or returned empty; one friendly-target assertion omitted the expected object ID. A new issue/update produced no activity messages. | Mixed; root cause unresolved | Compare Intabia activity-generation and projection records with Huly. Add a populated activity fixture before testing replies and pinning. |
| `list_social_identity_providers` | Intabia returned a provider value outside our finite schema. | Confirmed output-contract mismatch | Capture the exact non-secret provider discriminator and extend the schema only if it represents a supported Intabia contract. |
| `get_event`, `create_event` | Ordinary event create/delete passed, but two reads failed and native Meeting reconciliation failed. A native UI-created scheduled meeting also cannot be read by `get_event`. | Mixed; confirmed native model difference remains | Inspect Intabia's meeting/event link model and support derived or linked event records. |
| `get_notification_context`, `list_notification_contexts` | Ordinary context listing passed; hidden-context listing and context lookup failed output validation. | Mixed output-contract mismatch | Capture decoded boundary differences and add Intabia fixtures for archive/pin/hide operations. |
| `create_relation` | Intabia issues resolve as `tracker:class:IssueTaskType`; relation endpoint validation requires `tracker:class:Issue`. | Confirmed class-contract mismatch | Make relation validation hierarchy-aware without weakening unrelated endpoint checks. |
| Board/workbench tools | Intabia has no Huly Board application/model declaration. Board queries fail; `list_workbench_applications` otherwise works but one preference-state assertion returned null. | Unsupported module plus one mixed projection | Detect missing Board capability explicitly and return a typed unsupported result; investigate nullable workbench preference state. |
| `list_mail_threads` | Direct mail fixture seeding failed; a subsequent empty query failed at `findAll`. | Unresolved and fixture-incomplete | Compare Intabia mail classes and seed a supported Mail fixture before classifying compatibility. |
| `list_office_rooms`, `list_offices` | Floors/defaults work, while room listing throws and offices fail output validation. | Confirmed live failures; root cause unresolved | Compare Intabia virtual-office room/office DTOs and class hierarchy. |
| `list_meeting_minutes`, `get_meeting_minutes` | Empty listing previously passed. A native scheduled meeting has status `7`, extends `Space`, uses `name`, `descriptionRef`, and `roomId`, and makes both populated calls fail. Our installed Huly SDK expects status `0`/`1`, `AttachedDoc`, `title`, `description`, and `attachedTo`. | Confirmed model-contract mismatch | Add an Intabia-aware boundary projection without weakening the Huly contract. |
| `list_test_cases`, `get_test_case` | The MCP-created case lifecycle passes. Native UI cases omit `type` and `priority`; populated listing and native-case reads fail output validation. The other 27 Test Management tools pass. | Mixed native-default contract mismatch | Parse absent native fields and define faithful defaults or optional output semantics. |
<!-- problems:end -->

## Unverified tools and blockers

<!-- unverified:start -->
| Tool | Category | Why unverified |
| --- | --- | --- |
| `upsert_project_target_preference` | projects | Not run: persistent mutation has no exact inverse for usedOn. |
| `get_message_template` | templates | The UI-created controlled-document template is a different model; no live message-template fixture exists. |
| `render_message_template` | templates | The UI-created controlled-document template is a different model; no live message-template fixture exists. |
| `get_document_snapshot` | documents | Native version history exists, but Intabia creates no `document:class:DocumentSnapshot`; its snapshot creator is a UI TODO stub. |
| `delete_relation` | associations | Blocked: relation creation fails on Intabia issue class. |
| `get_board` | boards | Blocked: Intabia Board model/application is absent. |
| `update_board` | boards | Blocked: Intabia Board model/application is absent. |
| `archive_board` | boards | Blocked: Intabia Board model/application is absent. |
| `unarchive_board` | boards | Blocked: Intabia Board model/application is absent. |
| `list_board_cards` | boards | Blocked: Intabia Board model/application is absent. |
| `get_board_card` | boards | Blocked: Intabia Board model/application is absent. |
| `create_board_card` | boards | Blocked: Intabia Board model/application is absent. |
| `update_board_card` | boards | Blocked: Intabia Board model/application is absent. |
| `archive_board_card` | boards | Blocked: Intabia Board model/application is absent. |
| `unarchive_board_card` | boards | Blocked: Intabia Board model/application is absent. |
| `delete_board_card` | boards | Blocked: Intabia Board model/application is absent. |
| `list_board_card_labels` | boards | Blocked: Intabia Board model/application is absent. |
| `add_board_card_label` | boards | Blocked: Intabia Board model/application is absent. |
| `remove_board_card_label` | boards | Blocked: Intabia Board model/application is absent. |
| `create_funnel` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `update_funnel` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `archive_funnel` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `delete_funnel` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `update_lead` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `move_lead` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `delete_lead` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `list_lead_comments` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `add_lead_comment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `update_lead_comment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `delete_lead_comment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `list_lead_attachments` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `add_lead_attachment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `get_lead_attachment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `update_lead_attachment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `delete_lead_attachment` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `list_lead_label_definitions` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `list_lead_labels` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `add_lead_label` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `update_lead_label` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `remove_lead_label` | leads | Blocked: default funnel workflow is rejected before dependent operations. |
| `list_recruiting_candidate_skills` | recruiting | No retained candidate fixture after cleanup. |
| `get_recruiting_applicant_match` | recruiting | No retained applicant-match fixture after cleanup. |
| `get_activity_message` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `pin_activity_message` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `list_activity_references` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `list_activity_replies` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `add_activity_reply` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `update_activity_reply` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `delete_activity_reply` | activity | Blocked: no populated ActivityMessage fixture was returned. |
| `archive_notification_context` | notifications | Blocked: notification-context output validation prevents a reliable context ID. |
| `unarchive_notification_context` | notifications | Blocked: notification-context output validation prevents a reliable context ID. |
| `update_notification_type_setting` | notifications | No existing setting row to restore; mutation was not attempted. |
| `get_office` | virtual-office | Blocked: office listing fails output validation. |
<!-- unverified:end -->

## Complete 601-tool ledger

<!-- ledger:start -->
| Category | Tool | Status | Evidence |
| --- | --- | --- | --- |
| activity | `add_activity_reply` | Unverified | No explicit invocation evidence; see unverified table. |
| activity | `add_reaction` | Passed | Explicit successful live call/assertion. |
| activity | `delete_activity_reply` | Unverified | No explicit invocation evidence; see unverified table. |
| activity | `get_activity_message` | Unverified | No explicit invocation evidence; see unverified table. |
| activity | `list_activity` | Mixed | Successful and failing live variants recorded. |
| activity | `list_activity_filters` | Passed | Explicit successful live call/assertion. |
| activity | `list_activity_references` | Unverified | No explicit invocation evidence; see unverified table. |
| activity | `list_activity_replies` | Unverified | No explicit invocation evidence; see unverified table. |
| activity | `list_mentions` | Passed | Explicit successful live call/assertion. |
| activity | `list_reactions` | Passed | Explicit successful live call/assertion. |
| activity | `list_saved_messages` | Passed | Explicit successful live call/assertion. |
| activity | `pin_activity_message` | Unverified | No explicit invocation evidence; see unverified table. |
| activity | `remove_reaction` | Passed | Explicit successful live call/assertion. |
| activity | `save_message` | Passed | Explicit successful live call/assertion. |
| activity | `unsave_message` | Passed | Explicit successful live call/assertion. |
| activity | `update_activity_reply` | Unverified | No explicit invocation evidence; see unverified table. |
| approvals | `add_approval_request` | Passed | Explicit successful live call/assertion. |
| approvals | `add_approval_request_comment` | Passed | Explicit successful live call/assertion. |
| approvals | `approve_approval_request` | Passed | Explicit successful live call/assertion. |
| approvals | `cancel_approval_request` | Passed | Explicit successful live call/assertion. |
| approvals | `get_approval_request` | Passed | Explicit successful live call/assertion. |
| approvals | `list_approval_requests` | Passed | Explicit successful live call/assertion. |
| approvals | `reject_approval_request` | Passed | Explicit successful live call/assertion. |
| associations | `create_association` | Passed | Explicit successful live call/assertion. |
| associations | `create_relation` | Failed | Live invocation/assertion failed; see problem table. |
| associations | `delete_association` | Passed | Explicit successful live call/assertion. |
| associations | `delete_relation` | Unverified | No explicit invocation evidence; see unverified table. |
| associations | `list_associations` | Passed | Explicit successful live call/assertion. |
| associations | `list_relations` | Passed | Explicit successful live call/assertion. |
| attachments | `add_attachment` | Skipped | add_attachment (generic — covered by add_issue_attachment) |
| attachments | `add_document_attachment` | Skipped | add_document_attachment (requires doc + file) |
| attachments | `add_issue_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `create_drawing` | Passed | Explicit successful live call/assertion. |
| attachments | `delete_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `delete_drawing` | Passed | Explicit successful live call/assertion. |
| attachments | `download_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `get_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `get_drawing` | Passed | Explicit successful live call/assertion. |
| attachments | `list_attachments` | Passed | Explicit successful live call/assertion. |
| attachments | `list_drawings` | Passed | Explicit successful live call/assertion. |
| attachments | `list_saved_attachments` | Passed | Explicit successful live call/assertion. |
| attachments | `pin_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `read_attachment_content` | Passed | Explicit successful live call/assertion. |
| attachments | `save_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `unsave_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `update_attachment` | Passed | Explicit successful live call/assertion. |
| attachments | `update_drawing` | Passed | Explicit successful live call/assertion. |
| boards | `add_board_card_label` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `archive_board` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `archive_board_card` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `create_board` | Failed | Live invocation/assertion failed; see problem table. |
| boards | `create_board_card` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `create_board_label` | Passed | Explicit successful live call/assertion. |
| boards | `delete_board_card` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `delete_board_label` | Passed | Explicit successful live call/assertion. |
| boards | `get_board` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `get_board_card` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `get_board_common_preference` | Failed | Live invocation/assertion failed; see problem table. |
| boards | `get_board_saved_view` | Passed | Explicit successful live call/assertion. |
| boards | `list_board_card_labels` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `list_board_cards` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `list_board_labels` | Passed | Explicit successful live call/assertion. |
| boards | `list_board_menu_pages` | Failed | Live invocation/assertion failed; see problem table. |
| boards | `list_board_saved_views` | Passed | Explicit successful live call/assertion. |
| boards | `list_board_viewlets` | Passed | Explicit successful live call/assertion. |
| boards | `list_boards` | Failed | Live invocation/assertion failed; see problem table. |
| boards | `remove_board_card_label` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `unarchive_board` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `unarchive_board_card` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `update_board` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `update_board_card` | Unverified | No explicit invocation evidence; see unverified table. |
| boards | `update_board_label` | Passed | Explicit successful live call/assertion. |
| calendar | `create_event` | Mixed | Successful and failing live variants recorded. |
| calendar | `create_recurring_event` | Skipped | create_recurring_event (no delete tool — would leak data) |
| calendar | `create_schedule` | Passed | Explicit successful live call/assertion. |
| calendar | `delete_event` | Passed | Explicit successful live call/assertion. |
| calendar | `delete_schedule` | Passed | Explicit successful live call/assertion. |
| calendar | `get_event` | Failed | Live invocation/assertion failed; see problem table. |
| calendar | `get_schedule` | Passed | Explicit successful live call/assertion. |
| calendar | `list_calendar_settings` | Passed | Explicit successful live call/assertion. |
| calendar | `list_calendars` | Passed | Explicit successful live call/assertion. |
| calendar | `list_event_instances` | Skipped | list_event_instances (requires recurring event) |
| calendar | `list_events` | Passed | Explicit successful live call/assertion. |
| calendar | `list_recurring_events` | Passed | Explicit successful live call/assertion. |
| calendar | `list_schedules` | Passed | Explicit successful live call/assertion. |
| calendar | `set_primary_calendar` | Passed | Explicit successful live call/assertion. |
| calendar | `update_calendar_settings` | Passed | Explicit successful live call/assertion. |
| calendar | `update_event` | Passed | Explicit successful live call/assertion. |
| calendar | `update_schedule` | Passed | Explicit successful live call/assertion. |
| cards | `add_card_comment` | Passed | Explicit successful live call/assertion. |
| cards | `create_card` | Passed | Explicit successful live call/assertion. |
| cards | `delete_card` | Passed | Explicit successful live call/assertion. |
| cards | `delete_card_comment` | Passed | Explicit successful live call/assertion. |
| cards | `get_card` | Passed | Explicit successful live call/assertion. |
| cards | `list_card_comments` | Passed | Explicit successful live call/assertion. |
| cards | `list_card_spaces` | Passed | Explicit successful live call/assertion. |
| cards | `list_card_versions` | Passed | Explicit successful live call/assertion. |
| cards | `list_cards` | Passed | Explicit successful live call/assertion. |
| cards | `list_master_tags` | Passed | Explicit successful live call/assertion. |
| cards | `update_card` | Passed | Explicit successful live call/assertion. |
| cards | `update_card_comment` | Passed | Explicit successful live call/assertion. |
| channels | `add_channel_members` | Passed | Explicit successful live call/assertion. |
| channels | `add_chat_message_attachment` | Passed | Explicit successful live call/assertion. |
| channels | `add_thread_reply` | Passed | Explicit successful live call/assertion. |
| channels | `archive_channel` | Passed | Explicit successful live call/assertion. |
| channels | `create_channel` | Passed | Explicit successful live call/assertion. |
| channels | `create_direct_message` | Passed | Explicit successful live call/assertion. |
| channels | `create_group_direct_message` | Passed | Explicit successful live call/assertion. |
| channels | `delete_channel` | Passed | Explicit successful live call/assertion. |
| channels | `delete_channel_message` | Passed | Explicit successful live call/assertion. |
| channels | `delete_chat_message_attachment` | Passed | Explicit successful live call/assertion. |
| channels | `delete_dm_message` | Passed | Explicit successful live call/assertion. |
| channels | `delete_thread_reply` | Passed | Explicit successful live call/assertion. |
| channels | `get_channel` | Passed | Explicit successful live call/assertion. |
| channels | `get_chat_message_attachment` | Passed | Explicit successful live call/assertion. |
| channels | `join_channel` | Passed | Explicit successful live call/assertion. |
| channels | `leave_channel` | Passed | Explicit successful live call/assertion. |
| channels | `list_channel_members` | Passed | Explicit successful live call/assertion. |
| channels | `list_channel_messages` | Passed | Explicit successful live call/assertion. |
| channels | `list_channels` | Passed | Explicit successful live call/assertion. |
| channels | `list_chat_message_attachments` | Passed | Explicit successful live call/assertion. |
| channels | `list_direct_messages` | Passed | Explicit successful live call/assertion. |
| channels | `list_dm_messages` | Passed | Explicit successful live call/assertion. |
| channels | `list_external_channel_messages` | Passed | Explicit successful live call/assertion. |
| channels | `list_pinned_chat_messages` | Passed | Explicit successful live call/assertion. |
| channels | `list_thread_replies` | Passed | Explicit successful live call/assertion. |
| channels | `remove_channel_members` | Passed | Explicit successful live call/assertion. |
| channels | `request_channel_access` | Passed | Explicit successful live call/assertion. |
| channels | `send_channel_message` | Passed | Explicit successful live call/assertion. |
| channels | `send_dm_message` | Passed | Explicit successful live call/assertion. |
| channels | `set_chat_message_pinned` | Passed | Explicit successful live call/assertion. |
| channels | `set_conversation_closed` | Passed | Explicit successful live call/assertion. |
| channels | `set_conversation_starred` | Passed | Explicit successful live call/assertion. |
| channels | `translate_chat_message` | Passed | Explicit successful live call/assertion. |
| channels | `unarchive_channel` | Passed | Explicit successful live call/assertion. |
| channels | `update_channel` | Passed | Explicit successful live call/assertion. |
| channels | `update_channel_message` | Passed | Explicit successful live call/assertion. |
| channels | `update_chat_message_attachment` | Passed | Explicit successful live call/assertion. |
| channels | `update_dm_message` | Passed | Explicit successful live call/assertion. |
| channels | `update_thread_reply` | Passed | Explicit successful live call/assertion. |
| collaborators | `add_object_collaborator` | Passed | Explicit successful live call/assertion. |
| collaborators | `list_object_collaborators` | Passed | Explicit successful live call/assertion. |
| collaborators | `remove_object_collaborator` | Passed | Explicit successful live call/assertion. |
| comments | `add_comment` | Passed | Explicit successful live call/assertion. |
| comments | `delete_comment` | Passed | Explicit successful live call/assertion. |
| comments | `list_comments` | Passed | Explicit successful live call/assertion. |
| comments | `update_comment` | Passed | Explicit successful live call/assertion. |
| contacts | `add_organization_channel` | Passed | Explicit successful live call/assertion. |
| contacts | `add_organization_member` | Passed | Explicit successful live call/assertion. |
| contacts | `add_person_attachment` | Passed | Explicit successful live call/assertion. |
| contacts | `add_person_channel` | Passed | Explicit successful live call/assertion. |
| contacts | `add_person_comment` | Passed | Explicit successful live call/assertion. |
| contacts | `create_organization` | Passed | Explicit successful live call/assertion. |
| contacts | `create_person` | Passed | Explicit successful live call/assertion. |
| contacts | `deactivate_employee` | Passed | Explicit successful live call/assertion. |
| contacts | `delete_organization` | Passed | Explicit successful live call/assertion. |
| contacts | `delete_person` | Passed | Explicit successful live call/assertion. |
| contacts | `delete_person_attachment` | Passed | Explicit successful live call/assertion. |
| contacts | `delete_person_comment` | Passed | Explicit successful live call/assertion. |
| contacts | `get_organization` | Passed | Explicit successful live call/assertion. |
| contacts | `get_person` | Passed | Explicit successful live call/assertion. |
| contacts | `get_person_administration` | Passed | Explicit successful live call/assertion. |
| contacts | `get_person_attachment` | Passed | Explicit successful live call/assertion. |
| contacts | `invite_employee` | Passed | Explicit successful live call/assertion. |
| contacts | `list_contact_channel_providers` | Passed | Explicit successful live call/assertion. |
| contacts | `list_employees` | Passed | Explicit successful live call/assertion. |
| contacts | `list_inactive_employees` | Passed | Explicit successful live call/assertion. |
| contacts | `list_organization_channels` | Passed | Explicit successful live call/assertion. |
| contacts | `list_organization_members` | Passed | Explicit successful live call/assertion. |
| contacts | `list_organizations` | Passed | Explicit successful live call/assertion. |
| contacts | `list_person_attachments` | Passed | Explicit successful live call/assertion. |
| contacts | `list_person_channels` | Passed | Explicit successful live call/assertion. |
| contacts | `list_person_comments` | Passed | Explicit successful live call/assertion. |
| contacts | `list_person_organizations` | Passed | Explicit successful live call/assertion. |
| contacts | `list_persons` | Passed | Explicit successful live call/assertion. |
| contacts | `list_social_identity_providers` | Failed | Live invocation/assertion failed; see problem table. |
| contacts | `make_organization_customer` | Passed | Explicit successful live call/assertion. |
| contacts | `make_person_customer` | Passed | Explicit successful live call/assertion. |
| contacts | `merge_people` | Passed | Explicit successful live call/assertion. |
| contacts | `remove_organization_channel` | Passed | Explicit successful live call/assertion. |
| contacts | `remove_organization_member` | Passed | Explicit successful live call/assertion. |
| contacts | `remove_person_channel` | Passed | Explicit successful live call/assertion. |
| contacts | `repair_person_social_identities` | Passed | Explicit successful live call/assertion. |
| contacts | `set_employee_position` | Passed | Explicit successful live call/assertion. |
| contacts | `update_organization` | Passed | Explicit successful live call/assertion. |
| contacts | `update_organization_channel` | Passed | Explicit successful live call/assertion. |
| contacts | `update_person` | Passed | Explicit successful live call/assertion. |
| contacts | `update_person_attachment` | Passed | Explicit successful live call/assertion. |
| contacts | `update_person_channel` | Passed | Explicit successful live call/assertion. |
| contacts | `update_person_comment` | Passed | Explicit successful live call/assertion. |
| custom-fields | `get_custom_field_values` | Passed | Explicit successful live call/assertion. |
| custom-fields | `list_custom_fields` | Passed | Explicit successful live call/assertion. |
| custom-fields | `set_custom_field` | Passed | Explicit successful live call/assertion. |
| documents | `add_document_label` | Passed | Explicit successful live call/assertion. |
| documents | `create_document` | Passed | Explicit successful live call/assertion. |
| documents | `create_teamspace` | Passed | Explicit successful live call/assertion. |
| documents | `delete_document` | Passed | Explicit successful live call/assertion. |
| documents | `delete_teamspace` | Passed | Explicit successful live call/assertion. |
| documents | `edit_document` | Passed | Explicit successful live call/assertion. |
| documents | `get_document` | Passed | Explicit successful live call/assertion. |
| documents | `get_document_snapshot` | Unverified | No explicit invocation evidence; see unverified table. |
| documents | `get_teamspace` | Passed | Explicit successful live call/assertion. |
| documents | `list_document_label_definitions` | Passed | Explicit successful live call/assertion. |
| documents | `list_document_labels` | Passed | Explicit successful live call/assertion. |
| documents | `list_document_snapshots` | Passed | Explicit successful live call/assertion. |
| documents | `list_documents` | Passed | Explicit successful live call/assertion. |
| documents | `list_inline_comments` | Passed | Explicit successful live call/assertion. |
| documents | `list_teamspaces` | Passed | Explicit successful live call/assertion. |
| documents | `remove_document_label` | Passed | Explicit successful live call/assertion. |
| documents | `update_teamspace` | Passed | Explicit successful live call/assertion. |
| drive | `add_drive_file_comment` | Passed | Explicit successful live call/assertion. |
| drive | `add_drive_members` | Passed | Explicit successful live call/assertion. |
| drive | `create_drive` | Passed | Explicit successful live call/assertion. |
| drive | `create_drive_folder` | Passed | Explicit successful live call/assertion. |
| drive | `delete_drive` | Passed | Explicit successful live call/assertion. |
| drive | `delete_drive_file_comment` | Passed | Explicit successful live call/assertion. |
| drive | `delete_drive_item` | Passed | Explicit successful live call/assertion. |
| drive | `get_drive` | Passed | Explicit successful live call/assertion. |
| drive | `get_drive_item` | Passed | Explicit successful live call/assertion. |
| drive | `list_drive_file_activity` | Passed | Explicit successful live call/assertion. |
| drive | `list_drive_file_comments` | Passed | Explicit successful live call/assertion. |
| drive | `list_drive_file_versions` | Passed | Explicit successful live call/assertion. |
| drive | `list_drive_items` | Passed | Explicit successful live call/assertion. |
| drive | `list_drives` | Passed | Explicit successful live call/assertion. |
| drive | `move_drive_item` | Passed | Explicit successful live call/assertion. |
| drive | `remove_drive_members` | Passed | Explicit successful live call/assertion. |
| drive | `rename_drive_item` | Passed | Explicit successful live call/assertion. |
| drive | `restore_drive_file_version` | Passed | Restored retained version 1, then restored version 2 as the original current version. |
| drive | `set_drive_owners` | Passed | Explicit successful live call/assertion. |
| drive | `update_drive` | Passed | Explicit successful live call/assertion. |
| drive | `update_drive_file_comment` | Passed | Explicit successful live call/assertion. |
| drive | `upload_drive_file` | Passed | Explicit successful live call/assertion. |
| drive | `upload_drive_file_version` | Passed | Explicit successful live call/assertion. |
| hr | `add_hr_request_attachment` | Passed | Explicit successful live call/assertion. |
| hr | `add_hr_request_comment` | Passed | Explicit successful live call/assertion. |
| hr | `assign_staff_department` | Passed | Explicit successful live call/assertion. |
| hr | `create_department` | Passed | Explicit successful live call/assertion. |
| hr | `create_hr_request` | Passed | Explicit successful live call/assertion. |
| hr | `create_public_holiday` | Passed | Explicit successful live call/assertion. |
| hr | `delete_department` | Passed | Explicit successful live call/assertion. |
| hr | `delete_hr_request` | Passed | Explicit successful live call/assertion. |
| hr | `delete_hr_request_attachment` | Passed | Explicit successful live call/assertion. |
| hr | `delete_hr_request_comment` | Passed | Explicit successful live call/assertion. |
| hr | `delete_public_holiday` | Passed | Explicit successful live call/assertion. |
| hr | `get_department` | Passed | Explicit successful live call/assertion. |
| hr | `get_hr_request` | Passed | Explicit successful live call/assertion. |
| hr | `get_hr_request_attachment` | Passed | Explicit successful live call/assertion. |
| hr | `get_hr_schedule` | Passed | Explicit successful live call/assertion. |
| hr | `get_hr_summary_report` | Passed | Explicit successful live call/assertion. |
| hr | `get_hr_table` | Passed | Explicit successful live call/assertion. |
| hr | `get_public_holiday` | Passed | Explicit successful live call/assertion. |
| hr | `list_departments` | Passed | Explicit successful live call/assertion. |
| hr | `list_hr_request_attachments` | Passed | Explicit successful live call/assertion. |
| hr | `list_hr_request_comments` | Passed | Explicit successful live call/assertion. |
| hr | `list_hr_request_types` | Passed | Explicit successful live call/assertion. |
| hr | `list_hr_requests` | Passed | Explicit successful live call/assertion. |
| hr | `list_public_holidays` | Passed | Explicit successful live call/assertion. |
| hr | `list_staff` | Passed | Explicit successful live call/assertion. |
| hr | `update_department` | Passed | Explicit successful live call/assertion. |
| hr | `update_hr_request` | Passed | Explicit successful live call/assertion. |
| hr | `update_hr_request_attachment` | Passed | Explicit successful live call/assertion. |
| hr | `update_hr_request_comment` | Passed | Explicit successful live call/assertion. |
| hr | `update_public_holiday` | Passed | Explicit successful live call/assertion. |
| inventory | `add_inventory_product_attachment` | Passed | Explicit successful live call/assertion. |
| inventory | `add_inventory_product_comment` | Passed | Explicit successful live call/assertion. |
| inventory | `add_inventory_product_photo` | Passed | Explicit successful live call/assertion. |
| inventory | `create_inventory_category` | Passed | Explicit successful live call/assertion. |
| inventory | `create_inventory_product` | Passed | Explicit successful live call/assertion. |
| inventory | `create_inventory_variant` | Passed | Explicit successful live call/assertion. |
| inventory | `delete_inventory_category` | Passed | Explicit successful live call/assertion. |
| inventory | `delete_inventory_product` | Passed | Explicit successful live call/assertion. |
| inventory | `delete_inventory_product_attachment` | Passed | Explicit successful live call/assertion. |
| inventory | `delete_inventory_product_comment` | Passed | Explicit successful live call/assertion. |
| inventory | `delete_inventory_product_photo` | Passed | Explicit successful live call/assertion. |
| inventory | `delete_inventory_variant` | Passed | Explicit successful live call/assertion. |
| inventory | `get_inventory_category` | Passed | Explicit successful live call/assertion. |
| inventory | `get_inventory_product` | Passed | Explicit successful live call/assertion. |
| inventory | `get_inventory_product_attachment` | Passed | Explicit successful live call/assertion. |
| inventory | `get_inventory_product_photo` | Passed | Explicit successful live call/assertion. |
| inventory | `get_inventory_variant` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_categories` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_product_activity` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_product_attachments` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_product_comments` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_product_photos` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_products` | Passed | Explicit successful live call/assertion. |
| inventory | `list_inventory_variants` | Passed | Explicit successful live call/assertion. |
| inventory | `update_inventory_category` | Passed | Explicit successful live call/assertion. |
| inventory | `update_inventory_product` | Passed | Explicit successful live call/assertion. |
| inventory | `update_inventory_product_attachment` | Passed | Explicit successful live call/assertion. |
| inventory | `update_inventory_product_comment` | Passed | Explicit successful live call/assertion. |
| inventory | `update_inventory_product_photo` | Passed | Explicit successful live call/assertion. |
| inventory | `update_inventory_variant` | Passed | Explicit successful live call/assertion. |
| issues | `add_issue_label` | Passed | Explicit successful live call/assertion. |
| issues | `add_issue_relation` | Passed | Explicit successful live call/assertion. |
| issues | `add_template_child` | Passed | Explicit successful live call/assertion. |
| issues | `create_component` | Passed | Explicit successful live call/assertion. |
| issues | `create_issue` | Passed | Explicit successful live call/assertion. |
| issues | `create_issue_from_template` | Passed | Explicit successful live call/assertion. |
| issues | `create_issue_template` | Passed | Explicit successful live call/assertion. |
| issues | `delete_component` | Passed | Explicit successful live call/assertion. |
| issues | `delete_issue` | Passed | Explicit successful live call/assertion. |
| issues | `delete_issue_template` | Passed | Explicit successful live call/assertion. |
| issues | `delete_related_issue_space_target` | Passed | Explicit successful live call/assertion. |
| issues | `get_component` | Passed | Explicit successful live call/assertion. |
| issues | `get_issue` | Passed | Explicit successful live call/assertion. |
| issues | `get_issue_template` | Passed | Explicit successful live call/assertion. |
| issues | `link_document_to_issue` | Passed | Explicit successful live call/assertion. |
| issues | `list_components` | Passed | Explicit successful live call/assertion. |
| issues | `list_issue_relations` | Passed | Explicit successful live call/assertion. |
| issues | `list_issue_templates` | Passed | Explicit successful live call/assertion. |
| issues | `list_issues` | Passed | Explicit successful live call/assertion. |
| issues | `list_related_issue_targets` | Passed | Explicit successful live call/assertion. |
| issues | `move_issue` | Passed | Explicit successful live call/assertion. |
| issues | `preview_deletion` | Passed | Explicit successful live call/assertion. |
| issues | `remove_issue_label` | Passed | Explicit successful live call/assertion. |
| issues | `remove_issue_relation` | Passed | Explicit successful live call/assertion. |
| issues | `remove_template_child` | Passed | Explicit successful live call/assertion. |
| issues | `set_issue_component` | Passed | Explicit successful live call/assertion. |
| issues | `set_related_issue_target` | Passed | Explicit successful live call/assertion. |
| issues | `unlink_document_from_issue` | Passed | Explicit successful live call/assertion. |
| issues | `update_component` | Passed | Explicit successful live call/assertion. |
| issues | `update_issue` | Passed | Explicit successful live call/assertion. |
| issues | `update_issue_template` | Passed | Explicit successful live call/assertion. |
| labels | `create_label` | Passed | Explicit successful live call/assertion. |
| labels | `delete_label` | Passed | Explicit successful live call/assertion. |
| labels | `list_labels` | Passed | Explicit successful live call/assertion. |
| labels | `update_label` | Passed | Explicit successful live call/assertion. |
| leads | `add_lead_attachment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `add_lead_comment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `add_lead_label` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `archive_funnel` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `create_funnel` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `create_lead` | Mixed | Successful and failing live variants recorded. |
| leads | `delete_funnel` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `delete_lead` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `delete_lead_attachment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `delete_lead_comment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `get_funnel` | Failed | Live invocation/assertion failed; see problem table. |
| leads | `get_lead` | Passed | Explicit successful live call/assertion. |
| leads | `get_lead_attachment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `list_funnels` | Passed | Explicit successful live call/assertion. |
| leads | `list_lead_attachments` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `list_lead_comments` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `list_lead_label_definitions` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `list_lead_labels` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `list_leads` | Passed | Explicit successful live call/assertion. |
| leads | `move_lead` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `remove_lead_label` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `update_funnel` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `update_lead` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `update_lead_attachment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `update_lead_comment` | Unverified | No explicit invocation evidence; see unverified table. |
| leads | `update_lead_label` | Unverified | No explicit invocation evidence; see unverified table. |
| mail | `list_mail_threads` | Failed | Live invocation/assertion failed; see problem table. |
| milestones | `create_milestone` | Passed | Explicit successful live call/assertion. |
| milestones | `delete_milestone` | Passed | Explicit successful live call/assertion. |
| milestones | `get_milestone` | Passed | Explicit successful live call/assertion. |
| milestones | `list_milestones` | Passed | Explicit successful live call/assertion. |
| milestones | `set_issue_milestone` | Passed | Explicit successful live call/assertion. |
| milestones | `update_milestone` | Passed | Explicit successful live call/assertion. |
| model-administration | `create_huly_attribute` | Passed | Explicit successful live call/assertion. |
| model-administration | `create_huly_enum` | Passed | Explicit successful live call/assertion. |
| model-administration | `delete_huly_attribute` | Passed | Explicit successful live call/assertion. |
| model-administration | `delete_huly_enum` | Passed | Explicit successful live call/assertion. |
| model-administration | `update_huly_attribute` | Passed | Explicit successful live call/assertion. |
| model-administration | `update_huly_enum` | Passed | Explicit successful live call/assertion. |
| notifications | `archive_all_notifications` | Skipped | archive_all_notifications (would archive all) |
| notifications | `archive_notification` | Passed | Explicit successful live call/assertion. |
| notifications | `archive_notification_context` | Unverified | No explicit invocation evidence; see unverified table. |
| notifications | `delete_notification` | Skipped | delete_notification (requires notification ID) |
| notifications | `get_notification` | Passed | Explicit successful live call/assertion. |
| notifications | `get_notification_context` | Failed | Live invocation/assertion failed; see problem table. |
| notifications | `get_unread_notification_count` | Passed | Explicit successful live call/assertion. |
| notifications | `hide_notification_context` | Skipped | hide_notification_context (notification context not found) |
| notifications | `list_notification_contexts` | Mixed | Successful and failing live variants recorded. |
| notifications | `list_notification_providers` | Passed | Explicit successful live call/assertion. |
| notifications | `list_notification_settings` | Passed | Explicit successful live call/assertion. |
| notifications | `list_notification_types` | Passed | Explicit successful live call/assertion. |
| notifications | `list_notifications` | Passed | Explicit successful live call/assertion. |
| notifications | `mark_all_notifications_read` | Skipped | mark_all_notifications_read (would clear all notifications) |
| notifications | `mark_notification_read` | Passed | Explicit successful live call/assertion. |
| notifications | `mark_notification_unread` | Passed | Explicit successful live call/assertion. |
| notifications | `pin_notification_context` | Skipped | pin_notification_context (notification context not found) |
| notifications | `subscribe_to_object_notifications` | Passed | Explicit successful live call/assertion. |
| notifications | `unarchive_notification` | Passed | Explicit successful live call/assertion. |
| notifications | `unarchive_notification_context` | Unverified | No explicit invocation evidence; see unverified table. |
| notifications | `unsubscribe_from_object_notifications` | Passed | Explicit successful live call/assertion. |
| notifications | `update_notification_provider_setting` | Skipped | update_notification_provider_setting (would modify settings) |
| notifications | `update_notification_type_setting` | Unverified | No explicit invocation evidence; see unverified table. |
| planner | `add_todo_label` | Passed | Explicit successful live call/assertion. |
| planner | `complete_todo` | Passed | Explicit successful live call/assertion. |
| planner | `create_todo` | Passed | Explicit successful live call/assertion. |
| planner | `delete_todo` | Passed | Explicit successful live call/assertion. |
| planner | `get_todo` | Passed | Explicit successful live call/assertion. |
| planner | `list_todo_label_definitions` | Passed | Explicit successful live call/assertion. |
| planner | `list_todo_labels` | Passed | Explicit successful live call/assertion. |
| planner | `list_todos` | Passed | Explicit successful live call/assertion. |
| planner | `remove_todo_label` | Passed | Explicit successful live call/assertion. |
| planner | `reopen_todo` | Passed | Explicit successful live call/assertion. |
| planner | `schedule_todo` | Passed | Explicit successful live call/assertion. |
| planner | `unschedule_todo` | Passed | Explicit successful live call/assertion. |
| planner | `update_todo` | Passed | Explicit successful live call/assertion. |
| preferences | `get_space_preference` | Passed | Explicit successful live call/assertion. |
| preferences | `list_space_preferences` | Passed | Explicit successful live call/assertion. |
| processes | `cancel_execution` | Skipped | start_process/cancel_execution (requires a process with an initial state and a matching safe card fixture) |
| processes | `get_process` | Skipped | get_process (no process definitions found in workspace) |
| processes | `list_process_executions` | Passed | Explicit successful live call/assertion. |
| processes | `list_processes` | Passed | Explicit successful live call/assertion. |
| processes | `start_process` | Skipped | start_process/cancel_execution (requires a process with an initial state and a matching safe card fixture) |
| projects | `create_project` | Passed | Explicit successful live call/assertion. |
| projects | `delete_project` | Skipped | delete_project (would pollute workspace) |
| projects | `get_project` | Passed | Explicit successful live call/assertion. |
| projects | `list_project_target_preferences` | Passed | Explicit successful live call/assertion. |
| projects | `list_projects` | Passed | Explicit successful live call/assertion. |
| projects | `list_statuses` | Passed | Explicit successful live call/assertion. |
| projects | `update_project` | Passed | Explicit successful live call/assertion. |
| projects | `upsert_project_target_preference` | Unverified | No explicit invocation evidence; see unverified table. |
| recruiting | `add_recruiting_attachment` | Passed | Explicit successful live call/assertion. |
| recruiting | `add_recruiting_candidate_skill` | Passed | Explicit successful live call/assertion. |
| recruiting | `add_recruiting_comment` | Passed | Explicit successful live call/assertion. |
| recruiting | `add_recruiting_related_issue` | Passed | Explicit successful live call/assertion. |
| recruiting | `archive_recruiting_vacancy` | Passed | Explicit successful live call/assertion. |
| recruiting | `create_recruiting_applicant` | Passed | Explicit successful live call/assertion. |
| recruiting | `create_recruiting_opinion` | Passed | Explicit successful live call/assertion. |
| recruiting | `create_recruiting_review` | Passed | Explicit successful live call/assertion. |
| recruiting | `create_recruiting_vacancy` | Passed | Explicit successful live call/assertion. |
| recruiting | `delete_recruiting_applicant` | Passed | Explicit successful live call/assertion. |
| recruiting | `delete_recruiting_attachment` | Passed | Explicit successful live call/assertion. |
| recruiting | `delete_recruiting_comment` | Passed | Explicit successful live call/assertion. |
| recruiting | `delete_recruiting_opinion` | Passed | Explicit successful live call/assertion. |
| recruiting | `delete_recruiting_review` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_applicant` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_applicant_match` | Unverified | No explicit invocation evidence; see unverified table. |
| recruiting | `get_recruiting_attachment` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_candidate` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_candidate_custom_field_values` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_opinion` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_review` | Passed | Explicit successful live call/assertion. |
| recruiting | `get_recruiting_vacancy` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_activity` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_applicant_matches` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_applicants` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_attachments` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_candidate_custom_fields` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_candidate_skills` | Unverified | No explicit invocation evidence; see unverified table. |
| recruiting | `list_recruiting_candidates` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_comments` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_opinions` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_related_issues` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_reviews` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_skills` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_vacancies` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_vacancy_statuses` | Passed | Explicit successful live call/assertion. |
| recruiting | `list_recruiting_vacancy_types` | Passed | Explicit successful live call/assertion. |
| recruiting | `remove_recruiting_candidate_skill` | Passed | Explicit successful live call/assertion. |
| recruiting | `remove_recruiting_related_issue` | Passed | Explicit successful live call/assertion. |
| recruiting | `set_recruiting_candidate_custom_field` | Passed | Explicit successful live call/assertion. |
| recruiting | `set_recruiting_candidate_profile` | Passed | Explicit successful live call/assertion. |
| recruiting | `unarchive_recruiting_vacancy` | Passed | Explicit successful live call/assertion. |
| recruiting | `update_recruiting_applicant` | Passed | Explicit successful live call/assertion. |
| recruiting | `update_recruiting_attachment` | Passed | Explicit successful live call/assertion. |
| recruiting | `update_recruiting_comment` | Passed | Explicit successful live call/assertion. |
| recruiting | `update_recruiting_opinion` | Passed | Explicit successful live call/assertion. |
| recruiting | `update_recruiting_review` | Passed | Explicit successful live call/assertion. |
| recruiting | `update_recruiting_vacancy` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `describe_huly_space_type_capabilities` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `get_huly_class` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `list_huly_attributes` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `list_huly_classes` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `list_huly_domain_index_configurations` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `list_huly_enums` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `list_huly_plugin_configurations` | Passed | Explicit successful live call/assertion. |
| sdk-discovery | `list_huly_sequences` | Passed | Explicit successful live call/assertion. |
| search | `fulltext_search` | Passed | Explicit successful live call/assertion. |
| security-administration | `create_huly_permission` | Passed | Explicit successful live call/assertion. |
| security-administration | `create_space_role` | Passed | Explicit successful live call/assertion. |
| security-administration | `delete_class_collaborator_metadata` | Passed | Explicit successful live call/assertion. |
| security-administration | `delete_huly_permission` | Passed | Explicit successful live call/assertion. |
| security-administration | `get_class_collaborator_metadata` | Passed | Explicit successful live call/assertion. |
| security-administration | `set_class_collaborator_metadata` | Passed | Explicit successful live call/assertion. |
| security-administration | `set_space_role_permissions` | Passed | Explicit successful live call/assertion. |
| security-administration | `update_huly_permission` | Passed | Explicit successful live call/assertion. |
| sequence-administration | `create_huly_sequence` | Passed | Explicit successful live call/assertion. |
| sequence-administration | `delete_huly_sequence` | Passed | Explicit successful live call/assertion. |
| sequence-administration | `update_huly_custom_sequence` | Passed | Explicit successful live call/assertion. |
| spaces | `add_space_members` | Passed | Explicit successful live call/assertion. |
| spaces | `add_space_role_members` | Passed | Explicit successful live call/assertion. |
| spaces | `create_space` | Passed | Explicit successful live call/assertion. |
| spaces | `get_global_space_admins` | Passed | Explicit successful live call/assertion. |
| spaces | `get_space` | Passed | Explicit successful live call/assertion. |
| spaces | `get_space_type` | Passed | Explicit successful live call/assertion. |
| spaces | `list_space_permissions` | Passed | Explicit successful live call/assertion. |
| spaces | `list_space_types` | Passed | Explicit successful live call/assertion. |
| spaces | `list_spaces` | Passed | Explicit successful live call/assertion. |
| spaces | `remove_space_members` | Passed | Explicit successful live call/assertion. |
| spaces | `remove_space_role_members` | Passed | Explicit successful live call/assertion. |
| spaces | `set_global_space_admins` | Passed | Explicit successful live call/assertion. |
| spaces | `set_space_owners` | Passed | Explicit successful live call/assertion. |
| spaces | `set_space_role_members` | Passed | Explicit successful live call/assertion. |
| spaces | `update_space` | Passed | Explicit successful live call/assertion. |
| storage | `upload_file` | Skipped | upload_file(standalone) (no blob delete tool — would leak data) |
| support | `get_support_status` | Passed | Explicit successful live call/assertion. |
| tag-categories | `create_tag_category` | Passed | Explicit successful live call/assertion. |
| tag-categories | `delete_tag_category` | Passed | Explicit successful live call/assertion. |
| tag-categories | `list_tag_categories` | Passed | Explicit successful live call/assertion. |
| tag-categories | `update_tag_category` | Passed | Explicit successful live call/assertion. |
| tags | `attach_tag` | Passed | Explicit successful live call/assertion. |
| tags | `create_tag` | Passed | Explicit successful live call/assertion. |
| tags | `delete_tag` | Passed | Explicit successful live call/assertion. |
| tags | `detach_tag` | Passed | Explicit successful live call/assertion. |
| tags | `list_attached_tags` | Passed | Explicit successful live call/assertion. |
| tags | `list_tags` | Passed | Explicit successful live call/assertion. |
| tags | `update_tag` | Passed | Explicit successful live call/assertion. |
| task-management | `create_issue_status` | Passed | Explicit successful live call/assertion. |
| task-management | `create_task_type` | Failed | Live invocation/assertion failed; see problem table. |
| task-management | `get_project_type` | Failed | Live invocation/assertion failed; see problem table. |
| task-management | `list_project_types` | Passed | Explicit successful live call/assertion. |
| task-management | `list_task_types` | Failed | Live invocation/assertion failed; see problem table. |
| templates | `get_message_template` | Unverified | No explicit invocation evidence; see unverified table. |
| templates | `list_message_template_categories` | Passed | Explicit successful live call/assertion. |
| templates | `list_message_template_fields` | Passed | Explicit successful live call/assertion. |
| templates | `list_message_templates` | Passed | Explicit successful live call/assertion. |
| templates | `render_message_template` | Unverified | No explicit invocation evidence; see unverified table. |
| test-management | `add_test_plan_item` | Passed | Temporary Test Plan item lifecycle passed. |
| test-management | `create_test_case` | Passed | Temporary Test Case lifecycle passed. |
| test-management | `create_test_plan` | Passed | Temporary Test Plan lifecycle passed. |
| test-management | `create_test_result` | Passed | Temporary Test Result lifecycle passed. |
| test-management | `create_test_run` | Passed | Temporary Test Run lifecycle passed. |
| test-management | `create_test_suite` | Passed | Temporary Test Suite lifecycle passed. |
| test-management | `delete_test_case` | Passed | Temporary Test Case cleanup passed. |
| test-management | `delete_test_plan` | Passed | Temporary Test Plan cleanup passed. |
| test-management | `delete_test_result` | Passed | Temporary Test Result cleanup passed. |
| test-management | `delete_test_run` | Passed | Temporary and plan-generated Test Run cleanup passed. |
| test-management | `delete_test_suite` | Passed | Temporary Test Suite cleanup passed. |
| test-management | `get_test_case` | Mixed | MCP-created case passed; native UI cases without type/priority fail output validation. |
| test-management | `get_test_plan` | Passed | MCP-created and retained native Test Plans passed. |
| test-management | `get_test_result` | Passed | MCP-created and retained native Test Results passed. |
| test-management | `get_test_run` | Passed | MCP-created and retained native Test Runs passed. |
| test-management | `get_test_suite` | Passed | MCP-created and retained native Test Suites passed. |
| test-management | `list_test_cases` | Failed | Live invocation/assertion failed; see problem table. |
| test-management | `list_test_plans` | Passed | Populated live listing passed. |
| test-management | `list_test_projects` | Passed | Explicit successful live call/assertion. |
| test-management | `list_test_results` | Passed | MCP-created and retained native Test Result listings passed. |
| test-management | `list_test_runs` | Passed | Populated live listing passed. |
| test-management | `list_test_suites` | Passed | Populated live listing passed. |
| test-management | `remove_test_plan_item` | Passed | Temporary Test Plan item cleanup passed. |
| test-management | `run_test_plan` | Passed | Created a run with exactly one result from one temporary plan item; explicit result/run cleanup passed. |
| test-management | `update_test_case` | Passed | Temporary Test Case update passed. |
| test-management | `update_test_plan` | Passed | Temporary Test Plan update passed. |
| test-management | `update_test_result` | Passed | Temporary Test Result update passed. |
| test-management | `update_test_run` | Passed | Temporary Test Run update passed. |
| test-management | `update_test_suite` | Passed | Temporary Test Suite update passed. |
| time tracking | `get_detailed_time_report` | Passed | Explicit successful live call/assertion. |
| time tracking | `get_time_report` | Passed | Explicit successful live call/assertion. |
| time tracking | `list_time_spend_reports` | Passed | Explicit successful live call/assertion. |
| time tracking | `list_work_slots` | Passed | Explicit successful live call/assertion. |
| time tracking | `log_time` | Passed | Explicit successful live call/assertion. |
| time tracking | `start_timer` | Passed | Explicit successful live call/assertion. |
| time tracking | `stop_timer` | Passed | Explicit successful live call/assertion. |
| user-statuses | `list_user_statuses` | Passed | Explicit successful live call/assertion. |
| views | `get_filtered_view` | Passed | Explicit successful live call/assertion. |
| views | `list_filtered_views` | Passed | Explicit successful live call/assertion. |
| views | `list_viewlets` | Passed | Explicit successful live call/assertion. |
| virtual-office | `create_office_floor` | Passed | Explicit successful live call/assertion. |
| virtual-office | `create_office_room` | Passed | Explicit successful live call/assertion. |
| virtual-office | `get_meeting_minutes` | Failed | Native scheduled MeetingMinutes record fails the Huly output contract. |
| virtual-office | `get_office` | Unverified | No explicit invocation evidence; see unverified table. |
| virtual-office | `get_office_floor` | Passed | Explicit successful live call/assertion. |
| virtual-office | `get_office_room` | Passed | Explicit successful live call/assertion. |
| virtual-office | `list_active_room_info` | Passed | Explicit successful live call/assertion. |
| virtual-office | `list_active_room_participants` | Passed | Explicit successful live call/assertion. |
| virtual-office | `list_device_preferences` | Passed | Explicit successful live call/assertion. |
| virtual-office | `list_meeting_minutes` | Mixed | Empty listing passed; populated native listing fails the Huly output contract. |
| virtual-office | `list_office_defaults` | Passed | Explicit successful live call/assertion. |
| virtual-office | `list_office_floors` | Passed | Explicit successful live call/assertion. |
| virtual-office | `list_office_rooms` | Failed | Live invocation/assertion failed; see problem table. |
| virtual-office | `list_offices` | Failed | Live invocation/assertion failed; see problem table. |
| virtual-office | `update_office_room` | Passed | Explicit successful live call/assertion. |
| workbench | `list_workbench_applications` | Mixed | Successful and failing live variants recorded. |
| workflow-statuses | `create_status_category` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `create_workflow_status` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `delete_status_category` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `delete_workflow_status` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `get_status_category` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `get_workflow_status` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `list_status_categories` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `list_workflow_statuses` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `update_status_category` | Passed | Explicit successful live call/assertion. |
| workflow-statuses | `update_workflow_status` | Passed | Explicit successful live call/assertion. |
| workspace | `create_access_link` | Passed | Explicit successful live call/assertion. |
| workspace | `create_workspace` | Skipped | create_workspace (workspace management) |
| workspace | `delete_workspace` | Skipped | delete_workspace (workspace management) |
| workspace | `get_regions` | Skipped | get_regions (workspace management) |
| workspace | `get_user_profile` | Passed | Explicit successful live call/assertion. |
| workspace | `get_workspace_info` | Passed | Explicit successful live call/assertion. |
| workspace | `list_workspace_members` | Passed | Explicit successful live call/assertion. |
| workspace | `list_workspaces` | Skipped | list_workspaces (workspace management) |
| workspace | `update_guest_settings` | Skipped | update_guest_settings (workspace management) |
| workspace | `update_member_role` | Skipped | update_member_role (workspace management) |
| workspace | `update_user_profile` | Skipped | update_user_profile (would modify test user) |
<!-- ledger:end -->

## Evidence and reproducibility

- Detailed broad-run findings: [intabia-broad-integration.md](intabia-broad-integration.md)
- Collaborator adapter validation: [intabia-adapter-validation.md](intabia-adapter-validation.md)
- Broad MCP artifact SHA-256: `b9e686d21ae3cf8548a2db2a7a14e509000084f669e3a66e7d4febe869b00f4b`
- Final reviewed MCP artifact SHA-256: `40bdd2727eaca89144189b560a9db34d79b9ba386ca539f869cb5682dfb59e13`
- Full runner SHA-256: `9e5e3e61904709f32efcb9d745c83d5256eb3556629d84785940218ba09afdc0`
- Private raw logs remain under `/tmp/intabia-*.log`, `/tmp/intabia-*.jsonl`, and `/tmp/intabia-*.error`; they are not committed because they can contain workspace data.

Post-run cleanup checks found no HULY issues and no documents in the retained fixture teamspace. The persistent teamspace and test conversations remain intentionally. Intabia and the existing Huly deployment both returned HTTP 200 after testing.
