import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { Cause, Config, Effect, Exit, Fiber, Option, Result, Scope } from "effect"

import { withAdapterAttachment, withAdapterCandidate, type AdapterExchange } from "./adapter-attachment.js"
import { readResidentAttachment } from "./attachment-file.js"
import type { ResidentAttachment } from "./attachment-file.js"
import { decodeCurrentRegistryAttachment, openGenerationRegistry } from "./generation-registry.js"
import {
  CLAIM_RETRY_MILLIS,
  MAX_REGISTRY_RECORDS,
  registryCapacityFailure,
  ManagedLaunchError,
  MANAGED_FAILURE_CLEANUP_MILLIS,
  type ResidentStartupCapture
} from "./managed-contract.js"
import {
  currentPosixOwner,
  inspectPrivateDirectory,
  PRIVATE_DIRECTORY_MODE,
  type ProtectedFileError,
  ResidentDirectory,
  ResidentFilePath
} from "./protected-path.js"
import { acquireSelectionClaim, SelectionClaimError } from "./selection-claim.js"
import type { StartupBudget } from "./startup-budget.js"

const withSelectionOwnership = <A, E, R>(
  directory: ResidentDirectory,
  use: (claim: Effect.Success<ReturnType<typeof acquireSelectionClaim>>) => Effect.Effect<A, E, R>,
  startup?: StartupBudget
) =>
  Effect.gen(function* () {
    // Retry between atomic acquisition brackets so cancellation cannot strand a new claim.
    while (true) {
      if (startup !== undefined) yield* startup.within(Effect.void)
      const result = yield* Effect.acquireUseRelease(
        acquireSelectionClaim(directory).pipe(Effect.result),
        (attempt): Effect.Effect<Option.Option<A>, E | ProtectedFileError | SelectionClaimError, R> => {
          if (Result.isSuccess(attempt)) return use(attempt.success).pipe(Effect.map(Option.some))
          const error = attempt.failure
          return error instanceof SelectionClaimError && error.reason === "busy"
            ? Effect.succeed(Option.none<A>())
            : Effect.fail(error)
        },
        (attempt) => (Result.isSuccess(attempt) ? attempt.success.release : Effect.void)
      )
      if (Option.isSome(result)) return result.value
      const wait = Effect.sleep(CLAIM_RETRY_MILLIS)
      yield* startup === undefined ? wait : startup.within(wait)
    }
  })

export const prepareManagedDirectory = Effect.gen(function* () {
  const owner = yield* currentPosixOwner
  const requested = yield* Config.schema(ResidentDirectory, "MCP_RESIDENT_STATE_DIRECTORY").pipe(
    Config.withDefault(ResidentDirectory.make(join(tmpdir(), `huly-mcp-${owner.userId}`)))
  )
  const directory = ResidentDirectory.make(resolve(requested))
  yield* Effect.tryPromise({
    try: () => fs.mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE, recursive: true }),
    catch: () =>
      new ManagedLaunchError({ reason: "ownership", message: "Resident private directory could not be created" })
  })
  return yield* inspectPrivateDirectory(directory, owner)
})

// Internal resource capabilities; only the registry payload is serialized.
type SelectionOwnership = {
  readonly directory: ResidentDirectory
  readonly release: Effect.Effect<void, SelectionClaimError>
  readonly registry: Effect.Success<ReturnType<typeof openGenerationRegistry>>
}

export const withResidentSelection = <A, E, R, B, F, S>(options: {
  readonly directory: ResidentDirectory
  readonly capture: ResidentStartupCapture
  readonly startup: StartupBudget
  readonly existing: (file: ResidentFilePath, exchange: AdapterExchange) => Effect.Effect<A, E, R>
  readonly absent: (ownership: SelectionOwnership) => Effect.Effect<B, F, S>
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      return yield* withSelectionOwnership(
        options.directory,
        (claim) =>
          Effect.gen(function* () {
            const registry = yield* options.startup.within(openGenerationRegistry(options.directory))
            const records = yield* options.startup.within(registry.inventory)
            let selected: ResidentAttachment | undefined
            for (const record of records) {
              const descriptor = yield* options.startup.within(decodeCurrentRegistryAttachment(record.envelope))
              if (descriptor === undefined) continue
              const matched = yield* withAdapterCandidate(
                descriptor,
                options.capture.selection,
                () => Effect.succeed(descriptor),
                options.startup
              )
              if (Option.isSome(matched)) {
                if (selected !== undefined)
                  return yield* new ManagedLaunchError({
                    reason: "ownership",
                    message: "Multiple compatible resident generations are unresolved; replacement refused"
                  })
                selected = matched.value
              }
            }
            if (selected !== undefined) {
              const descriptor = selected
              return yield* withAdapterAttachment(
                descriptor,
                (exchange) =>
                  claim.release.pipe(
                    Effect.andThen(
                      options.existing(
                        ResidentFilePath.make(join(options.directory, `${descriptor.identity.generation}.json`)),
                        exchange
                      )
                    )
                  ),
                options.capture.selection,
                options.startup
              )
            }
            if (records.length === MAX_REGISTRY_RECORDS) return yield* registryCapacityFailure()
            return yield* options.absent({ directory: options.directory, registry, release: claim.release })
          }),
        options.startup
      )
    })
  )

export const runOwnedGeneration = <A, E, R>(
  ownership: SelectionOwnership,
  run: (
    ready: (
      file: ResidentFilePath
    ) => Effect.Effect<void, ManagedLaunchError | ProtectedFileError | SelectionClaimError>
  ) => Effect.Effect<A, E, R>
) =>
  Effect.acquireUseRelease(
    Scope.make(),
    (publicationScope) =>
      Effect.suspend(() => {
        type Publication =
          | { readonly kind: "unpublished" | "publishing" }
          | {
              readonly kind: "published"
              readonly receipt: Effect.Success<ReturnType<typeof ownership.registry.publish>>
            }
        let publication: Publication = { kind: "unpublished" }
        let closed = false
        const publish = (file: ResidentFilePath) =>
          Effect.gen(function* () {
            if (closed || publication.kind !== "unpublished")
              return yield* new ManagedLaunchError({
                reason: "protocol",
                message: "Resident generation publication is fenced or was already attempted"
              })
            publication = { kind: "publishing" }
            if (dirname(resolve(file)) !== ownership.directory)
              return yield* new ManagedLaunchError({
                reason: "ownership",
                message: "Resident readiness reported another owner's directory; publication refused"
              })
            const receipt = yield* ownership.registry.publish(yield* readResidentAttachment(file))
            publication = { kind: "published", receipt }
            yield* ownership.release
          })
        const ready = (file: ResidentFilePath) =>
          publish(file).pipe(Effect.forkIn(publicationScope), Effect.flatMap(Fiber.join))
        return run(ready).pipe(
          Effect.tap(() =>
            publication.kind === "published"
              ? Effect.void
              : Effect.fail(
                  new ManagedLaunchError({
                    reason: "protocol",
                    message: "Resident owner stopped before publishing authenticated application readiness"
                  })
                )
          ),
          Effect.onExit((exit) =>
            Effect.gen(function* () {
              closed = true
              yield* Scope.close(publicationScope, exit)
              if (publication.kind !== "published" || (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)))
                return
              const owned = publication.receipt
              yield* withSelectionOwnership(ownership.directory, () => owned.retire).pipe(
                Effect.interruptible,
                Effect.timeoutOrElse({
                  duration: MANAGED_FAILURE_CLEANUP_MILLIS,
                  orElse: () =>
                    Effect.fail(
                      new ManagedLaunchError({
                        reason: "retirement",
                        message: "Resident retirement was not confirmed; replacement remains blocked"
                      })
                    )
                })
              )
            })
          )
        )
      }),
    (scope) => Scope.close(scope, Exit.void)
  )
