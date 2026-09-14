# Intabia broad integration validation

Run date: 2026-09-13. Target: Intabia 0.8.33 / model 0.8.4, mcp-compat, http://host.docker.internal:18087. Three native-initialized fixture users; HULY project membership includes owner, actor and reviewer. Credentials are private and excluded from this report.

## Scope and reproducibility

The unchanged full MCP integration runner was invoked with HULY_TOOL_MODE=native and HULY_TELEMETRY=false from a Linux-dependency checkout. Runner SHA-256: `9e5e3e61904709f32efcb9d745c83d5256eb3556629d84785940218ba09afdc0`. Built MCP SHA-256: `b9e686d21ae3cf8548a2db2a7a14e509000084f669e3a66e7d4febe869b00f4b`. Run ID: `1789341264-1315765`. The runner statically declares 521 unique tool calls; this is not the number successfully exercised. Private raw log: `/tmp/intabia-broad-integration.log`.

The broad run uses the initial collaborator-discovery patch. During the run, reviewers identified and corrected a retry regression in source. Its final artifact is tested separately; the running suite's artifact was not replaced.

## Subagent review

Standards and behavior reviewers independently identified the same P2: REST retries reused old workspace discovery. The fix restores one retry around discovery, parsing and connection, retrying only unavailable errors. An injected SDK regression verifies endpoint, token and collaborator discovery refresh; malformed discovery is asserted to execute once. The independent behavior reviewer re-reviewed the fix and reported no remaining findings. Focused tests passed: 97 tests in two files. The final reviewed build also passed document create/read/edit/read/delete with teamspace cleanup against both Intabia and the existing Huly control.

## Results

Full-run summary: **1,187 passed, 26 failed, 39 skipped (1,252 assertions)**. These are assertion counts, not unique tool coverage or a percentage of product support. 94.8% of all assertions passed (97.9% excluding skipped assertions); multiple assertions can exercise one tool, and a skipped branch can hide many operations. The 521 statically declared tools are not a measured successful-tool denominator.

The corrected-fixture rerun below passed all 226 assertions. It overlaps the first run, so its counts must not be added to the first denominator. The original broad run remains failed; it has not been rewritten as green.

## Initial source-backed compatibility findings

- Task types: our task-management schema requires kind (`task`, `subtask`, `both`). Pinned Intabia TaskType instead has isRootTaskType, allowAnyParent and allowedAsChildOf. Read/projection and create-from-template operations fail at this boundary. Do not fabricate a kind without defining a faithful mapping.
- Lead workflow: get_funnel rejects the default Lead task type target class. Exact cause requires further inspection.

## Reviewed-change quality gate

`GOMAXPROCS=2 pnpm check-all` passed in the isolated Linux verification checkout (exit 0). Coverage: statements 99.52%, branches 99.01%, functions 99.04%, lines 99.56%. No timeout budgets or thresholds were changed. Final reviewed MCP SHA-256: `40bdd2727eaca89144189b560a9db34d79b9ba386ca539f869cb5682dfb59e13`.

## Original Huly control run

The final reviewed MCP artifact was also run through the complete integration suite against the existing original Huly deployment at port 8087. This control used the same corrected runner (`12cc9eedcbadac2422e9efcb8127350ad2c95e02576cc8ffd8db2f75d4e1fa11`) and the same built MCP (`40bdd2727eaca89144189b560a9db34d79b9ba386ca539f869cb5682dfb59e13`) used for the final Intabia follow-ups. No Huly output schema or application contract was changed to accommodate Intabia.

The Huly control produced **1,431 passed, 9 failed and 32 skipped assertions (1,472 total)**. Its task-management project type, task type and status checks passed, directly preserving the Huly `kind` contract that differs from Intabia. The exercised lead, issue, contact, calendar event, meeting-room, Drive, card and channel lifecycles passed. Document operations passed except for the response timeout recorded below.

Eight failures were one custom-sequence retry/update scenario: four calls timed out with no response and four dependent assertions consequently observed empty or old values. The owned sequence fixture was later deleted successfully. The ninth failure was a timeout on the final full-content document replacement after the preceding search-and-replace operations had passed. These are recorded as unresolved original-Huly control failures; they are not attributed to Intabia support and are not hidden by the compatibility result.

Original Huly `list_test_projects` passed, but its workspace has no Test Management project, so the corrected Test Management lifecycle was skipped there. That lifecycle is therefore proven live on Intabia and schema-checked by the repository quality gate, but remains fixture-blocked on the original-Huly control deployment. Private raw control log: `/tmp/huly-control-full-after-intabia.log`.

## Targeted fixture-complete rerun

The first pass lacked a persistent document teamspace and a preexisting one-to-one DM. Created retained fixtures: `MCP compatibility documents` (6aa731cc972564e0b223f2bd) and owner–actor DM (6aa731d05bab91a8e1851346). A subagent checked extraction dependencies before running unchanged sections 7–9: original runner lines 1–2747, 4997–5680 and 9472–EOF. Temporary runner: `/tmp/hulymcp-intabia-reviewed/scripts/intabia-targeted.local.sh`; private log: `/tmp/intabia-targeted-integration.log`. Explicit HULY_TEST_DM_ID selected the fixture. Used final reviewed artifact.

RESULTS: 226 passed, 0 failed, 0 skipped (of 226). Exit 0. These are overlapping assertions, not additional unique tools; do not add this result to the broad pass rate. Covers documents (including corruption repair, native references and search/replace), teamspaces, direct/group messages, attachments, pinning, channel membership/lifecycle, replies and reactions. Sequential cleanup completed; persistent teamspace and fixture conversations remain intentionally.

## Failure classification

| Area | Failed assertions | Evidence and disposition |
| --- | ---: | --- |
| Task-management kind contract | 4 | Intabia TaskType has different fields; confirmed schema/model mismatch. Custom-task-type issue scenarios consequently skipped. |
| Lead workflow | 1 | Default Lead task target class rejected; workflow/class compatibility needs investigation. |
| Lead create response | 1 | No stdio response; later get_lead succeeded. Not sufficient to classify as failed persistence; bounded EOF/timeout behavior remains a candidate. |
| Activity projection | 1 | Expected target objectId absent; investigate projection/eventual consistency. |
| Missing DM fixture | 1 | Resolved by seeding owner–actor DM; targeted section rerun passed. |
| Board/workbench assumptions | 4 | Runner expects Huly's disabled Board application declaration and preference state; Intabia does not return that declaration. |
| Social identity providers | 1 | Returned provider data violates our finite provider schema; compatibility boundary needs adaptation. |
| Calendar event read/composition | 4 | Two get_event reads fail; Meeting creation reconciliation fails and no cleanup ID is returned. Later title-based helper cleanup confirmed fresh absence. |
| Notification contexts | 2 | Hidden-context list and context get produce invalid output. |
| Generic associations | 2 | Issue endpoint returned tracker:class:IssueTaskType where tracker:class:Issue was required. |
| Board operations | 4 | Missing Board model causes query errors; unsupported-feature error differs from harness expectation. |
| Mail fixture | 1 | Direct SDK mail-thread metadata seeding failed; scenario untested. |

## Remaining coverage limitations

The full runner deliberately skips some operations and depends on deployment-specific fixtures. Remaining gaps include process definitions and safe execution fixtures, external-calendar provider rows, contact-status rows, some notification mutations, workspace/account management, recurring events, and standalone blob upload cleanup. Test Management is now fixture-complete; its remaining gap is that native Intabia cases omit the `type` and `priority` fields required by our output contract. Passing CRUD in one family is not negative authorization coverage. The complete CLI integration mirror and HTTP transport variants were not run in this pass.

## Full-run assertion counts by section

| Section | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| 1. Projects | 5 | 0 | 3 |
| 1r. MCP Resources | 4 | 0 | 0 |
| 1a. Task Management | 5 | 4 | 0 |
| 1aa. Generic Workflow Status CRUD | 19 | 0 | 0 |
| 1ab. Model Enum / Attribute Administration | 12 | 0 | 0 |
| 1ac. Sequence Administration | 23 | 0 | 0 |
| 1ad. Security Metadata Administration | 30 | 0 | 0 |
| 1b. Leads | 28 | 2 | 0 |
| 1c. Recruiting CRUD | 84 | 0 | 0 |
| 1d. Inventory CRUD | 57 | 0 | 0 |
| 2. Issues CRUD | 75 | 1 | 2 |
| 3. Components CRUD | 8 | 0 | 0 |
| 4. Milestones CRUD | 17 | 0 | 0 |
| 5. Issue Templates CRUD | 12 | 0 | 0 |
| 5a. Message Template Discovery | 6 | 0 | 0 |
| 6. Labels & Tag Categories | 18 | 0 | 0 |
| 7. Documents | 1 | 0 | 1 |
| 7b. Document Edit (Search & Replace) | 27 | 0 | 0 |
| 8. Teamspaces | 4 | 0 | 0 |
| 9. Channels & Messages | 103 | 1 | 1 |
| 10. Contacts | 208 | 5 | 2 |
| 11. Calendar & Time | 123 | 4 | 5 |
| 11a. Virtual-office administration | 27 | 0 | 0 |
| 12. Notifications | 13 | 2 | 6 |
| 13. Search | 1 | 0 | 0 |
| 13a. SDK Discovery | 11 | 0 | 0 |
| 13b. Spaces | 96 | 0 | 0 |
| 13c. Generic Associations | 23 | 2 | 4 |
| 14. Cards | 58 | 0 | 1 |
| 14b. Boards | 17 | 4 | 0 |
| 14B. Mail thread metadata | 0 | 1 | 0 |
| 14C. Telegram stored messages | 7 | 0 | 0 |
| 15. Activity | 2 | 0 | 0 |
| 16. Workspace | 3 | 0 | 7 |
| 17. Attachments | 15 | 0 | 3 |
| 18. Test Management | 1 | 0 | 1 |
| 19. Processes | 2 | 0 | 3 |
| 20. Drive | 40 | 0 | 0 |
| 21. User Statuses | 2 | 0 | 0 |

## Standards review

Initial finding: one P2 retry regression. Fixed by restoring discovery on each retry with one shared error-classification helper. The standards reviewer implemented the fix and its regression test. No other standards findings were reported.

## Spec review

Initial finding: the same P2 violated preservation of connection retry behavior. An independent re-review of the fix reported no remaining behavioral findings. Workspace precedence, null/absent global fallback, sanitized malformed-discovery failure and scoped successful-client cleanup were confirmed.

Review totals: initially one finding per axis (the same defect); after correction, no remaining reported findings. Quality verification passed all 337 test files / 4,862 tests.

## Completion and cleanup

Broad runner exited 1 after its EXIT cleanup completed; targeted runner exited 0. No cleanup warning was emitted by either runner. Calendar meeting-room cleanup explicitly confirmed fresh absence after the creation error. Post-run config health: Intabia port 18087 HTTP 200; existing Huly port 8087 HTTP 200. The fixture teamspace and direct/group conversations remain intentionally for future tests; generated inbox notifications and captured emails can remain as normal side effects of the disposable integration workspace. This is not a claim of byte-for-byte workspace restoration.

Final fresh MCP reads found no HULY issues and no documents in the retained fixture teamspace; only the intended persistent teamspace remained. HULY retained all three member UUIDs and the original sole owner.

## Registry-complete follow-up index

Follow-up probes account for all 601 tools in [intabia-compatibility-index.md](intabia-compatibility-index.md). After the native UI fixture follow-up below, the tool-level ledger records 502 passed, 7 mixed, 17 failed, 22 deliberately skipped and 53 unverified tools. This supersedes using the full runner's assertion ratio as a proxy for compatibility.

Additional cleanup-safe live coverage passed for project update-and-restore, card update/delete, recruiting vacancy unarchive/update/rearchive, notification provider/type discovery and object subscription, document link/unlink, object collaborators, saved attachments, drawings, related-issue targets, person-comment update/delete, person attachment get/delete, and channel-message update/delete. Temporary issues, documents, drawings, attachments, comments, channels, and cards were deleted. The HULY project description was restored and the recruiting vacancy was returned to archived state.

Before the native UI fixtures were created, read-only follow-ups also passed project target preferences, related-issue targets, departments, staff, domain-index configuration, space-type capability description, recruiting vacancy/candidate lists, custom-field discovery/value lookup, schedules, activity filters, notification providers/types, floors, active-room info, empty meeting-minute listing, device preferences and office defaults. Empty results prove only the query/output path. New live failures were `list_office_rooms`, `list_offices`, and `list_mail_threads`; TestProject-dependent list tools returned the expected missing-project error because `list_test_projects` returned zero projects at that time. The populated Test Management and meeting-minute conclusions are superseded by the native UI fixture follow-up below.

Document snapshot listing passed but returned no snapshots. An update did not materialize a snapshot, leaving snapshot retrieval unverified. A fresh issue update returned no activity messages, leaving activity-message lookup, pinning and reply mutations unverified. The notification settings list was empty, so settings mutations were not performed without a restorable baseline.

## Native UI fixture follow-up

The Intabia UI enabled Test Management and Controlled Documents and created retained native Test Management, controlled-document template, Drive-version and scheduled-meeting fixtures. Intabia's native document history does not create `document:class:DocumentSnapshot`; its snapshot-creation UI is a TODO stub. The UI also has no supported creator for `contact:class:Status`. These two cases are unavailable native features rather than missing setup work.

The Test Management runner had stale argument names that did not match the registered MCP schemas: it read project `identifier` instead of `id`, used `testSuite` instead of `suite`, used `testPlan` instead of `plan`, used `testRun` instead of `run`, used `testResult` instead of `result`, and removed plan items by test-case ID instead of item ID. After correcting the runner, the lifecycle produced 32 passing assertions and one failure with complete cleanup. `run_test_plan` created exactly one result from one retained plan item; the generated result and run were explicitly deleted before the plan item, plan, case, and suite. Twenty-seven of 29 Test Management tools are Passed, `get_test_case` is Mixed, and `list_test_cases` is Failed. Native UI cases omit `type` and `priority`, causing output validation to fail, while an MCP-created case passes create/get/update/delete.

The retained Drive file exposed both versions. Restoring version 1 passed; restoring version 2 afterward returned the fixture to its original current version. `restore_drive_file_version` is Passed.

The populated meeting fixture changed the virtual-office conclusion. Intabia MeetingMinutes extends `Space`, uses `name`, `descriptionRef`, `roomId`, and status `Scheduled = 7`. The installed Huly SDK contract expects an `AttachedDoc` with `title`, `description`, `attachedTo`, and only Active/Finished status values. Both `list_meeting_minutes` and `get_meeting_minutes` fail on the populated record; the former remains Mixed because its empty query previously passed. The linked native scheduled meeting is also not found by `get_event`, consistent with Intabia's changed meeting/event composition.

The controlled-document template is not a message-template record and therefore does not unblock `get_message_template` or `render_message_template`.
