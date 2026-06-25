# Backlog

The backlog is driven by SDK parity and the project principle that this server should expose LLM-first tools: clear names, self-contained parameters, automatic identifier resolution, and single-call correctness. The audited source of truth lives in [../plans/huly-sdk-gap-matrix.md](../plans/huly-sdk-gap-matrix.md), with machine-checkable classifications in [../plans/sdk-parity-ledger.json](../plans/sdk-parity-ledger.json).

## Highest-Value Additions For Coding Agents

- Generic space follow-ups: role/permission definition writes, generic space creation, and module-specific wrappers above the shared space foundation. Generic space metadata, member/owner mutations, and typed-space role member mutations are covered by the shared spaces tools.
- Core schema/admin follow-ups: guarded attribute/enum writes, role/permission definition writes, generic space creation, global space admins, and module-specific wrappers above the shared space foundation.
- Drive follow-ups: drive create/update/delete, item move/rename/delete, adding new versions to existing files, permissions, and comments/activity.
- Team planner/reporting: team agendas, workload/capacity summaries, visibility-aware free/busy views, document action items, and planner automation diagnostics.
- Recruiting: vacancies, candidates, applications, application statuses, recruiter assignment, reviews, opinions, skills, and related comments/attachments/activity.
- Controlled documents and trainings: controlled document spaces/projects, review/approval workflows, templates, categories, snapshots/history, training assignments, attempts, scoring, and results.
- Module-specific tag wrappers for tag-backed concepts such as recruiting skills, controlled-document labels, and contact tags. Board-label definitions and board-card label attachment are covered by the `boards` tools.

## Planned Feature Surfaces

- Implemented foundation: generic space discovery and safe existing-space administration are covered by `spaces` tools for listing/getting spaces, listing/getting space types, reading permissions, updating common metadata, adding/removing members, and replacing owners.
- Controlled Documents / TraceX documents: controlled spaces/projects, controlled document CRUD, quality/technical docs, co-authors/reviewers/approvers, e-signature workflows, release/effective-date metadata, change control, training linkage, controlled-document comments, and snapshots/history.
- Products and product versions: product spaces, members, descriptions, attachments, versions, version state transitions, and change-control links.
- Trainings, questions, and assessments: training revisions, releases, requests, due dates, max attempts, question banks, answer options, correct-answer data, submissions, scoring, and reporting.
- Drive: first slice covers listing/getting drives, path traversal/list/get items, idempotent folder creation, uploads with parent creation, version listing, and restoring existing versions. Remaining gaps are drive create/update/delete, item move/rename/delete, adding new versions to existing files, comments/activity, and permissions/members.
- HR: departments, nested departments, staff mixins, managers, subscribers, team leads, request types, PTO/sick/overtime/remote requests, public holidays, and schedule/table reports.
- Recruiting: vacancies, talents/candidates, applications, matches, reviews, verdicts/opinions, vacancy-company lists, skills, and recruiting-specific custom fields/relations.
- Surveys and polls: survey CRUD, poll creation/attachment, survey question data, completion status, and results.
- Generic approval requests: create/list/approve/reject/cancel approval requests, decision comments, required approval counts, request status, and requested/approved/rejected people.
- Boards: board CRUD, board cards, status workflows, members/assignees, location, cover/archive fields, board labels, menu/archive views, saved views, viewlets, and common board preference reads.
- Inventory: category hierarchy CRUD, product CRUD, variant/SKU CRUD, and product-scoped photo, attachment, comment, and activity wrappers are covered by first-class tools; category/variant discussion wrappers remain outside this slice.
- Leads write surface: create/update/delete funnels and leads, status changes, assignment, start dates, customer descriptions, person customer support, and lead comments/attachments/labels/relations.
- Contacts: person channels, social identities, provider discovery, contact statuses, notes/comments, person attachments, person merge, employee invite/create/kick/reinvite, and inactive employee management.
- Calendar: calendar CRUD/config, external calendar sync metadata, primary calendar management, schedule objects, participant mutations, and RSVP/status support when stable.
- Team planner and schedule reporting: team agendas, workload/capacity summaries, and visibility-aware free/busy views across members/projects.
- Virtual office and meetings: offices, floors, rooms, access/language/default recording/transcription settings, meeting schedules, active participants, room info, meeting notes/transcript records (minutes), recordings, and device preferences.
- Chat and communication: request-access flows if Huly exposes a stable model, pinned messages, translation, applets, in-message polls, guest communication settings, and external Gmail/Telegram/Huly Mail surfaces plus provider-specific attachments once compatible packages/APIs are proven.
- Notifications and activity: browser/push subscription internals, provider defaults, UI presenter/viewlet metadata, and activity control/extension metadata.
- Attachments and media: previews/preview metadata and friendly wrappers for additional object types beyond issue/document/inventory product.
- Core schema and workspace administration: attribute/property create/update/delete/hide, enum CRUD/options, sequence management, role/permission definition writes, generic space creation, global space admins, integrations registry, invite settings, role capability settings, and workspace setting metadata.
- Integrations: GitHub repository/project mappings and sync metadata (deferred), Google Calendar connect/configure/sync controls, Bitrix entity/field mappings and sync status, Gmail/email channel messages, Telegram messages, Huly Mail/Mail plugin behavior, AI assistant integration state, and AI bot configuration if server-side APIs expose stable behavior.
- Templates, rating, support, billing, analytics, views, workbench, and preferences: read-only message template/category/field discovery is covered; message template writes/rendering remain deferred until provider semantics are proven. Generic saved filtered view discovery, filtered-view detail reads, viewlet metadata, and viewlet preference config discovery are covered by `views` tools; board-specific saved views, viewlets, and common board preference reads remain covered by `boards` tools. Document/person rating data is blocked by unpublished `@hcengineering/rating` SDK package (#90); support conversations, billing tier/status discovery, onboarding channels, tabs/widgets/apps, broader workbench state, and non-view module preference discovery/update remain future surfaces.
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
