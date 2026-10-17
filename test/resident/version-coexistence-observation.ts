import { Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { NativeHostObservation } from "./native-host-observation.js"

export const VersionCoexistenceObservation = Schema.Struct({
  implementations: Schema.Array(ResidentRegistryEnvelope.fields.implementation),
  artifacts: Schema.Array(
    Schema.Struct({
      implementation: ResidentRegistryEnvelope.fields.implementation,
      sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
    })
  ),
  generations: Schema.Array(ResidentRegistryEnvelope.fields.generation),
  parents: Schema.Array(NativeHostObservation),
  survivor: NativeHostObservation,
  survivorRecordUnchanged: Schema.Literal(true),
  backendsExited: Schema.Literal(true),
  privateStateRemoved: Schema.Literal(true)
})
