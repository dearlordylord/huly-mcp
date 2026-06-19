import { assertAt } from "../../../src/utils/assertions.js"
/* eslint-disable no-restricted-syntax -- test fixtures build Huly SDK tracker docs whose nominal types are not structurally compatible with plain object literals, and branded refs have no runtime constructors */
import { describe, it } from "@effect/vitest"
import { type Ref, toFindResult } from "@hcengineering/core"
import type { Issue as HulyIssue, IssueParentInfo, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { tracker } from "../../../src/huly/huly-plugins.js"
import { moveIssue } from "../../../src/huly/operations/issues-move.js"
import { issueIdentifier, projectIdentifier } from "../../helpers/brands.js"

const PROJECT_ID = "project-1" as Ref<HulyProject>

const makeProject = (): HulyProject =>
  ({
    _id: PROJECT_ID,
    _class: tracker.class.Project,
    identifier: "TEST",
    name: "Test Project",
    modifiedOn: 0,
    createdOn: 0
  }) as unknown as HulyProject

const makeIssue = (id: string, identifier: string, overrides?: Partial<HulyIssue>): HulyIssue =>
  ({
    _id: id as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: PROJECT_ID,
    identifier,
    number: Number(identifier.split("-")[1] ?? 0),
    title: `Issue ${identifier}`,
    attachedTo: "no-parent" as Ref<HulyIssue>,
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    subIssues: 0,
    parents: [] as Array<IssueParentInfo>,
    modifiedOn: 0,
    createdOn: 0,
    ...overrides
  }) as unknown as HulyIssue

interface UpdateCall {
  id: unknown
  ops: Record<string, unknown>
}

const buildLayer = (
  m: { issues: ReadonlyArray<HulyIssue>; projects?: ReadonlyArray<HulyProject>; updates?: Array<UpdateCall> }
) => {
  const projects = m.projects ?? [makeProject()]
  const issues = m.issues

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === tracker.class.Project) {
      return Effect.succeed(projects.find((p) => p.identifier === q.identifier))
    }
    if (_class === tracker.class.Issue) {
      if (q.identifier !== undefined) {
        return Effect.succeed(issues.find((i) => i.space === q.space && i.identifier === q.identifier))
      }
      if (q.number !== undefined) {
        return Effect.succeed(issues.find((i) => i.space === q.space && i.number === q.number))
      }
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === tracker.class.Issue) {
      return Effect.succeed(toFindResult(issues.filter((i) => i.attachedTo === q.attachedTo && i.space === q.space)))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _c: unknown,
    _s: unknown,
    id: unknown,
    ops: unknown
  ) => {
    m.updates?.push({ id, ops: ops as Record<string, unknown> })
    return Effect.succeed({} as never)
  }) as HulyClientOperations["updateDoc"]

  return HulyClient.testLayer({ findOne: findOneImpl, findAll: findAllImpl, updateDoc: updateDocImpl })
}

const PROJECT = projectIdentifier("TEST")

describe("moveIssue — to a new parent", () => {
  it.effect("re-parents, adjusts both parents' counts, and re-threads one descendant", () =>
    Effect.gen(function*() {
      const updates: Array<UpdateCall> = []
      const issue = makeIssue("issue-1", "TEST-1", {
        attachedTo: "old-parent" as Ref<HulyIssue>,
        attachedToClass: tracker.class.Issue,
        subIssues: 1
      })
      const parent = makeIssue("issue-9", "TEST-9")
      const child = makeIssue("issue-2", "TEST-2", { attachedTo: "issue-1" as Ref<HulyIssue> })

      const result = yield* moveIssue({
        project: PROJECT,
        identifier: issueIdentifier("TEST-1"),
        newParent: issueIdentifier("TEST-9")
      }).pipe(Effect.provide(buildLayer({ issues: [issue, parent, child], updates })))

      expect(result).toEqual({ identifier: "TEST-1", moved: true, newParent: "TEST-9" })

      // main move
      expect(assertAt(updates, 0).id).toBe("issue-1")
      expect(assertAt(updates, 0).ops).toEqual({
        attachedTo: "issue-9",
        attachedToClass: tracker.class.Issue,
        collection: "subIssues",
        parents: [{ parentId: "issue-9", identifier: "TEST-9", parentTitle: "Issue TEST-9", space: PROJECT_ID }]
      })
      // decrement old parent, increment new parent
      expect(assertAt(updates, 1)).toEqual({ id: "old-parent", ops: { $inc: { subIssues: -1 } } })
      expect(assertAt(updates, 2)).toEqual({ id: "issue-9", ops: { $inc: { subIssues: 1 } } })
      // descendant re-thread (no recursion since the child has no sub-issues)
      expect(assertAt(updates, 3).id).toBe("issue-2")
      expect(assertAt(updates, 3).ops).toEqual({
        parents: [
          { parentId: "issue-9", identifier: "TEST-9", parentTitle: "Issue TEST-9", space: PROJECT_ID },
          { parentId: "issue-1", identifier: "TEST-1", parentTitle: "Issue TEST-1", space: PROJECT_ID }
        ]
      })
      expect(updates).toHaveLength(4)
    }))

  it.effect("recurses through grandchildren", () =>
    Effect.gen(function*() {
      const updates: Array<UpdateCall> = []
      const issue = makeIssue("issue-1", "TEST-1", { attachedToClass: tracker.class.Project, subIssues: 1 })
      const child = makeIssue("issue-2", "TEST-2", { attachedTo: "issue-1" as Ref<HulyIssue>, subIssues: 1 })
      const grandchild = makeIssue("issue-3", "TEST-3", { attachedTo: "issue-2" as Ref<HulyIssue> })

      yield* moveIssue({
        project: PROJECT,
        identifier: issueIdentifier("TEST-1"),
        newParent: null
      }).pipe(Effect.provide(buildLayer({ issues: [issue, child, grandchild], updates })))

      const childUpdate = updates.find((u) => u.id === "issue-2")
      const grandchildUpdate = updates.find((u) => u.id === "issue-3")
      expect(childUpdate?.ops).toEqual({
        parents: [{ parentId: "issue-1", identifier: "TEST-1", parentTitle: "Issue TEST-1", space: PROJECT_ID }]
      })
      expect(grandchildUpdate?.ops).toEqual({
        parents: [
          { parentId: "issue-1", identifier: "TEST-1", parentTitle: "Issue TEST-1", space: PROJECT_ID },
          { parentId: "issue-2", identifier: "TEST-2", parentTitle: "Issue TEST-2", space: PROJECT_ID }
        ]
      })
    }))
})

describe("moveIssue — to top-level", () => {
  it.effect("detaches a sub-issue to the project and decrements the old parent", () =>
    Effect.gen(function*() {
      const updates: Array<UpdateCall> = []
      const issue = makeIssue("issue-1", "TEST-1", {
        attachedTo: "old-parent" as Ref<HulyIssue>,
        attachedToClass: tracker.class.Issue,
        subIssues: 0,
        parents: [
          { parentId: "old-parent" as Ref<HulyIssue>, identifier: "TEST-7", parentTitle: "Old", space: PROJECT_ID }
        ]
      })

      const result = yield* moveIssue({
        project: PROJECT,
        identifier: issueIdentifier("TEST-1"),
        newParent: null
      }).pipe(Effect.provide(buildLayer({ issues: [issue], updates })))

      expect(result).toEqual({ identifier: "TEST-1", moved: true })
      expect(result).not.toHaveProperty("newParent")
      expect(assertAt(updates, 0).ops).toEqual({
        attachedTo: PROJECT_ID,
        attachedToClass: tracker.class.Project,
        collection: "issues",
        parents: []
      })
      // decrement the old issue parent; no increment because it is now top-level
      expect(assertAt(updates, 1)).toEqual({ id: "old-parent", ops: { $inc: { subIssues: -1 } } })
      expect(updates).toHaveLength(2)
    }))

  it.effect("is a single update when the issue was already top-level", () =>
    Effect.gen(function*() {
      const updates: Array<UpdateCall> = []
      const issue = makeIssue("issue-1", "TEST-1", {
        attachedTo: PROJECT_ID as unknown as Ref<HulyIssue>,
        attachedToClass: tracker.class.Project,
        subIssues: 0
      })

      yield* moveIssue({
        project: PROJECT,
        identifier: issueIdentifier("TEST-1"),
        newParent: null
      }).pipe(Effect.provide(buildLayer({ issues: [issue], updates })))

      // old parent is the project (not an issue) -> no decrement; top-level -> no increment; no descendants
      expect(updates).toHaveLength(1)
    }))
})

describe("moveIssue — error branches", () => {
  it.effect("fails when the project is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        moveIssue({ project: projectIdentifier("NOPE"), identifier: issueIdentifier("TEST-1"), newParent: null })
          .pipe(Effect.provide(buildLayer({ issues: [], projects: [] })))
      )
      expect(err._tag).toBe("ProjectNotFoundError")
    }))

  it.effect("fails when the issue is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        moveIssue({ project: PROJECT, identifier: issueIdentifier("TEST-404"), newParent: null })
          .pipe(Effect.provide(buildLayer({ issues: [] })))
      )
      expect(err._tag).toBe("IssueNotFoundError")
    }))

  it.effect("fails when the new parent issue is not found", () =>
    Effect.gen(function*() {
      const issue = makeIssue("issue-1", "TEST-1")
      const err = yield* Effect.flip(
        moveIssue({ project: PROJECT, identifier: issueIdentifier("TEST-1"), newParent: issueIdentifier("TEST-404") })
          .pipe(Effect.provide(buildLayer({ issues: [issue] })))
      )
      expect(err._tag).toBe("IssueNotFoundError")
    }))
})
