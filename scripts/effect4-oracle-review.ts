import * as crypto from "node:crypto"

import { Option, Schema } from "effect"

import { canonicalJson } from "./effect4-oracle-canonical.js"
import { oracleDeltaIdentity, type OracleDelta, OracleDeltaSchema } from "./effect4-oracle-delta.js"
import { BehavioralOracleSchema, type BehavioralOracle, type OracleJsonRpcResponse } from "./effect4-oracle-schema.js"
import { ToolName, type ToolName as ToolNameType } from "../src/mcp/tools/registry.js"

const Sha256Schema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)))
const ReviewCategorySchema = Schema.Literals([
  "draft07-structure",
  "schema-metadata",
  "authored-constraints",
  "issue-assignee-tool-description",
  "cli-json-diagnostic",
  "cli-help"
])
type ReviewCategory = Schema.Schema.Type<typeof ReviewCategorySchema>
const PositiveCountSchema = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))
const ReviewRationaleSchema = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))
const IssueReferenceSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^#[1-9]\d*$/u)))

const OracleDeltaCategoryReviewSchema = Schema.Struct({
  category: ReviewCategorySchema,
  count: PositiveCountSchema,
  deltaSetSha256: Sha256Schema,
  rationale: ReviewRationaleSchema,
  issue: IssueReferenceSchema
})

export const OracleDeltaReviewSchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  baselineSha256: Sha256Schema,
  reviewedCurrentSha256: Sha256Schema,
  categories: Schema.Array(OracleDeltaCategoryReviewSchema)
})
export type OracleDeltaReview = Schema.Schema.Type<typeof OracleDeltaReviewSchema>

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex")

const ISSUE_ASSIGNEE_TOOL_NAMES: ReadonlySet<ToolNameType> = new Set([
  ToolName.make("list_issues"),
  ToolName.make("create_issue"),
  ToolName.make("update_issue")
])
const TOOL_DESCRIPTION_PATH = /^\/bundledProcesses\/stdio\/native\/(\d+)\/result\/tools\/(\d+)\/description$/u
const CandidateListToolsResponseSchema = Schema.Struct({
  result: Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: ToolName })) })
})
type CandidateToolIdentities = ReadonlyMap<string, ToolNameType>
const EMPTY_CANDIDATE_TOOL_IDENTITIES: CandidateToolIdentities = new Map()

const candidateToolIdentityKey = (responseIndex: number, toolIndex: number): string => `${responseIndex}/${toolIndex}`

export const parseCandidateToolIdentities = (
  candidateResponses: ReadonlyArray<OracleJsonRpcResponse>
): CandidateToolIdentities => {
  const identities = new Map<string, ToolNameType>()
  for (const [responseIndex, response] of candidateResponses.entries()) {
    const candidate = Schema.decodeUnknownOption(CandidateListToolsResponseSchema)(response)
    if (Option.isNone(candidate)) continue
    for (const [toolIndex, tool] of candidate.value.result.tools.entries()) {
      identities.set(candidateToolIdentityKey(responseIndex, toolIndex), tool.name)
    }
  }
  return identities
}

const candidateToolName = (
  path: string,
  candidateToolIdentities: CandidateToolIdentities
): ToolNameType | undefined => {
  const match = TOOL_DESCRIPTION_PATH.exec(path)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  return candidateToolIdentities.get(candidateToolIdentityKey(Number(match[1]), Number(match[2])))
}

export const oracleDeltaReviewCategory = (
  delta: OracleDelta,
  candidateToolIdentities: CandidateToolIdentities = EMPTY_CANDIDATE_TOOL_IDENTITIES
): ReviewCategory | undefined => {
  if (delta.path.startsWith("/registry/authoredConstraints/")) return "authored-constraints"
  if (delta.path.includes("/inputSchema/") || delta.path.includes("/outputSchema/")) {
    return delta.path.endsWith("/description") || delta.path.endsWith("/title")
      ? "schema-metadata"
      : "draft07-structure"
  }
  const toolName = candidateToolName(delta.path, candidateToolIdentities)
  if (toolName !== undefined && ISSUE_ASSIGNEE_TOOL_NAMES.has(toolName)) {
    return "issue-assignee-tool-description"
  }
  if (delta.path.includes("/help/") || delta.path.endsWith("Help/stdout")) return "cli-help"
  if (delta.path.includes("/cli/") && delta.path.endsWith("stderr")) return "cli-json-diagnostic"
  if (delta.path.startsWith("/cli/errors/") && delta.path.endsWith("/message")) return "cli-json-diagnostic"
  return undefined
}

const categoryDigest = (deltas: ReadonlyArray<OracleDelta>): string =>
  sha256(canonicalJson(deltas.map(oracleDeltaIdentity).sort()))

const REVIEW_CATEGORY_ORDER: ReadonlyArray<ReviewCategory> = [
  "draft07-structure",
  "schema-metadata",
  "authored-constraints",
  "issue-assignee-tool-description",
  "cli-json-diagnostic",
  "cli-help"
]

const categoryMetadata = (category: ReviewCategory): { readonly issue: string; readonly rationale: string } => {
  switch (category) {
    case "draft07-structure":
      return {
        issue: "#225",
        rationale:
          "Reviewed Effect 4 Draft-07 structural dialect: refs, definitions, optional/null unions, refinements, and composition wrappers."
      }
    case "schema-metadata":
      return {
        issue: "#225",
        rationale:
          "Reviewed schema metadata migration: authored descriptions are preserved and legacy generator-default metadata is replaced."
      }
    case "authored-constraints":
      return {
        issue: "#225",
        rationale:
          "Reviewed authored-constraint projection: the same 522 ordered tools remain represented and strict Draft-07/runtime agreement passes."
      }
    case "issue-assignee-tool-description":
      return {
        issue: "#244",
        rationale:
          "Reviewed agent-facing issue tool descriptions advertising exact agent UserProfile titles as assignee inputs."
      }
    case "cli-json-diagnostic":
      return {
        issue: "#228",
        rationale:
          "Reviewed CLI JSON diagnostic: deterministic line/column context was added without changing failure classification or exit status."
      }
    case "cli-help":
      return {
        issue: "#228",
        rationale: "Reviewed concise Effect 4 CLI help rendering; route inventory and order are unchanged."
      }
  }
}

const categorizeOracleDeltas = (
  deltas: ReadonlyArray<OracleDelta>,
  candidateToolIdentities: CandidateToolIdentities = EMPTY_CANDIDATE_TOOL_IDENTITIES
): {
  readonly categorized: Map<ReviewCategory, Array<OracleDelta>>
  readonly unclassified: ReadonlyArray<OracleDelta>
} => {
  const categorized = new Map<ReviewCategory, Array<OracleDelta>>()
  const unclassified: Array<OracleDelta> = []
  for (const delta of deltas) {
    const category = oracleDeltaReviewCategory(delta, candidateToolIdentities)
    if (category === undefined) {
      unclassified.push(delta)
      continue
    }
    const entries = categorized.get(category) ?? []
    entries.push(delta)
    categorized.set(category, entries)
  }
  return { categorized, unclassified }
}

export const createOracleDeltaReview = (
  baselineJson: string,
  currentJson: string,
  deltas: ReadonlyArray<OracleDelta>,
  candidateToolIdentities: CandidateToolIdentities = EMPTY_CANDIDATE_TOOL_IDENTITIES
): OracleDeltaReview => {
  const { categorized, unclassified } = categorizeOracleDeltas(deltas, candidateToolIdentities)
  if (unclassified.length > 0) throw new Error("Cannot review unclassified oracle deltas.")
  return Schema.decodeUnknownSync(OracleDeltaReviewSchema)({
    formatVersion: 1,
    baselineSha256: sha256(baselineJson),
    reviewedCurrentSha256: sha256(currentJson),
    categories: REVIEW_CATEGORY_ORDER.flatMap((category) => {
      const entries = categorized.get(category) ?? []
      return entries.length === 0
        ? []
        : [{ category, count: entries.length, deltaSetSha256: categoryDigest(entries), ...categoryMetadata(category) }]
    })
  })
}

const OracleDeltaCategoryReportSchema = Schema.Struct({
  category: ReviewCategorySchema,
  deltas: Schema.Array(OracleDeltaSchema)
})
const AuthoredConstraintToolReportSchema = Schema.Struct({
  toolName: ToolName,
  deltas: Schema.Array(OracleDeltaSchema).pipe(Schema.check(Schema.isMinLength(1)))
})
export const OracleDeltaAuditReportSchema = Schema.Struct({
  certificate: OracleDeltaReviewSchema,
  categories: Schema.Array(OracleDeltaCategoryReportSchema),
  authoredConstraintsByTool: Schema.Array(AuthoredConstraintToolReportSchema)
})
export type OracleDeltaAuditReport = Schema.Schema.Type<typeof OracleDeltaAuditReportSchema>

const authoredConstraintIndex = (delta: OracleDelta): number => {
  const match = /^\/registry\/authoredConstraints\/(\d+)(?:\/|$)/u.exec(delta.path)
  if (match?.[1] === undefined) throw new Error(`Authored-constraint delta has an invalid path: ${delta.path}`)
  return Number(match[1])
}

export const createOracleDeltaAuditReport = (
  baselineJson: string,
  currentJson: string,
  baseline: BehavioralOracle,
  current: BehavioralOracle,
  deltas: ReadonlyArray<OracleDelta>
): OracleDeltaAuditReport => {
  const candidateToolIdentities = parseCandidateToolIdentities(current.bundledProcesses.stdio.native)
  const { categorized, unclassified } = categorizeOracleDeltas(deltas, candidateToolIdentities)
  if (unclassified.length > 0) throw new Error("Cannot report unclassified oracle deltas.")
  const byTool = new Map<string, Array<OracleDelta>>()
  for (const delta of categorized.get("authored-constraints") ?? []) {
    const index = authoredConstraintIndex(delta)
    const baselineName = baseline.registry.authoredConstraints[index]?.toolName
    const currentName = current.registry.authoredConstraints[index]?.toolName
    if (baselineName === undefined || currentName === undefined || baselineName !== currentName) {
      throw new Error(`Cannot associate authored-constraint delta ${delta.path} with one stable tool.`)
    }
    const entries = byTool.get(currentName) ?? []
    entries.push(delta)
    byTool.set(currentName, entries)
  }
  return Schema.decodeUnknownSync(OracleDeltaAuditReportSchema)({
    certificate: createOracleDeltaReview(baselineJson, currentJson, deltas, candidateToolIdentities),
    categories: REVIEW_CATEGORY_ORDER.flatMap((category) => {
      const entries = categorized.get(category) ?? []
      return entries.length === 0 ? [] : [{ category, deltas: entries }]
    }),
    authoredConstraintsByTool: [...byTool].map(([toolName, entries]) => ({ toolName, deltas: entries }))
  })
}

export const verifyReviewedOracleDeltas = (
  baselineJson: string,
  currentJson: string,
  deltas: ReadonlyArray<OracleDelta>,
  review: OracleDeltaReview
): void => {
  if (sha256(baselineJson) !== review.baselineSha256) {
    throw new Error("Effect 3 oracle baseline does not match the reviewed SHA-256.")
  }
  if (sha256(currentJson) !== review.reviewedCurrentSha256) {
    throw new Error("Effect 4 oracle corpus does not match the reviewed SHA-256.")
  }

  const duplicateCategories = review.categories.filter(
    (entry, index, entries) => entries.findIndex((candidate) => candidate.category === entry.category) !== index
  )
  if (duplicateCategories.length > 0) throw new Error("Oracle delta review contains duplicate categories.")

  const candidate = Schema.decodeUnknownOption(Schema.fromJsonString(BehavioralOracleSchema))(currentJson)
  const candidateToolIdentities = Option.isSome(candidate)
    ? parseCandidateToolIdentities(candidate.value.bundledProcesses.stdio.native)
    : EMPTY_CANDIDATE_TOOL_IDENTITIES
  const { categorized, unclassified } = categorizeOracleDeltas(deltas, candidateToolIdentities)
  if (unclassified.length > 0) {
    throw new Error(`Oracle comparison contains ${unclassified.length} unclassified deltas.`)
  }

  for (const entry of review.categories) {
    const actual = categorized.get(entry.category) ?? []
    if (actual.length !== entry.count || categoryDigest(actual) !== entry.deltaSetSha256) {
      throw new Error(`Oracle delta category ${entry.category} differs from its reviewed exact set.`)
    }
    categorized.delete(entry.category)
  }
  if (categorized.size > 0) throw new Error("Oracle comparison contains an unreviewed delta category.")
}
