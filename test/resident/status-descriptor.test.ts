import { randomUUID } from "node:crypto"
import { Effect, Exit, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { parseResidentStatusDescriptor } from "../../src/resident/status-descriptor.js"
import { registryAttachment } from "../helpers/resident-registry-fixture.js"

it("recognizes a known status descriptor across package versions while refusing inconsistent identities", async () => {
  const original = registryAttachment()
  const attachment = { ...original, implementation: { ...original.implementation, version: "other-package-version" } }
  const envelope = ResidentRegistryEnvelope.make({
    format: 1,
    implementation: attachment.implementation,
    generation: attachment.identity.generation,
    diagnostics: { processId: process.pid, parentProcessId: process.ppid },
    descriptor: Redacted.make(Schema.encodeSync(ResidentAttachment)(attachment))
  })
  expect(await Effect.runPromise(parseResidentStatusDescriptor(envelope))).toEqual(attachment)
  expect(
    await Effect.runPromise(
      parseResidentStatusDescriptor({ ...envelope, descriptor: Redacted.make({ futureWire: true }) })
    )
  ).toBeUndefined()
  for (const changed of [
    { ...envelope, implementation: { ...envelope.implementation, version: "mismatched-version" } },
    { ...envelope, generation: ResidentRegistryEnvelope.fields.generation.make(randomUUID()) }
  ])
    expect(Exit.isFailure(await Effect.runPromiseExit(parseResidentStatusDescriptor(changed)))).toBe(true)
})
