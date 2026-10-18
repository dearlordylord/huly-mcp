# Resident launch model sketch

Status: proposed types awaiting approval. `resident-launch.qnt` typechecks. It
has no initialization, transitions, invariants or simulation results. The
response-ownership model remains separate and unchanged.

## Scope and actors

The source contract is GitHub #322 through #328,
[ADR 0003](../docs/adr/0003-adopt-mcporter-resident-lifecycle.md) and
[the selected lifecycle contract](../docs/adr/0003-adopt-mcporter-resident-lifecycle.md).
The sketch follows the adopted MCPorter lifecycle practices: callers, native
backends, per-identity ownership claims, publication receipts, attachment leases,
requests and explicit retirement evidence. It does not require a guardian,
restricted worker or operation journal.

`CallerId` denotes a unique adapter incarnation, not a reusable host name or wire
request ID. Callers retain kill authority only before attempting Start. Backend
resources and publication belong to their original generation. A lost receipt,
PID or port cannot create authority to kill, delete or replace an unresolved
owner. Application readiness remains separate from Huly model readiness.

`RetirementUnverified` blocks overlapping replacement. `OwnedClosureConfirmed`
represents observed closure of actually owned resources. `OperatorRetirementVerified`
is an explicit trusted input after verified local cleanup; it cannot be inferred
from file absence, timeout, a diagnostic PID or an ordinary Huly read. Native
verification of that input remains outside the abstract model's proof.

A backend crash may interrupt every client. The model must not require another
client's request to survive that crash. Healthy-backend cancellation, EOF and
ordinary idle shutdown retain their separate isolation/work-protection rules.
Unexpected owner loss may produce bounded refusal rather than automatic failover.
After verified retirement, concurrent callers serialize into one fresh generation.

## Request evidence

There is no operation journal, persisted reservation, replay queue or cross-session
operation-status lookup, as defined in
[ADR 0002](../docs/adr/0002-resident-recovery-without-operation-journal.md).
The `writes` map is specification/oracle history keyed by adapter incarnation and
request ordinal, not runtime storage. Retaining this history across modeled actor
loss lets the oracle detect replay without requiring application persistence.

Backend terminal production, adapter receipt, queue admission and actual host
observation are separate facts. Output write completion does not prove the host
processed a result. Possible dispatch without a host-observed terminal result
remains unconfirmed. An observed result remains known despite a later disconnect.
No replacement restores an old invocation. Local retirement does not settle or
cancel a remote Huly mutation; operation-specific reconciliation is separate.
This has the same per-request uncertainty as standalone stdio.

## Transitions and evidence

The next increment would separate claim acquisition, Start attempt and delivery,
application readiness, atomic publication and receipt observation, cancellation,
drain, confirmed cleanup, unexpected backend loss, blocked selection, verified
operator cleanup and replacement. Target dispatch, remote commit, terminal
production, adapter receipt and host observation are separate crash windows.

Intended checks are one admitted compatible owner, authenticated attachment,
generation-fenced cleanup, no dispatch after waiting cancellation, no admission
after drain, no ordinary idle retirement of protected work and no automatic replay.
These checks are not implemented yet. Existing separate-parent concurrency cases,
quality gates and deadlines remain independent requirements.

The proposed sampled domain uses three caller incarnations, three backends,
three generations, two compatibility identities and three invocations. It must
cover concurrent startup, an independent configuration, ordinary retirement,
blocked owner loss and a replacement after verified cleanup. Clock rounds order
expiry; they do not certify measured deadlines.

Assume cooperating package writers and protected lifecycle state. Same-user
manual destruction of the live namespace is not supported automatic recovery;
missing files never establish verified retirement. Detectable corruption and
missing expected records remain refusal cases. This explicit boundary replaces
the prior arbitrary-erasure proof obligation in the guardian proposal.

No liveness result is claimed. Eventual replacement requires successful verified
retirement, local coordination and explicit scheduling assumptions. Native OS
permissions, process identity/cleanup, Huly semantics, actual host behavior and
resource measurements still need separate qualification. Typechecking alone
establishes none of those properties.


## Type reconciliation with observed fault schedules — 2026-10-18

The proposed request map now uses the same `InvocationId` as verification-only write history. A wire JSON-RPC ID is a separate request field: two adapter incarnations may both use ID1 while their invocation identities remain different. The caller is derived from the map key instead of duplicated in the request record. This permits the late old-reply/fresh-read schedule without treating a reused wire ID as the same invocation.

`RemoteEffect` records oracle truth separately from caller knowledge: a write can remain uncertain while its remote effect is pending, and can commit after local retirement. Neither a fresh read nor local cleanup changes that fact into known failure. Request cleanup is independent of its execution phase, so a terminal/canceled request may still retain protected local resources. An owned resource also records its caller, allowing foreign-attachment cleanup to be distinguished from generation cleanup.

These are proposed type corrections only. They add no actions, invariants, initialization or proof. The existing explicit type-sketch approval checkpoint remains in effect; it has not been inferred from repeated implementation continuations. The bounded domain must include colliding wire IDs, at least two adapter incarnations and an old invocation retained in oracle history after adapter loss.


The proposed coordination abstraction remains plain Quint: protected claims/registry are shared-state coordination, while `starts` represents explicitly scheduled delivery of startup messages. This keeps ownership/retirement interleavings in one bounded state model but requires explicit message-delivery actions rather than Choreo scaffolding. The choice and the grouping of per-caller/per-backend records are part of the existing type-sketch sign-off, not an approved transition design.
