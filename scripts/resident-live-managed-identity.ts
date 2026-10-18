import { join } from "node:path"
import { Effect, Schema } from "effect"

import { GetHulyContextResultSchema } from "../src/domain/schemas/huly-context.js"
import { readResidentAttachmentEnvelope } from "../src/resident/attachment-file.js"
import { ResidentDirectory, ResidentFilePath } from "../src/resident/protected-path.js"
import { openRegistryInventory } from "../src/resident/registry-inventory.js"
import type { HostMessage } from "../src/resident/request-headers.js"
import {
  type LiveReadClient,
  type ManagedLiveReadHostReceipt,
  LiveReadProbeError
} from "./resident-live-read-contract.js"

const CONTEXT_ID = 4
const ContextCall = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: GetHulyContextResultSchema })
})
// Internal request port; wire messages and the receipt remain schema-owned.
export type LiveReadContextRequest = (
  id: NonNullable<HostMessage["id"]>,
  method: "tools/call",
  params: Readonly<Record<string, Schema.Json>>
) => Effect.Effect<unknown, LiveReadProbeError>
export const captureManagedReadIdentity = Effect.fn("captureManagedReadIdentity")(
  function* (directory: ResidentDirectory, request: LiveReadContextRequest, client: LiveReadClient | undefined) {
    const context = yield* Schema.decodeUnknownEffect(ContextCall)(
      yield* request(CONTEXT_ID, "tools/call", { name: "get_huly_context", arguments: {} })
    )
    const exposure = context.structuredContent.result.toolExposure
    if (
      client !== undefined &&
      (exposure.configuredMode !== client.configuredMode || exposure.resolvedMode !== client.exposure)
    )
      return yield* new LiveReadProbeError({ phase: "ownership" })
    const port = context.structuredContent.result.transport.http?.port
    if (context.structuredContent.result.transport.type !== "http" || port === undefined)
      return yield* new LiveReadProbeError({ phase: "ownership" })
    const registry = yield* openRegistryInventory(ResidentDirectory.make(join(directory, "generations")))
    const records = yield* registry.inventory
    const [record] = records
    if (records.length !== 1 || record === undefined) return yield* new LiveReadProbeError({ phase: "ownership" })
    const descriptor = yield* readResidentAttachmentEnvelope(
      ResidentFilePath.make(join(directory, `${record.envelope.generation}.json`))
    )
    if (
      Number(descriptor.endpoint.port) !== port ||
      descriptor.identity.generation !== record.envelope.generation ||
      descriptor.implementation.version !== record.envelope.implementation.version
    )
      return yield* new LiveReadProbeError({ phase: "ownership" })
    return {
      exposure,
      mode: "managed",
      generation: descriptor.identity.generation,
      backendProcessId: record.envelope.diagnostics.processId
    } satisfies Pick<ManagedLiveReadHostReceipt, "mode" | "generation" | "backendProcessId" | "exposure">
  },
  Effect.mapError(() => new LiveReadProbeError({ phase: "ownership" }))
)
