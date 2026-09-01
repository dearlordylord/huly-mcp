# Effect 4 final parity report

## Certified target

This report certifies the direct cutover of `@firfi/huly-mcp` and
`@firfi/huly-cli` to the installed `effect@4.0.0-rc.108` cohort. It covers the
final state of the integration branch for issues #209 and #232. No Effect 3
runtime, compatibility layer, diagnostic suppression, or weakened quality gate
is part of the released artifacts.

## Local-Huly certification

The live suites ran from the project container against the local Huly deployment
after loading `.env.local` and rewriting only the configured origin from
`localhost` to `host.docker.internal`. Raw credentials and tokens were not
written to this report or test logs.

| Surface | Result | Certified behavior |
| --- | --- | --- |
| Native stdio MCP | 1,095 passed, 0 failed, 27 skipped | Full lifecycle matrix, invalid-input paths, cleanup, response drain, and EOF shutdown |
| Native HTTP with environment credentials | 1,091 passed, 0 failed, 31 skipped | Modern protocol discovery and the full lifecycle matrix through the real HTTP listener |
| Native HTTP with request headers | 1,091 passed, 0 failed, 31 skipped | Request-scoped URL, workspace, and redacted token configuration with full cleanup |
| Tool exposure and scope | Passed | Request-local client classification, auto/native/proxy selection, category/tool pins, strict proxy output, and invalid pins |
| Packed CLI focused | 123 passed, 0 failed | Parsing, typed failures and exits, confirmation, structured and binary output, and disposable-resource cleanup |
| Packed CLI full mirror | 1,095 passed, 0 failed, 27 skipped | The clean-installed CLI catalog executes the same live lifecycle program and cleanup assertions |

The skipped cases are intentionally non-destructive or require optional local
fixture state documented in `INTEGRATION_TESTING.md`; they are not failures or
migration deferrals. Representative reads, writes, idempotent retries, expected
domain failures, malformed inputs, authentication rejection, and deletion of
confirmed disposable resources were exercised. The live runs do not rely on
immediate read-after-write visibility where Huly is eventually consistent.

Four live-only defects were repaired during certification:

- Planner scheduling now projects Huly's mixin-backed employee fields to a
  plain schema-owned boundary before decoding, so a readable inherited `active`
  field is accepted without weakening the active-employee check.
- Modern MCP tool exposure now reads client identity from the validated
  request-local metadata envelope. The deprecated connection accessor remains
  only as the legacy fallback.
- CLI operator diagnostics are routed to stderr, preserving stdout as a clean
  JSON/data boundary while agent-visible warnings remain in the result envelope.
- CLI Huly-client cleanup is bounded by a five-second grace period with static,
  secret-free diagnostics, so a completed operation is not hidden by a stuck SDK
  close promise.

## Effect 3 oracle and artifact parity

The immutable Effect 3 oracle was not regenerated. The final Effect 4 corpus is
verified by the compact reviewed certificate described in
`behavioral-oracle-delta-review.md`: 21,092 exact differences are divided into
12,754 Draft-07 structural dialect changes, 4,897 schema-metadata changes, 3,428
authored-constraint projections, 3 direct issue-assignee tool-description
changes, 6 richer CLI JSON diagnostics, and 4 concise CLI help changes. Counts,
current/baseline hashes, and sorted delta-set hashes
reject unreviewed, changed, duplicate, or stale classifications.

The certified registry remains 522 ordered unique operations. Strict Ajv
Draft-07 compilation passes for all 524 native and 6 proxy schemas. Discovery,
resources, CLI routing/help, transport behavior, package closure, executable
modes, clean-consumer installs, and artifact-size evidence are covered by the
oracle and #225/#229/#231 certificates referenced from the migration ledger.

## Reference and guidance decision

`.reference/effect-v3.22.1` is retained only as immutable historical parity
provenance. Setup no longer provisions or verifies it, it is absent from the
active lookup order, and the repository intentionally has no ambiguous
`.reference/effect` alias. Current work consults the installed rc.108
declarations, `node_modules/effect/AGENTS.md`, and the explicitly pinned v4
source and skills checkout. Active prompts no longer direct implementation work
through the v3-to-v4 migration workflow.

## Release gate

Both packages have a patch Changesets entry for this cutover. The final
release-candidate gate is:

```bash
mise exec node@22.22.2 -- pnpm check-all
```

It passed on the current tree after this report, the integration-driven fixes,
and subsequent certified maintenance: 861 files produced zero strict Effect
diagnostics, all 290 test files and 4,320 tests passed, and coverage was 99.57%
statements, 99.00% branches, 99.26% functions, and 99.61% lines. The gate retains the existing TypeScript 7, strict Effect diagnostics,
circular-dependency, complexity, schema-boundary, no-mocks, duplication, and 99%
coverage requirements.
