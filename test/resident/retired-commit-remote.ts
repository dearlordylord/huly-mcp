import { createServer } from "node:http"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { Deferred, Effect, Schema } from "effect"

import { RetiredCommitEndpoint, RetiredCommitRequest, RetiredCommitState } from "./retired-commit-observation.js"
import type { ResidentFilePath } from "../../src/resident/protected-path.js"

const HTTP_OK = 200

export const startRetiredCommitCounter = async (stateFile: ResidentFilePath) => {
  await fs.writeFile(stateFile, Schema.encodeSync(Schema.fromJsonString(RetiredCommitState))({ writes: 0 }), {
    mode: 0o600,
    flag: "wx"
  })
  const entered = Effect.runSync(Deferred.make<void>())
  const permit = Effect.runSync(Deferred.make<void>())
  const committed = Effect.runSync(Deferred.make<void>())
  const disconnected = Effect.runSync(Deferred.make<void>())
  const pending = new Set<Promise<void>>()
  const failures: Array<unknown> = []
  const dispatches = { writes: 0, reads: 0 }
  const server = createServer((request, response) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.once("end", () => {
      const operation = (async () => {
        const call = Schema.decodeUnknownSync(Schema.fromJsonString(RetiredCommitRequest))(
          Buffer.concat(chunks).toString("utf8")
        )
        if (call.operation === "increment") {
          dispatches.writes++
          response.once("close", () => Effect.runSync(Deferred.succeed(disconnected, undefined)))
          await Effect.runPromise(Deferred.succeed(entered, undefined))
          await Effect.runPromise(Deferred.await(permit))
          await fs.writeFile(stateFile, Schema.encodeSync(Schema.fromJsonString(RetiredCommitState))({ writes: 1 }))
          await Effect.runPromise(Deferred.succeed(committed, undefined))
        } else dispatches.reads++
        response.writeHead(HTTP_OK, { "content-type": "application/json" }).end(await fs.readFile(stateFile, "utf8"))
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
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Counter has no owned TCP listener")
  return {
    endpoint: Schema.decodeUnknownSync(RetiredCommitEndpoint)(`http://127.0.0.1:${address.port}/counter`),
    entered: Deferred.await(entered),
    disconnected: Deferred.await(disconnected),
    committed: Deferred.await(committed),
    commit: Deferred.succeed(permit, undefined),
    dispatches,
    failures,
    settle: () => Promise.all([...pending]),
    close: async () => {
      Effect.runSync(Deferred.succeed(permit, undefined))
      await Promise.allSettled([...pending])
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}
