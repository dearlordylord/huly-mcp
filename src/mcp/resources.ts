/**
 * MCP Resources support for read-only Huly context.
 *
 * @module
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  ErrorCode,
  ListResourcesRequestSchema,
  type ListResourcesResult,
  ListResourceTemplatesRequestSchema,
  type ListResourceTemplatesResult,
  McpError,
  ReadResourceRequestSchema,
  type ReadResourceResult
} from "@modelcontextprotocol/sdk/types.js"
import { Cause, Chunk, Effect, Exit, ParseResult, Schema } from "effect"

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
import { HulyClient } from "../huly/client.js"
import type { HulyDomainError } from "../huly/errors.js"
import { getIssue } from "../huly/operations/issues.js"
import { getProject, listProjects } from "../huly/operations/projects.js"
import { formatParseError } from "./error-mapping.js"

export const HULY_RESOURCE_MIME_TYPE = "application/json"

const RESOURCE_NOT_FOUND = -32002
const RESOURCE_LIST_LIMIT = 200

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
    readonly project: string
  }
  | {
    readonly _tag: "issue"
    readonly uri: string
    readonly project: string
    readonly identifier: string
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
  if (!url.pathname.startsWith("/")) throw invalidResourceUri(uri, "Resource URI path is malformed.")

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
): { readonly project: string; readonly identifier: string } => {
  const separatorIndex = issue.indexOf("-")
  if (separatorIndex <= 0 || separatorIndex === issue.length - 1) {
    throw invalidResourceUri(uri, "huly://issues/{issue} requires a full issue identifier with a project prefix.")
  }
  return {
    project: issue.slice(0, separatorIndex),
    identifier: issue
  }
}

export const parseHulyResourceUri = (uri: string): HulyResource => {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    throw invalidResourceUri(uri, "Resource URI must be an absolute huly:// URI.")
  }

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
          project: segments[0]
        }
      }
      if (isProjectIssueSegments(segments)) {
        return {
          _tag: "issue",
          uri,
          project: segments[0],
          identifier: segments[2]
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
  if (ParseResult.isParseError(error)) {
    return new McpError(
      ErrorCode.InternalError,
      `Failed to list Huly resources: ${formatParseError(error)}.`
    )
  }

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

  return new McpError(ErrorCode.InternalError, "Failed to list Huly resources.")
}

export const listResources = (): Effect.Effect<ListResourcesResult, McpError, HulyClient> =>
  parseListProjectsParams({ includeArchived: false, limit: RESOURCE_LIST_LIMIT }).pipe(
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
  if (ParseResult.isParseError(error)) {
    return new McpError(
      ErrorCode.InvalidParams,
      `Invalid Huly resource URI "${uri}": ${formatParseError(error)}. ${expectedFormats}`
    )
  }

  if (isNotFoundError(error)) {
    return new McpError(RESOURCE_NOT_FOUND, "Resource not found", { uri })
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

const absurdResource = (_resource: never): never => {
  throw new McpError(ErrorCode.InternalError, "Unsupported Huly resource type.")
}

const readParsedHulyResource = (
  resource: HulyResource
): Effect.Effect<ReadResourceResult, McpError, HulyClient> => {
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

    default:
      return absurdResource(resource)
  }
}

export const readHulyResource = (
  uri: string
): Effect.Effect<ReadResourceResult, McpError, HulyClient> =>
  Effect.try({
    try: () => parseHulyResourceUri(uri),
    catch: (e) =>
      e instanceof McpError
        ? e
        : new McpError(ErrorCode.InvalidParams, `Invalid Huly resource URI "${uri}". ${expectedFormats}`)
  }).pipe(
    Effect.flatMap(readParsedHulyResource)
  )

const createResourceClientResolutionError = (uri: string, _error: unknown): McpError =>
  new McpError(
    ErrorCode.InternalError,
    `Failed to initialize Huly clients while reading resource "${uri}". Verify Huly URL, workspace, and authentication configuration.`
  )

const createResourceListClientResolutionError = (_error: unknown): McpError =>
  new McpError(
    ErrorCode.InternalError,
    "Failed to initialize Huly clients while listing resources. Verify Huly URL, workspace, and authentication configuration."
  )

interface ResourceClientBundle {
  readonly hulyClient: HulyClient["Type"]
}

interface InflightResourceGuard {
  readonly enter: () => void
  readonly leave: () => void
}

const throwResourceReadError = (uri: string, cause: Cause.Cause<McpError>): never => {
  const failures = Chunk.toArray(Cause.failures(cause))
  const failure = failures[0]
  if (failure instanceof McpError) throw failure
  throw new McpError(ErrorCode.InternalError, `Failed to read Huly resource "${uri}"`)
}

const throwResourceListError = (cause: Cause.Cause<McpError>): never => {
  const failures = Chunk.toArray(Cause.failures(cause))
  const failure = failures[0]
  if (failure instanceof McpError) throw failure
  throw new McpError(ErrorCode.InternalError, "Failed to list Huly resources")
}

export const registerResourceHandlers = (
  server: Server,
  resolveClients: () => Promise<ResourceClientBundle>,
  inflight?: InflightResourceGuard
): void => {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    inflight?.enter()
    try {
      let clients: ResourceClientBundle
      try {
        clients = await resolveClients()
      } catch (e) {
        throw createResourceListClientResolutionError(e)
      }

      const resourceList = await Effect.runPromiseExit(
        listResources().pipe(
          Effect.provideService(HulyClient, clients.hulyClient)
        )
      )
      if (Exit.isSuccess(resourceList)) return resourceList.value
      return throwResourceListError(resourceList.cause)
    } finally {
      inflight?.leave()
    }
  })
  server.setRequestHandler(ListResourceTemplatesRequestSchema, listResourceTemplates)
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    inflight?.enter()
    try {
      const { uri } = request.params
      let clients: ResourceClientBundle
      try {
        clients = await resolveClients()
      } catch (e) {
        throw createResourceClientResolutionError(uri, e)
      }

      const resourceRead = await Effect.runPromiseExit(
        readHulyResource(uri).pipe(
          Effect.provideService(HulyClient, clients.hulyClient)
        )
      )
      if (Exit.isSuccess(resourceRead)) return resourceRead.value
      return throwResourceReadError(uri, resourceRead.cause)
    } finally {
      inflight?.leave()
    }
  })
}
