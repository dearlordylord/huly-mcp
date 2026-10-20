import * as fs from "node:fs/promises"
import { join } from "node:path"
import { NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Fiber, Redacted, Schema } from "effect"

import { ProfileEnvironmentSchema } from "../../../src/profiles/model.js"
import { encodeChildReply, parseChildStart } from "../../../src/resident/bootstrap-codec.js"
import {
  BootstrapNonce,
  ManagedLaunchError,
  MANAGED_PACKAGE_NAME,
  MANAGED_BOOTSTRAP_VERSION
} from "../../../src/resident/managed-contract.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { adoptSelectionClaim } from "../../../src/resident/selection-claim.js"
import { VERSION } from "../../../src/version.js"
import { PeerMode, PeerObservation } from "../managed-peer-observation.js"

const ipcFailure = () => new ManagedLaunchError({ reason: "ipc", message: "Owned fixture IPC failed" })
const send = (frame: Redacted.Redacted<string>) =>
  Effect.callback<void, ManagedLaunchError>((resume) => {
    if (process.send === undefined) {
      resume(Effect.fail(ipcFailure()))
      return
    }
    process.send(Redacted.value(frame), (error) => resume(error === null ? Effect.void : Effect.fail(ipcFailure())))
  })
const message = Effect.callback<unknown>((resume) => {
  const receive = (input: unknown) => {
    process.removeListener("message", receive)
    resume(Effect.succeed(input))
  }
  process.on("message", receive)
  return Effect.sync(() => process.removeListener("message", receive))
})

const main = Effect.gen(function* () {
  const mode = yield* Config.schema(PeerMode, "RESIDENT_TEST_CHILD_MODE")
  const directory = yield* Config.schema(ResidentDirectory, "RESIDENT_TEST_DIRECTORY")
  const nonce = yield* Config.schema(BootstrapNonce, "MCP_RESIDENT_BOOTSTRAP_NONCE")
  const observation = PeerObservation.make({
    pid: process.pid,
    rawHulyEnvironmentPresent: [...Object.keys(ProfileEnvironmentSchema.fields), "MCP_AUTH_TOKEN"].some(
      (key) => process.env[key] !== undefined
    )
  })
  const write = (file: string, value: PeerObservation) =>
    Effect.promise(async () => {
      const pending = join(directory, `${file}.pending`)
      await fs.writeFile(pending, Schema.encodeSync(Schema.fromJsonString(PeerObservation))(value), {
        mode: 0o600,
        flag: "wx"
      })
      try {
        await fs.link(pending, join(directory, file))
      } finally {
        await fs.unlink(pending)
      }
    })
  yield* write("prepared.json", observation)
  if (mode === "exit-before-prepared") return
  const prepared = yield* encodeChildReply({
    kind: "prepared",
    version: MANAGED_BOOTSTRAP_VERSION,
    nonce,
    implementation: { name: MANAGED_PACKAGE_NAME, version: mode === "wrong-version" ? "incompatible-version" : VERSION }
  })
  const receive = yield* message.pipe(Effect.forkChild)
  if (mode === "malformed") yield* send(Redacted.make("{"))
  else if (mode === "premature-ready")
    yield* send(
      yield* encodeChildReply({
        kind: "ready",
        version: MANAGED_BOOTSTRAP_VERSION,
        file: ResidentFilePath.make(join(directory, "application.json"))
      })
    )
  else if (mode === "refused")
    yield* send(yield* encodeChildReply({ kind: "refused", version: MANAGED_BOOTSTRAP_VERSION }))
  else if (mode === "wrong-nonce") {
    const raw = Redacted.value(nonce)
    const wrong = yield* Schema.decodeUnknownEffect(BootstrapNonce)(`${raw.startsWith("a") ? "b" : "a"}${raw.slice(1)}`)
    yield* send(
      yield* encodeChildReply({
        kind: "prepared",
        version: MANAGED_BOOTSTRAP_VERSION,
        nonce: wrong,
        implementation: { name: MANAGED_PACKAGE_NAME, version: VERSION }
      })
    )
  } else yield* send(prepared)
  const start = yield* parseChildStart(yield* Fiber.join(receive))
  const claim = yield* adoptSelectionClaim(start.directory, start.claim)
  yield* claim.release
  yield* write("started.json", { ...observation, workspace: start.capture.selection.huly.workspace })
  if (mode === "exit-before-ready") return
  yield* send(
    yield* encodeChildReply(
      mode === "refuse-after-start"
        ? { kind: "refused", version: MANAGED_BOOTSTRAP_VERSION }
        : {
            kind: "ready",
            version: MANAGED_BOOTSTRAP_VERSION,
            file: ResidentFilePath.make(join(directory, "application.json"))
          }
    )
  )
  yield* Effect.callback<void>((resume) => {
    const disconnected = () => {
      process.removeListener("disconnect", disconnected)
      resume(write("disconnected.json", observation))
    }
    process.on("disconnect", disconnected)
    if (!process.connected) disconnected()
    return Effect.sync(() => process.removeListener("disconnect", disconnected))
  })
}).pipe(
  Effect.timeout("2 seconds"),
  Effect.ensuring(
    Effect.sync(() => {
      if (process.connected) process.disconnect?.()
    })
  )
)

NodeRuntime.runMain(main, { disableErrorReporting: true })
