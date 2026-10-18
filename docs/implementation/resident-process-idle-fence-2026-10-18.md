# Idle fence before new packaged attachment

The managed-idle-fence fixture complements the attachment-first process test.
A separately owned backend uses the production managed lifecycle and injected
TestClock. Its explicit client-close port reports entry and waits on a Deferred,
holding cleanup after automatic idle fencing. The original backend is a bundled
fixture with typed test client services, rather than the package entrypoint.

Only after the closing event does the coordinator launch an actual packaged
managed adapter with a pending ping. That process must exit1/no signal without
being killed and with empty stdout. Its diagnostic must state no Huly dispatch
and omit the fixture Huly token. The original registry bytes, registry inventory
and namespace inventory must remain unchanged; the old backend remains alive.
This excludes an overlapping new generation while cleanup is unresolved.

The coordinator releases the close port and requires original backend close0/no
signal plus an empty namespace. A fresh independent SDK parent then launches
the actual packaged managed path, receives successful context, and must own a
different generation. Parent exit0, exact kernel-owned replacement backend
exit0 and empty state complete the scenario. Requests/observations retain5s,
owned backend exits7s and supervisor25s bounds. Cleanup attempts parent and
original backend independently and preserves the primary failure.

Evidence: `/tmp/resident-idle-fence-process-first.log`, one test passes11.16s.
Receipt `/tmp/resident-idle-fence-0ES1VB.receipt.json` records refusal1, original
exit0, distinct replacement generation and replacement kernel exit0. Its phase
log records held cleanup before refusal and confirmed original exit before
fresh startup. TypeScript and changed-file lint/format pass; both scoped reviews
accepted. Failed phases/state/isolated bundles are retained by the harness.

This proves fence-first bounded refusal and safe later attachment across actual
process/package boundaries with controlled original-backend time. It does not
measure physical idle deadlines, qualify real Huly work at the fence, native
macOS or the entire lifecycle matrix. No production change, legacy path, journal
or full campaign was added. All six issues remain incomplete.
