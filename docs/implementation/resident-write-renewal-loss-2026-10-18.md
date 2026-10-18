# Lease renewal failure while a committed write awaits its response

Test-only increment after `d84f4f79`; all six issues remain incomplete.

The uncertain-write process fixture now exercises renewal loss through an actual packaged manual adapter and private TLS control/data channels. Its optional typed test lease policy preserves default token registration and authentication while allowing a controlled renewal response. The fixture advertises a short test lease (1000ms/10ms renewal), matching existing attachment-test practice. Production lease values, request deadlines and cleanup bounds remain unchanged; this is not a measurement of the production five-second heartbeat.

The write is parsed and exclusively creates the independent state file with writes1. Its MCP response remains held. Only after that commit does the renewal handler return403. The adapter must terminate1/no signal, emit the existing unknown-outcome diagnostic, and deliver no stdout result. Exactly one renewal and one write dispatch are required; the state must still decode to writes1. No adapter replay occurs and local shutdown is not mistaken for remote rollback.

After observing adapter closure, the test releases the held handler and joins all pending write/renewal work before checking failures. Failure cleanup releases both gates, joins handlers before server closure and preserves an existing primary error if cleanup fails. The renewal promise ownership correction came from Standards review; both scoped reviews accepted the resulting semantics and cleanup.

The initial renewal-only case passed in `/tmp/resident-write-renewal-loss-first.log`. Final uncertain-write, adapter-attachment and adapter-boundary cohort passes three files/28tests in `/tmp/resident-write-renewal-loss-owned-cleanup.log`. Changed-file lint/format pass. No full gate was run.

This proves a committed synthetic write/held response across real adapter renewal failure. It does not certify native Huly writes, lease-expiry versus renewal-error timing, remote cancellation/abort, every uncertain outcome schedule, macOS, lifecycle oracle or final movement qualification. No production journal or retry behavior is introduced.
