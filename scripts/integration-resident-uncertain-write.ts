import "../src/polyfills.js"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Layer, Schema } from "effect"

import { HulyConfigService } from "../src/config/config.js"
import { CreateProjectParamsSchema, GetProjectParamsSchema } from "../src/domain/schemas/projects.js"
import { HulyClient } from "../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../src/huly/diagnostics.js"
import { createProject, deleteProject, getProject } from "../src/huly/operations/projects.js"
import { ResidentPackagePath } from "../src/resident/managed-contract.js"
import { ResidentDirectory } from "../src/resident/protected-path.js"
import { fixturePackageVersion, startResidentFixture } from "../test/helpers/resident-fixture.js"
import { testStdioEnvironment } from "../test/helpers/stdio-environment.js"

const REQUEST_ID = 41
const RESPONSE_BOUND = 5_000
const EXIT_BOUND = 7_000

const Input = Schema.Struct({
  bundle: ResidentPackagePath,
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
  dispatches: Schema.Int,
  submitted: Schema.Boolean,
  created: Schema.Boolean,
  proved: Schema.Boolean,
  cleanup: Schema.Literals(["not-submitted", "unresolved", "deleted"])
})
const Receipt = Schema.Struct({
  boundary: Schema.Literal("packaged-adapter-test-tls-real-huly-operation"),
  project: CreateProjectParamsSchema.fields.identifier,
  dispatches: Schema.Literal(1),
  created: Schema.Literal(true),
  adapterExit: Schema.Literal(1),
  hostTerminalBytes: Schema.Literal(0),
  uncertaintyReported: Schema.Literal(true),
  readbackMatched: Schema.Literal(true),
  fixtureDeleted: Schema.Literal(true)
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
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(Input))(process.argv[2])
  const target = Schema.decodeUnknownSync(GetProjectParamsSchema)({ project: input.project.identifier })
  requireFact(new URL(process.env.HULY_URL ?? "").hostname === "host.docker.internal", "Local Huly required")
  await fs.mkdir(input.evidence, { mode: 0o700 })
  requireFact(await absent(target), "Fixture identifier already exists")
  let dispatches = 0
  let created = false
  let submitted = false
  let cleanupState: Schema.Schema.Type<typeof Phase>["cleanup"] = "not-submitted"
  const handlers: Array<Promise<void>> = []
  let handlerFailed = false
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
          const result = await live(createProject(input.project))
          requireFact(
            result.created && result.identifier === input.project.identifier && result.name === input.project.name,
            "Creation did not confirm the owned fixture"
          )
          created = true
          response.destroy()
        })()
        handlers.push(handler)
        void handler.catch(() => {
          handlerFailed = true
          response.destroy()
        })
      })
    },
    "live-uncertain-write-private",
    await fixturePackageVersion()
  )
  const adapter = spawn(process.execPath, [input.bundle], {
    env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
  })
  const closed = once(adapter, "close")
  void closed.catch(() => {})
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
    const exited = await bounded(closed, RESPONSE_BOUND)
    requireFact(exited[0] === 1 && exited[1] === null, "Adapter did not report failure")
    await bounded(Promise.all(handlers), RESPONSE_BOUND)
    requireFact(!handlerFailed && created && dispatches === 1, "One real mutation was not confirmed")
    requireFact(Buffer.concat(output).length === 0, "Host observed unexpected terminal output")
    const diagnostic = Buffer.concat(diagnostics).toString("utf8")
    requireFact(
      diagnostic.includes("operation outcome may be unknown") && diagnostic.includes("No request was replayed"),
      "Adapter uncertainty diagnostic missing"
    )
    const readback = await live(getProject(target))
    requireFact(
      readback.identifier === input.project.identifier && readback.name === input.project.name,
      "Fresh readback did not match the owned fixture"
    )
  }
  try {
    await proveResponseLoss()
    proved = true
  } catch (error) {
    primary = { error }
  }
  const cleanup = await Promise.allSettled([
    (async () => {
      if (adapter.exitCode === null && adapter.signalCode === null) adapter.kill("SIGKILL")
      await bounded(closed, EXIT_BOUND)
    })(),
    bounded(Promise.all(handlers), RESPONSE_BOUND)
  ])
  const transportCleanup = await Promise.allSettled([fixture.cleanup()])
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
  const receipt = Schema.encodeSync(Schema.fromJsonString(Receipt))({
    boundary: "packaged-adapter-test-tls-real-huly-operation",
    project: input.project.identifier,
    dispatches: 1,
    created: true,
    adapterExit: 1,
    hostTerminalBytes: 0,
    uncertaintyReported: true,
    readbackMatched: true,
    fixtureDeleted: true
  })
  await fs.writeFile(join(input.evidence, "receipt.json"), receipt, { flag: "wx", mode: 0o600 })
  process.stdout.write(`${receipt}\n`)
}
void main().catch(() => {
  process.stderr.write("Resident real-Huly uncertainty qualification failed; inspect private phase evidence\n")
  process.exitCode = 1
})
