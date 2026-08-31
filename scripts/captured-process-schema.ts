import { Schema } from "effect"

export const CapturedProcessResultSchema = Schema.Struct({
  exitCode: Schema.Int,
  stderr: Schema.String,
  stdout: Schema.String
})
export type CapturedProcessResult = Schema.Schema.Type<typeof CapturedProcessResultSchema>
