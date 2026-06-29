# Native Reference Round-Trip Across Rich Text Surfaces

## Objective

Make MCP markdown round-trips preserve native Huly `reference` nodes everywhere the MCP API exposes Huly rich text as markdown, not only documents and issues.

Rule under test:

- A markdown link to the current workspace Huly browse URL with `_class`, `_id`, and `label` must write a native `reference` node.
- External URLs and other-workspace Huly browse URLs must remain normal links.
- Existing documents and issues behavior must remain stable, including their public `DocumentReferenceError` and `IssueReferenceError` tags.
- Each task must run a self-review coding agent loop after implementation: spawn a review agent, ask it to inspect the task's diff against `.claude/review-rules.md`, fix reasonable notes, and repeat until no reasonable notes remain.

## Shared Pre-Research

- Existing native-reference parser lives in `src/huly/operations/markup.ts`.
- Malformed-aware write wrapper lives in `src/huly/operations/native-reference-markup.ts`.
- Document-specific write wrapper lives in `src/huly/operations/document-native-references.ts`.
- Issue-specific write wrapper lives in `src/huly/operations/issue-native-references.ts`.
- Blob collaborator writes using `client.uploadMarkup(..., "markdown")` or `client.updateMarkup(..., "markdown")` currently use the client adapter markdown converter and do not use the native-reference wrapper.
- Inline markup writes using `markdownToMarkupString` / `optionalMarkdownToMarkup` currently preserve links as link marks, not native references.
- Review agents must consult `.claude/review-rules.md`.
- `effect-solutions` is not on PATH in this container; `.reference/effect/` is linked and available for direct lookup.

## Task List

### 01. Validate `markdownToMarkupString`

Status: done

Pre-research:

- Current converter is `markdownToMarkupString` in `src/huly/operations/markup.ts`.
- Existing test currently asserts matching Huly browse URLs remain links.

Input:

- Current-workspace Huly browse markdown link.
- External URL.
- Other-workspace Huly browse URL.

Expected output:

- Current-workspace link becomes a `reference` node.
- External and other-workspace links remain link marks.

Success criteria:

- `test/huly/operations/markup.test.ts` has explicit validation for the new default.
- Existing `markdownToMarkupStringWithHulyLinks` malformed behavior remains tested.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Updated markup converter tests.

Unambiguous test:

- `pnpm test test/huly/operations/markup.test.ts`

### 02. Validate `create_card`

Status: done

Pre-research:

- Operation writes `params.content` through `client.uploadMarkup(..., "markdown")` in `src/huly/operations/cards.ts`.
- `get_card` reads content as markdown from collaborator markup.

Input:

- `content` containing a current-workspace Huly browse link.

Expected output:

- Captured uploaded collaborator markup contains a `reference` node.

Success criteria:

- Unit test fails before the shared write fix and passes after.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Focused `create_card` native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/cards.test.ts`

### 03. Validate `update_card`

Status: done

Pre-research:

- Existing content path uses `updateMarkup(..., "markdown")`; missing content path uses `uploadMarkup(..., "markdown")`.

Input:

- Existing card content plus replacement markdown containing current-workspace Huly browse link.

Expected output:

- `updateMarkup` stores a native `reference` node.
- No raw markdown is written to `updateDoc`.

Success criteria:

- Unit test covers existing-content update.
- Unit test covers missing-content upload if not already covered by create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Focused `update_card` native-reference tests.

Unambiguous test:

- `pnpm test test/huly/operations/cards.test.ts`

### 04. Validate `create_todo`

Status: done

Pre-research:

- `uploadTodoDescription` writes through `client.uploadMarkup(..., "markdown")` in `src/huly/operations/planner.ts`.
- Applies to personal and issue-attached ToDos.

Input:

- ToDo `description` containing a current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test covers at least one personal ToDo and one issue-attached ToDo if test setup already supports both cheaply.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Planner native-reference create tests.

Unambiguous test:

- `pnpm test test/huly/operations/planner.test.ts`

### 05. Validate `update_todo`

Status: done

Pre-research:

- Existing description path uses `updateMarkup(..., "markdown")`; missing description path uses `uploadMarkup(..., "markdown")`.

Input:

- Replacement ToDo `description` containing current-workspace Huly browse link.

Expected output:

- Existing description is updated as native `reference`.
- Missing description uploads native `reference` and updates the ToDo description ref.

Success criteria:

- Unit tests cover both paths.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Planner native-reference update tests.

Unambiguous test:

- `pnpm test test/huly/operations/planner.test.ts`

### 06. Validate `create_event`

Status: done

Pre-research:

- `resolveEventInputs` writes event description through `client.uploadMarkup(..., "markdown")` in `src/huly/operations/calendar-shared.ts`.

Input:

- Event `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates non-recurring create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Calendar create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/calendar.test.ts test/huly/operations/calendar-branches.test.ts test/huly/operations/calendar-coverage.test.ts`

### 07. Validate `create_recurring_event`

Status: done

Pre-research:

- Recurring event create shares `resolveEventInputs`.

Input:

- Recurring event `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates recurring create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Calendar recurring native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/calendar-recurring.test.ts test/huly/operations/calendar.test.ts`

### 08. Validate `update_event`

Status: done

Pre-research:

- Existing description path uses `updateMarkup(..., "markdown")`; missing description path uses `uploadMarkup(..., "markdown")`.

Input:

- Event `description` replacement containing current-workspace Huly browse link.

Expected output:

- Existing description update stores a native `reference` node.
- Missing description upload stores a native `reference` node and updates the event description ref.

Success criteria:

- Unit tests cover both paths.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Calendar update native-reference tests.

Unambiguous test:

- `pnpm test test/huly/operations/calendar.test.ts test/huly/operations/calendar-coverage.test.ts`

### 09. Validate `update_organization`

Status: done

Pre-research:

- `get_organization` fetches description as markdown.
- `update_organization` uses `updateMarkup(..., "markdown")` when a description ref exists and `uploadMarkup(..., "markdown")` otherwise.

Input:

- Organization `description` containing current-workspace Huly browse link.

Expected output:

- Update and upload paths store native `reference` nodes.

Success criteria:

- Unit tests cover both paths.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Organization native-reference tests.

Unambiguous test:

- `pnpm test test/huly/operations/contacts-organization.test.ts`

### 10. Validate `create_recruiting_vacancy`

Status: done

Pre-research:

- `fullDescription` is uploaded through `client.uploadMarkup(..., "markdown")` in `src/huly/operations/recruiting-vacancies.ts`.

Input:

- Vacancy `fullDescription` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Recruiting vacancy create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/recruiting.test.ts`

### 11. Validate `update_recruiting_vacancy`

Status: done

Pre-research:

- Update path re-uploads `fullDescription` through `uploadFullDescription`.

Input:

- Replacement `fullDescription` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node and update writes the new ref.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Recruiting vacancy update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/recruiting.test.ts`

### 12. Validate `create_test_plan`

Status: done

Pre-research:

- Test plan descriptions are fetched as markdown through `test-management-shared.ts` and written via `uploadMarkup(..., "markdown")`.

Input:

- Test plan `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test management plan create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-plans.test.ts`

### 13. Validate `update_test_plan`

Status: done

Pre-research:

- Update path always uploads replacement description and writes the ref.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test management plan update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-plans.test.ts`

### 14. Validate `create_test_case`

Status: done

Pre-research:

- Test case create writes description through `uploadMarkup(..., "markdown")`.

Input:

- Test case `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test management case create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-core.test.ts`

### 15. Validate `update_test_case`

Status: done

Pre-research:

- Update path uploads replacement description and writes the ref.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test management case update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-core.test.ts`

### 16. Validate `create_test_run`

Status: done

Pre-research:

- Test run create writes description through `uploadMarkup(..., "markdown")`.

Input:

- Test run `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test run create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-runs.test.ts`

### 17. Validate `update_test_run`

Status: done

Pre-research:

- Update path uploads replacement description and writes the ref.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test run update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-runs.test.ts`

### 18. Validate `create_test_result`

Status: done

Pre-research:

- Test result create may inherit source case description and uses test run/result write helpers in `src/huly/operations/test-management-runs.ts`.

Input:

- Result creation path with description content containing current-workspace Huly browse link, if the public schema supports direct result description on create.

Expected output:

- Captured upload contains a native `reference` node or the task documents that no direct write path exists.

Success criteria:

- Unit test or explicit code-level finding.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Non-applicability documented: `createTestResult` has no description input and initializes `description: null`; native-reference writes are covered by `update_test_result`.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-runs.test.ts`

### 19. Validate `update_test_result`

Status: done

Pre-research:

- Update path uploads replacement description and writes the ref.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Captured upload contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Test result update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/test-management-runs.test.ts`

### 20. Validate `create_board_card`

Status: done

Pre-research:

- Board card description is inline Markup produced by `descriptionFromMarkdown`.

Input:

- Board card `description` containing current-workspace Huly browse link.

Expected output:

- Created card inline description contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Board card create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/boards.test.ts`

### 21. Validate `update_board_card`

Status: done

Pre-research:

- Board card update uses `descriptionFromMarkdown` in `boards-card-update.ts`.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Updated inline description contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Board card update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/boards.test.ts`

### 22. Validate `create_component`

Status: done

Pre-research:

- Component description is inline Markup written through `optionalMarkdownToMarkup`.

Input:

- Component `description` containing current-workspace Huly browse link.

Expected output:

- Created component inline description contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Component create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/components.test.ts`

### 23. Validate `update_component`

Status: done

Pre-research:

- Component update writes inline Markup through `optionalMarkdownToMarkup`.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Updated inline description contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Component update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/components.test.ts`

### 24. Validate `create_milestone`

Status: done

Pre-research:

- Milestone create dual-writes inline Markup through `optionalMarkdownToMarkup` and collaborator markup through `uploadMarkup(..., "markdown")`.

Input:

- Milestone `description` containing current-workspace Huly browse link.

Expected output:

- Inline description and collaborator upload both contain native `reference` nodes.

Success criteria:

- Unit test validates both writes.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Milestone create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/milestones.test.ts`

### 25. Validate `update_milestone`

Status: done

Pre-research:

- Milestone update dual-writes inline Markup and collaborator markup.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Inline description and collaborator upload both contain native `reference` nodes.

Success criteria:

- Unit test validates both writes.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Milestone update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/milestones.test.ts`

### 26. Validate `create_issue_template`

Status: done

Pre-research:

- Issue template parent and child descriptions are inline Markup written through `optionalMarkdownToMarkup`.

Input:

- Template `description` and one child `description` containing current-workspace Huly browse links.

Expected output:

- Parent and child inline descriptions contain native `reference` nodes.

Success criteria:

- Unit test validates parent and child create paths.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Issue template create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/issue-templates.test.ts`

### 27. Validate `update_issue_template`

Status: done

Pre-research:

- Issue template update writes inline Markup through `optionalMarkdownToMarkup`.

Input:

- Replacement template `description` containing current-workspace Huly browse link.

Expected output:

- Updated inline description contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Issue template update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/issue-templates.test.ts`

### 28. Validate `create_recruiting_review`

Status: done

Pre-research:

- Recruiting review description is inline Markup written through `markdownToMarkupString`.

Input:

- Review `description` containing current-workspace Huly browse link.

Expected output:

- Created review inline description contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Recruiting review create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/recruiting.test.ts`

### 29. Validate `update_recruiting_review`

Status: done

Pre-research:

- Recruiting review update writes inline Markup through `markdownToMarkupString`.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Updated inline description contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Recruiting review update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/recruiting.test.ts`

### 30. Validate `create_recruiting_opinion`

Status: done

Pre-research:

- Recruiting opinion description is inline Markup written through `markdownToMarkupString`.

Input:

- Opinion `description` containing current-workspace Huly browse link.

Expected output:

- Created opinion inline description contains a native `reference` node.

Success criteria:

- Unit test validates create.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Recruiting opinion create native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/recruiting.test.ts`

### 31. Validate `update_recruiting_opinion`

Status: done

Pre-research:

- Recruiting opinion update writes inline Markup through `markdownToMarkupString`.

Input:

- Replacement `description` containing current-workspace Huly browse link.

Expected output:

- Updated inline description contains a native `reference` node.

Success criteria:

- Unit test validates update.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Recruiting opinion update native-reference test.

Unambiguous test:

- `pnpm test test/huly/operations/recruiting.test.ts`

### 32. Validate comment/message write surfaces

Status: done

Pre-research:

- Issue comments, attached comments, drive comments, activity messages, channels, DMs, and thread replies use `markdownToMarkupString`.
- These were previously treated as ordinary links by design; this task validates the new global rule if `markdownToMarkupString` changes.

Input:

- Comment/message body containing current-workspace Huly browse link.

Expected output:

- Body markup contains a native `reference` node.
- External links remain normal links.

Success criteria:

- At least one representative test each for issue comments and channel/DM messaging.
- Existing message behavior remains otherwise unchanged.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Comment/message native-reference validation tests.

Unambiguous test:

- `pnpm test test/huly/operations/comments.test.ts test/huly/operations/channels.test.ts test/huly/operations/drive-comments.test.ts`

### 33. Fix `markdownToMarkupString` default behavior

Status: done

Pre-research:

- `markdownToMarkupString` is the shared inline/message converter.
- It currently calls `markdownToMarkup` with `MARKDOWN_INPUT_REF_URL` to prevent reference conversion.
- `markdownToMarkupStringWithHulyLinks` already has the desired conversion logic and malformed-reference reporting.

Input:

- Shared markup converter code.

Expected output:

- `markdownToMarkupString` preserves native Huly references for complete current-workspace browse links by default.
- Malformed current-workspace browse links remain ordinary links for this non-Effect, non-error-returning converter.
- `markdownToMarkupStringWithHulyLinks` remains the strict/malformed-aware API for surfaces that need typed failures.

Success criteria:

- Focused markup tests pass.
- Inline field tests pass without per-operation converter duplication.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Updated `src/huly/operations/markup.ts`.

Unambiguous test:

- `pnpm test test/huly/operations/markup.test.ts`

### 34. Fix collaborator `"markdown"` write conversion

Status: done

Pre-research:

- `src/huly/client.ts` converts collaborator `"markdown"` writes using `sdk.markdownToMarkup(... MARKDOWN_INPUT_REF_URL ...)`.
- Blob rich-text surfaces using `uploadMarkup` / `updateMarkup` with `"markdown"` bypass `markdownToMarkupString`.

Input:

- Client adapter `toInternalMarkup` markdown branch.

Expected output:

- Collaborator `"markdown"` writes also preserve complete current-workspace Huly browse links as native references.
- Existing explicit `"markup"` callers for documents/issues remain stable.

Success criteria:

- Client upload/update markup tests cover native reference conversion.
- Blob field operation tests pass.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Updated `src/huly/client.ts` and client tests.

Unambiguous test:

- `pnpm test test/huly/client.test.ts test/huly/operations/cards.test.ts test/huly/operations/planner.test.ts test/huly/operations/calendar.test.ts`

### 35. Update LLM-facing schemas and tool descriptions

Status: done

Pre-research:

- Documents and issues currently document native-reference browse-link behavior.
- Other markdown fields mostly say only "markdown supported".

Input:

- Schema descriptions under `src/domain/schemas/`.
- Tool descriptions under `src/mcp/tools/`.
- README generated tool table.

Expected output:

- All affected markdown/rich-text fields tell the LLM that current-workspace Huly browse URLs become native references and external URLs stay links.

Success criteria:

- Descriptions are concise and consistent.
- `pnpm update-readme` is run if needed.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Updated schemas/tools/README.

Unambiguous test:

- `pnpm verify-readme`

### 36. Focused Verification

Status: done

Pre-research:

- Relevant test files are listed in each task.

Input:

- Full implementation.

Expected output:

- Focused tests pass for all changed operation groups.

Success criteria:

- Run:
  - `pnpm test test/huly/operations/markup.test.ts`
  - `pnpm test test/huly/client.test.ts`
  - `pnpm test test/huly/operations/cards.test.ts test/huly/operations/planner.test.ts test/huly/operations/calendar.test.ts`
  - `pnpm test test/huly/operations/contacts-organization.test.ts test/huly/operations/recruiting.test.ts`
  - `pnpm test test/huly/operations/test-management-core.test.ts test/huly/operations/test-management-plans.test.ts test/huly/operations/test-management-runs.test.ts`
  - `pnpm test test/huly/operations/boards.test.ts test/huly/operations/components.test.ts test/huly/operations/milestones.test.ts test/huly/operations/issue-templates.test.ts`
  - `pnpm test test/huly/operations/comments.test.ts test/huly/operations/channels.test.ts test/huly/operations/drive-comments.test.ts`
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Passing focused test output.

Unambiguous test:

- Commands above.

### 37. Full Gate

Status: done

Pre-research:

- Project gate is `pnpm check-all`.

Input:

- Full implementation after focused tests.

Expected output:

- Full quality gate passes.

Success criteria:

- `pnpm check-all` passes.
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Passing check-all output.

Unambiguous test:

- `pnpm check-all`

### 38. Local Huly Integration Verification

Status: done

Pre-research:

- Integration command inside this container must source `.env.local` and rewrite `localhost` to `host.docker.internal`.

Input:

- Built server with full implementation.

Expected output:

- Integration suite passes.
- Manual or scripted proof shows a representative non-issue/non-document field stores `type: "reference"`.

Success criteria:

- Run:
  - `pnpm build`
  - `set -a && source .env.local && set +a && HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh`
- Self-review loop has no remaining reasonable notes.

Expected artifact:

- Passing integration output and proof notes in final response.
- Integration output: `792 passed, 0 failed, 27 skipped (of 819)`.
- Representative non-issue/non-document proof: bundled branch-code script created a personal Planner ToDo, fetched
  `time:class:ToDo.description` raw collaborator markup, and found:
  `{"type":"reference","attrs":{"id":"tracker:project:DefaultProject","objectclass":"tracker:class:Project","label":"HULY Project"}}`.

Unambiguous test:

- Commands above.
