import { Schema } from "effect"

/** Typed failure for Promise-returning adapters called from the Effect MCP edge. */
export class EffectMcpBoundaryError extends Schema.TaggedError<EffectMcpBoundaryError>()("EffectMcpBoundaryError", {
  cause: Schema.Defect()
}) {}
