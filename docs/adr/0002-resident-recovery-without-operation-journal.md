# Recover resident backends without an operation journal

On 2026-10-17, the user requested a decision with Astra on whether resident
sharing needs a durable operation journal. The decision is to remove that
requirement and amend #322 and #327 explicitly. Resident recovery does not
maintain or consult a durable per-operation ledger, expose cross-session
operation-status lookup, or persist a replay queue. Protected backend ownership
inventory remains a separate requirement. This decision supersedes the journal
proposal in `resident-recovery-design.md` and the initial guardian model sketch.
It does not qualify the unfinished recovery implementation.

The later [ADR 0003](0003-adopt-mcporter-resident-lifecycle.md) selects the
MCPorter lifecycle contract and supersedes the earlier guardian requirement and
arbitrary same-user namespace-erasure proof obligation. The no-journal and
truthful-uncertainty decision here remains unchanged.

## Reason and trade-off

The adapter sends each invocation at most once and does not move pending requests
into a replacement generation. No replay follows from dispatch control, without
remembering operations on disk. This is a per-invocation transport guarantee,
not exactly-once Huly effects or deduplication of caller-issued repeats. The
proposed opaque reference, generation and
classification could not establish whether Huly committed, identify an equivalent
request with a new ID, or prove the host received a terminal result.

A useful durable history would need a stable caller receipt, a lookup contract,
retention and reconciliation rules, and storage lifecycle behavior. None is part
of this feature. Adding storage without those consumers introduces failure modes
and can block independent work without resolving the original uncertainty.

The deliberately excluded capability is server-maintained recall of an attempt
after all caller and adapter context is lost. A new session cannot ask this
resident mechanism whether its previous operation committed. If that capability
is requested later, it needs a separate design with migration, retention,
compaction, corruption, deletion, durability and idempotency contracts. It cannot
be inferred from an opaque journal or a healthy backend.

## Request evidence and its lifetime

Each invocation belongs to one adapter incarnation, request ordinal and backend
generation. Reused wire request IDs do not identify an earlier invocation. The
adapter retains only bounded in-memory request and output state for its active
connection. Existing provisional limits remain eight active requests per adapter
and sixteen queued output frames. This decision changes neither limit.

The relevant observations are request acceptance, a dispatch attempt, a validated
terminal response, output queue admission, output write completion and actual
host observation. These are distinct facts. Neither progress nor a queued or
written terminal frame proves that the host processed a result. Host observation
is verified at the test/client boundary, not guessed by the adapter.

No new recovery-ledger events, mutation arguments, results, credentials or
operation fingerprints are persisted. Existing redacted diagnostics, caller
history and test receipts remain allowed. Invocation history in the Quint model
is specification/oracle state, not a production persistence requirement.

Only established refusal before dispatch permits a non-dispatch claim. Once
submission is possible, missing terminal evidence leaves the outcome unconfirmed.
A surviving adapter reports uncertainty when its output remains usable. Adapter
or host death can prevent a diagnostic; EOF or an incomplete call never proves
that the mutation failed. A result already observed by the host remains known
if the connection fails afterward.

Replacement never reconstructs or automatically retries an old invocation.
Confirmed local retirement permits safe local replacement, but does not settle
or cancel a mutation already accepted by remote Huly. An old write may complete
after replacement or after an intervening fresh read. Absence in a read,
particularly with eventual consistency, is not proof of non-dispatch or failure.
Independent new calls may proceed after safe replacement. Repeating an uncertain
mutation still requires operation-specific reconciliation or remote idempotency.
New-generation status describes that generation; it cannot assert zero old
uncertain operations or reconstruct their outcomes.

## Storage lifecycle consequences

There is no operation-journal path, file format, migration, compaction, expiration
or repair command. No existing operation journal was implemented, so there is
nothing to migrate or delete. No new operation-history bytes accumulate on disk.
In-memory request state is released with its owning adapter scope; cleanup or
process death does not resolve remote outcomes.

This removes no backend ownership safeguards. Ownership records contain lifecycle
evidence and must not become a per-operation ledger under another name. Their
format compatibility, bounds, permissions, publication, cleanup and missing or
corrupt state still require implementation and native qualification. Existing
registry limits remain sixteen generation records and 65,536 bytes per record;
this decision does not certify future pending-owner formats or their bounds.

Observed corrupt or missing expected ownership evidence cannot authorize process
signals, deletion of another generation or overlapping replacement. Complete
erasure of all ownership evidence while a prior owner lives requires a separately
justified coordination mechanism. A design that instead depends on excluding that
failure needs explicit contract review and cannot count it as qualified. An
operation journal would face the same erasure problem. No protection for that
schedule is claimed by this decision.

## Required evidence

The existing fault cases and deadlines remain. Add or retain these schedules at
the packaged process boundary and align their observations with the model:

1. Proven pre-dispatch refusal produces zero target dispatches. Cancellation while
   waiting prevents later dispatch; cancellation after dispatch does not prove
   rollback or mutation failure.
2. A disposable write commits and loses its response before headers. It is
   dispatched once, remains uncertain, and is not replayed into a replacement.
3. Host-observed progress precedes failure. Progress is not a terminal outcome.
4. A terminal response is produced, received or queued, then stdout fails or the
   adapter dies before host receipt. No completed-delivery claim is inferred.
5. Heartbeat or lease failure interrupts an active mutation. A generic attachment
   diagnostic must not misclassify that request as undispatched or failed.
6. Adapter or host death prevents reporting. A new adapter does not resurrect the
   old request or claim it did not execute. An observed terminal result remains
   known despite a subsequent disconnect.
7. Late replies and cleanup from an old generation cannot reach or retire a new
   attachment, including colliding wire request IDs.
8. An old remote mutation completes after confirmed local retirement, with an
   intervening fresh read. Neither replacement nor that read resolves the old
   outcome; independent work does not retry the original invocation.

The operation-journal decision does not establish these results. Process,
ownership, native-platform and live-Huly evidence remain required for completion.
