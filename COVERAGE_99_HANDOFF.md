# Coverage → 99% Gate: Handoff / Remaining Work

Status as of this branch (`coverage/final-99-resume`). `pnpm check-all` is **green**.

## Current coverage (full run)

| Metric | Baseline (pre-P4) | Now | 99% gate |
|---|---|---|---|
| Statements | 93.4% | **99.22%** (7683/7743) | ✅ |
| Lines | 93.65% | **99.27%** (7290/7343) | ✅ |
| Functions | 93.13% | **99.03%** (1855/1873) | ✅ |
| Branches | 82.31% | **96.86%** (2996/3093) | ⏳ ~67 branches short |

Thresholds in `vitest.config.ts` are ratcheted to `lines: 99, statements: 99, functions: 98.9, branches: 96.6` — locked so nothing can regress. **Raise each toward 99 as the matching metric is finished; set all four to `99` once branches lands.**

Only **branches** remains below the gate. To reach 99% branches you may leave at most **30** uncovered (currently 97). So roughly **67 more branches** must be covered (or, where genuinely unreachable, `v8 ignore`d with a documented reason).

## Principles used this session (please keep)

Honest 99%, not coverage-inflation:
1. **Delete genuinely-dead code** rather than ignore it (this repo has no `noUncheckedIndexedAccess`, so `arr[i] ?? x` after a non-empty `split`/index is provably dead and was deleted; redundant helpers like `uniqueTaskTypeRefs` and a redundant IPv6 first-hextet parser were removed).
2. **Write a real test for every reachable branch** (the large majority).
3. **`v8 ignore start/stop` only** for: provably-unreachable type-guards (e.g. `Map.get(...) ?? fallback` where the key is guaranteed present), security defense-in-depth (url-fetch SSRF), and integration-only paths (real DNS/TLS/30s timeouts, the live `HulyClient` SDK wiring) — **always with a `-- reason` comment**. The bare `/* v8 ignore next */` form is unreliable here; use `start/stop` or `-- reason`.

## Tooling / workflow

- **Find uncovered branch locations for a file:** `node scripts/uncovered.mjs <path-substring>` (reads `coverage/coverage-final.json`; run a coverage pass first). Prints branch types + line numbers, uncovered functions, and uncovered statements.
- **Verify one file fast:** `npx vitest run <test-file> --coverage --coverage.include='src/<file>.ts'`. Note: a targeted run **overwrites** `coverage-final.json`, so re-run full `npx vitest run --coverage` before using `uncovered.mjs` across files.
- **No mocks** (enforced by eslint + review): substitute behavior only through DI seams — `HulyClient.testLayer({...})`, `WorkspaceClient` live layer with a stubbed `HulySdk`, `HulyConfigService.testLayer`, etc. `test/helpers/mock-fn.ts` `mockFn` (call-tracking, not `vi.mock`) is allowed. Use brand constructors from `test/helpers/brands.ts` instead of `as` casts in fixtures.
- **esbuild ≠ tsc:** vitest (esbuild) skips type errors that `tsc` (in `check-all`) rejects. Always run the full `pnpm check-all`, not just `npx vitest run`, before declaring a file done.

## Remaining work, by file

Branch counts (`br`) and function counts (`fn`) are uncovered counts; `lines` are source line numbers of the uncovered branches/functions. Most are "exercise the other state" (optional field present/absent, not-found guard, fallback default, filter predicate).

### Operations (the bulk)

| File | br | fn | Uncovered lines | Notes |
|---|---|---|---|---|
| `huly/operations/issues-write.ts` | 9 | 0 | 184, 192, 267, 462, 466, 467, 470 | createIssue status/task-type workflow: default-status selection (184), `validStatusNames` empty-vs-named (192), no-resolvable-status fail (267), parent-data branches (462-472). Harness in `issues.test.ts` / `issues-extended.test.ts`. |
| `huly/operations/issues-read.ts` | 7 | 2 | 137, 193, 204, 248, 270, 286, 290 | list/get issue filter + optional-field branches; the 2 fns are `.map`/`.filter` callbacks at 211/292. |
| `huly/operations/persons.ts` | 5 | 0 | 122, 200, 343, 346 | `listPersons` nameRegex filter (122), getPerson `organizations.length > 0` (200), get-by-email path + not-found (343/346). Tested via `contacts-extended.test.ts`. |
| `huly/operations/documents.ts` | 4 | 0 | 166, 236, 289 | document optional-field / not-found branches. |
| `huly/operations/calendar.ts` | 4 | 0 | 145, 150 | event optional-field branches. |
| `huly/operations/issue-templates.ts` | 4 | 0 | 246, 504, 505, 506 | template optional-field spreads (504-506) + 246. |
| `huly/operations/relations.ts` | 4 | 0 | 62, 313, 315 | cross-project link prefix-equal edge (62), `listIssueRelations` document/teamspace display fallbacks when a related doc is missing (313/315). |
| `huly/operations/activity.ts` | 3 | 0 | 81, 87 | activity summary optional branches. |
| `huly/operations/channels.ts` | 3 | 0 | 147, 188 | channel add/list branches. |
| `huly/operations/contacts-shared.ts` | 3 | 0 | 120, 129 | `findPersonByEmailOrName` channel/like fallbacks (steps 2/4). |
| `huly/operations/issues-shared.ts` | 3 | 0 | 69, 161, 217 | shared issue helpers. |
| `huly/operations/organizations.ts` | 3 | 0 | 243, 383, 438 | `org.city || undefined` (243), getOrganization not-found (383), member with no email (438). |
| `huly/operations/generic-associations.ts` | 3 | 0 | (project/teamspace resolution success returns) | needs the harness to model `findProjectAndIssue`/`findTeamspaceAndDocument` (project+teamspace docs) to cover the issue/document/teamspace locator **success** paths. Already 98.99% / 100% funcs. |
| `huly/operations/attachments.ts` | 2 | 0 | 292 | optional branch. |
| `huly/operations/calendar-recurring.ts` | 2 | 0 | 236 | recurrence branch. |
| `huly/operations/tags-shared.ts` | 2 | 0 | 179, 206 | tag-category resolution branches. |
| `huly/operations/workspace.ts` | 2 | 0 | 91, 92 | member role/optional branches. |
| `huly/operations/calendar-shared.ts` | 1 | 0 | 65 | single branch. |
| `huly/operations/documents-inline-comments.ts` | 1 | 0 | 51 | single branch. |
| `huly/operations/markup.ts` | 1 | 0 | 127 | `markdownFromMarkup` null/undefined-vs-value. |
| `huly/operations/milestones.ts` | 1 | 0 | ~226 | `updateMilestone` non-empty-description upload path. |
| `huly/operations/notifications.ts` | 1 | 0 | 102 | `optionalDocId` defined-vs-undefined. |
| `huly/operations/tags.ts` | 1 | 0 | 92 | `listTags` titleSearch filter. |
| `huly/operations/projects.ts` | 2 | 2 | 104, 109 | project branches + 2 callback fns. |
| `huly/operations/test-management-shared.ts` | 1 | 3 | 233 | 3 uncovered fns (likely thin converters) + 1 branch. |
| `huly/operations/comments.ts` | 0 | 1 | — | 1 uncovered fn. |
| `huly/operations/search.ts` | 0 | 1 | ~30 | 1 uncovered fn. |

### Config / MCP / schemas / telemetry

| File | br | fn | Uncovered lines | Notes |
|---|---|---|---|---|
| `config/huly-runtime-context.ts` | 4 | 1 | 77, 81, 123, 254 | runtime-context resolution branches + 1 fn. |
| `mcp/protocol-handlers.ts` | 4 | 0 | 166-180, 341-354 | two handler branches (version tool / context tool error mapping). |
| `mcp/server.ts` | 1 | 3 | 125 | 3 uncovered fns (likely lifecycle/factory) + 1 branch. |
| `mcp/tools/registry.ts` | 0 | 3 | — | 3 uncovered fns. |
| `mcp/huly-context-tool.ts` | 2 | 0 | 102, 125 | context-tool branches. |
| `mcp/resources.ts` | 2 | 0 | 266, 316 | the remaining resource error-mapping branches (others already `v8 ignore`d as unreachable in P3). |
| `mcp/error-mapping.ts` | 1 | 0 | 218 | one error-code mapping. |
| `domain/schemas/documents.ts` | 4 | 0 | 75, 388, 391 | schema encode/decode branches — usually quick via `assertDecodeFailure`/`Schema.decodeUnknownSync`. |
| `domain/schemas/channels.ts` | 2 | 0 | 86 | schema branch. |
| `domain/schemas/contacts.ts` | 2 | 0 | 83 | schema branch. |
| `domain/schemas/leads.ts` | 0 | 1 | — | 1 uncovered fn. |
| `huly/huly-labels.ts` | 1 | 0 | 13 | `hulyModelLabelTail` `?? value` fallback (empty segments). |
| `telemetry/posthog.ts` | 0 | 1 | ~56 | 1 uncovered fn (likely a no-op/flush path). |

## Suggested order

1. **Single-branch files** (markup, milestones, notifications, tags, error-mapping, huly-labels, calendar-shared, documents-inline-comments) — fast, each is "test the other state".
2. **Schema files** (`domain/schemas/{documents,channels,contacts}.ts`) — `assertDecodeFailure` from `test/helpers/property.js`.
3. **Function-only files** (registry, server, comments, search, posthog, leads, test-management-shared) — small set; only ~8 functions needed total but functions are already above gate, so these mainly help if a function also gates a branch.
4. **Operation files** with 2–5 branches (persons, organizations, channels, activity, contacts-shared, issues-shared, calendar, documents, issue-templates, projects, workspace, attachments, tags-shared, calendar-recurring).
5. **issues-write/issues-read** (9 + 7) — most intricate; need the full project/task-type/status workflow harness.
6. **generic-associations** last 3 — require modeling project+teamspace resolution in the test harness (or `v8 ignore` the thin success-return wrappers, consistent with the already-ignored issue-locator delegation).

When branches reaches 99%, set all four thresholds in `vitest.config.ts` to `99` and confirm `pnpm check-all` stays green.

## Note on duplicated tests

The generic-associations test additions also exist inside commit `e02b824` on `fix/issue-79-document-content-corruption` (PR #80) — they were accidentally swept in there. If that PR merges, de-dupe those test blocks on whichever branch merges second.
