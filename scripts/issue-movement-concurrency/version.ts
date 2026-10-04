import { Effect, Schema } from "effect"
import { WorkspaceInfoSchema } from "../../src/domain/schemas/workspace.js"
import { NonEmptyString, UrlString, WorkspaceVersion } from "../../src/domain/schemas/shared.js"
import { runPublic } from "./public-process.js"
import { FixtureBoundaryError } from "./fixture-errors.js"
import { makeServerVersionEvidence, readDeploymentVersion } from "./version-evidence.js"

const VERSION_READ_TIMEOUT_MS = 30_000
const upstream = Schema.decodeUnknownSync(UrlString)(process.argv[2])
void Effect.runPromise(
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: (signal) =>
        runPublic(["packages/huly-cli/dist/index.cjs", "workspace", "info", "get", "--json"], upstream, signal),
      catch: () =>
        new FixtureBoundaryError({
          stage: "version-read",
          reason: NonEmptyString.make("Public workspace version request unavailable")
        })
    })
    const workspace = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(WorkspaceInfoSchema))(result).pipe(
      Effect.mapError(
        () =>
          new FixtureBoundaryError({
            stage: "version-parse",
            reason: NonEmptyString.make("Public workspace payload cannot establish server version")
          })
      )
    )
    const workspaceVersion = yield* Schema.decodeUnknownEffect(WorkspaceVersion)(workspace.version).pipe(
      Effect.mapError(
        () =>
          new FixtureBoundaryError({
            stage: "version-parse",
            reason: NonEmptyString.make("Actual workspace server version unavailable")
          })
      )
    )
    const deployment = yield* readDeploymentVersion(upstream)
    return yield* makeServerVersionEvidence(deployment, workspaceVersion)
  }).pipe(Effect.timeout(VERSION_READ_TIMEOUT_MS))
).then(
  (evidence) => process.stdout.write(`${JSON.stringify(evidence)}\n`),
  () => {
    process.stderr.write("Actual server-version read failed.\n")
    process.exitCode = 1
  }
)
