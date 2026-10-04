import { Schema } from "effect"
import { DocId, NonEmptyString, PositiveInteger, UrlString } from "../../src/domain/schemas/shared.js"

export const GatewayPoint = Schema.Literals([
  "allocation-before", "allocation-after", "commit-before", "commit-after", "verification-read"
])
export type GatewayPoint = Schema.Schema.Type<typeof GatewayPoint>
export const GatewayAction = Schema.Literals(["pause", "fail", "drop"])
export type GatewayAction = Schema.Schema.Type<typeof GatewayAction>
export const GatewayControl = Schema.Union([
  Schema.Struct({ command: Schema.Literal("arm"), point: GatewayPoint, action: GatewayAction, persistent: Schema.Boolean }),
  Schema.Struct({ command: Schema.Literal("release") }),
  Schema.Struct({ command: Schema.Literal("close") })
])
export type GatewayControl = Schema.Schema.Type<typeof GatewayControl>
export const GatewayArguments = Schema.Struct({ upstream: UrlString })
export const GatewayEvent = Schema.Union([
  Schema.Struct({ event: Schema.Literal("ready"), url: UrlString }),
  Schema.Struct({ event: Schema.Literal("barrier"), point: GatewayPoint, action: GatewayAction }),
  Schema.Struct({ event: Schema.Literal("forwarded"), point: GatewayPoint, status: PositiveInteger, attempt: PositiveInteger }),
  Schema.Struct({ event: Schema.Literal("retry-suppressed"), point: GatewayPoint, attempt: PositiveInteger }),
  Schema.Struct({ event: Schema.Literal("failure"), reason: NonEmptyString })
])
export type GatewayEvent = Schema.Schema.Type<typeof GatewayEvent>

const SequenceTransaction = Schema.Struct({
  _class: Schema.Literal("core:class:TxUpdateDoc"),
  objectClass: Schema.Literal("tracker:class:Project"),
  objectId: DocId,
  operations: Schema.Struct({ $inc: Schema.Struct({ sequence: PositiveInteger }) })
})
const MovementBatch = Schema.Struct({
  _class: Schema.Literal("core:class:TxApplyIf"),
  scope: NonEmptyString,
  txes: Schema.Array(Schema.Struct({ objectId: DocId }))
})

export const parseWritePoint = (input: unknown): GatewayPoint | undefined => {
  if (Schema.decodeUnknownOption(SequenceTransaction)(input)._tag === "Some") return "allocation-before"
  if (Schema.decodeUnknownOption(MovementBatch)(input)._tag === "Some") return "commit-before"
  return undefined
}
