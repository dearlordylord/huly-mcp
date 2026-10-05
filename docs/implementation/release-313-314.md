# Release qualification: issues #313 and #314

Status: implementation accepted for release under the user's explicit contention-timeout waiver and full CLI mirror waiver. Publication is deferred to the user's machine after npm login. Prepared versions: `@firfi/huly-mcp@0.53.0` and `@firfi/huly-cli@0.51.0`; these include all four pending changesets, including saved local profiles, Effect 4, analytics opt-out and these issue fixes.

## Acceptance evidence

| Criterion | Observation |
| --- | --- |
| #313 root/descendant cycle refusal, actionable reason, discovered issue IDs and offending stable parent ID | Unit selector matrix passed; zero writes and allocations asserted. |
| #313 same/cross-project selectors, truthful reservation guidance and no invalid retry | Unit and failure-path tests passed. Reservation-backed guidance is in both reason and inspection. |
| #313 integration cycle step asserts the new reason | Fixture authored; live cycle assertion not reached after tools/list timeout. Accepted by user waiver; no observed live pass claimed. |
| #314 assigned component ID and label; absent, null, undefined, deleted and malformed references omitted | All five unit cases passed. Schema owns the optional component reference. |
| #314 set component followed by get_issue | Both full HTTP configurations passed `get_issue projects assigned component ID` and `get_issue projects assigned component label`. |
| #314 packed CLI mirror readback | Fixture retains the same assertions. User stopped and accepted the full mirror before this assertion; ordinary packed CLI integration passed completely. |

## Quality evidence

Functional source `cf203c9b191c1e65ed81fddab56371bcd8dc733e` passed every one of the 19 check-all gates: 404 files, 5381 tests. Coverage: statements 99.48%, branches 99.01%, functions 99.08%, lines 99.58%; duplication 0.93%. A preceding complete gate also passed. Strict TypeScript 7 and Effect error/warning diagnostics, circular dependencies, complexity, formatting and inventory gates remain enabled.

Final source `300653907d758e261d001cdc0c20e69cb634af5f` passed all static gates and 5378 tests locally under Node 24.15.0; three forest tests reached unchanged 5000 ms deadlines. GitHub CI under Node 22.22.2 passed the static gates and 5379 tests; two of the same forest tests timed out. These are accepted exceptions; actual failed receipts and exits were retained. No assertion, timeout or quality threshold was weakened. Later source changes consist of harness parsing, its regression tests, release versions and evidence documentation.

Independent Standards and Spec reviews reported no blocking findings. CI portability fixes were tested under both supported pinned Node versions. Linux arm64 frozen-lockfile dependencies were isolated from the canonical Darwin checkout; all 35 candidate files matched before reporting.

## Live campaign and limits

- Ordinary packed CLI: **exit 0, clean true**, 196 PASS observations, all declared behavior/risk cases completed.
- HTTP env configuration: 721 PASS observations, including #314 component readback, before a 30-second readiness request timeout.
- HTTP header configuration: 666 PASS observations, including #314 component readback, before a 30-second attachment request timeout. The subsequent empty-ID assertion is a consequence of that missing response.
- Full native Huly: 55 PASS observations before a missing response. Intabia attempt also stopped on missing responses.
- Full CLI mirror: 51 PASS observations before the user's explicit stop/accept decision. Remaining assertions unobserved; this was not a measured timeout or a completed suite.
- Movement concurrency: nine cases passed; the tenth reached a movement deadline. Independent owned-record preservation observations were valid for all ten executed cases; eight later cases were not reached.
- Tree, movement, transfer and attribute suites stopped at request/connect deadlines. Original logs and failed receipts are retained; none was changed into a passing receipt.

Every bounded runner reported process cleanup complete. This does not prove absence of every fixture from interrupted full suites; cleanup after each completed fixture is recorded where observed. Existing fixture-dependent skips are retained, including pre-existing standard sequence metadata and unavailable workspace fixture capabilities.

Native discovery scope, saved credential profiles, HTTP no-config smoke, stdio unreachable smoke, packed MCP/CLI certification, dependency closure, package versions and artifact metrics passed. HTTP no-config smoke additionally passed under Node 22.22.2. GitHub Docker smoke passed; cancelled package and Node 24 jobs provide no additional evidence. Unsupported-Node diagnostic passed on the earlier functional candidate. Optional SDK reference-model parity is partial because its optional checkout is absent; required reference ledger and SDK corpus checks passed.

Legacy token harness: the initial raw-token schema startup failure was corrected with `Schema.RedactedFromValue`; seven focused tests passed, including two real subprocess regressions without network access. The corrected active harness completed with exit 0 under Node 24.15.0: core REST, account, storage/file and collaborator markup passed through both stdio and HTTP. Cleanup of issue, attachment and document was confirmed in both transports. All 25 captured artifacts passed the secret check. Modern personal API token compatibility remains uncertified.

Versioned MCP 0.53.0 and CLI 0.51.0 archives passed packed-artifact certification. Artifact metrics were refreshed for these versions. Production publication must run the existing `pnpm local-release` from a clean master checkout under Node 24.15.0; it regenerates canonical x64 evidence and waits for Package Smoke before publishing and creating tags/releases. No npm package was published by this session.

Private evidence: `/tmp/hulymcp-release-evidence-313-314`, including original quality receipts, campaign logs, `release-validation/outcomes.txt`, `timeout-waivers.txt`, source hashes and CI logs. Public reports: [#313](issue-313.md), [#314](issue-314.md). User waivers are release decisions, distinct from observed test passes.

## Final versioned-candidate gate

At release commit `11d70bb2`, `pnpm check-all` passed movement fixture preflight and stopped at the unchanged 60-second movement-process deadline. An off-repository continuation ran every remaining gate with the exact original per-stage limits: all 16 remaining static/build gates passed, including strict diagnostics (1188 files, zero errors/warnings), registry versions, schemas, CLI inventory, documentation, skill, dependency closure, lint and duplication. Coverage reached its unchanged 300-second outer limit without a terminal test/coverage summary; exit 124 and complete process cleanup were retained. Together, 17 of 19 stages passed and two timeouts were accepted by the user. No final coverage count is inferred from progress output. Earlier complete functional-source coverage and the later Node 22/24 actual test counts above remain the observed evidence. Logs: `release-validation/release-versioned-check-all.log`, `final-gates-outcomes.txt` and `final-test-coverage.log`.
