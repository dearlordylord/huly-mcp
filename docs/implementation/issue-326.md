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

## Protected work and shared-model waiting — criterion 3

The current Linux checks passed all eight combinations of MCP revision
(`2026-07-28`/`2025-06-18`), canceled role (model-load creator/joiner), and clock
(real elapsed time/injected clock). Two independent adapters share one full-model
load. Canceling one waiter leaves the other waiting and then completing its
expected project read; a fresh read through the same generation also succeeds.
Retained requests move from two to one to zero. Each successful receipt includes
parent joins, backend kernel exit 0 and private-state removal.

Model-wait cases alone retain live attachments and do not establish protection
without membership. Three additional checks cover that boundary, including an
actual SIGKILL of the only adapter, injected lease expiry and held request
cleanup. The same generation remains alive across multiple idle intervals until
cleanup is released; retirement then waits a new full idle interval. The process
receipt records exactly one business dispatch, backend exit 0 and removed state.

Evidence under `/tmp/resident-auth-config-0db836c2`:

- `model-wait-current.json`: eight passes; `work-protection-observed-cases.json`
  records the eight distinct receipt roots and their protocol/role/clock keys.
- `idle-protected-work-current.json`: three passes.
- `/tmp/resident-idle-work-nmwAks.receipt.json`: independent expired-membership
  process receipt.

Injected-clock cases qualify ordering, not measured physical durations. These
checks use disposable local REST data; live Huly and native macOS remain separate.

## Idle/admission ordering — criterion 4

Seven focused component checks and two native process checks passed. They cover
an admission begun before idle expiry, idle fencing before admission, the
retained compatible admission path, fresh work on an accepting generation and
refusal during held cleanup. After confirmed retirement, a new caller can start
a distinct generation. The process cases join the owned backend exits and
verify private-state removal.

The reports are `idle-admission-order-current.json` and
`idle-fence-process-current.json` in the evidence directory above.
`idle-order-observed-cases.json` records the two exact native receipt paths and
SHA-256 hashes. This qualifies
the defined orderings; it is not exhaustive enumeration of OS schedules.

## Drain and native-resource retention — criterion 5

Sixteen focused checks passed across `admission-fence.test.ts`,
`native-session-ownership.test.ts`, `resident-client-close.test.ts` and
`resource-shutdown.test.ts`. Drain fences new admission, retains native session
UUIDs and client leases until cleanup confirms, closes a client once, and
preserves typed/redacted close failures and the existing five-second close bound.
A quiesced native resource-discovery request is refused before Huly dispatch.
The startup sequence awaits admission cleanup before closing the shared client;
a failed drain does not authorize premature shared-client closure.

`drain-retention-current.json` retains the sixteen results.
`retirement-focused-results.json` summarizes these five focused groups: 8, 3, 7,
2 and 16 passes, with zero failures. Fresh Spec review accepted the scoped
criterion-3/4/5 evidence. These results do not establish native macOS behavior,
full lifecycle-model coverage, the final combined quality gate or completion of
all issue-326 criteria.
