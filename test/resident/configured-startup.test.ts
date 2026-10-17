import { watch } from "node:fs"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Deferred, Effect, Fiber, Option, Schema } from "effect"
import { expect, it } from "vitest"

import { main } from "../../src/index.js"
import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { withAdapterAttachment } from "../../src/resident/adapter-attachment.js"
import { ResidentFilePath } from "../../src/resident/protected-path.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"

it("starts the configured entrypoint with the captured identity and policy", async () => {
  const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-configured-startup-"))
  const environment = {
    ...residentSelectionEnvironment(),
    MCP_TRANSPORT: "resident-http",
    MCP_RESIDENT_STATE_DIRECTORY: directory,
    TOOLS: "list_projects"
  }
  const original = new Map(Object.keys(environment).map((key) => [key, process.env[key]]))
  const published = Effect.runSync(Deferred.make<ResidentFilePath>())
  const watcher = watch(directory, (_event, filename) => {
    if (filename?.endsWith(".json")) {
      const file = Schema.decodeUnknownSync(ResidentFilePath)(join(directory, filename))
      Effect.runSync(Deferred.succeed(published, file))
    }
  })
  try {
    Object.assign(process.env, environment)
    await Effect.runPromise(
      Effect.gen(function* () {
        const captured = yield* captureResidentSelection(environment)
        const running = yield* main.pipe(Effect.forkScoped)
        const attachment = yield* readResidentAttachment(yield* Deferred.await(published))
        yield* withAdapterAttachment(
          attachment,
          (exchange) =>
            exchange(HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" }), Option.none(), (response) =>
              response.text.pipe(Effect.map(() => expect(response.status).toBe(200)))
            ),
          captured.selection
        )
        yield* Fiber.interrupt(running)
        expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
      }).pipe(
        Effect.scoped,
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(environment))),
        Effect.timeout("5 seconds")
      )
    )
  } finally {
    watcher.close()
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})
