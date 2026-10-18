import { Effect, Option, Redacted, Schema } from "effect"

import { ResidentAttachment } from "./attachment-file.js"
import type { ResidentRegistryEnvelope } from "./managed-contract.js"
import { registryFailure } from "./registry-inventory.js"

/** Status negotiates its own wire; it does not grant managed attachment compatibility. */
export const parseResidentStatusDescriptor = Effect.fn("parseResidentStatusDescriptor")(function* (
  envelope: ResidentRegistryEnvelope
) {
  const decoded = Schema.decodeUnknownOption(ResidentAttachment)(Redacted.value(envelope.descriptor))
  if (Option.isNone(decoded)) return undefined
  const descriptor = decoded.value
  if (
    descriptor.implementation.version !== envelope.implementation.version ||
    descriptor.identity.generation !== envelope.generation
  )
    return yield* registryFailure()
  return descriptor
})
