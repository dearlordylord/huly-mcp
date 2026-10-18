import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"
import { Config, Effect, Option, Schema } from "effect"

import { ResidentDirectory, type PosixOwner } from "./protected-path.js"

const AbsoluteDirectory = ResidentDirectory.check(Schema.makeFilter(isAbsolute))
export const readManagedDirectory = Effect.fn("readManagedDirectory")(function* (platform: PosixOwner["platform"]) {
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
  return ResidentDirectory.make(join(base, "huly-mcp", "resident"))
})
