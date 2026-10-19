import { execFile } from "node:child_process"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Cause, Context, Deferred, Effect, Exit, Layer, Ref, Result, Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  LIVE_FIRST_READ_ID,
  LIVE_CONTINUED_READ_ID,
  LiveReadPairInput,
  LiveReadPairReceipt,
  LiveReadProbeDiagnostic,
  LiveReadProbePhase
} from "../../scripts/resident-live-read-contract.js"
import { GetProjectParamsSchema } from "../../src/domain/schemas/projects.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { registerEffectMcpRegistry } from "../../src/mcp/effect-ai-registry.js"
import { ToolParseFailure } from "../../src/mcp/tools/operation-failure.js"
import { VERSION } from "../../src/version.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { ResidentAttachment, withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import { AUTHORIZATION, withNativeServer, type OwnerName, type Owner } from "../helpers/resident-native-fixture.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeCompatibilityAuthority } from "../../src/resident/compatibility-authority.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const CommandFailure = Schema.Struct({ stderr: Schema.String })
class ProbeCommandFailure extends Schema.TaggedError<ProbeCommandFailure>()("ProbeCommandFailure", {
  phase: LiveReadProbePhase,
  forcedCleanup: Schema.Boolean
}) {}
const commandFailure = (error: unknown) => {
  const parsed = Schema.decodeUnknownResult(CommandFailure)(error)
  if (Result.isSuccess(parsed)) {
    for (const line of parsed.success.stderr.split("\n")) {
      const diagnostic = Schema.decodeUnknownResult(Schema.fromJsonString(LiveReadProbeDiagnostic))(line)
      if (Result.isSuccess(diagnostic))
        return new ProbeCommandFailure({
          phase: diagnostic.success.phase,
          forcedCleanup: parsed.success.stderr.includes("Fixture supervision deadline exceeded")
        })
    }
  }
  return new ProbeCommandFailure({
    phase: "pair",
    forcedCleanup: Result.isSuccess(parsed) && parsed.success.stderr.includes("Fixture supervision deadline exceeded")
  })
}
const Targets = LiveReadPairInput.fields.targets
const targets = Schema.decodeUnknownSync(Targets)([
  { project: "ONE", name: "First fixture project" },
  { project: "TWO", name: "Second fixture project" }
])
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 5000,
  lease: DEFAULT_LEASE_POLICY
})
describe.skipIf(process.platform !== "linux")("supervised live-read wire probe", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let probe: string
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    await runFile(
      "pnpm",
      ["build:mcp", `--outfile=${bundle.path}`, `--define:PKG_VERSION=${JSON.stringify(VERSION)}`],
      { timeout: PROCESS_BOUND }
    )
    probe = join(dirname(bundle.path), "live-read-probe.cjs")
    await runFile(
      "pnpm",
      [
        "exec",
        "esbuild",
        "scripts/integration-resident-read-pair.ts",
        "--bundle",
        "--platform=node",
        "--format=cjs",
        ...NATIVE_RUNTIME_EXTERNALS,
        `--outfile=${probe}`
      ],
      { timeout: PROCESS_BOUND }
    )
  }, PROCESS_BOUND)
  afterAll(async () => {
    await bundle?.cleanup()
  })

  it.each([
    [targets[0], { ...targets[1], project: targets[0].project }],
    [targets[0], { ...targets[1], name: targets[0].name }]
  ])("refuses fixture pairs whose replies cannot distinguish both readers: %j", (...ambiguousTargets) => {
    const result = Schema.decodeUnknownResult(LiveReadPairInput)({
      bundle: bundle.path,
      attachment: "/private-fixture/attachment.json",
      targets: ambiguousTargets
    })
    expect(Result.isFailure(result)).toBe(true)
  })

  it.each(["correct", "wrong-result"] as const)(
    "verifies separate reader parents and colliding IDs with %s project replies",
    { timeout: PROCESS_BOUND },
    async (mode) =>
      withRegistryDirectory(async (directory) => {
        const requested: Array<string> = []
        await Effect.runPromise(
          Effect.gen(function* () {
            const services = yield* Layer.build(Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
            const clients = {
              hulyClient: Context.get(services, HulyClient),
              storageClient: Context.get(services, HulyStorageClient)
            }
            const base = toolRegistry.tools.get("get_project")
            if (base === undefined) return yield* Effect.die("Missing get_project operation")
            const firstWave = yield* Deferred.make<void>()
            const heldReadCancelled = yield* Deferred.make<void>()
            let firstWaveArrivals = 0
            const REQUIRED_FIRST_READERS = 2
            const tool = {
              ...base,
              operation: {
                ...base.operation,
                execute: (args: unknown) =>
                  Schema.decodeUnknownEffect(GetProjectParamsSchema)(args).pipe(
                    Effect.mapError((error) => new ToolParseFailure({ cause: Cause.fail(error), toolName: base.name })),
                    Effect.flatMap(({ project }) =>
                      Effect.gen(function* () {
                        requested.push(project)
                        firstWaveArrivals++
                        if (firstWaveArrivals === REQUIRED_FIRST_READERS) yield* Deferred.succeed(firstWave, undefined)
                        yield* Deferred.await(firstWave)
                        if (mode === "wrong-result" && project === targets[1].project)
                          return yield* Effect.never.pipe(
                            Effect.onInterrupt(() => Deferred.succeed(heldReadCancelled, undefined))
                          )
                        const target = targets.find((candidate) => candidate.project === project)
                        return {
                          result: {
                            identifier: project,
                            name: mode === "wrong-result" ? "Private wrong reply marker" : target?.name,
                            archived: false
                          },
                          warnings: []
                        }
                      })
                    )
                  )
              }
            }
            const registration = registerEffectMcpRegistry({
              registry: { ...toolRegistry, tools: new Map([[tool.name, tool]]), definitions: [tool] },
              resolveClients: async () => Exit.succeed(clients),
              telemetry: {
                sessionStart: () => {},
                firstListTools: () => {},
                toolCalled: () => {},
                shutdown: async () => {}
              },
              getHulyContext: () => Effect.die("Context is outside this read probe"),
              exposureOptions: { exposureConfig: { configuredMode: "native", proxyOutputStrict: false } },
              discoverConcreteResources: false,
              fetchLatestVersion: async () => "fixture"
            })
            const admissions = yield* makeResidentAdmissions(policy)
            const environment = { ...residentSelectionEnvironment(), HULY_TOOL_MODE: "native" }
            const capture = yield* captureResidentSelection(environment)
            const authority = yield* Ref.make<
              Effect.Success<ReturnType<typeof makeCompatibilityAuthority>> | undefined
            >(undefined)
            yield* withNativeServer(
              new Map<OwnerName, Owner>(),
              (endpoint, identity) =>
                Effect.gen(function* () {
                  yield* Ref.set(
                    authority,
                    yield* makeCompatibilityAuthority(capture.selection, identity.generation, AUTHORIZATION)
                  )
                  return yield* withPublishedResidentAttachment(
                    directory,
                    ResidentAttachment.make({
                      version: 1,
                      transport: "tls13-external-psk-v1",
                      implementation: { name: "@firfi/huly-mcp", version: VERSION },
                      endpoint,
                      identity,
                      authorization: AUTHORIZATION
                    }),
                    (attachment) =>
                      Effect.gen(function* () {
                        const parsed = yield* Schema.decodeUnknownEffect(LiveReadPairInput)({
                          bundle: bundle.path,
                          attachment,
                          targets
                        })
                        const input = yield* Schema.encodeEffect(Schema.fromJsonString(LiveReadPairInput))(parsed)
                        const outcome = yield* Effect.tryPromise({
                          try: () =>
                            runFile(
                              "python3",
                              [
                                "test/resident/fixtures/reap-descendants.py",
                                "--report-reaped",
                                process.execPath,
                                probe,
                                "pair",
                                input
                              ],
                              { timeout: PROCESS_BOUND, env: environment }
                            ),
                          catch: commandFailure
                        }).pipe(Effect.result)
                        if (mode === "wrong-result") {
                          expect(outcome._tag).toBe("Failure")
                          if (outcome._tag !== "Failure") return yield* Effect.die("Wrong project reply was accepted")
                          expect(outcome.failure.phase).toBe("read")
                          expect(outcome.failure.forcedCleanup).toBe(false)
                          yield* Deferred.await(heldReadCancelled).pipe(Effect.timeout("5 seconds"))
                        } else {
                          expect(outcome).toMatchObject({ _tag: "Success" })
                          if (outcome._tag !== "Success") return yield* Effect.die("Read-pair process failed")
                          const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(LiveReadPairReceipt))(
                            outcome.success.stdout
                          )
                          expect(receipt.readers.map((reader) => reader.target)).toEqual(targets)
                          expect(receipt.readers[0].parentPid).not.toBe(receipt.readers[1].parentPid)
                          expect(receipt.readers[0].adapterPid).not.toBe(receipt.readers[1].adapterPid)
                          expect(receipt.readers.map((reader) => [reader.firstId, reader.continuedId])).toEqual([
                            [LIVE_FIRST_READ_ID, LIVE_CONTINUED_READ_ID],
                            [LIVE_FIRST_READ_ID, LIVE_CONTINUED_READ_ID]
                          ])
                          expect(receipt.backendRetirement).toBe("not-requested")
                          expect(requested.filter((project) => project === "ONE")).toHaveLength(2)
                          expect(requested.filter((project) => project === "TWO")).toHaveLength(2)
                        }
                      })
                  )
                }),
              {
                registration,
                middleware: (app) =>
                  Ref.get(authority).pipe(
                    Effect.flatMap((selected) => residentAdmissionMiddleware(admissions, selected)(app))
                  )
              }
            )
          }).pipe(Effect.scoped)
        )
      })
  )
})
