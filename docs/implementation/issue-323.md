# Issue 323 implementation evidence

## Explicit manual entrypoint — criteria 1 and 2

The package launcher dispatches explicit `stdio-http` to the manual adapter and explicit `stdio-resident` to own-package managed startup. The ordinary default remains standalone stdio; direct HTTP stays explicit. [Manual commands](../resident-manual.md) use the packaged entrypoints, with no third-party gateway, global host edit or OS-service installation.

Manual mode reads the deliberately supplied protected descriptor. Its schema binds format/implementation, loopback endpoint, generation/TLS identity and private authorization. The adapter authenticates that channel and sends private daemon authorization, not Huly credentials. It does not discover an arbitrary listener or implicitly substitute a profile. Fresh source/contract Spec audit accepted these criteria and #324.2; this does not replace native/live qualification.

## Routing and output bounds — criteria 5, 7 and 8

Evidence root: `/tmp/resident-launch-model-a2935a11`. `manual-adapter-current.json` records seven actual packaged manual-adapter cases covering colliding IDs/different replies, origin-bound progress, cancellation, EOF, adapter death and missing terminal output. Their observed response transitions are replayed into Quint. Delayed-commit observations separately cover late old replies while a colliding read is held. Unsupported ID-bearing interactive server requests are rejected rather than assigned invented continuation behavior.

The adapter has bounded input, eight concurrent requests, a sixteen-message output queue, a response-byte budget and a ten-second output-write allowance. The limits are admission safeguards, not certified performance targets. `output-backpressure-final.json` adds a distinct controlled output-pipeline saturation/drain/reblock case with continued peer replies. It does not claim independently measured exact internal queue occupancy.

`validated-native-output-stop-receipts.json` validates four completed closed/unread stdout observations, both protocols, from the `c23d1c72` run. `validated-native-burst-receipts.json` validates both completed burst-admission observations from that run. The read-only checkers apply the corresponding Effect schemas and all original test assertions; receipt hashes are retained. The two burst cases show the actual eight-request bound, rejection of the overflow request without dispatch, retained work 9→1→0 and independent peer reads. All observed MCP bytes match SHA-256 `33311217d91ac0938123173ea9d555939fe9321edbf6f763b4d67c0e404a5d4f`; these fixture/contract sources are unchanged in `f91fd0a0`.

These are per-case observations retained before the aggregate gate timed out. They do not turn the failed gate into a pass. The [qualification record](resident-qualification-cadence.md) retains the separate failed attempts, current focused checks and scope limits. No live-Huly demo, native macOS result or entire issue completion is inferred.

### Initialization status and discovery during model acquisition

The private live-status contract now exposes a required `hulyInitialization`
projection of the existing client acquisition fiber: inactive, initializing,
ready, failed, or closed. Reading it does not acquire clients, retry a failure,
or create another lifecycle owner. Initializing includes configuration and Huly
connection/model acquisition; it does not identify a separate SDK download phase.
Closed means the resolver rejects new acquisitions. Resource cleanup can still be
pending or fail; the CLI explicitly reports cleanup as unconfirmed.

The native model-wait fixture now opens a third independent discovery client
while two requests are held behind one model acquisition. All eight existing
protocol/creator/clock combinations passed in
`/tmp/resident-launch-model-a2935a11/initialization-native-model-wait.json`.
Discovery completed with backend readiness ready and Huly initialization
initializing; acquisition count stayed one. Subsequent reads observed ready.
These receipts identify their own later package bytes, not artifact333.

Focused status/resolver checks passed, including an interruption finalizer held
with Deferred while the resolver already fences new work:
`initialization-closure-focused.json`. Standards and Spec review both required
clarifying closed versus completed cleanup; that wording is corrected without
additional mutable state. The change supplies the missing initialization
visibility for #322.44. It does not establish a passing coherent quality gate.
