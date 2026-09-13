# HTTP transport model and test observations

The model covers HTTP admission, client ownership, and shutdown. Its domain bounds
and intentionally omitted SDK details are documented in `http-transport-admission.qnt`.
`quint.lock` records the Quint Studio survey and historical behavior-test observations;
its recorded line numbers and hashes describe those observations, not current release certification.

`oracle-client/typescript/` and `spells/` are the generated support files supplied by
Quint Studio with this model. They are retained as test tooling. The oracle client
uses an ambient test registry and its own HTTP/ITF protocol, so production modules
must not import it. It is excluded from application coverage; the source-owned
diagnostics publisher remains subject to the normal 99% gate.
The repository's composite TypeScript project includes application and test files,
so it also lists the generated files imported by the test setup. This does not add
them to either published bundle.

Production lifecycle code publishes schema-typed events on Node's
`huly.http-transport-admission` diagnostics channel. With no subscribers, publishing
does not evaluate deferred fields or serialize events. It reads no oracle environment
configuration and starts no oracle HTTP client.

`test/setup/quint-oracle.ts` owns the test subscription and cleanup. When Quint Studio
sets `QUINT_ORACLE_URL`, it forwards observations to the generated oracle adapter.
Forwarding exceptions fail the owning test rather than escaping a Node subscriber.
Ordinary tests run without the daemon; tests using `test.concurrent` are not supported
by the generated oracle registry.

Tests tagged `oracle-infrastructure` exercise the diagnostic channel itself. They
still run with the oracle enabled, but the setup does not forward their synthetic
channel messages to the behavioral model or add a subscriber that would invalidate
their disabled-channel assertions.

Release review verification used the TypeScript backend with seed `1`: all three
model files typechecked, all 10 `Test$` deterministic tests passed, and all 47 named
coverage runs passed. Bounded simulation used `--mbt --max-steps 30 --max-samples 200`
and found no violations of `shutdown_success_waits_for_drain`,
`tenant_bundles_stay_isolated`, or `dispatched_requests_passed_guards`.
This is bounded simulation and regression evidence, not exhaustive verification.
