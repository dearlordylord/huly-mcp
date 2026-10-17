# Resident recovery design decision

Status: conditional design for the next implementation experiment. This is not
verified recovery, a completed criterion, or approval of the pending Quint logic.

## Problem

The existing authorized child owns native MCP and Huly resources. Its death loses
the process handle and publication receipt needed to prove retirement. A fresh
caller cannot reconstruct that authority from a PID, port or stale file.

## Caller's view

The host continues to launch the explicit managed adapter. Selection captures
the complete authority and policy, then returns one authenticated native backend.
After an old request loses its response, the adapter reports an unknown outcome
and never retries it. A later attachment may select a replacement only after a
surviving owner verifies retirement. Inventory loss remains bounded refusal.

Internally, one acquisition operation hides guardian discovery and serialized
replacement. Callers do not coordinate status, stop, delete, retry and start.

## Ownership shape

A small guardian retains the original backend ChildProcess handle and the
generation's publication receipts. The backend child owns native MCP/TLS,
request scopes, lazy Huly models and network resources. Operation traffic goes
directly to native MCP; the guardian has no Huly client or tool gateway.

Before application imports, the guardian must enforce a qualified restricted
runtime policy that prevents supported code from creating untracked descendants
or native escape surfaces. A joined original child close can establish local
retirement only under that premise. No such policy is implemented or qualified
by this document. Node's permission model is a possible trusted-code safeguard,
not protection against malicious code, and its limits remain part of the proof
obligation: [Node 24 permissions](https://nodejs.org/download/release/v24.20.0/docs/api/permissions.html).

The guardian alone publishes generation records and temporary descriptors. The
child receives immutable credentials and transport identity over its owned private
channel, then reports native application readiness. It cannot write ownership
state or remove a replacement's files. Control/status and native MCP use distinct
authenticated capabilities; an unavailable control endpoint authorizes nothing.

The filesystem claim protects short selection/publication and replacement
transactions. The registry receipt survives for the entire owned generation.
Never hold the selection claim for an application's entire lifetime. An old
callback cannot publish or consume another epoch's receipt.

Before authorizing child creation, persist protected pending ownership evidence.
If the guardian dies, that unresolved inventory blocks new creation even if the
child cooperatively notices IPC disconnect. A stopped child may never process
disconnect, so it is not retirement evidence available to a new caller.

## Uncertainty and bounds

Resident recovery does not maintain or consult a durable per-operation ledger,
expose cross-session operation-status lookup, or persist a replay queue. This
supersedes the earlier mandatory journal proposal after the user's 2026-10-17
review with Astra. The rationale, evidence lifetime, failure cases and explicit
scope amendment are in [ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md).

Each invocation belongs to its original adapter incarnation, request and backend
generation. It is dispatched at most once and never transferred to a replacement.
A surviving adapter retains bounded request state until completion or closure.
Possible dispatch without a host-observed terminal outcome remains unconfirmed.
Report uncertainty when output remains usable. Abrupt host or adapter death can
prevent reporting; disconnect never proves that a Huly mutation failed.

Replacement cannot reconstruct prior requests or report their outcomes. Confirmed
local retirement proves neither settlement nor cancellation of an accepted remote
Huly operation. An ordinary fresh read without an operation-specific
reconciliation contract, or healthy replacement alone, does not reconcile an old
write.
Independent new requests may proceed after safe replacement; repeating an uncertain
mutation still needs operation-specific reconciliation or remote idempotency.

Protected pending ownership inventory remains required before worker creation.
It contains lifecycle evidence, not operation history. Observed corrupt, missing
expected or incompatible ownership evidence refuses unsafe replacement. Complete
erasure of all ownership evidence while an owner remains alive is a separate
coordination proof obligation; an operation journal would not solve it. No
implementation or platform qualification for that case is claimed here.

Preserve total startup selection 10 seconds and cleanup confirmation 5 seconds.
A timeout does not create a second allowance or authorize replay. Do not
automatically kill a live admitted worker to manufacture recovery evidence.
Every guardian, backend and adapter counts in final RSS/CPU measurements.

## Synthesis

Candidate A is the conditional base. Independent review scores it 8/10 against
candidate B's 7/10 for architectural readiness, not measured safety. Both
independently converge on a surviving owner plus restricted child and reject
source inspection alone as descendant proof. The comparison uses independent
roles on the available inherited model; it provides no model-family diversity.

Graft B's explicit joined-child capability and prohibition on transferring
process/socket handles or exposing a process-creation service. Reject B's
ambiguous lifetime-long selection claim. The later ADR 0002 supersedes A's
mandatory operation journal and its rejection of adapter-lifetime uncertainty
tracking. Keep protected pending ownership publication before worker creation
and refusal after unresolved ownership loss. Neither candidate's Node20 premise
is authoritative: current package engines require Node >=22.19.0. Preserve that actual contract and qualify its
earliest supported runtime rather than adding stale compatibility branches.

Worker-thread-only ownership and OS process groups were considered and rejected
as the base: neither presently supplies a demonstrated transitive retirement
proof for this application. Native containment bindings remain an alternative
requiring an actual implementation and platform qualification.

## First experiment and rejection gate

Boot the exact packaged native application under the restricted policy, alongside
disposable denied child/Worker/addon/WASI/inspector and handle-transfer probes.
Exercise supported SDK construction with a disposable fixture before claiming
compatibility. The final live Huly campaign remains deferred until all six slices
are implemented and integrated. A standalone permission probe is insufficient.

Only after that premise survives should a guardian/child experiment kill its
owned backend, join closure, report an uncertain disposable mutation without
replay and serialize concurrent new callers into one fresh generation. A guardian-loss
schedule must instead refuse and preserve unresolved state. Falsifying the
containment premise rejects this design; it does not weaken the retirement test.

Exact types, public boundaries and runtime modules are derived from these call
sites after the first premise test. No unused API stubs or new state-machine
library are introduced. Lifecycle model logic still awaits its separate approval.
