import { Effect } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  executeBoundedStdioShutdown,
  makeStdioShutdownCoordinator,
  type StdioShutdownReason,
  type StdioShutdownResources
} from "../../src/mcp/stdio-shutdown.js"
import { propertyTestParameters } from "../helpers/property.js"

const reasonArbitrary = fc.constantFrom<StdioShutdownReason>(
  "stdin-eof",
  "stdin-close",
  "sigint",
  "sigterm",
  "stop",
  "runtime-interruption"
)

describe("stdio shutdown coordinator properties", () => {
  it("keeps the first reason and performs cleanup at most once for every repeated trigger sequence", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(reasonArbitrary, { minLength: 1, maxLength: 30 }), async (reasons) => {
        const counts = { clients: 0, telemetry: 0, wire: 0 }
        const resources: StdioShutdownResources = {
          drain: Effect.void,
          closeWire: Effect.sync(() => {
            counts.wire++
          }),
          closeTelemetry: Effect.sync(() => {
            counts.telemetry++
          }),
          closeClients: Effect.sync(() => {
            counts.clients++
          }),
          forceExit: () => Effect.void,
          writeDiagnostic: () => Effect.void
        }

        const state = await Effect.runPromise(
          Effect.gen(function* () {
            const coordinator = yield* makeStdioShutdownCoordinator()
            for (const reason of reasons) yield* coordinator.request(reason)
            yield* Effect.all(
              [
                executeBoundedStdioShutdown(coordinator, resources),
                executeBoundedStdioShutdown(coordinator, resources),
                executeBoundedStdioShutdown(coordinator, resources)
              ],
              { concurrency: "unbounded", discard: true }
            )
            yield* executeBoundedStdioShutdown(coordinator, resources)
            return yield* coordinator.state
          })
        )

        expect(state).toEqual({ _tag: "Complete", outcome: "graceful", reason: reasons[0] })
        expect(counts).toEqual({ clients: 1, telemetry: 1, wire: 1 })
      }),
      propertyTestParameters
    )
  })
})
