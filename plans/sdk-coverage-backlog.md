# SDK Coverage Backlog

> Status: unvalidated backlog candidates. These are not accepted implementation scope until each item has a small PRD or issue with an integration-test strategy.

These candidate gaps came from a quick comparison against installed Huly SDK/plugin surfaces and local examples. They are not yet validated against live Huly behavior, user demand, or SDK write semantics.

- [ ] Not validated: direct-message creation and direct-message send/update/delete tools. Current tools list direct message conversations but message write coverage is channel-focused.
- [ ] Not validated: saved document tools, such as save document, unsave document, and list saved documents.
- [ ] Not validated: document snapshot/history tools using `DocumentSnapshot`.
- [ ] Not validated: calendar management tools for `Calendar`, `ExternalCalendar`, `Schedule`, and `PrimaryCalendar` objects.
- [ ] Not validated: richer attachment/media tools for SDK classes such as `Embedding`, `Drawing`, and `Photo`.
- [ ] Not validated: social identity and contact channel inspection tools for lower-level contact/account debugging.
- [ ] Not validated: card favorites, card roles, card sections, and card view defaults/extensions.
- [ ] Not validated: project/task descriptor management beyond the safe project type, task type, and issue status tools already implemented.
- [ ] Not validated: a carefully constrained raw read-only SDK inspection tool. This should remain read-only unless a separate safety design is approved.

## Validation Checklist

- [ ] Confirm the SDK class shape and required fields from local examples, SDK types, or live workspace inspection.
- [ ] Decide whether the tool is LLM-first and safer as a single high-level operation rather than raw SDK access.
- [ ] Define cleanup-safe integration coverage, or explicitly document why only read-only integration is safe.
- [ ] Add schema-backed inputs and encoded output validation.
- [ ] Run `pnpm check-all`.
