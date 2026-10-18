import "../src/polyfills.js"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Layer, Schema } from "effect"

import { HulyConfigService } from "../src/config/config.js"
import {
  CreateProjectParamsSchema,
  type CreateProjectResultSchema,
  GetProjectParamsSchema
} from "../src/domain/schemas/projects.js"
import { HulyClient } from "../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../src/huly/diagnostics.js"
import { deleteProject, getProject } from "../src/huly/operations/projects.js"
import { ResidentPackagePath } from "../src/resident/managed-contract.js"
import { ResidentDirectory } from "../src/resident/protected-path.js"
import { LeasePolicy } from "../src/resident/admission-contract.js"
import { KernelOwnedExit, ReapedEventsFd } from "../test/helpers/kernel-reaped-events.js"
import { LiveProbeEnvironment, LiveReadProtocol } from "./resident-live-read-contract.js"
import { withLiveManagedWrite } from "./resident-live-managed-write.js"
import { fixturePackageVersion, startResidentFixture } from "../test/helpers/resident-fixture.js"
import { testStdioEnvironment } from "../test/helpers/stdio-environment.js"

const REQUEST_ID = 41
const RESPONSE_BOUND = 5_000
const EXIT_BOUND = 7_000
const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const FAULT_LEASE_MILLIS = 1_000
const FAULT_RENEWAL_MILLIS = 10
const ResponseLoss = Schema.Literals(["before-headers", "after-progress", "renewal-loss"])
const Progress = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.Literal("notifications/progress"),
  params: Schema.Struct({ progressToken: Schema.Literal("live-fixture-write"), progress: Schema.Literal(1) })
})
const progressLine = Schema.encodeSync(Schema.fromJsonString(Progress))({
  jsonrpc: "2.0",
  method: "notifications/progress",
  params: { progressToken: "live-fixture-write", progress: 1 }
})

const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  upstreamProtocol: LiveReadProtocol,
  responseLoss: ResponseLoss,
  evidence: ResidentDirectory,
  project: CreateProjectParamsSchema
})
const Call = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(REQUEST_ID),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: Schema.Literal("fixture_create_project"), arguments: Schema.Struct({}) })
})
const Phase = Schema.Struct({
  responseLoss: ResponseLoss,
  progressObserved: Schema.Boolean,
  renewalRefusals: Schema.Int,
  proofStep: Schema.Literals([
    "request-response",
    "handlers",
    "renewal-count",
    "host-output",
    "uncertainty-diagnostic",
    "readback",
    "complete"
  ]),
  dispatches: Schema.Int,
  submitted: Schema.Boolean,
  created: Schema.Boolean,
  proved: Schema.Boolean,
  cleanup: Schema.Literals(["not-submitted", "unresolved", "deleted"])
})
const Observation = Schema.Struct({
  boundary: Schema.Literal("packaged-adapter-test-tls-packaged-managed-backend"),
  upstreamProtocol: LiveReadProtocol,
  responseLoss: ResponseLoss,
  project: CreateProjectParamsSchema.fields.identifier,
  dispatches: Schema.Literal(1),
  created: Schema.Literal(true),
  adapterExit: Schema.Literal(1),
  hostTerminalBytes: Schema.Literal(0),
  uncertaintyReported: Schema.Literal(true),
  readbackMatched: Schema.Literal(true),
  fixtureDeleted: Schema.Literal(true)
})
const Receipt = Schema.Struct({
  ...Observation.fields,
  backendExit: KernelOwnedExit,
  privateStateRemoved: Schema.Literal(true)
})
const layer = HulyClient.layer.pipe(Layer.provide(HulyConfigService.layer))
const live = <A, E>(operation: Effect.Effect<A, E, HulyClient | Diagnostics>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      return yield* operation.pipe(Effect.provideService(Diagnostics, diagnostics.service))
    }).pipe(Effect.provide(layer), Effect.scoped, Effect.timeout("5 seconds"))
  )
const bounded = <A>(pending: Promise<A>, millis: number) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(millis)))
const requireFact = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}
const absent = (target: Schema.Schema.Type<typeof GetProjectParamsSchema>) =>
  live(
    getProject(target).pipe(
      Effect.as(false),
      Effect.catchTag("ProjectNotFoundError", () => Effect.succeed(true))
    )
  )
const run = async (
  input: Schema.Schema.Type<typeof Input>,
  submit: (
    project: Schema.Schema.Type<typeof CreateProjectParamsSchema>
  ) => Promise<Schema.Schema.Type<typeof CreateProjectResultSchema>>
) => {
  const target = Schema.decodeUnknownSync(GetProjectParamsSchema)({ project: input.project.identifier })
  let dispatches = 0
  let created = false
  let submitted = false
  let cleanupState: Schema.Schema.Type<typeof Phase>["cleanup"] = "not-submitted"
  const handlers: Array<Promise<void>> = []
  let handlerFailed = false
  let truncate: (() => void) | undefined
  let progressObserved = false
  let renewalRefusals = 0
  let proofStep: Schema.Schema.Type<typeof Phase>["proofStep"] = "request-response"
  const committed = Effect.runSync(Deferred.make<void>())
  const releaseResponse = Effect.runSync(Deferred.make<void>())
  const fixture = await startResidentFixture(
    (request, response) => {
      const chunks: Array<Buffer> = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.once("end", () => {
        const handler = (async () => {
          Schema.decodeUnknownSync(Schema.fromJsonString(Call))(Buffer.concat(chunks).toString("utf8"))
          dispatches++
          requireFact(dispatches === 1, "Mutation was dispatched more than once")
          submitted = true
          cleanupState = "unresolved"
          const result = await submit(input.project)
          requireFact(
            result.created && result.identifier === input.project.identifier && result.name === input.project.name,
            "Creation did not confirm the owned fixture"
          )
          created = true
          Effect.runSync(Deferred.succeed(committed, undefined))
          if (input.responseLoss === "renewal-loss") {
            await Effect.runPromise(Deferred.await(releaseResponse))
            response.destroy()
          } else if (input.responseLoss === "after-progress") {
            truncate = () => response.destroy()
            response.writeHead(HTTP_OK, { "content-type": "text/event-stream" })
            response.write(`data: ${progressLine}\n\n`)
          } else response.destroy()
        })()
        handlers.push(handler)
        void handler.catch(() => {
          handlerFailed = true
          response.destroy()
        })
      })
    },
    "live-uncertain-write-private",
    await fixturePackageVersion(),
    undefined,
    input.responseLoss === "renewal-loss"
      ? {
          lease: Schema.decodeUnknownSync(LeasePolicy)({
            durationMillis: FAULT_LEASE_MILLIS,
            renewEveryMillis: FAULT_RENEWAL_MILLIS
          }),
          renew: (_request, response) => {
            const renewal = Effect.runPromise(Deferred.await(committed)).then(() => {
              requireFact(created, "Renewal refusal preceded mutation confirmation")
              renewalRefusals++
              response.writeHead(HTTP_FORBIDDEN).end()
            })
            handlers.push(renewal)
            void renewal.catch(() => {
              handlerFailed = true
              response.destroy()
            })
          }
        }
      : undefined
  )
  const adapter = spawn(process.execPath, [input.bundle], {
    env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
  })
  const closed = once(adapter, "close")
  void closed.catch(() => {})
  const lines = createInterface({ input: adapter.stdout })
  const progress = input.responseLoss === "after-progress" ? once(lines, "line") : undefined
  void progress?.catch(() => {})
  const output: Array<Buffer> = []
  const diagnostics: Array<Buffer> = []
  adapter.stdout.on("data", (chunk: Buffer) => output.push(chunk))
  adapter.stderr.on("data", (chunk: Buffer) => diagnostics.push(chunk))
  adapter.stdin.on("error", () => {})
  let primary: { readonly error: unknown } | undefined
  let proved = false
  const proveResponseLoss = async () => {
    adapter.stdin.write(
      `${Schema.encodeSync(Schema.fromJsonString(Call))({
        jsonrpc: "2.0",
        id: REQUEST_ID,
        method: "tools/call",
        params: { name: "fixture_create_project", arguments: {} }
      })}\n`
    )
    if (progress !== undefined) {
      const observed = Schema.decodeUnknownSync(Schema.Tuple([Schema.String]))(await bounded(progress, RESPONSE_BOUND))
      if (observed[0] !== progressLine || truncate === undefined)
        throw new Error("Expected committed-write progress missing")
      progressObserved = true
      truncate()
    }
    const exited = await bounded(closed, RESPONSE_BOUND)
    requireFact(exited[0] === 1 && exited[1] === null, "Adapter did not report failure")
    Effect.runSync(Deferred.succeed(releaseResponse, undefined))
    proofStep = "handlers"
    await bounded(Promise.all(handlers), RESPONSE_BOUND)
    requireFact(!handlerFailed && created && dispatches === 1, "One real mutation was not confirmed")
    proofStep = "renewal-count"
    requireFact(renewalRefusals === (input.responseLoss === "renewal-loss" ? 1 : 0), "Unexpected renewal refusal count")
    proofStep = "host-output"
    requireFact(
      Buffer.concat(output).toString("utf8") === (input.responseLoss === "after-progress" ? `${progressLine}\n` : ""),
      "Host observed unexpected terminal output"
    )
    const diagnostic = Buffer.concat(diagnostics).toString("utf8")
    proofStep = "uncertainty-diagnostic"
    const noReplay =
      input.responseLoss === "renewal-loss" ? "stopped without replaying a request" : "No request was replayed"
    requireFact(
      diagnostic.includes("operation outcome may be unknown") && diagnostic.includes(noReplay),
      "Adapter uncertainty diagnostic missing"
    )
    proofStep = "readback"
    const readback = await live(getProject(target))
    requireFact(
      readback.identifier === input.project.identifier && readback.name === input.project.name,
      "Fresh readback did not match the owned fixture"
    )
    proofStep = "complete"
  }
  try {
    await proveResponseLoss()
    proved = true
  } catch (error) {
    primary = { error }
  }
  Effect.runSync(Deferred.succeed(committed, undefined))
  Effect.runSync(Deferred.succeed(releaseResponse, undefined))
  const cleanup = await Promise.allSettled([
    (async () => {
      if (adapter.exitCode === null && adapter.signalCode === null) adapter.kill("SIGKILL")
      await bounded(closed, EXIT_BOUND)
    })(),
    bounded(Promise.all(handlers), RESPONSE_BOUND)
  ])
  const transportCleanup = await Promise.allSettled([fixture.cleanup()])
  lines.close()
  let deleted = false
  const remoteCleanup = await Promise.allSettled([
    (async () => {
      if (!submitted) return
      const owned = await live(getProject(target))
      requireFact(owned.name === input.project.name, "Cleanup ownership mismatch")
      const result = await live(deleteProject(target))
      requireFact(result.deleted, "Fixture deletion not confirmed")
      requireFact(await absent(target), "Deleted fixture is still present")
      deleted = true
      cleanupState = "deleted"
    })()
  ])
  const evidence = await Promise.allSettled([
    fs.writeFile(
      join(input.evidence, "phases.json"),
      Schema.encodeSync(Schema.fromJsonString(Phase))({
        responseLoss: input.responseLoss,
        progressObserved,
        renewalRefusals,
        proofStep,
        dispatches,
        submitted,
        created,
        proved,
        cleanup: cleanupState
      }),
      { flag: "wx", mode: 0o600 }
    )
  ])
  if (primary !== undefined) throw primary.error
  for (const result of [...cleanup, ...transportCleanup, ...remoteCleanup, ...evidence])
    if (result.status === "rejected") throw result.reason
  requireFact(proved && deleted, "Fixture evidence incomplete")
  return Observation.make({
    boundary: "packaged-adapter-test-tls-packaged-managed-backend",
    upstreamProtocol: input.upstreamProtocol,
    responseLoss: input.responseLoss,
    project: input.project.identifier,
    dispatches: 1,
    created: true,
    adapterExit: 1,
    hostTerminalBytes: 0,
    uncertaintyReported: true,
    readbackMatched: true,
    fixtureDeleted: true
  })
}
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(Input))(process.argv[2])
  requireFact(new URL(process.env.HULY_URL ?? "").hostname === "host.docker.internal", "Local Huly required")
  const environment = Schema.decodeUnknownSync(LiveProbeEnvironment)(
    Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined))
  )
  const reapedFd = Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD)
  await fs.mkdir(input.evidence, { mode: 0o700 })
  const target = Schema.decodeUnknownSync(GetProjectParamsSchema)({ project: input.project.identifier })
  requireFact(await absent(target), "Fixture identifier already exists")
  const result = await withLiveManagedWrite(
    {
      bundle: input.bundle,
      directory: ResidentDirectory.make(join(input.evidence, "managed")),
      reapedFd,
      protocol: input.upstreamProtocol
    },
    environment,
    (submit) => run(input, submit)
  )
  const receipt = Schema.encodeSync(Schema.fromJsonString(Receipt))({
    ...result.observation,
    backendExit: result.backendExit,
    privateStateRemoved: true
  })
  await fs.writeFile(join(input.evidence, "receipt.json"), receipt, { flag: "wx", mode: 0o600 })
  process.stdout.write(`${receipt}\n`)
}

void main().catch(() => {
  process.stderr.write("Resident real-Huly uncertainty qualification failed; inspect private phase evidence\n")
  process.exitCode = 1
})
