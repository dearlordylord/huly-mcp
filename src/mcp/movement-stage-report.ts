import { lstat, open, realpath } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { Effect, Schema } from "effect"
import {
  makeMovementStageObserver,
  MovementObserverError,
  MovementObserverStatusSchema,
  MovementStageReportSchema
} from "./movement-stage-observer.js"

export const MovementReportDirectorySchema = Schema.String.check(
  Schema.makeFilter((value) => isAbsolute(value), { message: "must be an absolute private directory" })
).pipe(Schema.brand("MovementReportDirectory"))
export const MovementObserverProcessSchema = Schema.Struct({
  processId: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)).pipe(
    Schema.brand("MovementObserverProcessId")
  ),
  userId: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)).pipe(
    Schema.brand("MovementObserverUserId")
  )
})
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const PERMISSION_MASK = 0o777
// Bootstrap owns the process identity and filesystem lifetime, not the observed domain operation.
export const makeFileMovementStageObserver = Effect.fn("makeFileMovementStageObserver")(function* (
  directory: Schema.Schema.Type<typeof MovementReportDirectorySchema>,
  identity: Schema.Schema.Type<typeof MovementObserverProcessSchema>,
  publishStatus: (line: string) => void
) {
  const info = yield* Effect.tryPromise({
    try: () => lstat(directory),
    catch: () => new MovementObserverError({ phase: "configuration" })
  })
  const canonical = yield* Effect.tryPromise({
    try: () => realpath(directory),
    catch: () => new MovementObserverError({ phase: "configuration" })
  })
  if (
    canonical !== directory ||
    info.uid !== identity.userId ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & PERMISSION_MASK) !== PRIVATE_DIRECTORY_MODE
  )
    return yield* Effect.fail(new MovementObserverError({ phase: "configuration" }))
  const state = { request: 0 }
  return makeMovementStageObserver({
    write: (report) =>
      Effect.tryPromise({
        try: async () => {
          const request = ++state.request
          const file = await open(
            join(directory, `movement-${identity.processId}-${request}.json`),
            "wx",
            PRIVATE_FILE_MODE
          )
          try {
            await file.writeFile(JSON.stringify(Schema.encodeSync(MovementStageReportSchema)(report)))
          } finally {
            await file.close()
          }
        },
        catch: () => new MovementObserverError({ phase: "report" })
      }),
    publishStatus: (status) =>
      Effect.sync(() => publishStatus(JSON.stringify(Schema.encodeSync(MovementObserverStatusSchema)(status))))
  })
})
