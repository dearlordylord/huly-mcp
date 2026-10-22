import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { ResidentDirectory, ResidentFilePath } from "../../src/resident/protected-path.js"
import { registryAttachment } from "../helpers/resident-registry-fixture.js"
import { RegistryRetirementReport as Report } from "./registry-retirement-contract.js"
import { buildIsolatedProcessFixture } from "../helpers/process-fixture-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
const PREPARATION_BOUND = 30_000
let fixture: Awaited<ReturnType<typeof buildIsolatedProcessFixture>>
let preparation: ReturnType<typeof buildIsolatedProcessFixture> | undefined
beforeAll(async () => {
  preparation = buildIsolatedProcessFixture("test/resident/fixtures/registry-retirement-child.ts", PREPARATION_BOUND)
  fixture = await preparation
}, PREPARATION_BOUND)
afterAll(async () => {
  const owned = await preparation?.catch(() => undefined)
  await owned?.cleanup()
})
const observe = <A>(pending: Promise<A>, bound = 5_000) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(bound)))
const start = async (directory: ResidentDirectory, descriptor: ResidentFilePath) => {
  const child = spawn(process.execPath, [fixture.path, directory, descriptor], {
    stdio: ["ignore", "pipe", "inherit", "ipc"],
    env: testStdioEnvironment()
  })
  const closed = once(child, "close")
  void closed.catch(() => {})
  if (child.stdout === null) {
    child.kill("SIGKILL")
    await observe(closed, 7_000)
    throw new Error("Registry child stdout unavailable")
  }
  const lines = createInterface({ input: child.stdout })
  const iterator = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await observe(iterator.next())
    if (line.done) throw new Error("Registry owner closed without its report")
    return Schema.decodeUnknownSync(Report)(line.value)
  }
  return { child, closed, lines, next }
}

it.skipIf(process.platform === "win32")(
  "refuses late old-process retirement without removing a replacement registry record, including retry",
  { timeout: 20_000 },
  async () => {
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-retirement-process-"))
    const directory = ResidentDirectory.make(join(root, "state"))
    await fs.mkdir(directory, { mode: 0o700 })
    const descriptor = registryAttachment()
    const descriptorFile = ResidentFilePath.make(join(root, "descriptor.json"))
    await fs.writeFile(descriptorFile, Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))(descriptor), {
      flag: "wx",
      mode: 0o600
    })
    const children: Array<Awaited<ReturnType<typeof start>>> = []
    let primary: { readonly error: unknown } | undefined
    try {
      const original = await start(directory, descriptorFile)
      children.push(original)
      expect(await original.next()).toBe("published")
      const file = join(directory, "generations", `${descriptor.identity.generation}.json`)
      const saved = join(root, "original.json")
      const originalBytes = await fs.readFile(file)
      const originalIdentity = await fs.lstat(file, { bigint: true })
      await fs.rename(file, saved)
      const replacement = await start(directory, descriptorFile)
      children.push(replacement)
      expect(await replacement.next()).toBe("published")
      const before = await fs.readFile(file)
      const identity = await fs.lstat(file, { bigint: true })
      expect(identity.ino === originalIdentity.ino && identity.dev === originalIdentity.dev).toBe(false)
      original.child.send("retire")
      expect(await original.next()).toBe("refused")
      expect(await observe(original.closed, 7_000)).toEqual([0, null])
      expect((await fs.readFile(file)).equals(before)).toBe(true)
      const after = await fs.lstat(file, { bigint: true })
      expect({ dev: after.dev, ino: after.ino }).toEqual({ dev: identity.dev, ino: identity.ino })
      expect(replacement.child.exitCode).toBe(null)
      expect(replacement.child.signalCode).toBe(null)
      replacement.child.send("retire")
      expect(await replacement.next()).toBe("retired")
      expect(await observe(replacement.closed, 7_000)).toEqual([0, null])
      expect(await fs.readdir(directory)).toEqual([])
      expect((await fs.readFile(saved)).equals(originalBytes)).toBe(true)
    } catch (error) {
      primary = { error }
    }
    const cleanup = await Promise.allSettled(
      children.map(async (owner) => {
        if (owner.child.exitCode === null && owner.child.signalCode === null) owner.child.kill("SIGKILL")
        await observe(owner.closed, 7_000)
        owner.lines.close()
      })
    )
    const removals = cleanup.every((result) => result.status === "fulfilled")
      ? await Promise.allSettled([fs.rm(root, { recursive: true })])
      : []
    if (primary !== undefined) throw primary.error
    for (const result of [...cleanup, ...removals]) if (result.status === "rejected") throw result.reason
  }
)
