import { Schema } from "effect"

import { NATIVE_PATH_BYTES } from "./native-wire.js"

const forbiddenCharacters = ["\0", "\r", "\n"]

export const NativeSocketPath = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (value) =>
      value.startsWith("/") &&
      !forbiddenCharacters.some((character) => value.includes(character)) &&
      Buffer.byteLength(value) < NATIVE_PATH_BYTES
  )
).pipe(Schema.brand("NativeResidentSocketPath"))
export type NativeSocketPath = Schema.Schema.Type<typeof NativeSocketPath>
