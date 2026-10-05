import { chmod, lstat, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { test, expect } from "vitest"
import { MovementStageReportSchema } from "../../src/mcp/movement-stage-observer.js"
import {
  makeFileMovementStageObserver,
  MovementObserverProcessSchema,
  MovementReportDirectorySchema
} from "../../src/mcp/movement-stage-report.js"
const privateDirectoryMode = 0o700
const publicDirectoryMode = 0o755
const privateFileMode = 0o600
const permissionMask = 0o777

for (const mode of ["owned", "public", "symlink", "wrong-owner"]) {
  test(`private movement report directory ${mode}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "movement-report-"))
    const link = `${directory}-link`
    try {
      await chmod(directory, mode === "public" ? publicDirectoryMode : privateDirectoryMode)
      if (mode === "symlink") await symlink(directory, link)
      const owner = (await lstat(directory)).uid
      const identity = Schema.decodeUnknownSync(MovementObserverProcessSchema)({
        processId: process.pid,
        userId: mode === "wrong-owner" ? owner + 1 : owner
      })
      const path = Schema.decodeUnknownSync(MovementReportDirectorySchema)(mode === "symlink" ? link : directory)
      const statuses: Array<string> = []
      const created = await Effect.runPromise(
        Effect.result(
          makeFileMovementStageObserver(path, identity, (line) => {
            statuses.push(line)
          })
        )
      )
      if (mode !== "owned") {
        expect(created._tag).toBe("Failure")
        expect(await readdir(directory)).toEqual([])
        return
      }
      if (created._tag !== "Success") throw new Error("Owned private directory was refused")
      expect(
        await Effect.runPromise(created.success(Effect.succeed("unchanged").pipe(Effect.withSpan("moveIssue"))))
      ).toBe("unchanged")
      const files = await readdir(directory)
      expect(files).toHaveLength(1)
      const file = join(directory, Schema.decodeUnknownSync(Schema.NonEmptyString)(files[0]))
      expect((await lstat(file)).mode & permissionMask).toBe(privateFileMode)
      const report = Schema.decodeUnknownSync(Schema.fromJsonString(MovementStageReportSchema))(
        await readFile(file, "utf8")
      )
      expect(report.stages.map((stage) => stage.stage)).toEqual(["moveIssue"])
      expect(statuses).toEqual(['{"observerStatus":"recorded"}'])
      await rm(directory, { recursive: true })
      expect(await Effect.runPromise(created.success(Effect.succeed("still unchanged")))).toBe("still unchanged")
      expect(statuses.at(-1)).toBe('{"observerStatus":"unavailable"}')
    } finally {
      await rm(link, { force: true })
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test("configuration codecs refuse relative report paths and invalid process identities", () => {
  expect(Schema.decodeUnknownOption(MovementReportDirectorySchema)("relative/private")._tag).toBe("None")
  for (const input of [
    { processId: -1, userId: 0 },
    { processId: 0, userId: -1 },
    { processId: 0.5, userId: 0 }
  ])
    expect(Schema.decodeUnknownOption(MovementObserverProcessSchema)(input)._tag).toBe("None")
})

for (const kind of ["missing", "broken-link", "noncanonical", "file"]) {
  test(`report configuration refuses ${kind} before observing an operation`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "movement-report-invalid-"))
    const entry = join(directory, "entry")
    try {
      await chmod(directory, privateDirectoryMode)
      if (kind === "broken-link") await symlink(join(directory, "absent"), entry)
      if (kind === "file") {
        await writeFile(entry, "private", { mode: privateDirectoryMode })
      }
      const owner = (await lstat(directory)).uid
      const identity = Schema.decodeUnknownSync(MovementObserverProcessSchema)({
        processId: process.pid,
        userId: owner
      })
      const path = Schema.decodeUnknownSync(MovementReportDirectorySchema)(
        kind === "noncanonical" ? `${directory}/.` : entry
      )
      const statuses: Array<string> = []
      const result = await Effect.runPromise(
        Effect.result(
          makeFileMovementStageObserver(path, identity, (line) => {
            statuses.push(line)
          })
        )
      )
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.phase).toBe("configuration")
      expect(statuses).toEqual([])
      expect((await readdir(directory)).filter((name) => name.startsWith("movement-"))).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
