# Authenticated managed stop request

The operator targets one exact generation in an existing private namespace.
The public operation is `requestResidentStop({ directory, generation })`;
the CLI is `huly resident stop --generation <uuid>`. The existing
`resident status` command remains observational.

The selected design reuses the managed backend's admissions fence. Its existing
owner observes that fence, stops the server, joins the actual serving fiber and
completes resource finalizers. Only the enclosing `runOwnedGeneration` may retire
its registry receipt after successful owned cleanup. The HTTP route never stops
the server directly, forks a shutdown task, deletes metadata or signals a PID.

## Protocol and ownership

`src/resident/operator-stop.ts` owns the private wire schemas and HTTP rendering.
`residentAdmissionMiddleware` dispatches the reserved route inside existing
generation TLS, bearer and Host/Origin protection, before attachment lookup or
Huly client acquisition. Only configured managed lifetime supplies the internal
capability `{ kind: "managed", generation, fence }`. Manual and foreground
lifetimes supply `{ kind: "unsupported" }` and refuse without fencing.

At `/resident/control/stop-v1`:

- GET returns wire version 1, exact generation, managed mode, acknowledgment
  `admission-fenced` and retirement evidence `none`.
- POST parses wire version 1 and the exact generation within the existing
  4,096-byte control-body limit. Wrong generation, unsupported mode and invalid
  input refuse before fencing. Oversized native requests can close their socket
  instead of delivering the refusal response.
- A valid POST prepares its schema-encoded acknowledgment, executes the existing
  idempotent fence and returns 202 with `retirement: "unconfirmed"`.
- Other methods return 405. Responses do not include credentials or endpoints.

The request may lose its acknowledgment when shutdown closes the serving stack.
An acknowledgment establishes acceptance alone. `server.stop()`'s done signal
also does not prove successful serving exit, outer cleanup or registry retirement.
No status snapshot, missing file, quiet port, PID observation or EOF supplies that
proof. The client must preserve unknown submission after possible dispatch and
must not automatically retry, reset the namespace or launch a replacement.

Control wire compatibility is independent of the CLI package version. The client
negotiates the supported wire before POST and authenticates the selected
generation. Ordinary adapter compatibility remains exact implementation version
plus captured Huly identity and policy. This design changes no mutation outcome
or reconciliation contract.

The client inspects the existing bounded namespace and immutable registry
descriptor without creating directories or acquiring a claim. Its single
invocation state is not-submitted, submitted or accepted with an authenticated
receipt. A failed channel finalizer cannot erase validated acceptance; its
diagnostic remains redacted and retirement remains unconfirmed. Selection/control
uses the existing ten-second budget, individual exchanges retain five-second
limits and owned TLS cleanup keeps its existing five-second bound. These are
not a new total server-shutdown deadline.

CLI exit zero means accepted only. Uncertain submission is the existing
nonretryable conflict failure (exit 5), including JSON failure output on stderr;
it does not emit a success result. Missing target is NOT_FOUND, invalid generation
is INVALID_INPUT. All outcomes leave registry ownership to the existing owner.

## Alternatives and synthesis

Two independent sketches compared reuse of the admissions fence with a detached
authenticated witness connection. A witness could carry positive retirement
evidence only after all serving/runtime cleanup and fenced registry retirement.
Its survival across the exact Node/Effect listener finalizers is unproven. It also
adds socket capacity, framing and resource lifetime rules. The selected design
adds no witness, persistent stop receipt, journal, guardian or extra lifecycle
state owner.

The parent and independent cross-judge both scored the witness design 9/12 and
the fence design 11/12 against authentication, truthful evidence, existing
ownership, fault handling, interface depth and executable seams. Neither sketch
received credit for qualification that had not run. The fence design's explicit
limitation is no external positive retirement confirmation. Full verified
retirement and recovery requirements remain mandatory.

## Evidence and remaining work

The server checkpoint has native TLS tests for authorization, malformed/oversized
input, wrong generation, method refusal, unsupported lifetime and repeated
acceptance. Actual backend tests hold client cleanup after the response, verify
the owner is still running and publication remains, then release cleanup and
join the owner before checking publication removal. These tests do not exercise
the enclosing managed registry receipt or a packaged operator client.

The client now has real protected-file/TLS schedules for acknowledgment loss,
malformed/wrong-generation acknowledgment, pre-POST wire/authentication refusal,
explicit post-capability refusal and compatibility with a different recorded
implementation version. Source CLI acceptance and uncertainty, plus packaged CLI
absent-target refusal, are covered. These do not constitute qualification of two
released installations or the full packaged stop process lifecycle.

Add process schedules for lost acknowledgment, active operations,
cleanup failure retaining ownership, unrelated generations, CLI death and
verified replacement after actual owned retirement. Preserve existing deadlines,
inventory bounds, no replay and native/Huly qualification. No ticket is complete
on this evidence alone.
