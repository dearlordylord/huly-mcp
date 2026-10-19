# Check first and continued reads from two resident adapters

Use this Linux-only probe during the final local Huly campaign after all six
resident implementation slices are integrated. Track candidate qualification and remaining work in
[the resident feature issue](https://github.com/dearlordylord/huly-mcp/issues/322).
The probe uses two Node reader processes and two packaged stdio adapters. It
checks modern MCP discovery or legacy initialization, the native tool catalog, resource templates, and
first and continued `get_project` calls with colliding IDs across readers.

## Prepare the backend and fixture projects

Build the candidate with `pnpm build:mcp`. Start an explicit backend using the
[manual resident instructions](resident-manual.md#start-the-backend), with
`HULY_TOOL_MODE=native` and the intended Huly credentials and tool policy.
Keep that foreground process running. Record its printed attachment path.

Select two existing disposable fixture projects. Record each project's exact
identifier and name. Both identifiers and both names must differ, so a response
routed to the wrong reader fails the check. The probe reads these projects and
does not create or change fixtures.

Use the same Huly selection and native tool policy in the probe environment.
Keep authentication in the environment or private profile. Do not place secrets
in the input JSON or command arguments.

## Build and run the probe

Run from this checkout with Linux-local dependencies:

```bash
umask 077
pnpm exec esbuild scripts/integration-resident-read-pair.ts \
  --bundle --platform=node --format=cjs --external:ws \
  --outfile=dist/resident-read-probe.cjs
```

Keep the compiled probe under this checkout so its external runtime dependencies
resolve through the Linux-local node_modules. Copying only the bundle to an
unrelated temporary directory does not provide those dependencies.

Create a private `read-pair-input.json` file with absolute candidate and
attachment paths and the selected fixture labels:

```json
{
  "bundle": "/absolute/checkout/dist/index.cjs",
  "attachment": "/absolute/private/directory/generation.json",
  "targets": [
    { "project": "ONE", "name": "First fixture project" },
    { "project": "TWO", "name": "Second fixture project" }
  ]
}
```

The optional input field `"protocol": "2025-06-18"` selects legacy initialization
and its initialized notification. Omit it or select `"2026-07-28"` for modern
discovery. Both readers use the selection, and the pair receipt records it.
Require the receipt protocol to match the requested version. The same selection
applies to the managed mode below.

Run the compiled probe directly under the existing Linux child subreaper:

```bash
HULY_TOOL_MODE=native python3 test/resident/fixtures/reap-descendants.py \
  --report-reaped node dist/resident-read-probe.cjs pair \
  "$(cat read-pair-input.json)" > read-pair-receipt.json 2> read-pair-diagnostics.jsonl
```

The supervisor passes an owned exit-observation pipe to the probe. A wrapper
that closes extra file descriptors cannot replace this direct invocation.
The probe refuses unsupported platforms and a missing supervisor descriptor.

Require command exit zero and a decoded `LiveReadPairReceipt`. The receipt names
both fixture targets, the selected generation, separate parent and adapter PIDs,
request IDs 41 and 42 for each reader, and zero exits for parents and adapters.
It records `backendRetirement: "not-requested"` because the backend has a
separate owner. A receipt printed before a failed supervisor exit is not a pass.

The existing supervisor bounds the entire run to 25 seconds and joins owned
descendants. Each exchange has a five-second bound. Reader and receipt bounds
are also finite, but the supervisor's earlier deadline wins. A diagnostic
`resident-live-read-failure` contains a phase without credentials or raw replies.
On one reader's failure, the coordinator closes the other reader's controlling
stdin. That reader interrupts its operation and finalizes its adapter.

## Retain evidence and retire the backend

Keep the receipt and diagnostics private because fixture names may be private.
Record the candidate revision, artifact hashes, selected authentication path,
command exit, and these files in the campaign evidence. Stop the externally
owned backend through its original foreground owner and verify its exit and
owned descriptor cleanup separately. Do not infer retirement from a missing
PID, file, or listener.

The manual mode does not qualify actual Claude or Codex hosts, managed startup,
direct HTTP, performance, mutation uncertainty, or other operating systems.
The automated process test uses a local native TLS server with deterministic
project operations. Its development-version bundle tests the probe itself;
it provides no live Huly or release-artifact qualification evidence.

## Check automatic managed startup and idle retirement

Use the same built probe, candidate, Huly environment, and two project targets.
Replace `attachment` in the private input file with `directory`, naming an
existing empty directory owned by the current user with mode 0700. The probe
refuses an occupied directory and does not remove existing ownership evidence.

The input `clients[].configuredMode` describes the mode the probe expects; it
does not configure the adapter environment. For an automatic native/proxy pair,
set `HULY_TOOL_MODE=auto` in the supervised command environment and keep each
client's expected exposure in the private input.

Run the same supervised command with `managed-pair` in place of `pair`. Require
exit zero and a decoded `ManagedLiveReadPairReceipt`. Both readers must report
the same generation and backend PID, correlated with their actual context
response and protected registry/attachment records. Their parent and adapter
PIDs must differ. Each reader checks both project responses before disconnecting.

The managed probe waits for the supervisor's actual child-exit observation after
the backend's normal idle shutdown. It requires exit zero and an empty private
directory, recording `backendRetirement: "confirmed"`. Missing files alone do
not satisfy this check. Forced supervisor cleanup fails the campaign.

The managed process test launches the packaged production backend against a
disposable REST fixture through the real Huly SDK. It requires four project
reads and one shared full-model acquisition. This proves the local process
schedule; live Huly, real client hosts, and native macOS qualification remain
separate campaign requirements.


## Check name-driven auto exposure

For managed qualification, set HULY_TOOL_MODE=auto and add this optional clients
selection to the private pair input. Entries correspond to the two targets:

```json
"clients": [
  { "name": "claude-code", "configuredMode": "auto", "exposure": "native" },
  { "name": "codex", "configuredMode": "auto", "exposure": "proxy" }
]
```

Run with each supported protocol, then repeat with the two client entries
reversed. The selections state expected behavior; they do not override server
policy. The managed probe compares actual context exposure with those
expectations and refuses a mismatch before project reads. Each reader invokes
the project operation through its expected native or proxy interface and parses
the corresponding output schema. Require both receipts' client/exposure/catalog
fields; historical receipts without them do not prove this scenario. Compare the
complete catalog against the candidate's expected inventory, not only the
presence of one tool. The current unfiltered candidate has606native tools and
6proxy-visible tools including the two built-ins.

Both readers must share the generation/backend and retain their distinct target
results and process identities. Keep the existing response/exit/supervisor bounds
and verify kernel-owned retirement and empty private state. These name-selected
Node readers do not replace actual-host or capability-negotiation qualification.
