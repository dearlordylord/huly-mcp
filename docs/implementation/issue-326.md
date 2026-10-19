# Issue 326 implementation evidence

## Lifecycle policy — criterion 1, partial evidence

The maintained [resident manual](../resident-manual.md#attachment-leases-and-managed-idle-retirement)
records the current lease, heartbeat, idle, control and drain defaults. The
policy distinguishes attachment eligibility from retained request and cleanup
ownership. Expiry does not establish a Huly operation's outcome, free an
unverified resource or authorize replay.

Current sources are `admission-contract.ts`, `adapter-attachment.ts`,
`admissions.ts`, `admission-lifetime-state.ts`, `attachment-owner.ts`,
`managed-contract.ts` and `manual-backend.ts` under `src/resident/`.
`managed-idle-protected-work.test.ts` and
`managed-idle-admission-race.test.ts` describe cleanup retention and the two
admission/fence orderings. Their existence is not a current native qualification
receipt.

Historical preparation evidence exists in commit `5e69e7ed` at
`docs/implementation/resident-lease-policy.md`. That record describes a
monotonic calibration before lease wiring, using the preceding `109c4a85`
candidate. Its raw report remains at
`/tmp/resident-admission-calibration-monotonic-109c4a85/report.json`.
This is historical calibration evidence, not a measurement of the current
combined artifact or live Huly acquisition.

The historical policy proposed a 15-second managed idle interval before managed
startup existed. Commit `5e1187f1` introduced managed startup with the current
5-second idle constant. The earlier calibration must not be presented as
measurement of that later policy. Criterion 1's requirement for measured bounds
before real lifecycle wiring still needs a complete provenance audit, including
that policy change; documenting today's constants alone does not complete it.
The same managed-startup commit's `resident-managed-design.md` explicitly names
five seconds as a new managed policy and leaves process qualification pending;
it records the selection, rather than supplying the missing measurement.

Independent Standards and Spec reviews found no factual overclaim in the new
manual section. This documentation increment changes no runtime policy,
deadline, model or test inventory. No native measurement or full quality gate
was rerun for it, and issue 326 remains incomplete.

## Adapter loss isolation — criterion 2

Four Linux combinations were observed across two attempts: clean EOF and
SIGKILL, each with MCP revisions `2026-07-28` and `2025-06-18`. Two independent
parents start managed adapters sharing one backend. Actual SDK project queries
use the same request ID with different project payloads, and both REST responses
are held. Ending or killing the first adapter interrupts only its call. The
survivor returns its expected project, then completes another read through the
same accepting generation. Retained request counts move from two to one to zero.
The dead adapter's attachment remains owned until lease expiry in the SIGKILL
cases. Each successful case joins both parent exits, observes backend exit 0
through the kernel supervisor, and verifies an empty private namespace.

The initial four-case run passed three cases; legacy EOF failed during discovery
before business dispatch. Its result and failure remain preserved. The test host
now explicitly identifies expiration of the same five-second discovery request
allowance, and the supervisor also saves owned-exit receipts. A focused run of
only the failed case with that diagnostic passed. The failure did not reproduce;
its exact cause remains unknown. This is not a clean four-case campaign or a
startup repair.

Evidence under `/tmp/resident-auth-config-0db836c2`:

- `active-query-current.json`: initial three passes and one failure.
- `active-query-first-input.json`: retained original source hashes and roots.
- `active-query-legacy-eof-diagnostic.json`: subsequent focused pass.
- `active-query-observed-cases.json`: four successful receipt locations,
  generation inventory observations and runtime hashes.

All four successful receipts identify the same packaged MCP bytes, SHA-256
`33311217d91ac0938123173ea9d555939fe9321edbf6f763b4d67c0e404a5d4f`.
The diagnostic host changes no server runtime, request allowance or acceptance
assertion. This demonstrates the scoped isolation behavior with disposable REST
data; live Huly, native macOS, startup stability, the other lifecycle cases and
the full quality gate remain separate qualification work. Empty state and process
absence alone are not kernel exit proof for the earlier failed discovery attempt.
