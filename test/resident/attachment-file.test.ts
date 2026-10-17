import { randomBytes, randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { Deferred, Effect, Exit, Fiber, Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import {
  readResidentAttachment,
  ResidentAttachment,
  withPublishedResidentAttachment
} from "../../src/resident/attachment-file.js"
import { ProtectedFileError, ResidentDirectory, ResidentFilePath } from "../../src/resident/protected-path.js"
import { VERSION } from "../../src/version.js"

const KEY_BYTES = 32
const GROUP_READABLE = 0o640
const PRIVATE_FILE = 0o600
const FOREIGN_DIRECTORY = 0o755
const OTHER_BITS = 0o077
const TOO_LARGE = 65_537

const attachment = () =>
  Schema.decodeUnknownSync(ResidentAttachment)({
    version: 1,
    transport: "tls13-external-psk-v1",
    implementation: { name: "@firfi/huly-mcp", version: VERSION },
    endpoint: "https://127.0.0.1:4321/mcp",
    identity: { generation: randomUUID(), key: randomBytes(KEY_BYTES).toString("hex") },
    authorization: "private-file-fixture-authorization"
  })

const withDirectory = async (use: (directory: ResidentDirectory) => Promise<void>) => {
  const directory = ResidentDirectory.make(
    await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), "resident-attachment-"))
  )
  try {
    await use(directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const refusal = async (file: ResidentFilePath) => {
  const result = await Effect.runPromise(Effect.result(readResidentAttachment(file)))
  if (Result.isSuccess(result)) throw new Error("Expected attachment refusal")
  return result.failure
}

it("publishes a complete private generation descriptor and releases only its owned file", async () =>
  withDirectory(async (root) => {
    const descriptor = attachment()
    const directory = ResidentDirectory.make(path.join(root, "state"))
    await Effect.runPromise(
      withPublishedResidentAttachment(directory, descriptor, (file) =>
        Effect.promise(async () => {
          const loaded = await Effect.runPromise(readResidentAttachment(file))
          expect(loaded.identity.generation).toBe(descriptor.identity.generation)
          expect(loaded.endpoint.href).toBe(descriptor.endpoint.href)
          expect(Redacted.value(loaded.identity.key) === Redacted.value(descriptor.identity.key)).toBe(true)
          expect(Redacted.value(loaded.authorization) === Redacted.value(descriptor.authorization)).toBe(true)
          expect((await fs.stat(file)).mode & OTHER_BITS).toBe(0)
          expect((await fs.stat(directory)).mode & OTHER_BITS).toBe(0)
          expect(path.basename(file)).toBe(`${descriptor.identity.generation}.json`)
          expect((await refusal(ResidentFilePath.make(path.join(directory, "missing.json")))).kind).toBe("io")
        })
      )
    )
    expect(await fs.readdir(directory)).toEqual([])
  }))

it("refuses permissive files, symlinks, invalid bytes and oversized descriptors", async () =>
  withDirectory(async (root) => {
    await Effect.runPromise(
      withPublishedResidentAttachment(root, attachment(), (file) =>
        Effect.promise(async () => {
          const saved = await fs.readFile(file)
          await fs.chmod(file, GROUP_READABLE)
          expect((await refusal(file)).kind).toBe("permission")
          await fs.chmod(file, PRIVATE_FILE)
          const link = ResidentFilePath.make(path.join(root, "linked.json"))
          await fs.symlink(file, link)
          expect((await refusal(link)).kind).toBe("permission")
          await fs.unlink(link)
          await fs.writeFile(file, Buffer.from([0xff]))
          expect((await refusal(file)).kind).toBe("input")
          await fs.writeFile(file, " ".repeat(TOO_LARGE))
          expect((await refusal(file)).kind).toBe("input")
          await fs.writeFile(file, saved)
        })
      )
    )
  }))

it("does not overwrite a published generation and detects a replacement installed before cleanup", async () =>
  withDirectory(async (root) => {
    const descriptor = attachment()
    const exit = await Effect.runPromiseExit(
      withPublishedResidentAttachment(root, descriptor, (file) =>
        Effect.promise(async () => {
          const duplicate = await Effect.runPromiseExit(
            withPublishedResidentAttachment(root, descriptor, () => Effect.void)
          )
          expect(Exit.isFailure(duplicate)).toBe(true)
          expect((await Effect.runPromise(readResidentAttachment(file))).identity.generation).toBe(
            descriptor.identity.generation
          )
          await fs.unlink(file)
          await fs.writeFile(file, "replacement state", { flag: "wx", mode: PRIVATE_FILE })
        })
      )
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(await fs.readFile(path.join(root, `${descriptor.identity.generation}.json`), "utf8")).toBe(
      "replacement state"
    )
  }))

it("refuses a non-private parent instead of changing its permissions", async () =>
  withDirectory(async (root) => {
    await fs.chmod(root, FOREIGN_DIRECTORY)
    const result = await Effect.runPromise(
      Effect.result(withPublishedResidentAttachment(root, attachment(), () => Effect.void))
    )
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(ProtectedFileError)
    expect((await fs.stat(root)).mode & OTHER_BITS).not.toBe(0)
    expect(await fs.readdir(root)).toEqual([])
  }))

it("refuses a copied generation name and incompatible package without exposing descriptor secrets", async () =>
  withDirectory(async (root) => {
    const descriptor = attachment()
    await Effect.runPromise(
      withPublishedResidentAttachment(root, descriptor, (file) =>
        Effect.promise(async () => {
          const copied = ResidentFilePath.make(path.join(root, `${randomUUID()}.json`))
          await fs.copyFile(file, copied)
          expect((await refusal(copied)).kind).toBe("input")
          await fs.unlink(copied)
          const saved = await fs.readFile(file, "utf8")
          await fs.writeFile(file, saved.replace(`"version":"${VERSION}"`, '"version":"incompatible"'))
          const rejected = await refusal(file)
          expect(rejected.kind).toBe("input")
          expect(rejected.message.includes(Redacted.value(descriptor.authorization))).toBe(false)
          expect(rejected.message.includes(Redacted.value(descriptor.identity.key))).toBe(false)
          await fs.writeFile(file, saved)
        })
      )
    )
  }))

it("removes its published descriptor and temporary file when the owner is interrupted", async () =>
  withDirectory(async (root) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const published = yield* Deferred.make<ResidentFilePath>()
        const owner = yield* withPublishedResidentAttachment(root, attachment(), (file) =>
          Deferred.succeed(published, file).pipe(Effect.andThen(Effect.never))
        ).pipe(Effect.forkScoped)
        const file = yield* Deferred.await(published)
        yield* readResidentAttachment(file)
        yield* Fiber.interrupt(owner)
      }).pipe(Effect.scoped)
    )
    expect(await fs.readdir(root)).toEqual([])
  }))

it("refuses oversized publication before creating generation state", async () =>
  withDirectory(async (directory) => {
    const descriptor = ResidentAttachment.make({ ...attachment(), authorization: Redacted.make("x".repeat(TOO_LARGE)) })
    const outcome = await Effect.runPromise(
      Effect.result(
        withPublishedResidentAttachment(directory, descriptor, () =>
          Effect.die("Oversized descriptor must not be published")
        )
      )
    )
    expect(Result.isFailure(outcome) && outcome.failure.kind).toBe("input")
    expect(await fs.readdir(directory)).toEqual([])
  }))
