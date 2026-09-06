import { Schema } from "effect"

const Sha256Schema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)))
export const ReviewCategorySchema = Schema.Literals([
  "draft07-structure",
  "schema-metadata",
  "authored-constraints",
  "issue-assignee-description",
  "post-baseline-operation-expansion",
  "cli-json-diagnostic",
  "cli-help"
])
export type ReviewCategory = Schema.Schema.Type<typeof ReviewCategorySchema>
const PositiveCountSchema = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))
const ReviewRationaleSchema = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))
const IssueReferenceSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^#[1-9]\d*$/u)))
type IssueReference = Schema.Schema.Type<typeof IssueReferenceSchema>
const IssueReferencesSchema = Schema.Array(IssueReferenceSchema).pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isUnique())
)

export const ORACLE_DELTA_REVIEW_FORMAT_VERSION = 2

export const OracleDeltaCategoryReviewSchema = Schema.Struct({
  category: ReviewCategorySchema,
  count: PositiveCountSchema,
  deltaSetSha256: Sha256Schema,
  rationale: ReviewRationaleSchema,
  issues: IssueReferencesSchema
})

export const REVIEW_CATEGORY_ORDER: ReadonlyArray<ReviewCategory> = [
  "draft07-structure",
  "schema-metadata",
  "authored-constraints",
  "issue-assignee-description",
  "post-baseline-operation-expansion",
  "cli-json-diagnostic",
  "cli-help"
]

export const reviewCategoryMetadata = (
  category: ReviewCategory
): { readonly issues: ReadonlyArray<IssueReference>; readonly rationale: string } => {
  switch (category) {
    case "draft07-structure":
      return {
        issues: ["#97", "#225", "#264", "#265", "#266", "#267", "#268"],
        rationale:
          "Reviewed Effect 4 Draft-07 structural dialect plus the post-baseline administration, Recruiting Candidate custom-field, Planner document-ToDo, Calendar-settings, virtual-office, and meeting-room schemas."
      }
    case "schema-metadata":
      return {
        issues: ["#97", "#225", "#245", "#264", "#265", "#266", "#267", "#268"],
        rationale:
          "Reviewed schema metadata migration and authored descriptions for issue-assignee resolution (#245) and the post-baseline #97 and #264-#268 feature contracts."
      }
    case "authored-constraints":
      return {
        issues: ["#225", "#245"],
        rationale:
          "Reviewed authored-constraint projection: pre-funnel tools remain represented, #245 assignee alternative descriptions are preserved, and strict Draft-07/runtime agreement passes."
      }
    case "issue-assignee-description":
      return {
        issues: ["#245"],
        rationale:
          "Reviewed agent-facing issue tool and assignee input descriptions advertising exact agent UserProfile titles."
      }
    case "post-baseline-operation-expansion":
      return {
        issues: ["#97", "#264", "#265", "#266", "#267", "#268"],
        rationale:
          "Reviewed the ordered operation expansion and shifted registry/CLI surfaces from #97 and #264-#267, together with post-baseline Planner (#265) and meeting-room (#268) contract changes in the affected ordered region."
      }
    case "cli-json-diagnostic":
      return {
        issues: ["#228"],
        rationale:
          "Reviewed CLI JSON diagnostic: deterministic line/column context was added without changing failure classification or exit status."
      }
    case "cli-help":
      return {
        issues: ["#97", "#228", "#245", "#264", "#265", "#266", "#267", "#268"],
        rationale:
          "Reviewed concise Effect 4 CLI help rendering, including the #245 assignee guidance and the #97 and #264-#268 operation and contract updates represented in the complete help output."
      }
  }
}
