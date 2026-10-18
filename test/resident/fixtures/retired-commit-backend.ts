import "../../../src/polyfills.js"
import { Effect, Logger, Ref, Schema } from "effect"

import { HulyError } from "../../../src/huly/errors.js"
import type { ToolRegistry } from "../../../src/mcp/tools/index.js"
import { defineTool } from "../../../src/mcp/tools/registry.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { runManagedFaultBackend } from "../../helpers/managed-fault-backend.js"
import {
  RetiredCommitEndpoint,
  RetiredCommitEvent,
  RetiredCommitOperation,
  RetiredCommitRequest,
  RetiredCommitState,
  retiredCommitToolName
} from "../retired-commit-observation.js"

const Input = Schema.Struct({ directory: ResidentDirectory, endpoint: RetiredCommitEndpoint })
const Empty = Schema.Struct({})
const emit = (event: RetiredCommitEvent) =>
  Schema.encodeEffect(Schema.fromJsonString(RetiredCommitEvent))(event).pipe(
    Effect.orDie,
    Effect.flatMap((line) => Effect.sync(() => process.stdout.write(`${line}\n`)))
  )
const main = Effect.gen(function* () {
  const input = yield* Schema.decodeUnknownEffect(Input)({ directory: process.argv[2], endpoint: process.argv[3] })
  const capture = yield* captureResidentSelection({ ...process.env })
  const counts = yield* Ref.make({ writes: 0, reads: 0 })
  const remote = (operation: RetiredCommitOperation) =>
    Effect.gen(function* () {
      yield* Ref.update(counts, (state) =>
        operation === "increment" ? { ...state, writes: state.writes + 1 } : { ...state, reads: state.reads + 1 }
      )
      const body = yield* Schema.encodeEffect(Schema.fromJsonString(RetiredCommitRequest))({ operation }).pipe(
        Effect.mapError(() => new HulyError({ message: "Fixture counter request invalid" }))
      )
      const reply = yield* Effect.tryPromise({
        try: async (signal) => {
          const response = await fetch(input.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal
          })
          const payload: unknown = await response.json()
          return { ok: response.ok, payload }
        },
        catch: () => new HulyError({ message: "Fixture remote counter unavailable" })
      })
      if (!reply.ok) return yield* new HulyError({ message: "Fixture counter refused the operation" })
      return yield* Schema.decodeUnknownEffect(RetiredCommitState)(reply.payload).pipe(
        Effect.mapError(() => new HulyError({ message: "Fixture counter reply invalid" }))
      )
    })
  const definitions = RetiredCommitOperation.literals.map((operation) =>
    defineTool(
      {
        name: retiredCommitToolName(operation),
        description: "Operate on the separately owned disposable remote counter.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        resultSchema: RetiredCommitState,
        category: "test"
      },
      Schema.decodeUnknownEffect(Empty),
      () => remote(operation)
    )
  )
  const tools = new Map<string, (typeof definitions)[number]>(definitions.map((tool) => [tool.name, tool]))
  const registry: ToolRegistry = {
    tools,
    definitions,
    handleToolCall: (name, args, huly, storage, workspace) =>
      tools.get(name)?.handler(args, huly, storage, workspace) ?? Promise.resolve(null)
  }
  yield* runManagedFaultBackend({
    directory: input.directory,
    capture,
    registry,
    close: () => Promise.resolve(),
    onReady: (attachment) => emit({ kind: "ready", generation: attachment.identity.generation })
  })
  yield* emit({ kind: "retired", ...(yield* Ref.get(counts)) })
}).pipe(Effect.scoped, Effect.provideService(Logger.LogToStderr, true))
void Effect.runPromise(main).catch(() => {
  process.stderr.write("Retired-commit fixture backend failed\n")
  process.exitCode = 1
})
