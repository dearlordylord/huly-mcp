# Controlled idle ordering across process boundaries

The new managed-idle-clock fixtures run the production configured lifecycle in
a separately owned backend process with `TestClock.layer()`. A bounded,
schema-decoded IPC command queue advances that backend's clock. The client is
an actual packaged managed adapter owned by an independent SDK host process;
the test does not substitute the adapter transport or admission protocol.

The coordinator first confirms backend readiness and advances4900ms. The client
then connects and receives a successful context. The registry must contain only
the reported generation, owned by the actual backend child PID. Advancing
another5000ms must preserve the attachment and permit a second successful
context through the same adapter/port with byte-identical registry state.

After parent exit0/no signal, advancing4900ms must still leave the backend alive
and its record unchanged. Another100ms must produce owned backend close0/no
signal and an empty namespace. Acknowledged clock advances and retirement are
recorded in the phase log. External observations retain5s bounds, backend
retirement7s and supervisor25s. Virtual advancement is not physical elapsed time.

Primary failures take precedence over cleanup failures. Parent and backend
cleanup are attempted independently under existing bounds; the supervisor owns
any remaining descendant cleanup. Failed phase logs, private state and isolated
builds are retained. Boundary commands/events/receipts are schema-owned.

Initial evidence: `/tmp/resident-idle-clock-process-first.log`, one test passed
12.78s. `/tmp/resident-idle-clock-wDqS0a.receipt.json` records the same adapter
and port for both successful context calls, parent/backend exits0 and state
removal. Both scoped reviews accepted; TypeScript and changed-file lint pass.

Final run after adding exact registry-owner/inventory assertions and phase
acknowledgements: `/tmp/resident-idle-clock-process-final.log`, one test passes
5.73s. `/tmp/resident-idle-clock-ZJAyVd.receipt.json` and its phase log confirm
the same success/exit/state outcomes and all acknowledged advances.

This proves the attachment-first ordering through actual process/HTTPS/packaged
adapter boundaries. It does not establish a physical timeout measurement,
automatic packaged backend startup, queued/active Huly work at the fence,
fence-first process ordering or native macOS behavior. Existing tests cover
other orders at component level; this report does not promote those to process
qualification. No production code, legacy path, journal or full campaign changed.
All six issues remain incomplete.
