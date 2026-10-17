import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Exit, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { decodeCurrentRegistryAttachment, openGenerationRegistry } from "../../src/resident/generation-registry.js"
import {
  MAX_REGISTRY_BYTES,
  MAX_REGISTRY_RECORDS,
  ResidentRegistryEnvelope
} from "../../src/resident/managed-contract.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { registryAttachment, withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

it("refuses oversized publication before writing any locator or temporary file", async () =>
  withRegistryDirectory(async (root) => {
    const registry = await Effect.runPromise(openGenerationRegistry(root))
    const oversized = ResidentAttachment.make({
      ...registryAttachment(),
      authorization: Redacted.make("x".repeat(MAX_REGISTRY_BYTES))
    })
    expect(Exit.isFailure(await Effect.runPromiseExit(registry.publish(oversized)))).toBe(true)
    expect(await fs.readdir(join(root, "generations"))).toEqual([])
  }))

it("refuses current envelopes whose decoded descriptor changes generation or implementation", async () =>
  withRegistryDirectory(async (root) => {
    const registry = await Effect.runPromise(openGenerationRegistry(root))
    await Effect.runPromise(registry.publish(registryAttachment()))
    for (const { envelope } of await Effect.runPromise(registry.inventory)) {
      const other = registryAttachment()
      for (const descriptor of [
        other,
        {
          ...other,
          identity: { ...other.identity, generation: envelope.generation },
          implementation: { ...other.implementation, version: "incompatible" }
        }
      ]) {
        const encoded = Schema.encodeSync(ResidentAttachment)(descriptor)
        expect(
          Exit.isFailure(
            await Effect.runPromiseExit(
              decodeCurrentRegistryAttachment({ ...envelope, descriptor: Redacted.make(encoded) })
            )
          )
        ).toBe(true)
      }
    }
  }))

it("publishes a private complete record, decodes only the current generation, and retires once", async () =>
  withRegistryDirectory(async (root) => {
    const registry = await Effect.runPromise(openGenerationRegistry(root))
    const descriptor = registryAttachment()
    const owned = await Effect.runPromise(registry.publish(descriptor))
    expect((await fs.stat(owned.file)).mode & 0o077).toBe(0)
    expect((await fs.stat(join(root, "generations"))).mode & 0o077).toBe(0)
    const records = await Effect.runPromise(registry.inventory)
    expect(records).toHaveLength(1)
    for (const record of records) {
      expect(JSON.stringify(record.envelope.descriptor)).not.toContain("registry-fixture-private-authorization")
      const decoded = await Effect.runPromise(decodeCurrentRegistryAttachment(record.envelope))
      expect(decoded?.identity.generation).toBe(descriptor.identity.generation)
      expect(decoded === undefined ? undefined : Redacted.value(decoded.authorization)).toBe(
        Redacted.value(descriptor.authorization)
      )
      expect(
        await Effect.runPromise(
          decodeCurrentRegistryAttachment({
            ...record.envelope,
            implementation: { ...record.envelope.implementation, version: "incompatible" },
            descriptor: Redacted.make({ intentionally: "opaque old format" })
          })
        )
      ).toBeUndefined()
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            decodeCurrentRegistryAttachment({ ...record.envelope, descriptor: Redacted.make({ invalid: true }) })
          )
        )
      ).toBe(true)
    }
    expect(Exit.isFailure(await Effect.runPromiseExit(registry.publish(descriptor)))).toBe(true)
    await Effect.runPromise(owned.retire)
    await Effect.runPromise(owned.retire)
    expect(await fs.readdir(root)).toEqual([])
  }))

it("reports a replaced registry directory and never retries its consumed retirement", async () =>
  withRegistryDirectory(async (root) => {
    const registry = await Effect.runPromise(openGenerationRegistry(root))
    const owned = await Effect.runPromise(registry.publish(registryAttachment()))
    const directory = join(root, "generations")
    const moved = join(root, "moved-generations")
    await fs.rename(directory, moved)
    await fs.symlink(moved, directory, "dir")
    const error = await Effect.runPromise(Effect.flip(owned.retire))
    expect(error._tag).toBe("ManagedLaunchError")
    expect((await fs.lstat(directory)).isSymbolicLink()).toBe(true)
    expect(await fs.readdir(moved)).toEqual([])
    await fs.writeFile(owned.file, "later fixture entry", { flag: "wx", mode: 0o600 })
    await Effect.runPromise(owned.retire)
    expect(await fs.readFile(owned.file, "utf8")).toBe("later fixture entry")
  }))

it("refuses a seventeenth publication without changing the sixteen existing records", async () =>
  withRegistryDirectory(async (root) => {
    const registry = await Effect.runPromise(openGenerationRegistry(root))
    const receipts = []
    for (let index = 0; index < MAX_REGISTRY_RECORDS; index++)
      receipts.push(await Effect.runPromise(registry.publish(registryAttachment())))
    const error = await Effect.runPromise(Effect.flip(registry.publish(registryAttachment())))
    expect("reason" in error ? error.reason : undefined).toBe("capacity")
    expect(await Effect.runPromise(registry.inventory)).toHaveLength(MAX_REGISTRY_RECORDS)
    for (const receipt of receipts) await Effect.runPromise(receipt.retire)
    expect(await fs.readdir(root)).toEqual([])
  }))

it("never deletes a replacement through an old retirement capability, even on retry", async () =>
  withRegistryDirectory(async (root) => {
    const registry = await Effect.runPromise(openGenerationRegistry(root))
    const owned = await Effect.runPromise(registry.publish(registryAttachment()))
    await fs.rename(owned.file, `${owned.file}.original`)
    await fs.writeFile(owned.file, "replacement", { flag: "wx", mode: 0o600 })
    expect(Exit.isFailure(await Effect.runPromiseExit(owned.retire))).toBe(true)
    await Effect.runPromise(owned.retire)
    expect(await fs.readFile(owned.file, "utf8")).toBe("replacement")
  }))

for (const fault of [
  "unknown-format",
  "wrong-generation",
  "malformed",
  "oversized",
  "invalid-utf8",
  "symlink",
  "unexpected-entry",
  "seventeen"
]) {
  it(`blocks unresolved registry inventory: ${fault}`, async () =>
    withRegistryDirectory(async (root) => {
      const registry = await Effect.runPromise(openGenerationRegistry(root))
      const receipt = await Effect.runPromise(registry.publish(registryAttachment()))
      const record = Schema.encodeSync(ResidentRegistryEnvelope)(
        Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
          await fs.readFile(receipt.file, "utf8")
        )
      )
      switch (fault) {
        case "unknown-format":
          await fs.writeFile(receipt.file, JSON.stringify({ ...record, format: 2 }))
          break
        case "wrong-generation":
          await fs.writeFile(receipt.file, JSON.stringify({ ...record, generation: randomUUID() }))
          break
        case "malformed":
          await fs.writeFile(receipt.file, "{")
          break
        case "oversized":
          await fs.writeFile(receipt.file, " ".repeat(65_537))
          break
        case "invalid-utf8":
          await fs.writeFile(receipt.file, Buffer.from([0xff]))
          break
        case "symlink":
          await fs.rename(receipt.file, `${receipt.file}.saved`)
          await fs.symlink(`${receipt.file}.saved`, receipt.file)
          break
        case "unexpected-entry":
          await fs.mkdir(join(root, "generations", "foreign"))
          break
        case "seventeen":
          for (let index = 1; index < 17; index++)
            await fs.writeFile(join(root, "generations", `${randomUUID()}.json`), "{}", { mode: 0o600 })
      }
      expect(Exit.isFailure(await Effect.runPromiseExit(registry.inventory))).toBe(true)
      expect(await fs.stat(root)).toBeDefined()
    }))
}
