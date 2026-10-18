# Packaged adapter output-validation fidelity

Test-only increment after `03b8638b`; all six issues remain incomplete.

The native output-validation server fixture is now shared by the existing raw HTTPS tests and a new packaged stdio suite. It still uses production `defineTool` and `makeEffectMcpRegistry`, positive-count output schema, deliberately invalid−1 operation output and typed internal service layers. Packaged cases additionally enable real resident admission/request-context middleware and protected attachment publication metadata for the fixture generation.

Six cases cover both supported negotiated protocols across native, strict proxy and non-strict proxy exposure. Each owns an actual adapter process launched from the suite’s isolated package build and uses the maintained protocol handshake helpers, bounded frame decoding and redacted subprocess environment. The adapter must forward exactly the server-generated invalid-output tool error without successful structured content, then return the exact valid count1 result (including the proxy wrapper where applicable). Exactly two operations execute. Each actual adapter close must be0/no signal before fixture teardown; the existing owned-child helper also enforces cleanup.

The original three raw HTTPS checks remain, establishing that server validation—not MCP SDK client-side checking—produces the error. The packaged cases use raw stdio frames rather than SDK validation. This is an in-process native HTTPS backend fixture plus actual packaged adapter processes, not a packaged managed backend or separate external parent hosts, and no remote Huly operation is executed.

Nine final cases pass across two files in `/tmp/resident-packaged-output-validation-final.log` (4.76 seconds); changed-file lint/format and both scoped reviews pass. Setup iterations are retained in `/tmp/resident-packaged-output-validation-{first,admitted,diagnostic,generation-file,version-fixed}.log`. The initial descriptor used an arbitrary filename and source VERSION0.0.0-dev rather than the generation filename and bundled package version. Production attachment checks refused it. Preparation also added the missing resident admission middleware. Correcting fixture setup produced the passing matrix; production compatibility checks were preserved.

No full gate was run. Broader result/resource types, real Huly payloads, independent-client failure isolation, native macOS, full lifecycle oracle and final movement qualification remain open. No journal, legacy fallback or production behavior is introduced.
