# Capability and metadata transport boundary

Candidate: `c392e2cf` plus this test-only increment. All six issues #323–328 remain incomplete; production source is unchanged.

`test/resident/capability-boundary.test.ts` runs two adapters concurrently against a real PSK TLS fixture for protocols 2026-07-28 and 2025-06-18. It checks complete parsed request bodies, distinct client capabilities, Unicode/null extension metadata, colliding request IDs and progress tokens, exact caller-specific replies, per-adapter legacy sessions and suppression of an invented modern session. The second request waits for the first response, so legacy session negotiation precedes its use. Boundary replies are parsed and encoded through their owning Effect schema.

The three focused capability-boundary, request-headers and response-stream files pass 19 tests (`/tmp/resident-capability-boundary-focused.log`). Changed-file Oxlint and formatting pass. Standards review's outbound schema finding was corrected and confirmed resolved; Spec review found no actionable issue within this transport-only scope. No full gate was run, following the user's local-check instruction.

This fixture uses in-process test Stdio adapters and synthetic discovery/initialization replies. Its legacy sequence omits `notifications/initialized`. It proves transport preservation and session isolation, not successful native MCP negotiation, capability interpretation, separate OS parents, progress delivery or interactive continuation. A shared progress token is opaque metadata here; no progress event is produced.

Source inspection found no application progress or interactive producer in `src/mcp`, `src/runtime` or `src/resident`: installed Effect APIs expose these capabilities, but application handlers do not invoke them. Existing response-stream tests require rejection of id-bearing interactive backend requests. This does not close the wider #323.4/.5 contract or justify adding unsupported producers merely to populate a test.

Earlier fixture failures remain in `/tmp/resident-capability-boundary-{first,fixed,live-input}.log`: premature stdin EOF canceled requests, then pipelining before initialization lost the expected session. Correcting fixture sequencing produced the passing negotiated and final focused runs; no production fix was needed. Legacy 2025-06-18 remains covered because the installed Codex consumer requires it, as recorded in the protocol necessity audit; other compatibility paths require their own evidence.
