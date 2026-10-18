# Packaged refusal of corrupt crash ownership

The existing actual-process crash-refusal fixture now adds a third startup
attempt after the owned explicit backend has been killed and joined. The first
two attempts still cover an unavailable owner and a foreign plaintext listener
at the old endpoint. The third deliberately replaces the original registry
record with malformed JSON, then launches another actual packaged managed
adapter with a pending discovery request.

Every adapter must close with exit1/no signal and no stdout. Diagnostics must
state non-dispatch and no replay. After the third attempt, exact malformed bytes,
registry inventory and namespace inventory must remain unchanged. The foreign
listener must remain alive, and its byte detector must not observe Huly or
resident credentials. The schema-owned receipt now distinguishes the third
refusal and records corrupt-state retention.

Evidence: `/tmp/resident-corrupt-owner-process-first.log`, one process test
passes. Receipt `/tmp/resident-crash-refusal-Xr0Kfi.receipt.json` records three
exit1 refusals, no stdout and no credential disclosure; corresponding phase log
records all three startup attempts. The subreaper supervisor returned0, which
requires all owned children to be reaped without forced deadline cleanup.
Changed-file lint/format and scoped Standards/Spec reviews accepted.

This proves safe refusal of deliberately damaged ownership after confirmed
backend death. It does not establish metadata repair, automatic recovery after
manual destruction of live state, native macOS support or final qualification.
No production code, legacy behavior, journal or timeout changed. No full gate
or live Huly campaign ran. Issues323–328 remain incomplete.
