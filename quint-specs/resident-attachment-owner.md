# Attachment resource ownership model

`resident-attachment-owner.qnt` models the resource core in
`src/resident/attachment-owner.ts`. Two owners share no mutable resource inventory.
Each has two symbolic, single-use work tickets; one retained ticket may adopt the
adapter's single native legacy session. The ticket count is an exploration
bound; production retains at most eight requests per adapter, matching its
stdio concurrency budget.

Reservation, adoption, fencing, successful cleanup, failed cleanup, native
release, time advancement, renewal and expiry are separate atomic actions.
Each owner has a two-round eligibility lease on a monotonic abstract clock.
Reservations require accepting ownership before the deadline. Renewal strictly
extends an eligible lease; expiry fences work while preserving retained resources. Cancellation delivery is abstracted into
fencing; cleanup can finish later. Adoption remains possible for a retained
ticket during closing. A cleanup failure fences its owner and retains sessions.
Native release requires every owned ticket to have completed cleanup.

The safety predicates require session retention before release, no retained work
after release, fenced ownership after failed cleanup, and eligible reservations.
Four executable scenarios cover held cleanup with an independent survivor,
adoption during close, failed cleanup, and expiry with retained work. All pass.
A sampled run of 1,000 traces at depth 40 found no safety violation and reached
all nine action witnesses. Its seed is `0x53e9f3644a225`; the log is
`/tmp/resident-lease-quint-final.log`. The maximum observed trace length was 21.

Reproduce with:

```bash
pnpm exec quint typecheck quint-specs/resident-attachment-owner_test.qnt
pnpm exec quint test quint-specs/resident-attachment-owner_test.qnt
pnpm exec quint run quint-specs/resident-attachment-owner.qnt \
  --invariant=safety --max-samples=1000 --max-steps=40 --backend=typescript --seed=0x53e9f3644a225 \
  --witnesses reserved adopted fenced finished defected released time_advanced renewed expired
```

This is sampled model safety evidence, not exhaustive verification or a replay
of implementation observations. It abstracts transport framing, configuration,
generation acquisition, capacity reclamation and native map deletion. The clock
has six rounds and the inventory has two tickets per owner. The model does not
prove managed idle retirement or a wall-clock cleanup deadline.

TestClock tests separately cover waiter timeouts, renewal and lost admission
receipts. Real native MCP tests check map lifetime, actual target retention and
request-client cleanup using explicit fixture ports. Packaged process tests
cover adapter death and pause/resume with a surviving adapter. Live Huly and
implementation observation alignment remain required.
