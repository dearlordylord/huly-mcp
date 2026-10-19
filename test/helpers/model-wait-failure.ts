import { SdkErrorCode } from "@modelcontextprotocol/client"
import { Schema } from "effect"

const SdkCode = Schema.Literals(Object.values(SdkErrorCode))
export const ModelWaitFailure = Schema.Struct({
  stage: Schema.Literals(["connect", "discovery", "context", "command", "read", "driver"]),
  code: Schema.Union([SdkCode, Schema.Literal("UNCLASSIFIED")])
})
export type ModelWaitFailure = Schema.Schema.Type<typeof ModelWaitFailure>
const SdkFailure = Schema.Struct({ code: SdkCode })

export const modelWaitFailure = (stage: ModelWaitFailure["stage"], error: unknown): ModelWaitFailure => {
  const parsed = Schema.decodeUnknownOption(SdkFailure)(error)
  return { stage, code: parsed._tag === "Some" ? parsed.value.code : "UNCLASSIFIED" }
}

export const writeModelWaitFailure = (stage: ModelWaitFailure["stage"], error: unknown) =>
  process.stderr.write(
    Schema.encodeSync(Schema.fromJsonString(ModelWaitFailure))(modelWaitFailure(stage, error)) + "\n"
  )
