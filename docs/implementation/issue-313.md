# Issue #313

Status: implemented; release qualification accepts contention timeouts by explicit user decision. Live assertions not reached because of those timeouts remain unobserved.

Cycle destinations are refused during tree preflight with actionable root/parent identifiers, all discovered tree IDs, and `destinationParentId`. No retry call repeats the invalid destination. Blocked pre-write inspection uses the source project; reservation gap guidance is emitted only when execution evidence contains reservations.

Unit coverage checks root, child, grandchild, stable-ID and identifier selectors, agreeing project selectors, and a descendant in the destination project. All assert zero allocation and writes. Existing failure tests distinguish zero reservations from confirmed reservations. The movement CLI fixture checks the specific cycle reason and offending stable parent ID.

## Validation

- Standards and Spec reviews: no blocking findings after corrections; CI portability corrections were reviewed separately.
- Two complete `pnpm check-all` runs passed on the functional candidate. The final functional source `cf203c9b191c1e65ed81fddab56371bcd8dc733e` passed all 19 gates, 404 test files and 5381 tests. Coverage: statements 99.48%, branches 99.01%, functions 99.08%, lines 99.58%; duplication 0.93%.
- Final source `300653907d758e261d001cdc0c20e69cb634af5f`, Node 24.15.0: all static gates and 5378 tests passed. Three forest tests reached their unchanged 5000 ms deadlines. The user explicitly accepts contention timeouts; the actual quality receipt remains exit 1, clean and source-stable. No assertion, threshold or timeout was weakened.
- Validation used `/tmp/hulymcp-release-linux-313-314` with frozen-lockfile Linux arm64 dependencies. Canonical Darwin dependencies were preserved. All 35 changed source files matched before reporting.
- Native tool discovery scope, saved credential profiles, HTTP no-config smoke, stdio unreachable smoke, MCP packed certification, CLI packed certification, versions and artifact size checks passed.
- Movement concurrency: nine cases passed; the tenth hit a movement deadline. Independent owned-record preservation observations were valid for all ten executed cases; eight later cases were not reached. The failed receipt is retained under the user waiver.
- Tree, movement, transfer and attribute live suites stopped on request/connect deadlines. The cycle integration assertion is authored but its live execution was not reached. Full Intabia and full native Huly attempts also stopped on missing responses. These are accepted timeout exceptions, not observed passes.
- Full HTTP/CLI and active-token campaign: see [release qualification](release-313-314.md) for terminal evidence and limitations. Private logs and original receipts: `/tmp/hulymcp-release-evidence-313-314`.
- Optional SDK reference-model parity is partial because the optional reference checkout is absent; the required ledger gate and native SDK reference corpus check passed.
