import * as crypto from "node:crypto"

import { Option, Schema } from "effect"

import { canonicalJson } from "./effect4-oracle-canonical.js"
import { oracleDeltaIdentity, type OracleDelta, OracleDeltaSchema } from "./effect4-oracle-delta.js"
import { ISSUE_97_ADMINISTRATION_TOOL_NAMES } from "./effect4-oracle-issue97-tools.js"
import { BehavioralOracleSchema, type BehavioralOracle, type OracleJsonRpcResponse } from "./effect4-oracle-schema.js"
import { ToolName, type ToolName as ToolNameType } from "../src/mcp/tools/registry.js"

const Sha256Schema = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)))
const ReviewCategorySchema = Schema.Literals([
  "draft07-structure",
  "schema-metadata",
  "authored-constraints",
  "issue-assignee-description",
  "issue-97-administration",
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
const INPUT_FIELD_DESCRIPTION_PATH =
  /^\/bundledProcesses\/stdio\/native\/(\d+)\/result\/tools\/(\d+)\/inputSchema\/properties\/([^/]+)\/description$/u
const CandidateToolSchema = Schema.Struct({
  name: ToolName,
  inputSchema: Schema.optional(
    Schema.Struct({ properties: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)) })
  )
})
const CandidateListToolsResponseSchema = Schema.Struct({
  result: Schema.Struct({ tools: Schema.Array(CandidateToolSchema) })
})
type CandidateTool = Schema.Schema.Type<typeof CandidateToolSchema>
type CandidateToolIdentities = ReadonlyMap<string, CandidateTool>
const EMPTY_CANDIDATE_TOOL_IDENTITIES: CandidateToolIdentities = new Map()
const candidateToolIdentityKey = (responseIndex: number, toolIndex: number): string => `${responseIndex}/${toolIndex}`

export const parseCandidateToolIdentities = (
  candidateResponses: ReadonlyArray<OracleJsonRpcResponse>
): CandidateToolIdentities => {
  const identities = new Map<string, CandidateTool>()
  for (const [responseIndex, response] of candidateResponses.entries()) {
    const candidate = Schema.decodeUnknownOption(CandidateListToolsResponseSchema)(response)
    if (Option.isNone(candidate)) continue
    for (const [toolIndex, tool] of candidate.value.result.tools.entries()) {
      identities.set(candidateToolIdentityKey(responseIndex, toolIndex), tool)
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
  return candidateToolIdentities.get(candidateToolIdentityKey(Number(match[1]), Number(match[2])))?.name
}

const isIssueAssigneeInputDescription = (path: string, candidateToolIdentities: CandidateToolIdentities): boolean => {
  const match = INPUT_FIELD_DESCRIPTION_PATH.exec(path)
  if (match?.[1] === undefined || match[2] === undefined || match[3] !== "assignee") return false
  const tool = candidateToolIdentities.get(candidateToolIdentityKey(Number(match[1]), Number(match[2])))
  return (
    tool !== undefined &&
    ISSUE_ASSIGNEE_TOOL_NAMES.has(tool.name) &&
    tool.inputSchema?.properties !== undefined &&
    Object.hasOwn(tool.inputSchema.properties, "assignee")
  )
}

export const oracleDeltaReviewCategory = (
  delta: OracleDelta,
  candidateToolIdentities: CandidateToolIdentities = EMPTY_CANDIDATE_TOOL_IDENTITIES,
  isIssue97ExpansionDelta: (path: string) => boolean = () => false
): ReviewCategory | undefined => {
  if (isIssue97ExpansionDelta(delta.path)) return "issue-97-administration"
  if (delta.path.startsWith("/registry/authoredConstraints/")) return "authored-constraints"
  if (isIssueAssigneeInputDescription(delta.path, candidateToolIdentities)) return "issue-assignee-description"
  if (delta.path.includes("/inputSchema/") || delta.path.includes("/outputSchema/")) {
    return delta.path.endsWith("/description") || delta.path.endsWith("/title")
      ? "schema-metadata"
      : "draft07-structure"
  }
  const toolName = candidateToolName(delta.path, candidateToolIdentities)
  if (toolName !== undefined && ISSUE_97_ADMINISTRATION_TOOL_NAMES.has(toolName)) return "issue-97-administration"
  if (toolName !== undefined && ISSUE_ASSIGNEE_TOOL_NAMES.has(toolName)) {
    return "issue-assignee-description"
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
  "issue-assignee-description",
  "issue-97-administration",
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
          "Reviewed authored-constraint projection: pre-funnel tools remain represented and strict Draft-07/runtime agreement passes."
      }
    case "issue-assignee-description":
      return {
        issue: "#245",
        rationale:
          "Reviewed agent-facing issue tool and assignee input descriptions advertising exact agent UserProfile titles."
      }
    case "issue-97-administration":
      return {
        issue: "#97",
        rationale:
          "Reviewed employee-position, HR-department, Staff-assignment, funnel-administration, lead-mutation, HR-request, public-holiday, HR-report, and person-administration operations with their exact schemas and ordered registry/CLI exposure."
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
        rationale:
          "Reviewed concise Effect 4 CLI help rendering; funnel, HR-request, public-holiday, HR-report, and person-administration routes are added without changing other route behavior."
      }
  }
}

const categorizeOracleDeltas = (
  deltas: ReadonlyArray<OracleDelta>,
  candidateToolIdentities: CandidateToolIdentities = EMPTY_CANDIDATE_TOOL_IDENTITIES,
  isIssue97ExpansionDelta: (path: string) => boolean = () => false
): {
  readonly categorized: Map<ReviewCategory, Array<OracleDelta>>
  readonly unclassified: ReadonlyArray<OracleDelta>
} => {
  const categorized = new Map<ReviewCategory, Array<OracleDelta>>()
  const unclassified: Array<OracleDelta> = []
  for (const delta of deltas) {
    const category = oracleDeltaReviewCategory(delta, candidateToolIdentities, isIssue97ExpansionDelta)
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
  candidateToolIdentities: CandidateToolIdentities = EMPTY_CANDIDATE_TOOL_IDENTITIES,
  isIssue97ExpansionDelta: (path: string) => boolean = () => false
): OracleDeltaReview => {
  const { categorized, unclassified } = categorizeOracleDeltas(deltas, candidateToolIdentities, isIssue97ExpansionDelta)
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

const sameToolOrder = (left: ReadonlyArray<ToolNameType>, right: ReadonlyArray<ToolNameType>): boolean =>
  left.length === right.length && left.every((name, index) => name === right[index])

const issue97ExpansionStart = (
  baseline: ReadonlyArray<ToolNameType>,
  current: ReadonlyArray<ToolNameType>
): number | undefined => {
  const withoutIssue97Tools = current.filter((name) => !ISSUE_97_ADMINISTRATION_TOOL_NAMES.has(name))
  if (!sameToolOrder(baseline, withoutIssue97Tools)) return undefined
  const start = current.findIndex((name) => ISSUE_97_ADMINISTRATION_TOOL_NAMES.has(name))
  return start < 0 ? undefined : start
}

const pathAtOrAfter = (path: string, prefix: string, start: number | undefined): boolean => {
  if (start === undefined) return false
  const match = new RegExp(`^${prefix}/(\\d+)(?:/|$)`, "u").exec(path)
  return match?.[1] !== undefined && Number(match[1]) >= start
}

const nativeToolNames = (responses: ReadonlyArray<OracleJsonRpcResponse>, responseIndex: number) => {
  const response = responses[responseIndex]
  if (response === undefined) return []
  const decoded = Schema.decodeUnknownOption(CandidateListToolsResponseSchema)(response)
  return Option.isSome(decoded) ? decoded.value.result.tools.map((tool) => tool.name) : []
}

const makeIssue97ExpansionClassifier = (
  baseline: BehavioralOracle,
  current: BehavioralOracle
): ((path: string) => boolean) => {
  const starts = {
    authored: issue97ExpansionStart(
      baseline.registry.authoredConstraints.map((entry) => entry.toolName),
      current.registry.authoredConstraints.map((entry) => entry.toolName)
    ),
    operationOrder: issue97ExpansionStart(baseline.registry.operationOrder, current.registry.operationOrder),
    rawOrder: issue97ExpansionStart(baseline.registry.rawOrder, current.registry.rawOrder),
    routes: issue97ExpansionStart(
      baseline.cli.routes.map((route) => route.toolName),
      current.cli.routes.map((route) => route.toolName)
    ),
    tools: issue97ExpansionStart(
      baseline.registry.tools.map((entry) => entry.name),
      current.registry.tools.map((entry) => entry.name)
    )
  }
  const nativeStarts = current.bundledProcesses.stdio.native.map((_, responseIndex) =>
    issue97ExpansionStart(
      nativeToolNames(baseline.bundledProcesses.stdio.native, responseIndex),
      nativeToolNames(current.bundledProcesses.stdio.native, responseIndex)
    )
  )
  const registryExpansion = starts.rawOrder !== undefined && starts.operationOrder !== undefined
  const routeExpansion = starts.routes !== undefined
  return (path) => {
    if (pathAtOrAfter(path, "/registry/authoredConstraints", starts.authored)) return true
    if (pathAtOrAfter(path, "/registry/operationOrder", starts.operationOrder)) return true
    if (pathAtOrAfter(path, "/registry/rawOrder", starts.rawOrder)) return true
    if (pathAtOrAfter(path, "/registry/tools", starts.tools)) return true
    if (pathAtOrAfter(path, "/cli/routes", starts.routes)) return true
    const native = /^\/bundledProcesses\/stdio\/native\/(\d+)\/result\/tools\/(\d+)(?:\/|$)/u.exec(path)
    if (native?.[1] !== undefined && native[2] !== undefined) {
      const start = nativeStarts[Number(native[1])]
      if (start !== undefined && Number(native[2]) >= start) return true
    }
    return (
      path.startsWith("/cli/parity/live/") &&
      ((path.endsWith("/registryOperations") && registryExpansion) || (path.endsWith("/cliRoutes") && routeExpansion))
    )
  }
}

export const createOracleDeltaAuditReport = (
  baselineJson: string,
  currentJson: string,
  baseline: BehavioralOracle,
  current: BehavioralOracle,
  deltas: ReadonlyArray<OracleDelta>
): OracleDeltaAuditReport => {
  const candidateToolIdentities = parseCandidateToolIdentities(current.bundledProcesses.stdio.native)
  const isIssue97ExpansionDelta = makeIssue97ExpansionClassifier(baseline, current)
  const { categorized, unclassified } = categorizeOracleDeltas(deltas, candidateToolIdentities, isIssue97ExpansionDelta)
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
    certificate: createOracleDeltaReview(
      baselineJson,
      currentJson,
      deltas,
      candidateToolIdentities,
      isIssue97ExpansionDelta
    ),
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

  const decodeOracle = Schema.decodeUnknownOption(Schema.fromJsonString(BehavioralOracleSchema))
  const baseline = decodeOracle(baselineJson)
  const candidate = decodeOracle(currentJson)
  const candidateToolIdentities = Option.isSome(candidate)
    ? parseCandidateToolIdentities(candidate.value.bundledProcesses.stdio.native)
    : EMPTY_CANDIDATE_TOOL_IDENTITIES
  const isIssue97ExpansionDelta =
    Option.isSome(baseline) && Option.isSome(candidate)
      ? makeIssue97ExpansionClassifier(baseline.value, candidate.value)
      : () => false
  const { categorized, unclassified } = categorizeOracleDeltas(deltas, candidateToolIdentities, isIssue97ExpansionDelta)
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
