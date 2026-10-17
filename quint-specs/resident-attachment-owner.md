# Attachment resource ownership model

`resident-attachment-owner.qnt` models the resource core in
`src/resident/attachment-owner.ts`. Two owners share no mutable resource inventory.
Each has two symbolic, single-use work tickets; a ticket may adopt one native
session. These are exploration bounds, not production capacity policies.

Reservation, adoption, fencing, successful cleanup, failed cleanup and native
release are separate atomic actions. Cancellation delivery is abstracted into
fencing; cleanup can finish later. Adoption remains possible for a retained
ticket during closing. A cleanup failure fences its owner and retains sessions.
Native release requires every owned ticket to have completed cleanup.

The safety predicates require session retention before release, no retained work
after release, and fenced ownership after failed cleanup. Three executable
scenarios cover held cleanup with an independent survivor, adoption during close,
and failed cleanup. All three pass. A sampled run of 1,000 traces at depth 30 found
no safety violation and reached all six action witnesses. The log is
`/tmp/resident-attachment-owner-quint.log`; its seed is `0xc728251ef697a0f2`.
Finite tickets terminate naturally; the observed maximum trace length was 15.

Reproduce with:

```bash
pnpm exec quint typecheck quint-specs/resident-attachment-owner_test.qnt
pnpm exec quint test quint-specs/resident-attachment-owner_test.qnt
pnpm exec quint run quint-specs/resident-attachment-owner.qnt \
  --invariant=safety --max-samples=1000 --max-steps=30 \
  --witnesses reserved adopted fenced finished defected released
```

This is sampled model safety evidence, not exhaustive verification or a replay
of implementation observations. It abstracts transport framing, configuration,
generation acquisition, leases, time, capacities and native map deletion. The
implementation's close-waiter timeout is covered separately with TestClock.
Native map lifetime is checked through real native initialization and lookup.
The held resource test uses the production request-client lifecycle with explicit
fixture ports; actual MCP target-retention middleware and live Huly remain
required. Update the model before changing these resource transitions, and add
observation alignment when the private admission boundary is wired.
