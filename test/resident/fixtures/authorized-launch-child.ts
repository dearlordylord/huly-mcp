import "../../../src/polyfills.js"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { NodeRuntime } from "@effect/platform-node"
import { Config, Deferred, Effect, Redacted, Schema } from "effect"

import { readResidentAttachment } from "../../../src/resident/attachment-file.js"
import { encodeChildReply } from "../../../src/resident/bootstrap-codec.js"
import { awaitChildAuthorization, type ChildAuthorizationPort } from "../../../src/resident/child-authorization.js"
import { BootstrapNonce, ManagedLaunchError, MANAGED_PACKAGE_NAME } from "../../../src/resident/managed-contract.js"
import { runOwnedGeneration, withResidentSelection } from "../../../src/resident/managed-selection.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { makeStartupBudget } from "../../../src/resident/startup-budget.js"
import { runConfiguredResidentServer } from "../../../src/runtime/server-startup.js"
import { VERSION } from "../../../src/version.js"
import { AuthorizedOwnerMarker } from "../authorized-parent-loss-contract.js"

const main = Effect.gen(function* () {
  const environment = { ...process.env }
  const markers = yield* Config.schema(ResidentDirectory, "RESIDENT_TEST_DIRECTORY")
  const nonce = yield* Config.schema(BootstrapNonce, "MCP_RESIDENT_BOOTSTRAP_NONCE")
  const send = process.send?.bind(process)
  if (send === undefined || !process.connected)
    return yield* new ManagedLaunchError({ reason: "ipc", message: "Authorized fixture requires its owning parent" })
  const parentPid = process.ppid
  let privateFrames = 0
  const port: ChildAuthorizationPort = {
    onMessage: (listener) => {
      const receive = (raw: unknown) => {
        privateFrames++
        listener(raw)
      }
      process.on("message", receive)
      return () => process.off("message", receive)
    },
    onDisconnect: (listener) => {
      process.on("disconnect", listener)
      return () => process.off("disconnect", listener)
    },
    send: (frame, failed) => {
      try {
        send(Redacted.value(frame), (error) => {
          if (error !== null) failed()
        })
      } catch {
        failed()
      }
    }
  }
  const prepared = yield* encodeChildReply({
    kind: "prepared",
    version: 1,
    nonce,
    implementation: { name: MANAGED_PACKAGE_NAME, version: VERSION }
  })
  const start = yield* awaitChildAuthorization(port, nonce, prepared)
  const identity = {
    childPid: process.pid,
    parentPid,
    privateFrames: yield* Schema.decodeUnknownEffect(Schema.Literal(1))(privateFrames)
  }
  const write = (marker: Schema.Schema.Type<typeof AuthorizedOwnerMarker>) =>
    Schema.encodeEffect(Schema.fromJsonString(AuthorizedOwnerMarker))(marker).pipe(
      Effect.mapError(
        () => new ManagedLaunchError({ reason: "ipc", message: "Authorized owner marker could not be encoded" })
      ),
      Effect.flatMap((encoded) =>
        Effect.promise(async () => {
          const temporary = join(markers, `${marker.phase}.pending`)
          await fs.writeFile(temporary, encoded, { flag: "wx", mode: 0o600 })
          await fs.rename(temporary, join(markers, `${marker.phase}.json`))
        })
      )
    )
  const disconnected = yield* Deferred.make<void>()
  const lost = () => {
    Effect.runSync(Deferred.succeed(disconnected, undefined))
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      process.on("disconnect", lost)
      if (!process.connected) lost()
    }),
    () => Effect.sync(() => process.off("disconnect", lost))
  )
  yield* write({ phase: "authorized", ...identity })
  yield* Deferred.await(disconnected)
  const startup = yield* makeStartupBudget
  yield* withResidentSelection({
    directory: start.directory,
    capture: start.capture,
    startup,
    existing: () => Effect.die("No competing owner expected after parent loss"),
    absent: (ownership) =>
      runOwnedGeneration(ownership, (ready) =>
        runConfiguredResidentServer({
          directory: start.directory,
          capture: start.capture,
          environment,
          lifetime: "managed",
          startup,
          report: (file) =>
            ready(file).pipe(
              Effect.andThen(readResidentAttachment(file)),
              Effect.flatMap((attachment) =>
                write({ phase: "published", ...identity, generation: attachment.identity.generation })
              )
            )
        })
      )
  })
}).pipe(Effect.scoped)
NodeRuntime.runMain(main, { disableErrorReporting: true })
