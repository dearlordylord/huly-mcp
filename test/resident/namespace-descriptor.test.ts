import * as fs from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Exit, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { readResidentNamespace } from "../../src/resident/namespace-inventory.js"
import { ResidentEndpoint } from "../../src/resident/tls-channel.js"
import { withPublishedResidentState } from "../helpers/resident-status-fixture.js"

const Mutation = Schema.Literals(["malformed", "authorization", "tls-key", "endpoint", "generation"])
const change = (attachment: ResidentAttachment, mutation: Schema.Schema.Type<typeof Mutation>) => {
  switch (mutation) {
    case "malformed":
      return "corrupt fixture locator"
    case "authorization":
      return Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))({
        ...attachment,
        authorization: Redacted.make("different-fixture-authorization")
      })
    case "tls-key":
      return Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))({
        ...attachment,
        identity: {
          ...attachment.identity,
          key: Redacted.make(Redacted.value(attachment.identity.key).startsWith("f") ? "0".repeat(64) : "f".repeat(64))
        }
      })
    case "endpoint":
      return Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))({
        ...attachment,
        endpoint: Schema.decodeUnknownSync(ResidentEndpoint)("https://127.0.0.1:1/mcp")
      })
    case "generation":
      return Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))({
        ...attachment,
        identity: {
          ...attachment.identity,
          generation: Schema.decodeUnknownSync(ResidentAttachment.fields.identity.fields.generation)(randomUUID())
        }
      })
  }
}
for (const mutation of Mutation.literals) {
  it(`refuses a ${mutation} locator without changing either metadata copy`, async () =>
    withPublishedResidentState(async (directory, record, attachment) => {
      const file = join(directory, `${attachment.identity.generation}.json`)
      const original = await fs.readFile(file, "utf8")
      const registry = await fs.readFile(record, "utf8")
      const changed = change(attachment, mutation)
      await fs.writeFile(file, changed)
      try {
        expect(Exit.isFailure(await Effect.runPromiseExit(readResidentNamespace(directory)))).toBe(true)
        expect((await fs.readFile(file, "utf8")) === changed).toBe(true)
        expect((await fs.readFile(record, "utf8")) === registry).toBe(true)
      } finally {
        await fs.writeFile(file, original)
      }
    }))
}

it("accepts equivalent independently parsed metadata with harmless whitespace differences", async () =>
  withPublishedResidentState(async (directory, _record, attachment) => {
    const file = join(directory, `${attachment.identity.generation}.json`)
    await fs.writeFile(file, JSON.stringify(Schema.encodeSync(ResidentAttachment)(attachment), null, 2))
    const snapshot = await Effect.runPromise(readResidentNamespace(directory))
    expect(snapshot.records).toHaveLength(1)
  }))

it("keeps a foreign implementation's registry and locator payloads opaque", async () =>
  withPublishedResidentState(async (directory, record, attachment) => {
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
      await fs.readFile(record, "utf8")
    )
    await fs.writeFile(
      record,
      Schema.encodeSync(Schema.fromJsonString(ResidentRegistryEnvelope))({
        ...envelope,
        implementation: { ...envelope.implementation, version: "foreign-fixture-implementation" },
        descriptor: Redacted.make({ unknownFutureFormat: true })
      })
    )
    const locator = join(directory, `${attachment.identity.generation}.json`)
    await fs.writeFile(locator, "opaque future locator bytes")
    const snapshot = await Effect.runPromise(readResidentNamespace(directory))
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.currentDescriptors).toEqual([])
    expect(await fs.readFile(locator, "utf8")).toBe("opaque future locator bytes")
  }))
