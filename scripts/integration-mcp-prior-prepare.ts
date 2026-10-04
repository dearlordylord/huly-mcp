import { Effect, Schema } from "effect"
import { captureIntegrationMcpDiscovery, type ProcessOptions } from "./integration-mcp-call.js"
import { makePriorIdentity, writePriorCache, IntegrationMcpPriorError } from "./integration-mcp-prior.js"
const Directory = Schema.NonEmptyString
export const prepareIntegrationMcpPrior = (directory: unknown, options: ProcessOptions) =>
  Effect.gen(function* () {
    const parsedDirectory = yield* Schema.decodeUnknownEffect(Directory)(directory).pipe(
      Effect.mapError(() => new IntegrationMcpPriorError({ phase: "permissions" }))
    )
    const identity = yield* makePriorIdentity(options)
    const discover = yield* Effect.tryPromise({
      try: () => captureIntegrationMcpDiscovery(options),
      catch: () => new IntegrationMcpPriorError({ phase: "cache" })
    })
    // Identity must remain unchanged across the read-only preparation process.
    const currentIdentity = yield* makePriorIdentity(options)
    if (JSON.stringify(identity) !== JSON.stringify(currentIdentity))
      return yield* Effect.fail(new IntegrationMcpPriorError({ phase: "identity" }))
    return yield* writePriorCache(parsedDirectory, identity, discover)
  }).pipe(
    Effect.timeout("80 seconds"),
    Effect.mapError(() => new IntegrationMcpPriorError({ phase: "cache" }))
  )
