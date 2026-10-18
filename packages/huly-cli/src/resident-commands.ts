import { Console, Effect, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"

import { readManagedDirectoryForOwner } from "../../../src/resident/managed-directory-config.js"
import { ManagedLaunchError } from "../../../src/resident/managed-contract.js"
import { currentPosixOwner, ProtectedFileError, ResidentDirectory } from "../../../src/resident/protected-path.js"
import { observeResidentState, ResidentStateStatus } from "../../../src/resident/state-status.js"
import { requestResidentStop, ResidentStopReport, ResidentStopTarget } from "../../../src/resident/operator-stop.js"
import { CliRuntimeError } from "./render.js"
import type { ResidentStatusObservation } from "../../../src/resident/status-contract.js"

const renderObservation = (observation: ResidentStatusObservation | undefined) => {
  if (observation?.kind !== "authenticated") return "observation=unavailable recovery=unverified"
  const { readiness, work } = observation.status
  return `observation=authenticated readiness=${readiness} admission=${work.admission} attachments=${work.attachments} pendingAdmissions=${work.pendingAdmissions} retainedRequests=${work.retainedRequests} blockedRequests=${work.blockedRequests} drain=${work.drain} retirement=unconfirmed`
}

const STATE_DIRECTORY_FLAG = "state-directory"
type ResidentStatusFailure =
  | Effect.Error<ReturnType<typeof readManagedDirectoryForOwner>>
  | Effect.Error<typeof currentPosixOwner>
  | Effect.Error<ReturnType<typeof observeResidentState>>
  | Schema.SchemaError
const statusFailure = (error: ResidentStatusFailure) =>
  new CliRuntimeError({
    kind: "input",
    message:
      error instanceof ManagedLaunchError || error instanceof ProtectedFileError
        ? error.message
        : "Resident ownership could not select a protected state directory. Check configuration and ownership; preserve unresolved state.",
    retryable: false
  })
const selectDirectory = Effect.fn("Resident.selectDirectory")(function* (requested: Option.Option<string>) {
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
      const status = yield* observeResidentState(selected).pipe(Effect.mapError(statusFailure))
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
                  `${generation.implementation.name}@${generation.implementation.version} generation=${generation.generation} pid=${generation.diagnostics.processId} liveness=${generation.liveness} ${renderObservation(generation.observation)}`
              )
            ]
      yield* Console.log([...lines, status.guidance].join("\n"))
    })
).pipe(
  Command.withDescription(
    "Show redacted ownership and authenticated generation readiness/work counts when available. Never starts or attaches a client; unavailable observations do not prove retirement or permit recovery."
  )
)

const stopCommand = Command.make(
  "stop",
  {
    generation: Flag.String("generation").pipe(
      Flag.withDescription("Exact generation UUID from resident status; never selects a replacement implicitly.")
    ),
    directory: Flag.String(STATE_DIRECTORY_FLAG).pipe(
      Flag.optional,
      Flag.withDescription("Use this existing protected ownership namespace.")
    ),
    json: Flag.Boolean("json").pipe(Flag.withDefault(false))
  },
  ({ directory, generation, json }) =>
    Effect.gen(function* () {
      const selected = yield* selectDirectory(directory)
      const target = yield* Schema.decodeUnknownEffect(ResidentStopTarget.fields.generation)(generation).pipe(
        Effect.mapError(
          () =>
            new CliRuntimeError({
              kind: "input",
              message: "Resident stop requires an exact generation UUID from resident status.",
              retryable: false
            })
        )
      )
      const result = yield* requestResidentStop({ directory: selected, generation: target }).pipe(
        Effect.mapError(
          (error) =>
            new CliRuntimeError({
              kind:
                error.reason === "target-missing"
                  ? "lookup"
                  : error.reason === "unsupported-wire"
                    ? "input"
                    : "conflict",
              message: error.message,
              retryable: false
            })
        )
      )
      if (result.kind === "unconfirmed")
        return yield* new CliRuntimeError({
          kind: "conflict",
          retryable: false,
          message: `Stop request for generation ${result.generation} may have been accepted; submission and retirement are unconfirmed. No request was retried. Preserve unresolved state; this is not permission to reset ownership or replay Huly operations.`
        })
      yield* Console.log(
        json
          ? yield* Schema.encodeEffect(Schema.fromJsonString(ResidentStopReport))(result).pipe(Effect.orDie)
          : `Stop accepted for generation ${result.generation}; retirement is unconfirmed.`
      )
    })
).pipe(
  Command.withDescription(
    "Request graceful stop of one exact managed generation. Exit zero confirms admission fencing only; retirement remains unconfirmed. Lost acknowledgment is a nonretryable conflict. Never resets state or starts a replacement."
  )
)

export const residentCommand = Command.make("resident").pipe(
  Command.withDescription("Inspect resident ownership or request a managed generation stop"),
  Command.withSubcommands([statusCommand, stopCommand])
)
export const residentStatusSkillSurface = `huly resident status [--${STATE_DIRECTORY_FLAG} <path>] [--json]`
export const residentStopSkillSurface = `huly resident stop --generation <uuid> [--${STATE_DIRECTORY_FLAG} <path>] [--json]`
