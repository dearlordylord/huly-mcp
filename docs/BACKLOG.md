# Backlog

The backlog is driven by SDK parity and the project principle that this server should expose LLM-first tools: clear names, self-contained parameters, automatic identifier resolution, and single-call correctness. The audited source of truth lives in [../plans/huly-sdk-gap-matrix.md](../plans/huly-sdk-gap-matrix.md), with machine-checkable classifications in [../plans/sdk-parity-ledger.json](../plans/sdk-parity-ledger.json).

## Highest-Value Additions For Coding Agents

- Core administration residuals: specialized permission/configuration and raw system-model internals need a concrete agent workflow before promotion. Generic space creation/admins, enum/attribute CRUD, sequences, roles/permissions, and collaborator metadata are covered.
- Team planner/reporting: team agendas, workload/capacity summaries, visibility-aware free/busy views, document action items, and planner automation diagnostics.
- Recruiting residuals: Recruiting-friendly custom fields and an explicit decision between guided contact-first candidate enablement and a one-call candidate workflow.
- Controlled documents and trainings: controlled document spaces/projects, review/approval workflows, templates, categories, snapshots/history, training assignments, attempts, scoring, and results.
- Remaining module-specific tag wrappers are controlled-document labels (blocked until the SDK package is published) and contact tags when a stable collection is exposed. Issue labels, document labels, Planner ToDo labels, board labels, and recruiting skills have friendly module tools; generic `tags` tools remain the SDK fallback.

## Planned Feature Surfaces

- Implemented foundation: generic space discovery and safe existing-space administration are covered by `spaces` tools for listing/getting spaces, listing/getting space types, reading permissions, updating common metadata, adding/removing members, and replacing owners.
- Controlled Documents / TraceX documents: controlled spaces/projects, controlled document CRUD, quality/technical docs, co-authors/reviewers/approvers, e-signature workflows, release/effective-date metadata, change control, training linkage, controlled-document comments, and snapshots/history.
- Products and product versions: product spaces, members, descriptions, attachments, versions, version state transitions, and change-control links.
- Trainings, questions, and assessments: training revisions, releases, requests, due dates, max attempts, question banks, answer options, correct-answer data, submissions, scoring, and reporting.
- Drive: drive CRUD, members/owners, folders/files, move/rename/delete, uploads and new versions, restore, comments, and activity are covered.
- Recruiting: vacancies, candidates, applicants, matches, reviews, opinions, skills, comments, attachments, activity, and related issues are covered. Recruiting-friendly custom fields and candidate-create workflow policy remain.
- Surveys and polls: survey CRUD, poll creation/attachment, survey question data, completion status, and results.
- Generic approval requests: list/get/create/comment/approve/reject/cancel, request status, decision data, and requested/approved/rejected people are covered. Friendly attached-target resolution remains a workflow enhancement.
- Boards: board/card lifecycle, status workflows, members/assignees, location, cover/archive fields, labels, menu pages, saved views, viewlets, and common preference reads are covered. Provider integrations remain separate; hard deletion is intentionally excluded.
- Inventory: category hierarchy CRUD, product CRUD, variant/SKU CRUD, and product-scoped photo, attachment, comment, and activity wrappers are covered by first-class tools; category/variant discussion wrappers remain outside this slice.
- Leads write surface: funnel/lead lifecycle, workflow/status changes, assignment, dates, customer descriptions, person customers, and lead collaboration are covered.
- Contacts: person/organization/employee lifecycle, channels, identity/provider discovery and safe repair, statuses/profile data, notes, attachments, merge, invitations, deactivation, and inactive employee management are covered. Lower-level ChannelItem, PersonSpace, and UserProfile card administration remain.
- Calendar: calendar CRUD/config, external calendar sync metadata, primary calendar management, schedule objects, participant mutations, and RSVP/status support when stable.
- Team planner and schedule reporting: team agendas, workload/capacity summaries, and visibility-aware free/busy views across members/projects.
- Virtual office and meetings: offices, floors, rooms, access/language/default recording/transcription settings, meeting schedules, active participants, room info, meeting notes/transcript records (minutes), recordings, and device preferences.
- Chat and communication: pinned channel/DM messages are covered by locator-backed list/set tools. Provider-neutral Huly Mail channel metadata and bounded child subjects are covered by `list_mail_threads`; message bodies, attachments, mailbox capability, delivery state, and writes remain blocked on published communication/HulyLake and mailbox acknowledgement contracts. Persisted legacy Telegram messages are readable by exact contact-channel value or stable ID, with explicit no-model/no-channel states and no provider-freshness claim. Gmail remains an explicit unsupported assessment because Huly does not expose the live writer version needed for a safe legacy read. Request-access and translation also return explicit unsupported results until Huly exposes stable server-side contracts. Remaining work includes applets, in-message polls, guest communication settings, Gmail reads/sends, Telegram sends/provider health, and provider-specific attachments.
- Notifications and activity: browser/push subscription internals, provider defaults, UI presenter/viewlet metadata, and activity control/extension metadata.
- Attachments and media: previews/preview metadata and friendly wrappers for additional object types beyond issue/document/inventory product.
- Core schema and workspace administration: attribute/enum CRUD, sequences, statuses, role/permission definitions, generic space creation, global admins, and collaborator metadata are covered. Specialized permission/configuration internals, integrations registry, invite settings, role capability settings, and workspace setting metadata remain.
- Integrations: GitHub repository/project mappings and sync metadata (deferred), Google Calendar connect/configure/sync controls, Bitrix entity/field mappings and sync status, Gmail/email channel messages and compose/send/reply/shared-message/delivery-status workflows, Telegram provider health plus write/shared-message/delivery workflows beyond persisted reads, Huly Mail message/write behavior beyond the covered thread metadata index, AI assistant integration state, and AI bot configuration if server-side APIs expose stable behavior.
- Templates, rating, support, billing, analytics, views, workbench, and preferences: read-only message template/category/field discovery and caller-provided rendering are covered; template writes and provider execution remain deferred. Generic filtered-view/viewlet discovery and Board-specific views/preferences are covered; reusable action/filter/sort/group configuration remains. Document/person rating data is blocked by unpublished `@hcengineering/rating` SDK package (#90). `get_support_status` and `list_workbench_applications` cover the stable server-visible subsets; provider messages/actions and browser-local workbench state remain unsupported. Billing, onboarding, and non-view preference writes remain future surfaces.
- Document-specific gaps: snapshot restore, backlinks, notes, structured action items/tables, PDF/export, advanced document relationships, and document printing/export once SDK support is safe.

## MCP Resource Roadmap

- Return resource links from list/search tool results for direct `resources/read` follow-up.
- Add document resources when document reads have a stable URI shape and context-friendly payload.
- Consider scoped/paginated issue listing only when filters prevent very large `resources/list` responses.
- Consider resource `subscribe` and `listChanged` support after stateful sessions and a Huly change source are available.

## SDK Upgrade Revisit

- Revisit `@hcengineering/*` upgrades when a newer release is available after `0.7.423`.
- Verify published tarballs, not only npm metadata, before accepting SDK upgrades.
- Require valid published declaration files for direct Huly dependencies.
- Upgrade direct Huly package declarations coherently in `package.json`; do not accept lockfile-only transitive rewrites.
- Run `pnpm check-all` and local Huly integration tests before treating an SDK upgrade as viable.
