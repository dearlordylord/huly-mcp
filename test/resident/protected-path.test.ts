import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { expect, it } from "vitest"

import { currentPosixOwner, inspectPrivateDirectory, ResidentDirectory } from "../../src/resident/protected-path.js"

const PRIVATE = 0o700
const SHARED_WRITE = 0o777

it("checks the canonical target of a trusted OS alias and refuses an unsafe ancestor", async () => {
  const owner = await Effect.runPromise(currentPosixOwner)
  const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-path-"))
  const target = join(directory, "target")
  const alias = join(directory, "alias")
  const child = join(target, "child")
  try {
    await fs.mkdir(target, { mode: PRIVATE })
    await fs.mkdir(child, { mode: PRIVATE })
    await fs.symlink(target, alias)
    await fs.chmod(target, SHARED_WRITE)
    await expect(Effect.runPromise(inspectPrivateDirectory(ResidentDirectory.make(child), owner))).rejects.toThrow(
      "private files and directories"
    )
    await fs.chmod(target, PRIVATE)
    const inspect = () =>
      Effect.runPromise(inspectPrivateDirectory(ResidentDirectory.make(join(alias, "child")), owner))
    if (owner.userId === 0) {
      expect(await inspect()).toBe(child)
      await fs.chmod(target, SHARED_WRITE)
      await expect(inspect()).rejects.toThrow("private files and directories")
      await fs.chmod(target, PRIVATE)
      await fs.lchown(alias, owner.userId + 1, owner.userId + 1)
    }
    await expect(inspect()).rejects.toThrow("private files and directories")
  } finally {
    await fs.chmod(target, PRIVATE)
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it.runIf(process.platform === "linux")("checks the canonical target of the root-owned run alias", async (context) => {
  const entry = await fs.lstat("/var/run").catch(() => undefined)
  if (entry === undefined || !entry.isSymbolicLink() || entry.uid !== 0)
    return context.skip("Requires a root-owned /var/run alias")
  const owner = await Effect.runPromise(currentPosixOwner)
  await expect(Effect.runPromise(inspectPrivateDirectory(ResidentDirectory.make("/var/run"), owner))).rejects.toThrow(
    "private files and directories"
  )
})
