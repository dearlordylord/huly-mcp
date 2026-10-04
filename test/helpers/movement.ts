/* eslint-disable no-restricted-syntax -- Huly SDK fixture refs and generic injected ports are nominal; fixture casts bridge SDK types with no runtime constructors. */
import {
  type Doc,
  type DocumentQuery,
  type FindResult,
  type FindOptions,
  type Ref,
  toFindResult
} from "@hcengineering/core"
import type { Issue, Project } from "@hcengineering/tracker"
import { Effect } from "effect"

import { UNKNOWN_TOTAL } from "../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyAuthError } from "../../src/huly/errors-base.js"
import { tracker } from "../../src/huly/huly-plugins.js"

export const movementProject = (id = "project-1", identifier = "TEST"): Project =>
  ({ _id: id, identifier, _class: tracker.class.Project, name: identifier }) as unknown as Project

export const movementIssue = (id: string, overrides: Partial<Issue> = {}): Issue =>
  ({
    _id: id,
    _class: tracker.class.Issue,
    space: "project-1",
    identifier: `TEST-${id}`,
    title: `Issue ${id}`,
    attachedTo: tracker.ids.NoParent,
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    parents: [],
    subIssues: 0,
    childInfo: [],
    estimation: 2,
    reportedTime: 3,
    kind: "kind-1",
    status: "status-1",
    modifiedOn: 0,
    description: "content",
    component: "component-1",
    milestone: "milestone-1",
    ...overrides
  }) as unknown as Issue

export const initializeHierarchy = (issues: Array<Issue>): void => {
  for (const issue of issues) {
    issue.parents = ancestry(issues, issue)
    issue.subIssues = issues.filter((child) => child.attachedTo === issue._id).length
  }
  updateAggregates(issues)
}

const ancestry = (issues: ReadonlyArray<Issue>, issue: Issue): Issue["parents"] => {
  const parents: Issue["parents"] = []
  const seen = new Set([issue._id])
  let current = issues.find((parent) => parent._id === issue.attachedTo)
  while (current !== undefined && !seen.has(current._id)) {
    seen.add(current._id)
    parents.push({
      parentId: current._id,
      identifier: current.identifier,
      parentTitle: current.title,
      space: current.space
    })
    current = issues.find((parent) => parent._id === current?.attachedTo)
  }
  return parents
}

const updateAggregates = (issues: Array<Issue>): void => {
  for (const issue of issues) {
    issue.childInfo = issues
      .filter((child) => child.parents.some((info) => info.parentId === issue._id))
      .map((child) => ({ childId: child._id, estimation: child.estimation, reportedTime: child.reportedTime }))
  }
}

export interface MovementFixtureOptions {
  selectorTotal?: number
  projectSelectorTotal?: number
  onRead?: (query: Readonly<Record<string, unknown>>, issues: Array<Issue>, written: boolean) => void
  projects?: Array<Project>
  failWriteAt?: number
  failVerification?: boolean
  ignoreWrites?: boolean
  discoveryTotal?: number
  closureTotal?: number
  changeRootDuringRead?: boolean
  invalidSelectorResult?: boolean
  onWrite?: (issues: Array<Issue>) => void
}

export const movementFixture = (issues: Array<Issue>, options: MovementFixtureOptions = {}) => {
  const projects = options.projects ?? [movementProject()]
  const writes: Array<{ id: Ref<Doc>; operations: unknown }> = []
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    cls: unknown,
    query: DocumentQuery<T>,
    findOptions?: FindOptions<T>
  ) => {
    if (options.failVerification && writes.length > 0)
      return Effect.fail(new HulyAuthError({ message: "Read unavailable" }))
    const q = query as Record<string, unknown>
    options.onRead?.(q, issues, writes.length > 0)
    const records = cls === tracker.class.Project ? projects : issues
    const matching = records.filter((record) =>
      Object.entries(q).every(([key, value]) => {
        const actual = (record as unknown as Record<string, unknown>)[key]
        if (typeof value === "object" && value !== null && "$in" in value)
          return (value.$in as Array<unknown>).includes(actual)
        return actual === value
      })
    )
    const selected = options.invalidSelectorResult && q.identifier !== undefined ? issues.slice(0, 1) : matching
    const result = toFindResult(selected.map((record) => ({ ...record }))) as unknown as FindResult<T>
    if ((q.identifier !== undefined || q._id !== undefined) && options.selectorTotal !== undefined)
      result.total = options.selectorTotal
    if (cls === tracker.class.Project && options.projectSelectorTotal !== undefined)
      result.total = options.projectSelectorTotal
    if (q.space !== undefined && options.discoveryTotal !== undefined) result.total = options.discoveryTotal
    if (q.attachedTo !== undefined && options.closureTotal !== undefined) result.total = options.closureTotal
    if (findOptions?.total !== true) result.total = UNKNOWN_TOTAL
    if (q.space !== undefined && options.changeRootDuringRead) {
      for (const issue of result) issue.modifiedOn++
    }
    return Effect.succeed(result)
  }
  const updateDoc: HulyClientOperations["updateDoc"] = (_cls, _space, id, operations) => {
    writes.push({ id, operations })
    if (writes.length === options.failWriteAt) return Effect.fail(new HulyAuthError({ message: "Write unavailable" }))
    if (options.ignoreWrites) return Effect.succeed({})
    const issue = issues.find((record) => String(record._id) === String(id))
    const ops = operations as Record<string, unknown>
    if (issue !== undefined && typeof ops.attachedTo === "string") {
      issue.attachedTo = ops.attachedTo as Ref<Issue>
      issue.parents = ancestry(issues, issue)
      updateAggregates(issues)
    }
    if (issue !== undefined && typeof ops.$inc === "object" && ops.$inc !== null && "subIssues" in ops.$inc) {
      issue.subIssues += Number(ops.$inc.subIssues)
    }
    options.onWrite?.(issues)
    return Effect.succeed({})
  }
  return { issues, writes, operations: { findAll, updateDoc }, layer: HulyClient.testLayer({ findAll, updateDoc }) }
}

export const threeLevelMovementFixture = () => {
  const old = movementIssue("old")
  const root = movementIssue("root", { attachedTo: old._id })
  const child = movementIssue("child", { attachedTo: root._id })
  const leaf = movementIssue("leaf", { attachedTo: child._id })
  const destinationAncestor = movementIssue("ancestor")
  const destination = movementIssue("destination", { attachedTo: destinationAncestor._id })
  const issues = [old, root, child, leaf, destinationAncestor, destination]
  initializeHierarchy(issues)
  return { old, root, child, leaf, destinationAncestor, destination, issues }
}
