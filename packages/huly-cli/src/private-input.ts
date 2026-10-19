import type { Readable } from "node:stream"
import { Effect, Result, Schema } from "effect"

import { CliRuntimeError } from "./render.js"

const MAXIMUM_TOKEN_BYTES = 65536
const PrivateSecretInputSchema = Schema.RedactedFromValue(Schema.NonEmptyString)
export const parsePrivateSecret = Schema.decodeUnknownEffect(PrivateSecretInputSchema)

const inputError = () =>
  new CliRuntimeError({
    kind: "input",
    message: "Cannot read token from stdin. Supply one nonempty token, at most 64 KiB.",
    retryable: false
  })

export const readPrivateTokenInput = (input: Readable) =>
  Effect.callback<Schema.Schema.Type<typeof PrivateSecretInputSchema>, CliRuntimeError>((resume) => {
    const chunks: Array<Uint8Array> = []
    let size = 0
    let settled = false
    const cleanup = () => {
      input.off("data", onData)
      input.off("end", onEnd)
      input.off("error", onError)
      input.off("close", onError)
      input.pause()
    }
    const finish = (effect: Effect.Effect<Schema.Schema.Type<typeof PrivateSecretInputSchema>, CliRuntimeError>) => {
      if (settled) return
      settled = true
      cleanup()
      resume(effect)
    }
    const onError = () => finish(Effect.fail(inputError()))
    const onEnd = () =>
      finish(parsePrivateSecret(Buffer.concat(chunks).toString("utf8").trim()).pipe(Effect.mapError(inputError)))
    const onData = (chunk: unknown) => {
      const decoded = Schema.decodeUnknownResult(Schema.Uint8Array)(chunk)
      if (Result.isFailure(decoded)) return onError()
      size += decoded.success.byteLength
      if (size > MAXIMUM_TOKEN_BYTES) return onError()
      chunks.push(decoded.success)
    }
    if (input.readableEnded || input.destroyed) {
      onError()
    } else {
      input.once("end", onEnd)
      input.once("error", onError)
      input.once("close", onError)
      input.on("data", onData)
    }
    return Effect.sync(cleanup)
  })
