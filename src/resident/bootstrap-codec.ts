import { Effect, Redacted, Schema } from "effect"

import { ChildReply, ManagedLaunchError, MAX_BOOTSTRAP_BYTES, StartChild } from "./managed-contract.js"

const invalidFrame = () =>
  new ManagedLaunchError({
    reason: "ipc",
    message: "Resident private startup message was invalid or oversized; no request was dispatched"
  })
const Frame = Schema.String.check(Schema.makeFilter((value) => Buffer.byteLength(value, "utf8") <= MAX_BOOTSTRAP_BYTES))
const parseFrame = Schema.decodeUnknownEffect(Frame)

const decoder =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (input: unknown) =>
    parseFrame(input).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(schema))),
      Effect.mapError(invalidFrame)
    )
const encoder =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (value: A) =>
    Schema.encodeEffect(Schema.fromJsonString(schema))(value).pipe(
      Effect.flatMap(parseFrame),
      Effect.map(Redacted.make),
      Effect.mapError(invalidFrame)
    )

export const parseChildReply = decoder(ChildReply)
export const parseChildStart = decoder(StartChild)
export const encodeChildReply = encoder(ChildReply)
export const encodeChildStart = encoder(StartChild)
