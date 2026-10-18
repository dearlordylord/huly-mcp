# Held operation cleanup protects idle after adapter death

The managed-idle-work fixture uses the production managed lifecycle with a
synthetic typed tool and TestClock in a separate backend process. An actual
packaged managed adapter submits one modern MCP call. The tool reports entry
and holds its result. The coordinator kills its owned adapter, joins exact
SIGKILL termination and requires zero host-output bytes.

Actual request cancellation enters the tool's held cleanup. The backend clock
then advances by the unchanged default lease duration plus two complete managed
idle intervals. The backend must remain alive and retain byte-identical ownership
state. This demonstrates that losing the adapter and crossing the expiry/idle
thresholds do not establish completed cleanup or permit ordinary retirement.

After explicit cleanup release, the fixture requires its completion event,
survival for another4900ms and normal retirement after100ms more. The backend
reports exactly one dispatch, closes0/no signal and leaves its namespace empty.
The schema-decoded bounded control queue excludes release commands: release
completes a Deferred directly. Standards review identified and removed the
previous unreachable queue branch.

External observations retain5s bounds, owned backend exit7s and supervision25s.
Primary failures survive independent adapter/backend cleanup attempts. Failed
phase/state/build evidence is retained by the existing harness. No production
lease, timeout, journal or legacy behavior changed.

Initial evidence: `/tmp/resident-idle-work-process-first.log`, one test passes
3.36s. `/tmp/resident-idle-work-NFIgRD.receipt.json` records owned adapter SIGKILL,
one dispatch, backend exit0 and private-state removal. TypeScript and changed-file
lint/format pass; Spec review accepted and Standards finding corrected.

Final focused process plus protected-work component checks after the queue-type
correction: `/tmp/resident-idle-work-process-final.log`, two files/three tests
pass3.75s. Both scoped reviews accepted the final correction.

This is process/package-boundary evidence for cleanup-protected accounting
under controlled time. The tool and Huly client services are fixtures; it does
not establish a Huly mutation outcome, physical timing, queued-work fairness or
native macOS qualification. All six issues remain incomplete; no full gate or
live Huly campaign ran.
