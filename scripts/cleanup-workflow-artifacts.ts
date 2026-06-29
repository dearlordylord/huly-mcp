/* eslint-disable max-lines -- Operational cleanup command; splitting it is outside this rebase and would obscure conflict resolution. */
import type {
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  FindResult,
  Ref,
  Status,
  TxOperations
} from "@hcengineering/core"
import type { ProjectStatus, ProjectType, TaskType } from "@hcengineering/task"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: api-client does not expose these helpers as ESM runtime named exports under tsx.
const apiClient = require("@hcengineering/api-client") as typeof import("@hcengineering/api-client")
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: Huly plugin packages expose CommonJS defaults under tsx.
const coreModule = require("@hcengineering/core") as typeof import("@hcengineering/core")
const core = coreModule.default
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: Huly plugin packages expose CommonJS defaults under tsx.
const task = require("@hcengineering/task").default as typeof import("@hcengineering/task").default
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: Huly plugin packages expose CommonJS defaults under tsx.
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default

const DEFAULT_PROJECT_TYPE_NAME = "Classic"

interface Args {
  readonly taskTypeNames: ReadonlyArray<string>
  readonly taskTypePrefixes: ReadonlyArray<string>
  readonly statusNames: ReadonlyArray<string>
  readonly statusPrefixes: ReadonlyArray<string>
  readonly issueTitlePrefixes: ReadonlyArray<string>
  readonly projectType: string | undefined
  readonly dryRun: boolean
  readonly deleteTestIssues: boolean
}

interface WorkflowArtifacts {
  readonly projectType: ProjectType
  readonly taskTypes: ReadonlyArray<TaskType>
  readonly statuses: ReadonlyArray<Status>
}

interface CleanupConnection {
  readonly tx: TxOperations
  readonly rest: RestReadClient
}

interface RestReadClient {
  readonly endpoint: string
  readonly token: string
  readonly workspaceId: string
}

const usage = `Usage:
  pnpm exec tsx scripts/cleanup-workflow-artifacts.ts [options]

Options:
  --task-type-name <name>       Exact task type name to remove
  --task-type-prefix <prefix>   Task type name prefix to remove
  --status-name <name>          Exact status name to remove
  --status-prefix <prefix>      Status name prefix to remove
  --issue-title-prefix <prefix> Delete matching issues when they use matched workflow artifacts
  --project-type <id-or-name>   Project type to clean; omit to use ${DEFAULT_PROJECT_TYPE_NAME}
  --delete-test-issues          Delete matching issues before workflow cleanup
  --dry-run                     Print planned changes without writing
`

const readValue = (args: ReadonlyArray<string>, index: number, flag: string): string => {
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.\n${usage}`)
  }
  return value
}

const parseArgs = (argv: ReadonlyArray<string>): Args => {
  const taskTypeNames: Array<string> = []
  const taskTypePrefixes: Array<string> = []
  const statusNames: Array<string> = []
  const statusPrefixes: Array<string> = []
  const issueTitlePrefixes: Array<string> = []
  let projectType: string | undefined
  let dryRun = false
  let deleteTestIssues = false

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case "--task-type-name":
        taskTypeNames.push(readValue(argv, index, arg))
        index++
        break
      case "--task-type-prefix":
        taskTypePrefixes.push(readValue(argv, index, arg))
        index++
        break
      case "--status-name":
        statusNames.push(readValue(argv, index, arg))
        index++
        break
      case "--status-prefix":
        statusPrefixes.push(readValue(argv, index, arg))
        index++
        break
      case "--issue-title-prefix":
        issueTitlePrefixes.push(readValue(argv, index, arg))
        index++
        break
      case "--project-type":
        projectType = readValue(argv, index, arg)
        index++
        break
      case "--dry-run":
        dryRun = true
        break
      case "--delete-test-issues":
        deleteTestIssues = true
        break
      case "--help":
        console.log(usage)
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}\n${usage}`)
    }
  }

  if (
    taskTypeNames.length === 0
    && taskTypePrefixes.length === 0
    && statusNames.length === 0
    && statusPrefixes.length === 0
  ) {
    throw new Error(`At least one task type or status selector is required.\n${usage}`)
  }

  return {
    deleteTestIssues,
    dryRun,
    issueTitlePrefixes,
    projectType,
    statusNames,
    statusPrefixes,
    taskTypeNames,
    taskTypePrefixes
  }
}

const requiredEnv = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required.`)
  return value
}

const connect = async (): Promise<CleanupConnection> => {
  const url = requiredEnv("HULY_URL")
  const workspace = requiredEnv("HULY_WORKSPACE")
  const serverConfig = await apiClient.loadServerConfig(url)
  const token = process.env["HULY_TOKEN"]
  const auth = token !== undefined && token.trim() !== ""
    ? { token, workspace }
    : {
      email: requiredEnv("HULY_EMAIL"),
      password: requiredEnv("HULY_PASSWORD"),
      workspace
    }
  const { endpoint, token: workspaceToken, workspaceId } = await apiClient.getWorkspaceToken(url, auth, serverConfig)
  return {
    rest: { endpoint: endpoint.replace("ws", "http"), token: workspaceToken, workspaceId },
    tx: await apiClient.createRestTxOperations(endpoint, workspaceId, workspaceToken)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isTotalArrayPayload = (
  value: unknown
): value is { readonly value: ReadonlyArray<unknown>; readonly total?: unknown; readonly lookupMap?: unknown } =>
  isRecord(value) && value["dataType"] === "TotalArray" && Array.isArray(value["value"])

const toOptionalLookupMap = (value: unknown): Record<string, Doc> | undefined =>
  // eslint-disable-next-line no-restricted-syntax -- REST TotalArray lookup maps are SDK DTOs revived from JSON.
  isRecord(value) ? value as Record<string, Doc> : undefined

const totalArrayReviver = (_key: string, value: unknown): unknown => {
  if (!isTotalArrayPayload(value)) return value
  return Object.assign([...value.value], {
    lookupMap: toOptionalLookupMap(value.lookupMap),
    total: typeof value.total === "number" ? value.total : value.value.length
  })
}

const fetchJson = async <T>(response: Response): Promise<T> => {
  const json = await response.text()
  // eslint-disable-next-line no-restricted-syntax -- REST endpoint shape is owned by the Huly SDK; callers provide the SDK DTO type.
  return JSON.parse(json, totalArrayReviver) as T
}

const rawFindAll = async <T extends Doc>(
  rest: RestReadClient,
  _class: Ref<Class<T>>,
  query: DocumentQuery<T>,
  options?: FindOptions<T>
): Promise<FindResult<T>> => {
  const params = new URLSearchParams()
  params.append("class", _class)
  if (Object.keys(query).length > 0) {
    params.append("query", JSON.stringify(query))
  }
  if (options !== undefined && Object.keys(options).length > 0) {
    params.append("options", JSON.stringify(options))
  }

  const requestUrl = coreModule.concatLink(rest.endpoint, `/api/v1/find-all/${rest.workspaceId}?${params.toString()}`)
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${rest.token}`,
      "Content-Type": "application/json"
    },
    method: "GET"
  })
  if (!response.ok) {
    throw new Error(`find-all ${_class} failed: ${response.status} ${response.statusText}`)
  }
  const result = await fetchJson<FindResult<T> & { readonly error?: unknown }>(response)
  if (result.error !== undefined) {
    throw new Error(`find-all ${_class} failed: ${JSON.stringify(result.error)}`)
  }
  return result
}

const normalize = (value: string): string => value.trim().toLowerCase()

const matchesName = (
  name: string,
  exactNames: ReadonlyArray<string>,
  prefixes: ReadonlyArray<string>
): boolean => {
  const normalizedName = normalize(name)
  return exactNames.some((exact) => normalizedName === normalize(exact))
    || prefixes.some((prefix) => normalizedName.startsWith(normalize(prefix)))
}

const uniqueRefs = <T extends Doc>(refs: ReadonlyArray<Ref<T>>): Array<Ref<T>> =>
  refs.reduce<Array<Ref<T>>>((unique, ref) => unique.includes(ref) ? unique : [...unique, ref], [])

const sameProjectStatus = (left: ProjectStatus, right: ProjectStatus): boolean =>
  left._id === right._id && left.taskType === right.taskType

const uniqueProjectStatuses = (statuses: ReadonlyArray<ProjectStatus>): Array<ProjectStatus> =>
  statuses.reduce<Array<ProjectStatus>>(
    (unique, status) => unique.some((existing) => sameProjectStatus(existing, status)) ? unique : [...unique, status],
    []
  )

const isClassicProjectType = (projectType: ProjectType): boolean =>
  projectType._id === tracker.ids.ClassingProjectType
  || projectType.classic
  || normalize(projectType.name) === normalize(DEFAULT_PROJECT_TYPE_NAME)

const resolveProjectType = (
  projectTypes: ReadonlyArray<ProjectType>,
  projectTypeRef: string | undefined
): ProjectType => {
  const selected = projectTypeRef === undefined
    ? projectTypes.filter(isClassicProjectType)
    : projectTypes.filter((projectType) =>
      projectType._id === projectTypeRef || normalize(projectType.name) === normalize(projectTypeRef)
    )
  if (selected.length !== 1 || selected[0] === undefined) {
    throw new Error(
      projectTypeRef === undefined
        ? `Could not select ${DEFAULT_PROJECT_TYPE_NAME} project type unambiguously; pass --project-type.`
        : `Project type '${projectTypeRef}' did not resolve to exactly one project type.`
    )
  }
  return selected[0]
}

const titleMatches = (issue: HulyIssue, prefixes: ReadonlyArray<string>): boolean => {
  if (prefixes.length === 0) return true
  return prefixes.some((prefix) => issue.title.startsWith(prefix))
}

const findIssues = async (
  rest: RestReadClient,
  taskTypeIds: ReadonlyArray<Ref<TaskType>>,
  statusIds: ReadonlyArray<Ref<Status>>,
  titlePrefixes: ReadonlyArray<string>
): Promise<ReadonlyArray<HulyIssue>> => {
  const byTaskType = taskTypeIds.length === 0
    ? []
    : await rawFindAll<HulyIssue>(
      rest,
      tracker.class.Issue,
      { kind: { $in: [...taskTypeIds] } },
      { limit: 1000 }
    )
  const byStatus = statusIds.length === 0
    ? []
    : await rawFindAll<HulyIssue>(
      rest,
      tracker.class.Issue,
      { status: { $in: [...statusIds] } },
      { limit: 1000 }
    )
  const issuesById = new Map<string, HulyIssue>()
  for (const issue of [...byTaskType, ...byStatus]) {
    if (titleMatches(issue, titlePrefixes)) {
      issuesById.set(issue._id, issue)
    }
  }
  return [...issuesById.values()]
}

const loadArtifacts = async (
  rest: RestReadClient,
  args: Args
): Promise<WorkflowArtifacts> => {
  const projectTypes = await rawFindAll<ProjectType>(rest, task.class.ProjectType, {})
  const projectType = resolveProjectType([...projectTypes], args.projectType)

  const projectTypeTaskTypes = await rawFindAll<TaskType>(
    rest,
    task.class.TaskType,
    { parent: projectType._id },
    { limit: 1000 }
  )
  const taskTypesById = new Map<string, TaskType>()
  for (const taskType of projectTypeTaskTypes) {
    taskTypesById.set(taskType._id, taskType)
  }

  const taskTypeIds = uniqueRefs(projectType.tasks)
  if (taskTypeIds.length > 0) {
    const referencedTaskTypes = await rawFindAll<TaskType>(
      rest,
      task.class.TaskType,
      { _id: { $in: taskTypeIds } },
      { limit: 1000 }
    )
    for (const taskType of referencedTaskTypes) {
      taskTypesById.set(taskType._id, taskType)
    }
  }

  const statusIds = uniqueRefs(projectType.statuses.map((status) => status._id))
  const statuses = statusIds.length === 0
    ? []
    : await rawFindAll<Status>(
      rest,
      core.class.Status,
      { _id: { $in: statusIds } },
      { limit: 1000 }
    )

  return {
    projectType,
    statuses: [...statuses].filter((status) => matchesName(status.name, args.statusNames, args.statusPrefixes)),
    taskTypes: [...taskTypesById.values()].filter((taskType) =>
      matchesName(taskType.name, args.taskTypeNames, args.taskTypePrefixes)
    )
  }
}

const maybeUpdateDoc = async <T extends Doc>(
  client: TxOperations,
  dryRun: boolean,
  _class: Ref<Class<T>>,
  space: Doc["space"],
  objectId: Ref<T>,
  operations: DocumentUpdate<T>
): Promise<void> => {
  if (!dryRun) await client.updateDoc(_class, space, objectId, operations)
}

const maybeRemoveDoc = async <T extends Doc>(
  client: TxOperations,
  dryRun: boolean,
  _class: Ref<Class<T>>,
  space: Doc["space"],
  objectId: Ref<T>,
  warnOnly = false
): Promise<void> => {
  if (!dryRun) {
    try {
      await client.removeDoc(_class, space, objectId)
    } catch (error) {
      const message = `removeDoc failed for ${objectId}: ${error instanceof Error ? error.message : String(error)}`
      if (!warnOnly) throw new Error(message)
      console.warn(`Warning: ${message}`)
    }
  }
}

const removeWorkflowArtifacts = async (
  connection: CleanupConnection,
  args: Args
): Promise<void> => {
  const { rest, tx } = connection
  const artifacts = await loadArtifacts(rest, args)
  const taskTypeIds = uniqueRefs(artifacts.taskTypes.map((taskType) => taskType._id))
  const statusIds = uniqueRefs(artifacts.statuses.map((status) => status._id))

  console.log(`Project type: ${artifacts.projectType.name} (${artifacts.projectType._id})`)
  console.log(
    `Matched task types: ${
      artifacts.taskTypes.map((taskType) => `${taskType.name} (${taskType._id})`).join(", ") || "none"
    }`
  )
  console.log(
    `Matched statuses: ${artifacts.statuses.map((status) => `${status.name} (${status._id})`).join(", ") || "none"}`
  )

  const issues = await findIssues(rest, taskTypeIds, statusIds, args.issueTitlePrefixes)
  if (issues.length > 0 && !args.deleteTestIssues) {
    throw new Error(
      `Refusing to remove workflow artifacts while ${issues.length} matching issues still use them. Re-run with --delete-test-issues after confirming they are test artifacts.`
    )
  }

  for (const issue of issues) {
    console.log(`${args.dryRun ? "Would delete" : "Deleting"} issue ${issue.identifier}: ${issue.title}`)
    await maybeRemoveDoc(tx, args.dryRun, tracker.class.Issue, issue.space, issue._id)
  }

  if (!args.dryRun && args.issueTitlePrefixes.length > 0) {
    const remainingIssues = await findIssues(rest, taskTypeIds, statusIds, [])
    if (remainingIssues.length > 0) {
      const sample = remainingIssues.slice(0, 10).map((issue) => `${issue.identifier}: ${issue.title}`).join(", ")
      throw new Error(
        `Refusing workflow cleanup: ${remainingIssues.length} issues still use matched status/task type ids after test issue cleanup. Sample: ${sample}`
      )
    }
  } else {
    console.log("Dry run: skipping post-delete issue usage check")
  }

  const updatedProjectTasks = artifacts.projectType.tasks.filter((taskTypeId) => !taskTypeIds.includes(taskTypeId))
  const updatedProjectStatuses = uniqueProjectStatuses(artifacts.projectType.statuses).filter((status) =>
    !statusIds.includes(status._id) && !taskTypeIds.includes(status.taskType)
  )
  if (
    updatedProjectTasks.length !== artifacts.projectType.tasks.length
    || updatedProjectStatuses.length !== artifacts.projectType.statuses.length
  ) {
    console.log(`${args.dryRun ? "Would update" : "Updating"} project type refs`)
    await maybeUpdateDoc(
      tx,
      args.dryRun,
      task.class.ProjectType,
      core.space.Model,
      artifacts.projectType._id,
      { tasks: updatedProjectTasks, statuses: updatedProjectStatuses }
    )
  }

  const taskTypesToNormalize = await rawFindAll<TaskType>(
    rest,
    task.class.TaskType,
    { parent: artifacts.projectType._id },
    { limit: 1000 }
  )
  for (const taskType of taskTypesToNormalize) {
    if (taskTypeIds.includes(taskType._id)) continue
    const updatedStatuses = uniqueRefs(taskType.statuses).filter((statusId) => !statusIds.includes(statusId))
    if (updatedStatuses.length !== taskType.statuses.length) {
      console.log(`${args.dryRun ? "Would update" : "Updating"} task type refs ${taskType.name}`)
      await maybeUpdateDoc(
        tx,
        args.dryRun,
        task.class.TaskType,
        core.space.Model,
        taskType._id,
        { statuses: updatedStatuses }
      )
    }
  }

  for (const taskType of artifacts.taskTypes) {
    console.log(`${args.dryRun ? "Would delete" : "Deleting"} task type ${taskType.name} (${taskType._id})`)
    await maybeRemoveDoc(tx, args.dryRun, task.class.TaskType, core.space.Model, taskType._id)
    console.log(`${args.dryRun ? "Would delete" : "Deleting"} task type target class ${taskType.targetClass}`)
    await maybeRemoveDoc(tx, args.dryRun, core.class.Mixin, core.space.Model, taskType.targetClass)
  }

  for (const status of artifacts.statuses) {
    console.log(`${args.dryRun ? "Would delete" : "Deleting"} status ${status.name} (${status._id})`)
    await maybeRemoveDoc(tx, args.dryRun, status._class, core.space.Model, status._id)
  }
}

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))
  const connection = await connect()
  await removeWorkflowArtifacts(connection, args)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exit(1)
})
