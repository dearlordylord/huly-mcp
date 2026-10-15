import { execFile } from "node:child_process"
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

const execute = (args: ReadonlyArray<string>) =>
  Effect.callback<MacosSecurityReply, CliProfileStoreError>((resume) => {
    const child = execFile("/usr/bin/security", args, { encoding: "utf8" }, (error, output) => {
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

export const runMacosSecurity: MacosSecurityCommand = (request) =>
  Schema.encodeEffect(MacosSecurityRequestSchema)(request).pipe(
    Effect.mapError(macosKeychainUnavailable),
    Effect.flatMap((parsed) => execute(macosSecurityArguments(parsed))),
    Effect.timeout("10 seconds"),
    Effect.mapError(macosKeychainUnavailable)
  )
