# Resident launch model type sketch

This is a reviewable shape for the required #324–327 lifecycle model, alongside
the existing response-routing and attachment-owner models. The scaffold is
[resident-launch.qnt](../../quint-specs/resident-launch.qnt). It contains types and
state declarations only. It establishes no safety or liveness result.

The authoritative requirements are #322 and #323–328; the implemented ownership
design is recorded in [resident-managed-design.md](resident-managed-design.md).
The model must preserve the requirements when implementation evidence exposes a
defect, rather than change its properties to accept that defect.

| State | Meaning |
| --- | --- |
| Caller | Explicit resolved authority, policy and package-version equivalence key; local NoConfig, prepared child, irreversible Start attempt, attached generation or refusal |
| Child | Owning parent, fresh generation, application phase, independent Huly model phase and parent connection state |
| Claim | Free, held by a parent/child through a particular capability, or unresolved after ownership loss |
| Registry | Current schema/identity record, known incompatible opaque version, or unknown/corrupt evidence that blocks unsafe selection |
| Publication receipt | No record, exact owned cleanup capability, or publication whose local receipt was lost |
| Owned resource | Generation-fenced pending/admitted ownership and pending, failed or confirmed cleanup; unpublished owners remain inventoried |
| Start messages | Authenticated or invalid queued delivery, separately scheduled from parent disconnect and child retirement |
| Write | Caller/request owner, original generation, dispatch count and truthful undispatched, dispatched, uncertain, reported or reconciled outcome |

Use opaque equality keys for credentials and policy, with no raw secrets or
profile-name matching. Omit PID/port identity entirely: model actions can use only
owned capabilities. A diagnostic PID is neither a signal capability nor evidence
that descendants retired.

Split the interleavable steps: atomic claim acquisition versus cancellable retry;
Start attempt versus delivery; listener readiness versus application readiness;
atomic locator publication versus receipt observation; resource acquisition versus
admission publication; cancellation versus confirmed cleanup. These splits retain
the actual failure windows identified by process tests and the two retirement
corrections. Corrupt state, an unavailable current owner or unverified cleanup can
produce safe bounded refusal.

High-priority properties are one admitted compatible owner, no credential handoff
without expected private identity, generation-fenced publication/cleanup, no
parent kill authority after attempted Start, no accepted late Start after child
retirement, no client retirement with retained resources, and no automatic second
dispatch after an uncertain write. Version coexistence must preserve distinct
selection keys; a healthy replacement cannot erase an old uncertainty obligation.
Each major transition needs a reachable witness, including blocked/refused paths.

Begin with one caller and one child; add the second caller only after the first
actions execute. The combined sampled domain should then include three callers,
two identity/policy keys, two package versions and enough fresh generation IDs to
exercise a replacement. Abstract monotonic rounds model lease/idle eligibility;
real ten-/five-second deadlines remain independently checked by executable tests.
Fair scheduling, healthy local filesystem operations and authenticated channel
semantics are explicit assumptions, not conclusions of simulation.

Plain Quint is proposed because shared filesystem ownership dominates this small
protocol and the only private message is Start. The explicit Start-message set
still preserves delivery/disconnect interleavings. Choreo is the alternative if
its additional actor/effect scaffolding is preferred. No new production state
machine library is involved in either choice.

This model will not establish OS ownership/ACLs, cryptographic security, native
detachment, actual process reaping, Huly semantics or performance. The existing
response and attachment models remain responsible for their detailed routing and
work-barrier properties. Observation alignment and native/live receipts remain
required independently.
