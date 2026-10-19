import { Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { ResidentDirectory, ResidentFilePath } from "../../src/resident/protected-path.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"
import { ModelWaitEvent, ModelWaitProtocol } from "./model-wait-contract.js"

export const MIXED_READERS = 2
export const FOREGROUND_INTERRUPT_EXIT = 130
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
export const MixedLaunchInput = Schema.Struct({
  bundle: ResidentPackagePath,
  host: ResidentPackagePath,
  directory: ResidentDirectory,
  protocol: ModelWaitProtocol
})
export const MixedLaunchReceipt = Schema.Struct({
  mcpSha256: Digest,
  hostSha256: Digest,
  driverSha256: Digest,
  protocol: ModelWaitProtocol,
  generation: ResidentRegistryEnvelope.fields.generation,
  explicit: Schema.Struct({
    processId: KernelOwnedExit.fields.processId,
    file: ResidentFilePath,
    exitCode: Schema.Literals([0, FOREGROUND_INTERRUPT_EXIT])
  }),
  readers: Schema.Tuple([ModelWaitEvent.cases.ready, ModelWaitEvent.cases.ready]),
  backend: Schema.Union([
    Schema.Struct({
      lifetime: Schema.Literal("foreground"),
      processId: KernelOwnedExit.fields.processId,
      exitCode: Schema.Literal(FOREGROUND_INTERRUPT_EXIT)
    }),
    Schema.Struct({
      lifetime: Schema.Literal("managed"),
      processId: KernelOwnedExit.fields.processId,
      exitCode: Schema.Literal(0)
    })
  ]),
  parentExits: Schema.Tuple([Schema.Literal(0), Schema.Literal(0)]),
  modelRequests: Schema.Literal(1),
  projectReads: Schema.Literal(MIXED_READERS),
  privateStateRemoved: Schema.Literal(true)
})
