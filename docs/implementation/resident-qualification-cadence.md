# Resident qualification scope and local gate diagnosis

## macOS qualification deferred by the user

On 2026-10-18 the user made native macOS execution optional and nonblocking for this delivery, and will run it on their own computer. The amendment is recorded in GitHub issues #322 and #328. macOS support remains in scope. Native macOS scenarios remain deferred and unexecuted; Linux results do not qualify macOS. Linux requirements and all other behavioral cases, coverage thresholds, diagnostics, inventory, deadlines and cleanup obligations remain required. No denied SSH access was bypassed.

The completion audit retains all 170 rows. Only the dedicated Mac execution story `322.41` may be nonblocking `deferred`, and only when both frozen #322/#328 bodies contain the explicit approved amendment. Mixed Linux/macOS criteria still require their Linux portion. An arbitrary deferred requirement cannot produce completion. The checker self-tests cover complete proof, incomplete proof, authorized Mac deferral, missing authorization and still-required Linux deferral.

## Focused coverage-cohort comparison

The full quality gate on `4a7362be` stopped at the unchanged 300-second coverage limit. Its saved V8 chunks showed completion of 145 of 520 test files; there were no final coverage totals. This was a failed gate.

A source review identified 91 additional domain, operation, runtime and MCP port-test files without shared ambient mutations. They now use the existing ports project. The three stdio subprocess suites retain isolated module graphs, as does the resident launch-race project. Oracle-enabled runs still isolate the ports project. Worker count remains four and all coverage thresholds remain 99%.

Evidence: `/tmp/resident-launch-model-a2935a11/coverage-cohort/`. Five alternating baseline/candidate pairs executed the same 780 cases with zero runtime failures and identical per-source coverage scopes/counts. Baseline wall time median was 40.08 seconds (range 39.67–55.09); candidate median was 15.50 seconds (11.51–20.33). These are local subset measurements under shared-host load, not application performance measurements or a full-gate pass. Each subset command exited 1 because global coverage thresholds were intentionally unchanged. CPU profiles for the narrower initial 17-file investigation showed repeated module compilation/loading among the leading costs.

Independent Vitest file inventories contain the same 520 unique files; exactly 91 change project assignment. No test is removed. The comparison retains raw process results, case inventory hashes and coverage snapshots. A fresh full gate is still required on the resulting coherent candidate before live-Huly fixture writes.

## Preserved second gate and fresh coverage artifacts

The gate on `c23d1c72` also stopped at the unchanged 300-second coverage limit. Its retained chunks show 423 completed files and 97 remaining, all in ports. The first completed ports file appeared roughly 264 seconds after the first completed launch fixture. Installed Vitest source shows contiguous project ordering and compatible nonisolated runner reuse; it does not support repeated mixed-isolation eviction as the cause. Reordering projects would primarily change which files remain. No successful final test/coverage totals or live-Huly writes are claimed.

Two five-pair build comparisons produced the same package SHA-256 in every invocation. The second comparison reversed pair order on even pairs: package-script median 1.09 seconds (0.99–1.68), direct compiler 0.98 (0.86–1.19); one direct trial was slower. This modest, noisy wrapper reduction was not accepted as sufficient justification for another full gate. Raw results remain in `build-wrapper/` and `build-wrapper-balanced/` under the evidence root. The direct-compiler helper experiment was discarded.

Coverage now builds one fresh package-script artifact in each subprocess-bearing Vitest project. Setup uses the ordinary launcher, externals and package/Node-engine definitions, inside the existing coverage-stage allowance. Workers receive a schema-encoded absolute path and SHA-256. The helper hashes the exact read buffer and writes an exclusive independently owned suite copy. A bad/missing artifact or malformed grant fails without fallback. Without a grant, focused tests still build normally. There is no cross-run artifact cache or cached quality receipt.

Installed Vitest runs setup before pool tasks and copies project env to workers. Its global teardown precedes pool closure, so teardown removes only the setup-owned source; each suite owns its executable copy. SIGKILL cannot guarantee global teardown. Forced outer process-group cleanup remains unchanged; a killed run may retain an ignored private build artifact, which a subsequent invocation never reuses.

`coverage-bundle-copy.json` records five passing checks: independent verified copies, mutation isolation, malformed/missing/mismatched grant rejection and package-script byte parity. The absent-grant path builds a fresh source. `coverage-bundle-focused.json` records 12 passing helper/manual-adapter cases with coverage setup active; its exit 1 is expected at unchanged global coverage thresholds, not a full-gate pass. `coverage-setup-failure/result.json` and `run.log` retain an actual package-build failure in a separate root; the test-worker marker was not created and the owned command joined. This exercises failed setup without a mocked compiler.

## Output-pipeline boundary

`output-backpressure-first.json`, `output-backpressure-reviewed.json` and `output-backpressure-final.json` each record one passing actual packaged-adapter scenario. One SSE call submits 80 progress frames of 256 KiB, below the existing response-byte budget. With stdout unread, accepted progress reaches a bounded plateau while a separate adapter returns two exact colliding-ID replies. Controlled FIFO drainage advances progress beyond the plateau; stopping drainage again leaves substantial output and triggers the unchanged ten-second output-write allowance, exit 1 and the checked diagnostic. The peer returns a third reply. This establishes controlled output-pipeline backpressure; it does not independently measure an exact internal queue occupancy.

The reviewed test uses one five-second deadline per observation/drain phase, waits for process close before inspecting stderr, and independently attempts adapter and fixture cleanup while preserving the primary scenario failure. This adds a distinct case alongside large unread output and request-admission overflow; it does not replace those checks.
