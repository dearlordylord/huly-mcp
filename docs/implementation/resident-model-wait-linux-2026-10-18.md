# Shared model waiter cancellation — Linux, 2026-10-18

Parent #322 story9 requires cancellation of one waiting call to leave shared
initialization available to other sessions. The frozen completion audit had
component tests but lacked a packaged two-parent schedule for this behavior.

The maintained scenario is:

```bash
pnpm test test/resident/model-wait-process.test.ts
```

It builds the actual MCP launcher, starts two SDK client parents and their real
stdio adapters, and uses the managed loopback backend. A disposable REST server
holds the SDK's full-model HTTP response. Its explicit callback controls that
boundary; no module replacement or test monkey-patching is used.

The four cases cover cancellation of the first model requester or its joining
waiter, under negotiated MCP 2026-07-28 and MCP 2025-06-18. The fixture role
`creator` means the first model requester. Backend startup ownership election is
outside this schedule; the independent parents launch concurrently.

## Assertions

1. Both parents report distinct parent/adapter PIDs, the actual negotiated
   protocol and the same backend port. That port matches the protected
   descriptor, generation and registry record.
2. Before the model response is released, authenticated status reports two
   retained requests. Exactly one full-model HTTP request and zero project
   queries have reached the fixture.
3. Canceling the selected SDK invocation settles its client promise. The test
   separately waits for backend retained work to drop from `2` to `1` while both
   adapters remain attached. The model response is still held at this point.
4. Releasing the model gives the survivor its exact project result. The
   canceling client then reads a different project successfully, and the
   survivor performs a continued read. The complete project query sequence is
   `SURVIVE`, `FRESH`, `SURVIVE`, with exactly three reads and no writes. The
   original `CANCEL` query never arrives, including after model release.
5. All observations retain the same generation and unchanged registry bytes.
   Retained requests finish at `0`; blocked work remains `0`. Both parents exit0,
   the kernel supervisor joins the owned backend's normal idle exit0, and the
   private namespace is empty.

Each receipt binds the actual MCP artifact SHA-256. Schemas own IPC commands,
events, process input and receipts. Request/parent waits remain five seconds,
owned backend retirement seven seconds, and the supervisor run25 seconds.
Cleanup attempts every parent and closes the REST listener and kernel observer
even if another cleanup fails; a scenario failure takes precedence.

## Evidence and limits

Retained root: `/tmp/resident-model-wait-qualified-0uvjka_z`.
The focused four-case run passed in `/tmp/resident-model-wait-final-matrix.log`.
Initial fixture failures are retained: the first result assertion used a nested
shape instead of the schema-owned flat result; the SDK rejected use of modern
pinning for a legacy protocol. The corrected host selects legacy negotiation
and asserts its actual negotiated version. No product fix was needed.

Standards review found the failure-path cleanup gap; it is corrected and the
follow-up review is clean. Spec review accepted the scoped schedule. Final
`pnpm check-all` passes: 493 files / 5771 tests; 1394 diagnostic files, zero
errors or warnings. Coverage remains 99.45% statements, 99% branches, 99.01%
functions and 99.55% lines; output is 200/300 lines. Final log:
`/tmp/resident-model-wait-final-check-all.log`, SHA-256 `742b8fc3626eb5a57162b5d91aff26e9550bc028155ff4f5ab8c2768ac549d4a`.
The final receipt counters are parsed from actual observations after owned
backend exit, so exact model/read/write counts cover shutdown too.
`verify.mts` checks all four schema-owned receipts, artifact identity, actual
process lineage, retained work, supervisor exit and empty private state.

This is real process/MCP/SDK evidence against a disposable REST model fixture.
It is not a new live-Huly campaign or native macOS qualification. Production
sources and runtime artifacts are unchanged from `61da36a6`; prior scoped live
evidence continues to bind those bytes. Broader EOF/adapter-death, slow-host,
backpressure, routing, lifecycle model/oracle and final delivery requirements
remain incomplete. This increment does not close #323–328.
