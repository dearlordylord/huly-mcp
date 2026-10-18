import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Exit, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { withSelectionClaim } from "../../src/resident/selection-claim.js"
import { inspectResidentState, observeResidentState, ResidentStateStatus } from "../../src/resident/state-status.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

import { withPublishedResidentState } from "../helpers/resident-status-fixture.js"

const OVERFULL_STATUS_ENTRIES = 100

it("observes missing and empty namespaces without creating ownership directories", async () =>
  withRegistryDirectory(async (directory) => {
    const absent = await Effect.runPromise(inspectResidentState(ResidentDirectory.make(join(directory, "absent"))))
    expect(absent.state).toBe("absent")
    expect(absent.guidance).toContain("does not prove")
    expect(await fs.readdir(directory)).toEqual([])
    expect(await Effect.runPromise(inspectResidentState(directory))).toMatchObject({
      state: "observed",
      claim: "absent",
      generations: []
    })
    expect(await fs.readdir(directory)).toEqual([])
  }))

it("reports protected metadata and unresolved claims while omitting every private descriptor field", async () =>
  withPublishedResidentState(async (directory, file, attachment) => {
    const original = await fs.readFile(file, "utf8")
    const names = await fs.readdir(directory)
    const status = await Effect.runPromise(withSelectionClaim(directory, inspectResidentState(directory)))
    expect(status).toMatchObject({
      state: "observed",
      claim: "present-unverified",
      generations: [
        {
          implementation: attachment.implementation,
          generation: attachment.identity.generation,
          diagnostics: { processId: process.pid },
          liveness: "unverified"
        }
      ]
    })
    const encoded = Schema.encodeSync(Schema.fromJsonString(ResidentStateStatus))(status)
    for (const secret of [
      Redacted.value(attachment.identity.key),
      Redacted.value(attachment.authorization),
      attachment.endpoint.href,
      "authorization",
      "descriptor"
    ])
      expect(encoded.includes(secret)).toBe(false)
    expect(await fs.readFile(file, "utf8")).toBe(original)
    expect(await fs.readdir(directory)).toEqual(names)
  }))

it("keeps another implementation version opaque and does not claim it is healthy", async () =>
  withPublishedResidentState(async (directory, file) => {
    const original = await fs.readFile(file, "utf8")
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    await fs.writeFile(
      file,
      Schema.encodeSync(Schema.fromJsonString(ResidentRegistryEnvelope))({
        ...envelope,
        implementation: { ...envelope.implementation, version: "other-implementation" },
        descriptor: Redacted.make({ privateFuturePayload: "must-not-escape" })
      })
    )
    const status = await Effect.runPromise(observeResidentState(directory))
    expect(status).toMatchObject({
      state: "observed",
      generations: [
        {
          observation: { kind: "unavailable", recovery: "unverified" },
          implementation: { version: "other-implementation" },
          liveness: "unverified"
        }
      ]
    })
    expect(Schema.encodeSync(Schema.fromJsonString(ResidentStateStatus))(status)).not.toContain("must-not-escape")
  }))

it("refuses a non-private descriptor without repairing its permissions", async () =>
  withPublishedResidentState(async (directory, _record, attachment) => {
    const descriptor = join(directory, `${attachment.identity.generation}.json`)
    await fs.chmod(descriptor, 0o644)
    try {
      expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
      expect((await fs.stat(descriptor)).mode & 0o777).toBe(0o644)
    } finally {
      await fs.chmod(descriptor, 0o600)
    }
  }))

it("refuses corrupt records without changing their bytes", async () =>
  withPublishedResidentState(async (directory, file) => {
    await fs.writeFile(file, "corrupt private record")
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    expect(await fs.readFile(file, "utf8")).toBe("corrupt private record")
  }))

it("refuses missing expected generation or descriptor records without repairing them", async () =>
  withPublishedResidentState(async (directory, file, attachment) => {
    const preserved = await fs.mkdtemp(join(directory, "..", "resident-status-preserved-"))
    try {
      for (const missing of [file, join(directory, `${attachment.identity.generation}.json`)]) {
        const moved = join(preserved, "record")
        await fs.rename(missing, moved)
        try {
          expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
          await expect(fs.lstat(missing)).rejects.toMatchObject({ code: "ENOENT" })
        } finally {
          await fs.rename(moved, missing)
        }
      }
    } finally {
      await fs.rmdir(preserved)
    }
  }))

it("refuses unknown entries, malformed generation names and symbolic registry directories", async () =>
  withRegistryDirectory(async (directory) => {
    for (const name of ["unexpected", "not-a-generation.json"]) {
      const file = join(directory, name)
      await fs.writeFile(file, "untouched")
      expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
      expect(await fs.readFile(file, "utf8")).toBe("untouched")
      await fs.unlink(file)
    }
    await fs.mkdir(join(directory, "unexpected-directory"), { mode: 0o700 })
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    await fs.rmdir(join(directory, "unexpected-directory"))
    await fs.symlink(directory, join(directory, "generations"), "dir")
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    expect((await fs.lstat(join(directory, "generations"))).isSymbolicLink()).toBe(true)
  }))

it("refuses non-private roots and claims without changing their permissions", async () =>
  withRegistryDirectory(async (directory) => {
    await fs.mkdir(join(directory, "selection.claim"), { mode: 0o755 })
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    expect((await fs.stat(join(directory, "selection.claim"))).mode & 0o777).toBe(0o755)
    await fs.rmdir(join(directory, "selection.claim"))
    await fs.mkdir(join(directory, ".attachment-unsafe"), { mode: 0o755 })
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    expect((await fs.stat(join(directory, ".attachment-unsafe"))).mode & 0o777).toBe(0o755)
    await fs.rmdir(join(directory, ".attachment-unsafe"))
    await fs.chmod(directory, 0o755)
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    expect((await fs.stat(directory)).mode & 0o777).toBe(0o755)
  }))

it("bounds inspection of an overfull root and preserves every entry", async () =>
  withRegistryDirectory(async (directory) => {
    const names = Array.from({ length: OVERFULL_STATUS_ENTRIES }, () => `${randomUUID()}.json`)
    await Promise.all(names.map((name) => fs.writeFile(join(directory, name), "untouched")))
    expect(Exit.isFailure(await Effect.runPromiseExit(inspectResidentState(directory)))).toBe(true)
    expect((await fs.readdir(directory)).sort()).toEqual(names.sort())
  }))

it("does not mistake a non-directory ancestor for absent ownership state", async () =>
  withRegistryDirectory(async (directory) => {
    const ancestor = join(directory, "owner-state-file")
    await fs.writeFile(ancestor, "preserve unresolved ancestor", { mode: 0o600 })
    const result = await Effect.runPromiseExit(inspectResidentState(ResidentDirectory.make(join(ancestor, "resident"))))
    expect(Exit.isFailure(result)).toBe(true)
    expect(await fs.readFile(ancestor, "utf8")).toBe("preserve unresolved ancestor")
    expect(await fs.readdir(directory)).toEqual(["owner-state-file"])
  }))
