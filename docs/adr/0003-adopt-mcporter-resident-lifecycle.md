# Adopt MCPorter lifecycle practices for resident sharing

On 2026-10-17, the user directed us to adopt the researched lifecycle practices
rather than invent additional crash guarantees. Use MCPorter's coordinated
startup, authenticated ownership, generation fencing, graceful drain and bounded
refusal after unresolved owner loss as the reference contract. A backend crash
may interrupt every attached client. The feature preserves ordinary stdio's
remote-operation uncertainty; it does not provide stronger Huly durability,
transparent failover or uninterrupted service across a backend crash.

This supersedes the mandatory guardian/restricted-worker architecture in the
previous recovery design. The baseline has a transient launcher and a shared
native MCP backend that owns its resources and publication. A separate guardian,
restricted SDK worker or native containment layer is not required. Such an
addition needs a concrete unmet feature requirement and evidence that this
simpler contract cannot meet it. ADR 0002's no-journal decision remains in force.
This is a specification amendment, not implementation or platform qualification.

## Reference and adaptation

The reviewed reference is
[MCPorter at 1e3fa8a](https://github.com/openclaw/mcporter/blob/1e3fa8a893e3245a0843f714f81bfdf3b0ad5dbc/docs/daemon.md).
The source was fetched again for this decision. In particular, its documented
unexpected-daemon-exit policy retains metadata and blocks automatic replacement
until the operator verifies retirement of the owned transports.

| Reference practice | Huly MCP contract |
| --- | --- |
| Cross-process startup coordination | Automatic and explicit starts share one exclusive selection/publication protocol. Concurrent compatible launchers converge on one admitted backend. Partial claims cause bounded refusal. |
| Authenticated local readiness | Verify the expected backend and generation before transferring credentials. Retain our native loopback HTTP/TLS attachment rather than copying an upstream stdio gateway. |
| Atomic protected metadata | Publish schema-owned ownership records only at application readiness. Use a protected per-user lifecycle namespace and native permission checks. Production ownership state must not depend on disposable test directories. |
| Generation-bound identity | Fence requests, attachments, publication and cleanup to their original generation. PID or port alone never authorizes signalling or takeover. |
| Graceful stop and idle retirement | Fence admission and account for queued/active work before resource cleanup. A failed or unconfirmed retirement retains ownership evidence and blocks overlapping replacement. |
| Explicit crash refusal | An unexpected backend-owner exit may leave unresolved resources. Preserve its metadata, fail attachments within existing bounds and require verified local retirement before resetting ownership. Do not kill a PID or discard records to manufacture recovery. |
| Version-aware coexistence | Keep incompatible package/configuration generations separate. No silent takeover, credential inheritance or killing an older version's active work. |

Borrow these practices, not MCPorter's whole broker. We retain one native Huly
backend per compatible resolved configuration, independent adapter protocol
contexts, current TLS identity/authentication and the existing exposure policy.
We do not introduce MCPorter's universal per-user broker, Chrome-specific state,
45-second readiness allowance, 15-minute lease policy or third-party dependency.
Existing Huly startup, cleanup, lease, queue and concurrency bounds remain.
MCPorter's policy of pinning an idle host on unknown business outcomes is not
adopted. Once local work and resources are safely retired, uncertainty about a
remote mutation alone does not retain a backend forever or become resolved by
its shutdown.

## Crash and operation semantics

A backend crash may fail all its in-flight requests, including writes. For a
single request, possible Huly commit followed by lost response is the same
uncertainty already present in standalone stdio. No new data-loss-prevention,
rollback, exactly-once or crash-continuity layer is required.

The adapter does not restore or automatically replay those requests. It reports
unknown outcome after possible dispatch when output remains usable; process death
can prevent reporting. A fresh adapter cannot retrieve an old outcome. Local
retirement does not settle a previously accepted remote Huly mutation. Caller
reconciliation remains operation-specific, as defined by ADR 0002.

The accepted crash policy is bounded unavailability rather than unverified
replacement. Automatic startup remains required when there is no unresolved
owner and after confirmed normal retirement. Concurrent recovery callers may
select one replacement only after retirement is verified. Automatic replacement
after an unresolved owner crash is not promised. This explicitly narrows the
earlier recovery wording; it is not acceptance of the stronger old contract.

Ordinary client EOF, cancellation and idle shutdown retain their existing
isolation and drain requirements while the backend is healthy. Those requirements
must not be confused with continuity after the shared backend itself crashes.
All existing concurrent-client and fault schedules remain required evidence.

## Ownership threat boundary and cleanup

Lifecycle state is private to the OS account and accessed by cooperating package
versions through the ownership protocol. Another OS user's access is prevented
by native permissions/authentication and requires platform evidence. A hostile
same-user process that can rewrite the program or its private namespace is not
an isolation boundary this feature can enforce.

Manual deletion or replacement of live ownership files by that same account is
not a supported recovery operation. Detectable corruption, missing expected
records, stale locators and unconfirmed cleanup still cause bounded refusal.
Complete destruction of the live ownership namespace is outside automatic
recovery: an absent file cannot prove that a prior process exited. Stop and
verify the actual owned local processes/resources before an explicit namespace
reset. Do not certify arbitrary live-state erasure by adding another metadata
file or by assuming a missing PID means retirement. Use protected application
state for the managed production namespace; disposable temporary roots remain
appropriate only for owned fixtures or explicit temporary configurations.

Normal cleanup removes only the exact generation's records after confirmed
resource retirement. If the owner dies or cleanup fails, status explains the
blocked ownership and the required verified cleanup. No operation history is
stored in these records. Their version compatibility and native permission and
cleanup behavior still need qualification.

## Evidence required

Use the existing packaged separate-parent tests for simultaneous starts,
creator exit, independent request IDs, cancellation/EOF, model readiness,
idle-versus-admission, stale/corrupt ownership, foreign listeners, credentials,
version coexistence and confirmed cleanup. After an unexpected owner crash,
assert bounded actionable refusal, preserved evidence and no foreign signal or
request replay. After verified retirement, assert one serialized fresh generation.
A crash may interrupt every client; do not invent a surviving-call requirement
for that schedule. Retain ordinary healthy-backend isolation tests unchanged.

Quint should represent callers, backends, generation-owned claims/receipts,
attachments, requests and explicit retirement evidence. It need not model a
mandatory guardian, restricted worker or operation journal. Oracle invocation
history remains verification-only state. Native macOS/Linux and final live-Huly
evidence remain required; this reference supplies patterns, not those results.
No deadline, coverage threshold or concurrency inventory is relaxed by this
lifecycle decision. The subsequent 2026-10-18 user decision excludes Windows
resident implementation and qualification because substantial work remained;
unsupported Windows resident startup stays refused.
