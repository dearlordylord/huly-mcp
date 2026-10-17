import { Console, Effect, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"

import { readManagedDirectoryForOwner } from "../../../src/resident/managed-directory-config.js"
import { ManagedLaunchError } from "../../../src/resident/managed-contract.js"
import { currentPosixOwner, ProtectedFileError, ResidentDirectory } from "../../../src/resident/protected-path.js"
import { inspectResidentState, ResidentStateStatus } from "../../../src/resident/state-status.js"
import { CliRuntimeError } from "./render.js"

const STATE_DIRECTORY_FLAG = "state-directory"
type ResidentStatusFailure =
  | Effect.Error<ReturnType<typeof readManagedDirectoryForOwner>>
  | Effect.Error<typeof currentPosixOwner>
  | Effect.Error<ReturnType<typeof inspectResidentState>>
  | Schema.SchemaError
const statusFailure = (error: ResidentStatusFailure) =>
  new CliRuntimeError({
    kind: "input",
    message:
      error instanceof ManagedLaunchError || error instanceof ProtectedFileError
        ? error.message
        : "Resident status could not select a protected state directory. Check configuration and ownership; preserve unresolved state.",
    retryable: false
  })
const selectDirectory = Effect.fn("ResidentStatus.selectDirectory")(function* (requested: Option.Option<string>) {
  if (Option.isSome(requested)) return yield* Schema.decodeUnknownEffect(ResidentDirectory)(requested.value)
  const owner = yield* currentPosixOwner
  return yield* readManagedDirectoryForOwner(owner)
}, Effect.mapError(statusFailure))

const statusCommand = Command.make(
  "status",
  {
    directory: Flag.String(STATE_DIRECTORY_FLAG).pipe(
      Flag.optional,
      Flag.withDescription("Use this ownership namespace instead of the managed state-directory configuration.")
    ),
    json: Flag.Boolean("json").pipe(Flag.withDefault(false))
  },
  ({ directory, json }) =>
    Effect.gen(function* () {
      const selected = yield* selectDirectory(directory)
      const status = yield* inspectResidentState(selected).pipe(Effect.mapError(statusFailure))
      if (json)
        return yield* Console.log(
          yield* Schema.encodeEffect(Schema.fromJsonString(ResidentStateStatus))(status).pipe(Effect.orDie)
        )
      const lines =
        status.state === "absent"
          ? ["Resident state: absent"]
          : [
              "Resident state: observed",
              `Selection claim: ${status.claim}`,
              ...status.generations.map(
                (generation) =>
                  `${generation.implementation.name}@${generation.implementation.version} generation=${generation.generation} pid=${generation.diagnostics.processId} liveness=${generation.liveness}`
              )
            ]
      yield* Console.log([...lines, status.guidance].join("\n"))
    })
).pipe(
  Command.withDescription(
    "Show redacted resident ownership records and unresolved claims. Liveness and retirement remain unverified."
  )
)

export const residentCommand = Command.make("resident").pipe(
  Command.withDescription("Inspect local resident backend ownership"),
  Command.withSubcommands([statusCommand])
)
export const residentStatusSkillSurface = `huly resident status [--${STATE_DIRECTORY_FLAG} <path>] [--json]`
