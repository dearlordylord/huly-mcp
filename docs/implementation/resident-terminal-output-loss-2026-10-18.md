# Terminal response production without host delivery

Test-only increment after `3f485b93`; all six issues remain incomplete.

The maintained uncertain-write process test now adds `terminal-output-loss`. An actual packaged manual adapter receives a write request after its host stdout pipe is closed. The private TLS fixture parses the write, increments its dispatch count, exclusively creates the state file with writes1, and sends a complete schema-owned JSON-RPC terminal response. A server `finish` event is required independently of the adapter's termination.

The adapter exits1/no signal with the specific output-failure diagnostic. Host-observed bytes remain empty. The independent state file still decodes to writes1, exactly one write dispatch occurred and the fixture recorded no handler failure. A backend producing its terminal response therefore does not establish host delivery, and output loss does not cause adapter replay. Server HTTP finish is not claimed to prove adapter receipt, output-queue admission or host observation.

The original before-headers and after-progress loss modes retain their uncertainty/no-replay diagnostic assertions. The new output-failure path has its existing output-specific diagnostic; absence of replay is demonstrated by the dispatch/state assertions rather than requiring a new diagnostic string. The first run incorrectly required the old diagnostic from this separate output path and failed (`/tmp/resident-write-terminal-output-loss.log`); no production change was needed.

The corrected focused file passes all three cases in `/tmp/resident-write-terminal-output-loss-corrected.log` (3.46 seconds). Changed-file lint/format and both scoped source reviews pass. No full gate was run. This is synthetic private-TLS transport evidence with a real packaged adapter; it does not qualify native Huly terminal queues, all uncertainty schedules, supported host applications, macOS or the full lifecycle/final movement contract.
