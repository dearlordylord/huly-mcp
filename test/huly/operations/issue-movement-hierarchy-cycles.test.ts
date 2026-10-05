import { Schema } from "effect"
import { expect, it } from "vitest"
import { MovementIssueSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import {
  ancestorsOf,
  descendantsOf,
  hierarchyProblem,
  movementHierarchy
} from "../../../src/huly/operations/issue-movement-hierarchy.js"
import { movementIssue } from "../../helpers/movement.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)

it("detects an ancestor cycle that repeats above the selected task", () => {
  const first = movementIssue("first-ancestor")
  const second = movementIssue("second-ancestor", { attachedTo: first._id })
  first.attachedTo = second._id
  const root = movementIssue("selected", { attachedTo: first._id })
  const issue = parseIssue(root)
  const hierarchy = movementHierarchy([root, first, second].map(parseIssue))
  expect(ancestorsOf(hierarchy, issue)).toBeUndefined()
  expect(hierarchyProblem(hierarchy, issue)).toContain("cycle")
})

it("descendant traversal terminates a root cycle and deduplicates repeated attachment snapshots", () => {
  const root = movementIssue("cyclic-root")
  const child = movementIssue("cyclic-child", { attachedTo: root._id })
  root.attachedTo = child._id
  const parsedRoot = parseIssue(root)
  const parsedChild = parseIssue(child)
  const hierarchy = movementHierarchy([parsedRoot, parsedChild, { ...parsedChild }])
  expect(descendantsOf(hierarchy, parsedRoot)).toEqual([parsedRoot, parsedChild])
  expect(hierarchyProblem(hierarchy, parsedRoot)).toContain("cycle")
})
