import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Deferred, Effect, Schema } from "effect"
import { expect, it } from "vitest"

import { fixturePackageVersion, startResidentFixture } from "../helpers/resident-fixture.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const FixtureCall = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literals([1, 2]),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: Schema.Literals(["fixture_increment", "fixture_read"]), arguments: Schema.Struct({}) })
})
const FixtureState = Schema.Struct({ writes: Schema.Natural })
const FixtureReply = Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: FixtureCall.fields.id, result: FixtureState })
const bounded = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect.pipe(Effect.timeout(RESPONSE_BOUND)))

it(
  "does not resolve or replay a lost write when a fresh adapter reads before its delayed remote commit",
  { timeout: PROCESS_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    let passed = false
    try {
      await withRegistryDirectory(async (directory) => {
        const stateFile = join(directory, "remote-counter.json")
        await fs.writeFile(stateFile, Schema.encodeSync(Schema.fromJsonString(FixtureState))({ writes: 0 }), {
          mode: 0o600,
          flag: "wx"
        })
        const entered = Effect.runSync(Deferred.make<void>())
        const allowCommit = Effect.runSync(Deferred.make<void>())
        const committed = Effect.runSync(Deferred.make<void>())
        const disconnected = Effect.runSync(Deferred.make<void>())
        const pending = new Set<Promise<void>>()
        const failures: Array<unknown> = []
        let writeDispatches = 0
        let readDispatches = 0
        const fixture = await startResidentFixture(
          (request, response) => {
            const chunks: Array<Buffer> = []
            request.on("data", (chunk: Buffer) => chunks.push(chunk))
            request.once("end", () => {
              const operation = (async () => {
                const call = Schema.decodeUnknownSync(Schema.fromJsonString(FixtureCall))(
                  Buffer.concat(chunks).toString("utf8")
                )
                if (call.params.name === "fixture_increment") {
                  writeDispatches++
                  response.once("close", () => Effect.runSync(Deferred.succeed(disconnected, undefined)))
                  await Effect.runPromise(Deferred.succeed(entered, undefined))
                  await Effect.runPromise(Deferred.await(allowCommit))
                  await fs.writeFile(stateFile, Schema.encodeSync(Schema.fromJsonString(FixtureState))({ writes: 1 }))
                  await Effect.runPromise(Deferred.succeed(committed, undefined))
                } else readDispatches++
                const state = Schema.decodeUnknownSync(Schema.fromJsonString(FixtureState))(
                  await fs.readFile(stateFile, "utf8")
                )
                response
                  .writeHead(200, { "content-type": "application/json" })
                  .end(
                    Schema.encodeSync(Schema.fromJsonString(FixtureReply))({
                      jsonrpc: "2.0",
                      id: call.id,
                      result: state
                    })
                  )
              })()
              pending.add(operation)
              void operation.then(
                () => pending.delete(operation),
                (error: unknown) => {
                  pending.delete(operation)
                  failures.push(error)
                  response.destroy()
                }
              )
            })
          },
          "delayed-commit-private-fixture",
          await fixturePackageVersion()
        )
        const adapter = () => {
          const child = spawn(process.execPath, [bundle.path], {
            env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
          })
          const closed = once(child, "close")
          void closed.catch(() => {})
          child.stdin.on("error", () => {})
          child.stderr.resume()
          return { child, closed }
        }
        const original = adapter()
        const originalOutput: Array<Buffer> = []
        original.child.stdout.on("data", (bytes: Buffer) => originalOutput.push(bytes))
        let fresh: ReturnType<typeof adapter> | undefined
        let lines: ReturnType<typeof createInterface> | undefined
        try {
          original.child.stdin.write(
            `${Schema.encodeSync(Schema.fromJsonString(FixtureCall))({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "fixture_increment", arguments: {} }
            })}\n`
          )
          await bounded(Deferred.await(entered))
          expect(original.child.kill("SIGKILL")).toBe(true)
          expect(await bounded(Effect.promise(() => original.closed))).toEqual([null, "SIGKILL"])
          await bounded(Deferred.await(disconnected))
          expect(Buffer.concat(originalOutput).length).toBe(0)
          const reader = adapter()
          fresh = reader
          expect(reader.child.pid === original.child.pid).toBe(false)
          lines = createInterface({ input: reader.child.stdout })
          const incoming = lines[Symbol.asyncIterator]()
          const read = async (id: Schema.Schema.Type<typeof FixtureCall>["id"]) => {
            reader.child.stdin.write(
              `${Schema.encodeSync(Schema.fromJsonString(FixtureCall))({
                jsonrpc: "2.0",
                id,
                method: "tools/call",
                params: { name: "fixture_read", arguments: {} }
              })}\n`
            )
            const line = await bounded(Effect.promise(() => incoming.next()))
            expect(line.done).toBe(false)
            const reply = Schema.decodeUnknownSync(Schema.fromJsonString(FixtureReply))(line.value)
            expect(reply.id).toBe(id)
            return reply.result.writes
          }
          expect(await read(1)).toBe(0)
          await Effect.runPromise(Deferred.succeed(allowCommit, undefined))
          await bounded(Deferred.await(committed))
          expect(await read(2)).toBe(1)
          reader.child.stdin.end()
          expect(await bounded(Effect.promise(() => reader.closed))).toEqual([0, null])
          await bounded(Effect.promise(() => Promise.all([...pending])))
          expect(writeDispatches).toBe(1)
          expect(readDispatches).toBe(2)
          expect(failures).toEqual([])
        } finally {
          Effect.runSync(Deferred.succeed(allowCommit, undefined))
          for (const owned of [original, fresh]) {
            if (owned !== undefined && owned.child.exitCode === null && owned.child.signalCode === null) {
              owned.child.kill("SIGKILL")
              await bounded(Effect.promise(() => owned.closed))
            }
          }
          lines?.close()
          await Promise.allSettled([...pending])
          await fixture.cleanup()
        }
      })
      passed = true
    } finally {
      if (passed) await bundle.cleanup()
    }
  }
)
