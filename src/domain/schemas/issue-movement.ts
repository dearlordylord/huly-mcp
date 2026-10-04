import { Schema } from "effect"
import { toDraft07JsonSchema } from "./json-schema.js"
import { IssueId, IssueIdentifier, NonEmptyString, ProjectIdentifier } from "./shared.js"

const MovementDestinationSchema = Schema.Union([
  Schema.Struct({ project: ProjectIdentifier, parent: Schema.optionalKey(Schema.NullOr(IssueIdentifier)) }),
  Schema.Struct({ parent: Schema.NullOr(IssueIdentifier), project: Schema.optionalKey(ProjectIdentifier) })
]).annotate({
  description:
    "{project: 'HULY'} selects project top level; {parent: 'HULY-42'} infers the parent's project; {project: 'HULY', parent: 'HULY-42'} requires agreement; {parent: null} selects current project top level. Selectors accept identifiers or stable IDs."
})

export const MoveIssueParamsSchema = Schema.Struct({
  issue: IssueIdentifier.annotate({
    description: "Complete issue identifier or stable issue ID; source project is inferred."
  }),
  destination: MovementDestinationSchema,
  resolutions: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        issueId: IssueId,
        field: Schema.Literals(["component", "milestone"]),
        from: NonEmptyString,
        to: Schema.NullOr(NonEmptyString)
      })
    ).annotate({
      description:
        "Cross-project-only decisions. Omit for same-project movement, including no-ops. This slice refuses component/milestone resolutions; choose a compatible leaf without those references."
    })
  )
}).annotate({
  title: "MoveIssueParams",
  description:
    "Move a tree within its project or a compatible leaf across projects. Cross-project moves require equal project types, supported kind/status and no component/milestone references. Comments/threads, nested attachments, labels, time reports and audited activity records follow the move; historical payloads and independent links stay intact. Unknown classes/ownership edges or discovery limits refuse before writes. Unsupported structure is refused before allocation. Stable IDs persist; cross-project identifiers change."
})

export type MoveIssueParams = Schema.Schema.Type<typeof MoveIssueParamsSchema>
export const moveIssueParamsJsonSchema = toDraft07JsonSchema(MoveIssueParamsSchema)
export const parseMoveIssueParams = Schema.decodeUnknownEffect(MoveIssueParamsSchema)
