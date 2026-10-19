# Issue 326 implementation evidence

## Lifecycle policy — criterion 1, partial evidence

The maintained [resident manual](../resident-manual.md#attachment-leases-and-managed-idle-retirement)
records the current lease, heartbeat, idle, control and drain defaults. The
policy distinguishes attachment eligibility from retained request and cleanup
ownership. Expiry does not establish a Huly operation's outcome, free an
unverified resource or authorize replay.

Current sources are `admission-contract.ts`, `adapter-attachment.ts`,
`admissions.ts`, `admission-lifetime-state.ts`, `attachment-owner.ts`,
`managed-contract.ts` and `manual-backend.ts` under `src/resident/`.
`managed-idle-protected-work.test.ts` and
`managed-idle-admission-race.test.ts` describe cleanup retention and the two
admission/fence orderings. Their existence is not a current native qualification
receipt.

Historical preparation evidence exists in commit `5e69e7ed` at
`docs/implementation/resident-lease-policy.md`. That record describes a
monotonic calibration before lease wiring, using the preceding `109c4a85`
candidate. Its raw report remains at
`/tmp/resident-admission-calibration-monotonic-109c4a85/report.json`.
This is historical calibration evidence, not a measurement of the current
combined artifact or live Huly acquisition.

The historical policy proposed a 15-second managed idle interval before managed
startup existed. Commit `5e1187f1` introduced managed startup with the current
5-second idle constant. The earlier calibration must not be presented as
measurement of that later policy. Criterion 1's requirement for measured bounds
before real lifecycle wiring still needs a complete provenance audit, including
that policy change; documenting today's constants alone does not complete it.
The same managed-startup commit's `resident-managed-design.md` explicitly names
five seconds as a new managed policy and leaves process qualification pending;
it records the selection, rather than supplying the missing measurement.

Independent Standards and Spec reviews found no factual overclaim in the new
manual section. This documentation increment changes no runtime policy,
deadline, model or test inventory. No native measurement or full quality gate
was rerun for it, and issue 326 remains incomplete.
