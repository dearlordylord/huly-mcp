import { Schema } from "effect"
import { ResidentFilePath } from "../../src/resident/protected-path.js"

export const HostName = Schema.Literals(["claude-code", "codex-mcp-client"])
export const HostMode = Schema.Literals(["modern", "legacy"])
export const NativeHostInput = Schema.Struct({
  bundle: Schema.NonEmptyString,
  attachment: ResidentFilePath,
  host: HostName,
  mode: HostMode
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
