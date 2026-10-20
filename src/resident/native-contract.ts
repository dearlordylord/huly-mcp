import { timingSafeEqual } from "node:crypto"
import { Effect, Redacted, Schema } from "effect"

import { AttachmentToken } from "./admission-contract.js"
import { CompatibilityProof } from "./compatibility-contract.js"
import { BackendResponseError } from "./response-stream.js"
import { ResidentAttachment } from "./attachment-file.js"

export { NATIVE_CONTROL_BYTES, NATIVE_STARTUP_MILLIS, NATIVE_ACK, NATIVE_CONTROL_FD } from "./native-wire.js"
export { NativeSocketPath } from "./native-path.js"

export const NativeHello = Schema.Struct({
  version: Schema.Literal(1),
  authorization: ResidentAttachment.fields.authorization,
  attachmentToken: AttachmentToken,
  proof: CompatibilityProof
})
export type NativeHello = Schema.Schema.Type<typeof NativeHello>

export const nativeBridgeFailure = () =>
  new BackendResponseError({ message: "Native resident channel failed; no request was replayed" })

export const parseNativeHello = (input: string, authorization: Redacted.Redacted<string>) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(NativeHello))(input).pipe(
    Effect.mapError(nativeBridgeFailure),
    Effect.flatMap((hello) => {
      const expected = Buffer.from(Redacted.value(authorization))
      const actual = Buffer.from(Redacted.value(hello.authorization))
      return expected.length === actual.length && timingSafeEqual(expected, actual)
        ? Effect.succeed(hello)
        : Effect.fail(nativeBridgeFailure())
    })
  )
