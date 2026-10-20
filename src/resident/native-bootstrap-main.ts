import "../polyfills.js"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeStdio from "@effect/platform-node/NodeStdio"
import { Config, Effect, Schema } from "effect"

import { McpProcessPolicyError } from "../mcp/process-policy.js"
import { ConfigValidationError } from "../config/config.js"
import { runProfileStartupDiagnostic } from "../profiles/startup-diagnostic.js"
import { VERSION } from "../version.js"

import { makeAdapterAdmissionProof, withAdapterAttachment, type AdapterAdmissionHandoff } from "./adapter-attachment.js"
import type { ResidentAttachment } from "./attachment-file.js"
import { readNativeControl } from "./native-control.js"
import { readResidentAttachment } from "./attachment-file.js"
import { ManagedExecutable } from "./managed-contract.js"
import { launchManagedChild } from "./managed-process.js"
import { prepareManagedDirectory, withResidentSelection } from "./managed-selection.js"
import { NativeHello, NATIVE_CONTROL_BYTES, nativeBridgeFailure } from "./native-contract.js"
import { awaitNativeStartupPermission, publishNativeBootstrap } from "./native-bootstrap-output.js"
import { NATIVE_LOCAL_HEADER, NATIVE_ATTACHED_HEADER } from "./native-wire.js"
import { makeStartupBudget } from "./startup-budget.js"
import { withManagedStartupInput } from "./managed-startup-input.js"
import { resolveManagedStartup } from "./startup-selection.js"

const publish = (frame: string) => Effect.try({ try: () => publishNativeBootstrap(frame), catch: nativeBridgeFailure })
const local = Effect.gen(function* () {
  yield* publish(`${NATIVE_LOCAL_HEADER}\n`)
  const { main } = yield* Effect.promise(() => import("../runtime/server-startup.js"))
  return yield* main
})

const main = Effect.gen(function* () {
  yield* Config.schema(Schema.Literal(VERSION), "MCP_NATIVE_EXPECTED_VERSION").pipe(Config.withDefault(VERSION))
  const environment = { ...process.env }
  const startup = yield* makeStartupBudget
  const selected = yield* startup.within(resolveManagedStartup(environment, process.platform))
  if (selected.kind === "local") return yield* local
  yield* Effect.try({ try: awaitNativeStartupPermission, catch: nativeBridgeFailure })
  const capture = selected.capture
  return yield* withManagedStartupInput(process.stdin, (handoff) =>
    Effect.gen(function* () {
      const directory = yield* startup.within(prepareManagedDirectory)
      const executable = yield* Schema.decodeUnknownEffect(ManagedExecutable)({
        executable: process.execPath,
        packageFile: process.argv[1]
      })
      const attach = (attachment: ResidentAttachment, admission: AdapterAdmissionHandoff) =>
        Effect.gen(function* () {
          if (attachment.nativeSocket === undefined) return yield* nativeBridgeFailure()
          const proof = yield* startup.within(makeAdapterAdmissionProof(attachment, capture.selection))
          const hello = yield* Schema.encodeEffect(Schema.fromJsonString(NativeHello))({
            version: 1,
            authorization: attachment.authorization,
            proof,
            attachmentToken: admission.admitted.token
          })
          const output = `${attachment.nativeSocket}\n${hello}\n`
          if (Buffer.byteLength(output) > NATIVE_CONTROL_BYTES) return yield* nativeBridgeFailure()
          yield* publish(output)
          yield* handoff(
            readNativeControl(process.stdin).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.Literal(NATIVE_ATTACHED_HEADER))),
              Effect.andThen(admission.transfer)
            )
          )
        })
      yield* withResidentSelection({
        directory,
        capture,
        startup,
        existing: (file, _exchange, admission) =>
          readResidentAttachment(file).pipe(Effect.flatMap((attachment) => attach(attachment, admission))),
        absent: (ownership) =>
          Effect.gen(function* () {
            const file = yield* launchManagedChild({
              executable,
              capture,
              claim: ownership.claim,
              environment,
              startup
            })
            const descriptor = yield* startup.within(readResidentAttachment(file))
            yield* withAdapterAttachment(
              descriptor,
              (_exchange, admission) => attach(descriptor, admission),
              capture.selection,
              startup
            )
          })
      })
    })
  ).pipe(Effect.ensuring(Effect.sync(() => process.stdin.destroy())))
}).pipe(
  Effect.catchTag("CliProfileStoreError", (error) =>
    publish(`${NATIVE_LOCAL_HEADER}\n`).pipe(Effect.andThen(runProfileStartupDiagnostic(error, PKG_VERSION)))
  ),
  Effect.mapError((error) =>
    error instanceof ConfigValidationError || error instanceof McpProcessPolicyError ? error : nativeBridgeFailure()
  ),
  Effect.provide(NodeStdio.layer),
  Effect.tapError((error) => Effect.sync(() => process.stderr.write(`${error.message}\n`)))
)

NodeRuntime.runMain(main, { disableErrorReporting: true })
