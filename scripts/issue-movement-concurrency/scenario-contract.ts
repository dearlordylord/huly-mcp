import { Schema } from "effect"
import { MoveIssueParamsSchema } from "../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../src/domain/schemas/issues-results.js"
import { IssueSchema } from "../../src/domain/schemas/issues.js"
import { AddCommentResultSchema } from "../../src/domain/schemas/comments.js"
import { SetIssueComponentResultSchema } from "../../src/domain/schemas/components.js"
import { LogTimeResultSchema } from "../../src/domain/schemas/time.js"
import { CreateIssueResultSchema } from "../../src/domain/schemas/issues-results.js"
import {
  IssueId,
  NonEmptyString,
  PositiveInteger,
  ProjectIdentifier,
  UrlString
} from "../../src/domain/schemas/shared.js"
import { GatewayAction, GatewayEvent, GatewayPoint } from "./protocol.js"

export const ScenarioArguments = Schema.Struct({
  upstream: UrlString,
  transport: Schema.Literals(["mcp", "cli"]),
  movement: MoveIssueParamsSchema,
  point: GatewayPoint,
  action: GatewayAction,
  persistent: Schema.Boolean,
  timeoutMs: PositiveInteger,
  mutationKind: Schema.Literals(["none", "child", "comment", "time", "attribute", "ancestry"]),
  mutationTarget: Schema.Struct({ project: ProjectIdentifier, issueId: IssueId }),
  mutationParents: Schema.Record(ProjectIdentifier, IssueId),
  mutationArgs: Schema.Array(NonEmptyString)
})
export type ScenarioArguments = Schema.Schema.Type<typeof ScenarioArguments>
export const PublicObservation = Schema.Union([
  Schema.Struct({ status: Schema.Literal("result"), result: MoveIssueResultSchema }),
  Schema.Struct({ status: Schema.Literal("no-result"), reason: NonEmptyString })
])
export const MutationResultSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({ kind: Schema.Literal("child"), result: CreateIssueResultSchema }),
  Schema.Struct({ kind: Schema.Literal("comment"), result: AddCommentResultSchema }),
  Schema.Struct({ kind: Schema.Literal("time"), result: LogTimeResultSchema }),
  Schema.Struct({ kind: Schema.Literal("attribute"), result: SetIssueComponentResultSchema }),
  Schema.Struct({ kind: Schema.Literal("ancestry"), result: MoveIssueResultSchema })
])
export const ScenarioEvidence = Schema.Struct({
  observation: PublicObservation,
  gatewayEvents: Schema.Array(GatewayEvent),
  mutation: Schema.Struct({ before: IssueSchema, action: MutationResultSchema, after: IssueSchema })
})
