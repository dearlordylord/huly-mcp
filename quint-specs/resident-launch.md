# Resident launch model sketch

Status: proposed types awaiting approval. `resident-launch.qnt` typechecks. It
has no initialization, transitions, invariants or simulation results. The
response-ownership model remains separate and unchanged.

## Scope and state

The source contract is GitHub #322 through #328 and
[the conditional recovery design](../docs/implementation/resident-recovery-design.md).
The sketch separates callers, guardians, restricted workers, attachment leases,
requests and specification-only invocation history. Each actor has its own state record. Filesystem
claims are keyed by the complete compatibility identity, so independent
configurations can make progress separately.

Callers retain kill authority only before attempting Start. A guardian retains
the original worker handle and owns publication receipts. Losing that handle
cannot create retirement authority from a PID or port. Pending ownership is
recorded before a worker starts. Guardian loss leaves unresolved inventory even
if the worker later notices IPC disconnect.

Requests remain independent of attachment leases. Queued work, model waiters and
running work protect a generation from ordinary idle retirement. Expiry of a
lease cannot establish that its requests stopped. Model readiness is separate
from application readiness.

There is no operation journal, persisted reservation, replay queue or cross-session
operation-status lookup. [ADR 0002](../docs/adr/0002-resident-recovery-without-operation-journal.md)
records the explicit scope change. Ownership inventory remains separate and
protected; removing request persistence does not remove ownership proof obligations.

The `writes` map is specification/oracle history, not runtime storage. Its key
combines an adapter incarnation with a request ordinal. `CallerId` denotes a
unique adapter incarnation, not a reusable host name or wire request ID. The
oracle may retain history across modeled actor loss to detect replay, without
requiring application persistence. Backend terminal production, adapter receipt,
queue admission and actual host observation are separate phases. A completed
stdout write is not proof that the host processed the terminal result.

Only proven refusal before dispatch establishes non-dispatch. A possibly
submitted operation without a host-observed terminal result remains unconfirmed.
Unknown outcomes survive replacement in the surviving caller's state and in the
oracle's assertions; a fresh adapter cannot retrieve old outcomes. A host-observed
terminal result remains known despite a later transport failure. Local retirement
does not settle or cancel a remote Huly mutation, which may finish later.

## Proposed transitions and checks

The next increment would separate claim acquisition, prepared startup, Start
attempt, pending ownership persistence, restricted worker creation, application
readiness and publication. Recovery would separate observed child close,
retirement confirmation, receipt retirement and replacement. Target dispatch,
remote commit, terminal production, adapter receipt, output queueing and host
observation would also be separate steps, so each crash window can be exercised.

The intended checks are one admitted generation per compatibility identity,
generation-owned publication and cleanup, cross-client response isolation,
no dispatch after cancellation while waiting, no admission after drain, no
ordinary retirement of protected work and no replay of an uncertain operation. These checks are not implemented yet.

## Assumptions and proposed exploration

Startup and control messages may be lost. Processes may stop between steps.
The model abstracts filesystem and IPC behavior into observed events. Atomic
claim acquisition, authenticated messages, confirmed child closure and protected
ownership inventory remain implementation proof obligations. A typecheck
cannot establish any of those facts.

The proposed initial exploration uses three callers, three guardians, four
workers, three generations, two compatibility identities and three operations.
This includes competing launchers, an independent identity, a surviving caller,
and replacement with an uncertain operation. Ten-parent launch behavior remains
a separate real-process requirement. Clock rounds represent ordered expiry
events, not measured milliseconds.

Safety must hold under arbitrary message loss and crashes. Eventual recovery
would require explicit fairness, a surviving guardian, qualified worker
confinement and successful cleanup and ownership storage. No liveness result is claimed.
Native filesystem permissions, OS process behavior, SDK resources, real Huly
semantics and physical memory use require separate evidence.
