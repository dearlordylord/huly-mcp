import { execFile, type ChildProcess } from "node:child_process"
import { Effect, Result, Schema } from "effect"

import {
  macosKeychainUnavailable,
  macosSecurityArguments,
  MacosSecurityReplySchema,
  MacosSecurityRequestSchema,
  type MacosSecurityReply,
  type MacosSecurityRequest
} from "./macos-keychain-protocol.js"
import type { CliProfileStoreError } from "./model.js"

export type MacosSecurityCommand = (
  request: MacosSecurityRequest
) => Effect.Effect<MacosSecurityReply, CliProfileStoreError>
const ExitFailureSchema = Schema.Struct({ code: Schema.Int })
// Internal process port; the schema owns the callback's untrusted reply.
export type StartMacosSecurity = (
  args: ReadonlyArray<string>,
  complete: (error: unknown, output: unknown) => void
) => Pick<ChildProcess, "exitCode" | "signalCode" | "kill">
const startSecurity: StartMacosSecurity = (args, complete) =>
  execFile("/usr/bin/security", args, { encoding: "utf8" }, complete)

const execute = (start: StartMacosSecurity, args: ReadonlyArray<string>) =>
  Effect.callback<MacosSecurityReply, CliProfileStoreError>((resume) => {
    const child = start(args, (error, output) => {
      const failure = error === null ? undefined : Schema.decodeUnknownResult(ExitFailureSchema)(error)
      if (failure !== undefined && Result.isFailure(failure)) {
        resume(Effect.fail(macosKeychainUnavailable()))
        return
      }
      const status = failure === undefined ? 0 : failure.success.code
      resume(
        Schema.decodeUnknownEffect(MacosSecurityReplySchema)({ status, output }).pipe(
          Effect.mapError(macosKeychainUnavailable)
        )
      )
    })
    return Effect.sync(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    })
  })

export const makeMacosSecurity =
  (start: StartMacosSecurity = startSecurity): MacosSecurityCommand =>
  (request) =>
    Schema.encodeEffect(MacosSecurityRequestSchema)(request).pipe(
      Effect.mapError(macosKeychainUnavailable),
      Effect.flatMap((parsed) => execute(start, macosSecurityArguments(parsed))),
      Effect.timeout("10 seconds"),
      Effect.mapError(macosKeychainUnavailable)
    )

export const runMacosSecurity = makeMacosSecurity()
