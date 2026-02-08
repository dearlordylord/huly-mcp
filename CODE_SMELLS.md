# Code Smell Tracker

Rules: worktree work by parallel sub-agents. each writes REPORT.md. integration tests OK.

## Worktree Status

| WT | Items | Scope | Status | Result |
|----|-------|-------|--------|--------|
| wt-nits | 55, 66 | remove makeJsonSchema wrapper; remove TOOL_DEFINITIONS cast | MERGED | d185007: removed makeJsonSchema (100+ sites), removed TOOL_DEFINITIONS cast. 755/755 |
| wt-dead-code | 30, 32 | addSubstringSearch: remove or use; PersonRefSchema: remove from barrel | MERGED | 94fbe73: removed addSubstringSearch, removed PersonRefSchema from barrel. 755/755 |
| wt-shared-ops | 11, 31 | double-cast shared.ts:41; remove dead interfaces | MERGED | 5931308: eliminated double-cast (SDK types correct), removed 3 dead interfaces. 755/755 |
| wt-results-total | 27 | results.total fallback unnecessary, remove | MERGED | eb38a62: removed 8x .total??.length in 6 files, fixed test mock. 755/755 |
| wt-http-transport | 14, 50, 62 | transport cast; signal handler cleanup; redundant async | MERGED | 9b2ddb4: kept transport cast (documented SDK bug), fixed signal cleanup, removed async. 755/755 |
| wt-server-config | 5, 7, 45, 57 | version from pkg.json; remove casts; TOOLSETS via Config; remove HulyConfigError | MERGED | bf08e17: PKG_VERSION build-time inject, removed 3 casts, TOOLSETS via Config, removed HulyConfigError. 755/755 |
| wt-errors-research | 2b | RESEARCH: error 4-edit architecture viability | DONE | 6c283fb: as never defeats exhaustive check, schema union dead code. Recommends Option A |
| wt-schema-research | 23, 24 | RESEARCH: schema boilerplate factory; ParticipantSchema reuse | REJECTED | user: not wanted |
| wt-errors-cleanup | 2a, 28, 29, 33, 44 | remove mcpErrorCode+getMcpErrorCode; extract notif context dup; move McpErrorCode | MERGED | cb16e74: removed mcpErrorCode from 29 classes, moved McpErrorCode to error-mapping, extracted notif helper. 747/747 |
| wt-issues-split | 1 | split issues.ts -> issues/components/issue-templates | MERGED | a00f50f+user 10dd847: split ops+schemas, extracted threads.ts, max-lines rule. 747/747 |
| wt-issues-improve | 4, 8, 9, 10, 18, 19, 59 | findPerson $like; extractUpdatedSequence guard; toRef<Employee> verify; Email.make fix; resolveStatusByName; resolveAssignee; Unknown fallback fail | MERGED | a74c692: resolveStatusByName, resolveAssignee helpers; Schema decoder; findOne+$like. 747/747 |
| wt-storage | 3, 12, 13, 47 | FileSourceParams union; blob cast; ErrnoException guard; buildFileUrl encoding | MERGED | 2a37124: discriminated union, removed blob cast, ErrnoException guard, URLSearchParams. 755/755 |
| wt-polyfills | 6 | isolate globalThis polyfills -> polyfills.ts | MERGED | 2d16fa1: extracted to src/polyfills.ts. 747/747 |
| wt-registry | 17, 56 | single generic factory; remove _toolName | MERGED | 2785f2e: consolidated 5 factories into generic createHandler, removed _toolName. 747/747 |
| wt-dry-limit | 16 | clampLimit helper + DEFAULT_LIMIT/MAX_LIMIT constants; jscpd + no-magic-numbers | MERGED | 3e4f15f: clampLimit helper, named constants, jscpd lint. 747/747 |
| wt-dry-helpers | 25, 26 | findByNameOrId; findOneOrFail | MERGED | f1bd0c4: extracted findByNameOrId + findOneOrFail to shared.ts, updated 8 files. 747/747 |
| wt-dry-retry | 20 | shared connection retry HOF | MERGED | 817bbf7: extracted withConnectionRetry HOF to auth-utils. 755/755 |
| wt-cjs-interop | 21 | centralize CJS require() -> huly-plugins.ts | MERGED | 67b8895: centralized 12 plugins into huly-plugins.ts, updated 18 files (incl. split modules). 747/747 |
| wt-markup | 22 | extract toInternalMarkup/fromInternalMarkup | MERGED | f3211f6: extracted toInternalMarkup/fromInternalMarkup in client.ts. 748/748 |
| wt-schemas | 36, 37, 38, 39, 40, 41, 42, 43 | Email validation; NonNegativeInt counts; component field; GetPersonParams union; author type; senderId type; ProjectSchema archived; byDay validator | MERGED | 94aa9c2: Email validation, NonNegativeInt, ComponentIdentifier in templates, archived field. 748/748 |
| wt-contacts | 46 | email filtering after limit -> filter before or adjust | MERGED | d76fce3: channel-first query strategy, email filter before limit. 751/751 |
| wt-mcp-arch | 48, 49, 51, 52 | McpToolResponse index sig; handleToolCall return; WorkspaceClient optional; toMcpResponse _meta | MERGED | 8a67c1c: removed index sig, fixed handleToolCall return, simplified toMcpResponse. 51 kept as-is. 751/751 |
| wt-style | 61, 65 | handler style consistency; concatLink usage; prefer-tacit rule | MERGED | f5be2fa: point-free style, prefer-tacit eslint rule. 751/751 |
| wt-queries | 15 | Record<string,unknown> -> Partial<DocumentQuery<T>> | DONE | 1e41655: DocumentQuery<T> across 9 files, refAsPersonId helper for WorkSlot. 755/755 |

## Skipped Items

| # | Reason |
|---|--------|
| 34 | no - throw after absurd in client.ts |
| 35 | no - throw after absurd in error-mapping.ts |
| 53 | no - HTTP error raw strings |
| 54 | false positive - AssertionError is correctly spelled |
| 58 | no - isMainModule detection |
| 60 | no - data ternary |
| 63 | ignore - lint warnings |
| 64 | no - bundle size |
| 67 | no - as const |

## All Items Reference

| # | Description | Decision | WT |
|---|-------------|----------|----|
| 1 | Split issues.ts (1431L) -> issues/components/issue-templates | yes | wt-issues-split |
| 2a | Remove mcpErrorCode + getMcpErrorCode | yes | wt-errors-cleanup |
| 2b | Research: error 4-edit architecture viability | research | wt-errors-research |
| 3 | FileSourceParams -> discriminated union | yes | wt-storage |
| 4 | findPersonByEmailOrName: $like queries, restrict channel type | best effort | wt-issues-improve |
| 5 | Version hardcode 1.0.0 vs 0.1.25 | best effort | wt-server-config |
| 6 | Isolate globalThis polyfills -> polyfills.ts | yes | wt-polyfills |
| 7 | server.ts casts unknown->Error, Schema.Defect takes unknown | yes | wt-server-config |
| 8 | extractUpdatedSequence cast -> runtime guard | best effort | wt-issues-improve |
| 9 | toRef\<Employee\> -- verify is employee | best effort | wt-issues-improve |
| 10 | Email.make(person.name) when no email -- re-research API | research+fix | wt-issues-improve |
| 11 | shared.ts:41 double-cast Status | best effort | wt-shared-ops |
| 12 | storage.ts:188 blob._id as Ref\<Blob\> | best effort | wt-storage |
| 13 | storage.ts:357 caught error as ErrnoException | best effort | wt-storage |
| 14 | http-transport.ts:115 transport as Transport | best effort | wt-http-transport |
| 15 | Record\<string,unknown\> -> Partial\<DocumentQuery\<T\>\> ~15 locs | best effort | wt-queries |
| 16 | Math.min(limit??50,200) x31 -> clampLimit helper | yes | wt-dry-limit |
| 17 | 5 near-identical tool handler factories -> single generic | yes | wt-registry |
| 18 | Status resolution repeated 3x -> resolveStatusByName | yes | wt-issues-improve |
| 19 | Assignee resolution repeated 4x -> resolveAssignee | yes | wt-issues-improve |
| 20 | Connection retry logic duplicated -> shared HOF | yes | wt-dry-retry |
| 21 | CJS require() interop in 4+ files -> huly-plugins.ts | yes | wt-cjs-interop |
| 22 | Markup format switch duplicated 3x -> extract helpers | yes | wt-markup |
| 23 | Research: Schema+type+jsonSchema+parser boilerplate factory | research | wt-schema-research |
| 24 | Research: ParticipantSchema = PersonRefSchema, reuse? | research | wt-schema-research |
| 25 | "Find by name then by ID" duplicated 3x -> findByNameOrId | yes | wt-dry-helpers |
| 26 | "Find or fail" ~10x -> findOneOrFail | yes | wt-dry-helpers |
| 27 | results.total ?? results.length -- total is always number | yes | wt-results-total |
| 28 | error-mapping.ts dup notif context mapping -> extract | yes | wt-errors-cleanup |
| 29 | Remove getMcpErrorCode (dead export) | remove | wt-errors-cleanup |
| 30 | addSubstringSearch (dead export) -- remove or use | agent decides | wt-dead-code |
| 31 | Remove PaginationOptions/SearchOptions/LookupOptions | remove | wt-shared-ops |
| 32 | Remove PersonRefSchema from barrel export | remove | wt-dead-code |
| 33 | Remove mcpErrorCode from all error classes | remove | wt-errors-cleanup |
| 36 | Email brand: non-empty + single @ validation | yes | wt-schemas |
| 37 | Schema.Number for counts -> Schema.NonNegativeInt | yes | wt-schemas |
| 38 | component field raw String vs ComponentIdentifier | agent decides | wt-schemas |
| 39 | GetPersonParamsSchema -> discriminated union | yes | wt-schemas |
| 40 | author in comments.ts String vs PersonName | agent decides | wt-schemas |
| 41 | senderId raw String vs PersonId/AccountUuid | agent decides | wt-schemas |
| 42 | ProjectSchema missing archived field | agent decides | wt-schemas |
| 43 | byDay Array(String) vs WeekdaySchema | agent decides | wt-schemas |
| 44 | McpErrorCode -> error-mapping.ts (MCP layer) | yes | wt-errors-cleanup |
| 45 | process.env.TOOLSETS -> Effect Config | yes | wt-server-config |
| 46 | contacts.ts email filtering after limit | agent decides | wt-contacts |
| 47 | buildFileUrl missing URL encoding | agent decides | wt-storage |
| 48 | McpToolResponse index sig removal | agent decides | wt-mcp-arch |
| 49 | handleToolCall return Promise\<T\>\|null -> Promise\<T\|null\> | yes | wt-mcp-arch |
| 50 | HTTP signal handlers accumulate | agent decides | wt-http-transport |
| 51 | WorkspaceClient optional -> higher-level resolution | agent decides | wt-mcp-arch |
| 52 | toMcpResponse strips _meta by rebuild | agent decides | wt-mcp-arch |
| 55 | makeJsonSchema pass-through -> remove | yes | wt-nits |
| 56 | _toolName unused param -> remove | yes | wt-registry |
| 57 | HulyConfigError alias -> remove | yes | wt-server-config |
| 59 | "Unknown" status fallback -> fail instead | yes | wt-issues-improve |
| 61 | Tool handler style inconsistency -> standardize | yes | wt-style |
| 62 | Redundant async on non-await handlers | yes | wt-http-transport |
| 65 | buildFileUrl should use concatLink | agent decides | wt-style |
| 66 | TOOL_DEFINITIONS redundant as cast | yes | wt-nits |
| 68 | Enforce full ESLint ruleset on test files | yes | pending |
| 69 | Lower jscpd threshold | TODO | pending |

## Item 68 Research: Test File Lint Enforcement

**Source**: `eslint.config.mjs` TODO — currently only double-assertion ban on test files.

**Baseline**: 150 warnings (0 errors). Full enforcement: 2,492 problems (2,142 errors, 350 warnings).
**After auto-fix**: 365 problems (80 errors, 285 warnings) — 83% resolved by `pnpm lint --fix`.

**Remaining ~240 manual fixes in test files:**

| Rule | Count | Effort |
|------|-------|--------|
| `functional/immutable-data` | ~261 | disable for tests (mutation in setup is standard) |
| `consistent-type-assertions` | ~32 | low — remove `as T` where return type suffices |
| `no-unnecessary-condition` | ~27 | low-medium — remove defensive `?.` on non-nullable |
| `no-unused-vars` | ~20 | low — remove unused schema imports |
| `consistent-type-imports` | ~15 | low-medium |
| `no-non-null-assertion` | ~8 | low — add null checks |

**Approach**: extend rules to `["src/**/*.ts", "test/**/*.ts"]`, parser → `tsconfig.lint.json`, auto-fix, then manual pass. Disable `functional/immutable-data` for test files.
