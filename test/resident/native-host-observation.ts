import { Schema } from "effect"

export const HostName = Schema.Literals(["claude-code", "codex-mcp-client"])
export const HostMode = Schema.Literals(["modern", "legacy"])
export const NativeHostInput = Schema.Struct({
  bundle: Schema.NonEmptyString,
  endpoint: Schema.URLFromString,
  host: HostName,
  mode: HostMode,
  authorization: Schema.RedactedFromValue(Schema.NonEmptyString)
})
export const NativeHostObservation = Schema.Struct({
  host: HostName,
  mode: HostMode,
  parentPid: Schema.Int.check(Schema.isGreaterThan(0)),
  adapterPid: Schema.Int.check(Schema.isGreaterThan(0)),
  tools: Schema.Array(Schema.String),
  resourceTemplates: Schema.Array(Schema.String),
  contextIsError: Schema.Boolean
})
