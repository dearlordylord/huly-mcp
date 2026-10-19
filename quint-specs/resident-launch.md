# Resident launch and retirement model

The user approved the independent state fields and plain Quint coordination
model on 2026-10-18. The executable model now covers startup, attachment,
request ownership, lease expiry, drain, owner loss and verified replacement.
Bounded simulation is qualification of this abstract model, not exhaustive
verification of the implementation. The separate response-ownership model is
unchanged.

## Contract and state

The source contract is GitHub #322–328,
[ADR 0003](../docs/adr/0003-adopt-mcporter-resident-lifecycle.md) and
[the recovery decision](../docs/adr/0002-resident-recovery-without-operation-journal.md).
There is no operation journal, replay queue, persisted reservation or
cross-session operation-status lookup.

| Module | Responsibility |
| --- | --- |
| `resident-launch-types.qnt` | Approved caller, generation, claim, receipt, lease, request, resource and write-evidence types |
| `resident-launch-core.qnt` | Captured selection, protected claim, Start transfer, application readiness, publication and attachment acquisition |
| `resident-launch-requests.qnt` | Colliding wire IDs, shared-model waiting, cancellation, cleanup and separate remote/terminal evidence |
| `resident-launch-lifetime.qnt` | Renewal, expiry, ordinary idle fencing, retained attachment owners and confirmed retirement |
| `resident-launch-recovery.qnt` | Lost parent/backend/receipt, blocked selection, trusted retirement and stale-receipt cleanup decisions |
| `resident-launch.qnt` | Independent state variables, guarded actions, default adversarial schedule, invariants and witnesses |
| `resident-launch-observations.qnt` | Checked projection of actual admission-core decisions and inventory |

`CallerId` identifies an adapter incarnation. Requests use `(adapter, ordinal)`;
every modeled wire ID is deliberately 1. A new adapter cannot inherit the old
invocation merely because a host reuses its JSON-RPC ID. Backend slots and their
generations are used once; replacement consumes another slot.

One protected state directory has one selection claim. Full selection keys
contain independent symbolic authority, policy and implementation identities.
These symbols are fixture identities, not exposed credential fingerprints.
Different compatible groups may coexist after publication releases the claim.
Callers retain kill authority only for their own prepared child, before attempting
Start. `TransferOwner` covers the interval between revoking parent authority and
child adoption. Start delivery checks the exact authenticated claim message.

Application readiness and full Huly model readiness are independent. Attachment
acquisition has separate beginning and completion transitions. A pending attempt
protects the generation; a late owner after drain remains pending and owned until
cleanup confirms. Lease eligibility, member ownership and request cleanup are
separate facts. Expiry or cancellation cannot establish physical closure.

## Write uncertainty

The `writes` map is verification-only oracle history. The application does not
persist it. It distinguishes possible dispatch, remote outcome, backend terminal
production, adapter receipt, adapter output queuing and actual host observation.
A remote mutation can commit after local cleanup or retirement. Neither event
turns an unobserved result into known failure. An already observed terminal
result remains known after a later disconnect.

Dispatch occurs at most once per modeled invocation. Replacement cannot resume
that invocation. This is not business-level deduplication of a deliberately new
request submitted by a user. Operation-specific reconciliation is a separate,
trusted input; ordinary local cleanup and arbitrary reads do not perform it.
These are the same individual-request uncertainty windows as standalone stdio.

## Properties and schedules

The `safety` invariant checks unique unresolved compatible ownership, local
pre-Start kill authority, captured attachment identity, publication identity,
retired-resource closure, attachment/request resource ownership, and write
history/delivery consistency. Accepting backends must retain their exact current
locator. Stale cleanup actually compares a retained receipt with its target
registry entry; it is not an assumed refusal event.

Explicit tests cover pending admission versus drain/idle, expired acquisition,
shared-model cancellation, foreign-caller isolation with colliding wire IDs,
uncertain writes across cleanup/replacement, remote commit after replacement,
lost publication receipts, post-Start parent loss and unauthenticated Start.
The first combined fault run found a model defect: attachment close overwrote
request cleanup with a pre-interruption resource snapshot. The corrected transition
updates the interrupted resource map. The retained ITF counterexample and an
explicit cleanup-consistency scenario document that correction.

A private mutation allowing stale receipts to remove the replacement locator
caused `safety` to fail in the explicit replacement scenario.

The default `step` includes all modeled faults. Guided runs start from executable
startup/request prefixes to exercise later crash windows; those prefixes use the
same guarded actions. `serviceStep` separately exercises normal service without
external fault injection. It does not replace the default adversarial run.
Reachability counts include explicitly executed prefixes. They establish sampled
or scheduled reachability, not frequency estimates for production failures.

Initial unconstrained fault-heavy runs reached several late witnesses zero
times, including identity refusal and stale cleanup. Guided publication and
replacement prefixes reached these transitions. Failed/zero-witness build logs
remain in `/tmp/resident-launch-model-a2935a11`; increasing random samples alone
did not establish identity-refusal coverage.

Run the reproducible local check with:

```bash
pnpm verify:resident-launch-model --out /tmp/resident-launch-evidence
pnpm exec vitest run test/resident/launch-model-alignment.test.ts
```

The first command retains exact source hashes, commands, test/simulation logs and
per-schedule witness counts. It fails for a failed command, missing or globally
unreached witness, or inputs changed during the run. Tests are selected with
`Test$`; matching every definition would incorrectly execute imported predicates
and constructors as tests. No `quint verify` or exhaustive proof is claimed.

## Alignment with implementation

The TypeScript alignment test drives the real `advanceAdmission`,
`advanceLifetime` and `advanceMember` functions. It projects their actual
decisions and pending/member counts into the model for ordinary admission and
late owner publication after fencing. The observation codec is schema-owned.
A contradictory late-owner count must produce the specific Quint disabled-step
failure in `observedTest`; timeout, syntax or backend-start failure cannot satisfy
that negative control. The helper invokes the installed Node CLI directly with the TypeScript evaluator,
using a four-second child bound inside the unchanged five-second test allowance.
Temporary replay files are removed without masking a primary replay failure.

This projection covers admission inventory and decisions. It does not replay
native startup IPC, actual Huly writes or OS process ownership. Independent
process fixtures remain necessary for those boundaries.

## Bounds and assumptions

The concrete instance has three caller incarnations, three one-use backend
slots/generations, four selection keys and six invocation identities. Request
resource IDs 0–5 and acquisition resource IDs 100–102 are disjoint. Time is an
abstract round bounded at 8; a lease lasts two rounds. Rounds advance only while
an unexpired live attachment exists, coalescing irrelevant pre-lease time.
Physical 5/30-second policy bounds are tested independently, not inferred here.

The coordination abstraction is plain Quint: protected claims and registry are
shared state, with explicitly scheduled Start messages. The user approved this
choice instead of Choreo scaffolding. Partial maps represent absent resources;
guards check key presence before reads, and insertion uses `put`.

The model assumes cooperating package writers and protected lifecycle state.
Arbitrary same-user destruction of a live namespace is outside supported
recovery. Corrupt/version-incompatible file parsing and native inode/device
checks are implementation boundaries, not modeled file codecs. Missing files,
PID/port absence and timeout are never retirement evidence.

`OwnedClosureConfirmed` is observed closure of actually owned resources.
`OperatorRetirementVerified` is an explicit trusted input following verified
cleanup; the model does not manufacture that certificate. Backend crash may
interrupt all clients; healthy-backend cancellation isolation is a separate rule.
No transparent failover is required. An unresolved owner may cause bounded
refusal until retirement is verified.

No liveness or arbitrary-scale result is claimed. Finite domains may exhaust,
and no fairness is assumed. Eventual replacement requires verified retirement,
working local coordination and appropriate scheduling. Native macOS behavior,
OS ownership, Huly semantics, real host observation, resource measurements and the
final combined quality gate remain independent qualification requirements.
Update this model before changing the lifecycle contract it represents.
