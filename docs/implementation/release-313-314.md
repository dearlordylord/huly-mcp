# Release qualification: issues #313 and #314

Status: implementation accepted for release under the user's explicit contention-timeout waiver and full CLI mirror waiver. Publication is authorized. Prepared versions: `@firfi/huly-mcp@0.53.0` and `@firfi/huly-cli@0.51.0`; these include all four pending changesets, including saved local profiles, Effect 4, analytics opt-out and these issue fixes.

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

Legacy token harness: initial startup failed because raw environment token input was decoded with a schema requiring an already-redacted value. Correction and final evidence follow below. Modern personal API token compatibility remains uncertified.

Private evidence: `/tmp/hulymcp-release-evidence-313-314`, including original quality receipts, campaign logs, `release-validation/outcomes.txt`, `timeout-waivers.txt`, source hashes and CI logs. Public reports: [#313](issue-313.md), [#314](issue-314.md). User waivers are release decisions, distinct from observed test passes.
