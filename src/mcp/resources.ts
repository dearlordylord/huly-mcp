/**
 * MCP Resources support for read-only Huly context.
 *
 * @module
 */
import {
  ErrorCode,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  McpError,
  type ReadResourceResult
} from "@modelcontextprotocol/sdk/types.js"
import { Effect, ParseResult, Schema } from "effect"

import {
  type Issue,
  IssueSchema,
  parseGetIssueParams,
  parseGetProjectParams,
  parseListProjectsParams,
  type Project,
  ProjectSchema,
  type ProjectSummary
} from "../domain/schemas.js"
import { IssueIdentifier, MAX_LIMIT, ProjectIdentifier } from "../domain/schemas/shared.js"
import type { HulyClient } from "../huly/client.js"
import type { Diagnostics } from "../huly/diagnostics.js"
import type { HulyDomainError } from "../huly/errors.js"
import { getIssue } from "../huly/operations/issues.js"
import { getProject, listProjects } from "../huly/operations/projects.js"
import { formatParseError, McpErrorCode } from "./error-mapping.js"

export const HULY_RESOURCE_MIME_TYPE = "application/json"

const ProjectResourceEnvelopeSchema = Schema.Struct({
  type: Schema.Literal("huly.project"),
  uri: Schema.String,
  project: ProjectSchema
})

const IssueResourceEnvelopeSchema = Schema.Struct({
  type: Schema.Literal("huly.issue"),
  uri: Schema.String,
  issue: IssueSchema
})

type ProjectResourceEnvelope = Schema.Schema.Type<typeof ProjectResourceEnvelopeSchema>
type IssueResourceEnvelope = Schema.Schema.Type<typeof IssueResourceEnvelopeSchema>

export const resourceTemplates: ListResourceTemplatesResult["resourceTemplates"] = [
  {
    uriTemplate: "huly://projects/{project}",
    name: "huly-project",
    title: "Huly Project",
    description:
      "Read full details for a Huly tracker project by project identifier, for example huly://projects/HULY.",
    mimeType: HULY_RESOURCE_MIME_TYPE
  },
  {
    uriTemplate: "huly://issues/{issue}",
    name: "huly-issue",
    title: "Huly Issue",
    description: "Read full details for a Huly issue by full issue identifier, for example huly://issues/HULY-123.",
    mimeType: HULY_RESOURCE_MIME_TYPE
  },
  {
    uriTemplate: "huly://projects/{project}/issues/{issue}",
    name: "huly-project-issue",
    title: "Huly Project Issue",
    description:
      "Read full details for a Huly issue by project identifier and issue number, for example huly://projects/HULY/issues/123.",
    mimeType: HULY_RESOURCE_MIME_TYPE
  }
]

type HulyResource =
  | {
    readonly _tag: "project"
    readonly uri: string
    readonly project: ProjectIdentifier
  }
  | {
    readonly _tag: "issue"
    readonly uri: string
    readonly project: ProjectIdentifier
    readonly identifier: IssueIdentifier
  }

type HulyResourceHost = "projects" | "issues"

const expectedFormats =
  "Expected huly://projects/{project}, huly://issues/{PROJECT-NUMBER}, or huly://projects/{project}/issues/{issue}."

const EXPLICIT_ISSUE_URI_SEGMENTS = 3

const invalidResourceUri = (uri: string, message: string): McpError =>
  new McpError(ErrorCode.InvalidParams, `Invalid Huly resource URI "${uri}": ${message} ${expectedFormats}`)

const decodePathSegment = (uri: string, value: string): string => {
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.trim() === "" || decoded.trim() !== decoded || decoded.includes("/")) {
      throw invalidResourceUri(
        uri,
        "Resource URI path segments must be non-empty trimmed identifiers without slashes."
      )
    }
    return decoded
  } catch (e) {
    if (e instanceof McpError) throw e
    throw invalidResourceUri(uri, "Resource URI contains an invalid percent-encoded path segment.")
  }
}

const splitPath = (uri: string, url: URL): ReadonlyArray<string> => {
  if (url.pathname === "") return []
  /* v8 ignore start -- defensive: a non-empty WHATWG URL pathname always begins with "/" */
  if (!url.pathname.startsWith("/")) throw invalidResourceUri(uri, "Resource URI path is malformed.")
  /* v8 ignore stop */

  const rawSegments = url.pathname.slice(1).split("/")
  if (rawSegments.some(segment => segment === "")) {
    throw invalidResourceUri(uri, "Resource URI path segments must be non-empty.")
  }
  return rawSegments.map(segment => decodePathSegment(uri, segment))
}

const parseResourceHost = (uri: string, hostname: string): HulyResourceHost => {
  switch (hostname) {
    case "projects":
    case "issues":
      return hostname
    default:
      throw invalidResourceUri(uri, "Unsupported Huly resource host.")
  }
}

const isSingleSegment = (segments: ReadonlyArray<string>): segments is readonly [string] => segments.length === 1

const isProjectIssueSegments = (
  segments: ReadonlyArray<string>
): segments is readonly [string, "issues", string] =>
  segments.length === EXPLICIT_ISSUE_URI_SEGMENTS && segments[1] === "issues"

const splitFullIssueIdentifier = (
  uri: string,
  issue: string
): { readonly project: ProjectIdentifier; readonly identifier: IssueIdentifier } => {
  const separatorIndex = issue.indexOf("-")
  if (separatorIndex <= 0 || separatorIndex === issue.length - 1) {
    throw invalidResourceUri(uri, "huly://issues/{issue} requires a full issue identifier with a project prefix.")
  }
  return {
    project: parseProjectIdentifier(uri, issue.slice(0, separatorIndex)),
    identifier: parseIssueIdentifier(uri, issue)
  }
}

const parseProjectIdentifier = (uri: string, value: string): ProjectIdentifier => {
  try {
    return Schema.decodeUnknownSync(ProjectIdentifier)(value)
    /* v8 ignore start -- defensive: callers pass decodePathSegment output, a non-empty trimmed string the NonEmptyString brand always accepts */
  } catch {
    throw invalidResourceUri(uri, "Project identifier is invalid.")
  }
  /* v8 ignore stop */
}

const parseIssueIdentifier = (uri: string, value: string): IssueIdentifier => {
  try {
    return Schema.decodeUnknownSync(IssueIdentifier)(value)
    /* v8 ignore start -- defensive: see parseProjectIdentifier; pre-validated segments never reject */
  } catch {
    throw invalidResourceUri(uri, "Issue identifier is invalid.")
  }
  /* v8 ignore stop */
}

const parseResourceUrl = (uri: string): URL => {
  try {
    return new URL(uri)
  } catch {
    throw invalidResourceUri(uri, "Resource URI must be an absolute huly:// URI.")
  }
}

export const parseHulyResourceUri = (uri: string): HulyResource => {
  const url = parseResourceUrl(uri)
  if (url.protocol !== "huly:") {
    throw invalidResourceUri(uri, "Resource URI must use the huly:// scheme.")
  }

  const host = parseResourceHost(uri, url.hostname)
  const segments = splitPath(uri, url)

  switch (host) {
    case "projects":
      if (isSingleSegment(segments)) {
        return {
          _tag: "project",
          uri,
          project: parseProjectIdentifier(uri, segments[0])
        }
      }
      if (isProjectIssueSegments(segments)) {
        return {
          _tag: "issue",
          uri,
          project: parseProjectIdentifier(uri, segments[0]),
          identifier: parseIssueIdentifier(uri, segments[2])
        }
      }
      throw invalidResourceUri(uri, "Unsupported Huly project resource path.")

    case "issues": {
      if (!isSingleSegment(segments)) {
        throw invalidResourceUri(uri, "Unsupported Huly issue resource path.")
      }
      const issue = splitFullIssueIdentifier(uri, segments[0])
      return {
        _tag: "issue",
        uri,
        project: issue.project,
        identifier: issue.identifier
      }
    }
  }
}

const projectSummaryResource = (project: ProjectSummary): ListResourcesResult["resources"][number] => ({
  uri: `huly://projects/${encodeURIComponent(project.identifier)}`,
  name: project.identifier,
  title: project.name,
  description: project.description ?? `Huly project ${project.identifier}`,
  mimeType: HULY_RESOURCE_MIME_TYPE
})

const mapListErrorToMcp = (error: HulyDomainError | ParseResult.ParseError): McpError => {
  // defensive: listResources passes hardcoded valid params, so the parse channel never yields a
  // ParseError at runtime — but the union type keeps this branch for type-completeness.
  /* v8 ignore start */
  if (ParseResult.isParseError(error)) {
    return new McpError(
      ErrorCode.InternalError,
      `Failed to list Huly resources: ${formatParseError(error)}.`
    )
  }
  /* v8 ignore stop */

  if (error._tag === "HulyAuthError") {
    return new McpError(
      ErrorCode.InternalError,
      "Authentication error while listing Huly resources. Check Huly credentials or request headers."
    )
  }

  if (error._tag === "HulyConnectionError") {
    return new McpError(
      ErrorCode.InternalError,
      "Connection error while listing Huly resources. Verify Huly URL, workspace, and network connectivity."
    )
  }

  // defensive: listProjects can only surface a connection or auth client error (HulyClientError =
  // ConnectionError) plus parse errors, all handled above, so the generic fallback is unreachable.
  /* v8 ignore next */
  return new McpError(ErrorCode.InternalError, "Failed to list Huly resources.")
}

export const listResources = (): Effect.Effect<ListResourcesResult, McpError, HulyClient> =>
  parseListProjectsParams({ includeArchived: false, limit: MAX_LIMIT }).pipe(
    Effect.flatMap(listProjects),
    Effect.map(result => ({
      resources: result.projects.map(projectSummaryResource)
    })),
    Effect.mapError(mapListErrorToMcp)
  )

export const listResourceTemplates = (): ListResourceTemplatesResult => ({ resourceTemplates })

const isNotFoundError = (error: HulyDomainError): boolean =>
  error._tag === "ProjectNotFoundError" || error._tag === "IssueNotFoundError"

const mapReadErrorToMcp = (uri: string, error: HulyDomainError | ParseResult.ParseError): McpError => {
  // defensive: readParsedHulyResource passes pre-validated params, so the parse channel never yields
  // a ParseError at runtime — but the union type keeps this branch for type-completeness.
  /* v8 ignore start */
  if (ParseResult.isParseError(error)) {
    return new McpError(
      ErrorCode.InvalidParams,
      `Invalid Huly resource URI "${uri}": ${formatParseError(error)}. ${expectedFormats}`
    )
  }
  /* v8 ignore stop */

  if (isNotFoundError(error)) {
    return new McpError(McpErrorCode.ResourceNotFound, "Resource not found", { uri })
  }

  if (error._tag === "HulyAuthError") {
    return new McpError(
      ErrorCode.InternalError,
      `Authentication error while reading Huly resource "${uri}". Check Huly credentials or request headers.`
    )
  }

  if (error._tag === "HulyConnectionError") {
    return new McpError(
      ErrorCode.InternalError,
      `Connection error while reading Huly resource "${uri}". Verify Huly URL, workspace, and network connectivity.`
    )
  }

  // defensive: getProject/getIssue surface only not-found, connection, or auth errors (all handled
  // above) plus parse errors, so the generic fallback is unreachable.
  /* v8 ignore next */
  return new McpError(ErrorCode.InternalError, `Failed to read Huly resource "${uri}".`)
}

const projectJsonText = (value: ProjectResourceEnvelope): string =>
  JSON.stringify(Schema.encodeUnknownSync(ProjectResourceEnvelopeSchema)(value))

const issueJsonText = (value: IssueResourceEnvelope): string =>
  JSON.stringify(Schema.encodeUnknownSync(IssueResourceEnvelopeSchema)(value))

const projectReadResult = (uri: string, project: Project): ReadResourceResult => ({
  contents: [{
    uri,
    mimeType: HULY_RESOURCE_MIME_TYPE,
    text: projectJsonText({
      type: "huly.project",
      uri,
      project
    })
  }]
})

const issueReadResult = (uri: string, issue: Issue): ReadResourceResult => ({
  contents: [{
    uri,
    mimeType: HULY_RESOURCE_MIME_TYPE,
    text: issueJsonText({
      type: "huly.issue",
      uri,
      issue
    })
  }]
})

// defensive: HulyResource is a closed union of "project" | "issue", both handled in the switch
// below; this exhaustiveness guard is unreachable at runtime.
/* v8 ignore start */
const absurdResource = (_resource: never): never => {
  throw new McpError(ErrorCode.InternalError, "Unsupported Huly resource type.")
}
/* v8 ignore stop */

const readParsedHulyResource = (
  resource: HulyResource
): Effect.Effect<ReadResourceResult, McpError, HulyClient | Diagnostics> => {
  switch (resource._tag) {
    case "project":
      return parseGetProjectParams({ project: resource.project }).pipe(
        Effect.flatMap(getProject),
        Effect.map(project => projectReadResult(resource.uri, project)),
        Effect.mapError(error => mapReadErrorToMcp(resource.uri, error))
      )

    case "issue":
      return parseGetIssueParams({ project: resource.project, identifier: resource.identifier }).pipe(
        Effect.flatMap(getIssue),
        Effect.map(issue => issueReadResult(resource.uri, issue)),
        Effect.mapError(error => mapReadErrorToMcp(resource.uri, error))
      )

    /* v8 ignore next 2 -- defensive: exhaustive over the HulyResource union */
    default:
      return absurdResource(resource)
  }
}

export const readHulyResource = (
  uri: string
): Effect.Effect<ReadResourceResult, McpError, HulyClient | Diagnostics> =>
  Effect.try({
    try: () => parseHulyResourceUri(uri),
    /* v8 ignore start -- defensive: parseHulyResourceUri only ever throws McpError, so the else branch is unreachable */
    catch: (e) =>
      e instanceof McpError
        ? e
        : new McpError(ErrorCode.InvalidParams, `Invalid Huly resource URI "${uri}". ${expectedFormats}`)
    /* v8 ignore stop */
  }).pipe(
    Effect.flatMap(readParsedHulyResource)
  )
