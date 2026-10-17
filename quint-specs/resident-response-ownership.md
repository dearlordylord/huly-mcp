# Resident response ownership model

`resident-response-ownership.qnt` describes the response decisions in
`src/resident/response-stream.ts` and their use in `src/resident/manual-adapter.ts`.
Each request callback owns a response phase. A matching terminal reply advances
the phase from `Awaiting` to `Answered`. A foreign or duplicate reply fails the
request. Ending a request stream before a terminal reply also fails the request.

The model has four independent callback contexts with the same wire request ID.
Each context accepts at most one terminal reply and observes at most two progress
messages. `Failed` represents a typed failure that stops response consumption.
`Closed` represents successful response consumption after a terminal reply. It
does not represent adapter or backend shutdown.

This is a local response ledger with external input events. It does not model a
distributed coordination algorithm, so it uses ordinary Quint actions without
Choreo. It groups each callback's state into one record, following the separately
owned request state in the implementation.

## Reproducible checks

The workspace pins `@informalsystems/quint` to `0.32.0` as a development dependency.

```bash
pnpm verify:resident-model
pnpm exec vitest run test/resident/manual-adapter-process.test.ts
```

The model command typechecks the specification, runs six deterministic scenarios,
and simulates 10,000 traces with seed `323` and a maximum of 24 steps. It checks
`safety` and reports reachability for progress, accepted replies, foreign replies,
stream endings, and replies accepted by separate contexts. Every witness has a
nonzero count in the retained run. The specification terminates when all four
callbacks are failed or closed, so traces can end before 24 steps.

The process test preloads a test-only subscriber through Node's `--import` flag.
The subscriber forwards production diagnostics over a private child IPC channel.
It does not modify protocol stdout. The parent parses each observation with
`ResidentResponseObservation`, allocates a separate model context for each
process and request ordinal, and generates an `observeResult` replay. It then
runs that replay against the maintained model. A contradicted observation must
fail replay. Raw JSON-RPC IDs, client identity, credentials, and business payloads
are absent from the observation contract.

Production code publishes to `huly.resident-response-ownership` only when a
subscriber exists. It starts no oracle client and reads no oracle configuration.
The generated Quint Studio client and its historical registry remain unchanged.
No Quint Studio service was available for this increment. The evidence is local
Quint replay, not a claimed remote oracle run.

## Checked scope and limits

The safety predicates reject multiple terminal replies, foreign terminal replies,
and stream completion without a terminal reply. A completed callback has accepted
exactly one terminal reply. The process tests additionally compare different
payloads from colliding IDs and check cancellation, EOF, death, and continued use
of the surviving adapter.

The replay currently covers response admission decisions, including an observed
failed stream completion. It does not observe actual stdout delivery, cancellation
completion, adapter closure, backend admission, shared model acquisition, or
daemon generations. Canceled and killed requests leave response trace prefixes.
Those prefixes make no liveness claim. The model does not verify byte framing,
OS process ownership, authentication, backpressure timing, mutation outcomes,
leases, idle retirement, recovery, or upgrades. Later slices must extend the
models and observations for those requirements.

There is no fairness or eventual-delivery claim. Simulation and local replay are
bounded evidence. Native process tests and local-Huly qualification remain
independent requirements.
