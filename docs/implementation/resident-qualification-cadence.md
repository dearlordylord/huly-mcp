# Resident qualification scope and local gate diagnosis

## macOS qualification deferred by the user

On 2026-10-18 the user made native macOS execution optional and nonblocking for this delivery, and will run it on their own computer. The amendment is recorded in GitHub issues #322 and #328. macOS support remains in scope. Native macOS scenarios remain deferred and unexecuted; Linux results do not qualify macOS. Linux requirements and all other behavioral cases, coverage thresholds, diagnostics, inventory, deadlines and cleanup obligations remain required. No denied SSH access was bypassed.

## Focused coverage-cohort comparison

The full quality gate on `4a7362be` stopped at the unchanged 300-second coverage limit. Its saved V8 chunks showed completion of 145 of 520 test files; there were no final coverage totals. This was a failed gate.

A source review identified 91 additional domain, operation, runtime and MCP port-test files without shared ambient mutations. They now use the existing ports project. The three stdio subprocess suites retain isolated module graphs, as does the resident launch-race project. Oracle-enabled runs still isolate the ports project. Worker count remains four and all coverage thresholds remain 99%.

Evidence: `/tmp/resident-launch-model-a2935a11/coverage-cohort/`. Five alternating baseline/candidate pairs executed the same 780 cases with zero runtime failures and identical per-source coverage scopes/counts. Baseline wall time median was 40.08 seconds (range 39.67–55.09); candidate median was 15.50 seconds (11.51–20.33). These are local subset measurements under shared-host load, not application performance measurements or a full-gate pass. Each subset command exited 1 because global coverage thresholds were intentionally unchanged. CPU profiles for the narrower initial 17-file investigation showed repeated module compilation/loading among the leading costs.

Independent Vitest file inventories contain the same 520 unique files; exactly 91 change project assignment. No test is removed. The comparison retains raw process results, case inventory hashes and coverage snapshots. A fresh full gate is still required on the resulting coherent candidate before live-Huly fixture writes.
