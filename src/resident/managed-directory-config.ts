import * as fs from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { Config, Effect, Option, Result, Schema } from "effect"

import { ManagedLaunchError } from "./managed-contract.js"
import { ResidentDirectory, type PosixOwner } from "./protected-path.js"

const AbsoluteDirectory = ResidentDirectory.check(Schema.makeFilter(isAbsolute))
const MissingFile = Schema.Struct({ code: Schema.Literal("ENOENT") })

const refuseLegacyState = (directory: ResidentDirectory) =>
  Effect.gen(function* () {
    const occupied = yield* Effect.tryPromise({
      try: async () => {
        try {
          const handle = await fs.opendir(directory)
          try {
            return (await handle.read()) !== null
          } finally {
            await handle.close()
          }
        } catch (error) {
          if (Result.isSuccess(Schema.decodeUnknownResult(MissingFile)(error))) return false
          throw error
        }
      },
      catch: () =>
        new ManagedLaunchError({
          reason: "ownership",
          message: "Legacy resident state could not be inspected; no backend was started."
        })
    })
    if (occupied)
      return yield* new ManagedLaunchError({
        reason: "ownership",
        message:
          "Legacy temporary resident state exists. Stop and verify its owned processes before retiring that state and using the application-state default. No backend was started."
      })
  })

export const readManagedDirectory = Effect.fn("readManagedDirectory")(function* (
  platform: PosixOwner["platform"],
  legacyDirectory: ResidentDirectory
) {
  const explicit = yield* Config.option(Config.schema(ResidentDirectory, "MCP_RESIDENT_STATE_DIRECTORY"))
  if (Option.isSome(explicit)) return explicit.value
  const home = yield* Config.schema(AbsoluteDirectory, "HOME").pipe(
    Config.withDefault(ResidentDirectory.make(homedir()))
  )
  const base =
    platform === "darwin"
      ? join(home, "Library", "Application Support")
      : yield* Config.schema(Schema.String, "XDG_STATE_HOME").pipe(
          Config.withDefault(""),
          Effect.map((value) => (isAbsolute(value) ? value : join(home, ".local", "state")))
        )
  yield* refuseLegacyState(legacyDirectory)
  return ResidentDirectory.make(join(base, "huly-mcp", "resident"))
})

export const readManagedDirectoryForOwner = (owner: PosixOwner) =>
  readManagedDirectory(owner.platform, ResidentDirectory.make(join(tmpdir(), `huly-mcp-${owner.userId}`)))
