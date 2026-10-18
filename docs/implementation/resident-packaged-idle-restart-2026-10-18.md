# Packaged managed idle retirement and fresh startup

`managed-idle-restart-process.test.ts` runs two sequential complete packaged
startup/idle cycles under the existing Linux child subreaper. Each independent
host launches an actual packaged managed stdio adapter, negotiates modern MCP,
obtains its catalog/resources and calls `get_huly_context`. The fixture requires
a successful context with the expected workspace and a native catalog.

Each host is closed and joined with exit0/no signal. The fixture then waits for
the exact backend PID's kernel-owned exit receipt, requires exit0 and an empty
private namespace. Only after this confirmation does it start the next host.
Generation, parent and adapter identities must differ across cycles. The second
backend must also retire and leave no state. Request observations retain their
five-second bounds, kernel retirement its seven-second bound and supervision
its25-second bound; the separate build allowance remains30seconds.

The receipt schema owns both cycle observations and their kernel exits.
Primary cycle failures survive parent-close failure. Failed fixture phases and
the isolated bundle/private directory are retained; broader failed-child cleanup
belongs to the existing bounded supervisor.

Evidence: `/tmp/resident-idle-restart-process-first.log`, one test passes in
16.07seconds. `/tmp/resident-idle-restart-t1YUv8.receipt.json` contains distinct
generations and backend exits0 for PIDs3608389/3608695; its phase log records
the confirmed retirement before fresh parent startup. Scoped Standards and
Spec reviews accepted; changed-file lint/format pass.

This advances the earlier single-process controlled-clock restart proof to
actual packaged processes and physical idle retirement. It does not prove a
new attachment overlapping the idle fence, real Huly reads, adapter-specific
exit codes, native macOS behavior or complete lifecycle qualification. No
production change, legacy path, journal or full campaign was introduced.
Issues323–328 remain incomplete.
