import { expect, it } from "vitest"
import { PositiveInteger, IssueId, DocId } from "../../../src/domain/schemas/shared.js"
import { planTransferTreeWrites } from "../../../src/huly/operations/issue-transfer-tree-planning.js"
import { resolveTransferTreeAttributes } from "../../../src/huly/operations/issue-transfer-tree-attributes.js"
import { treePlanFixture } from "../../helpers/tree-plan.js"

const numbers = () => [4, 5, 6].map((value) => PositiveInteger.make(value))

it("refuses incomplete, duplicate and empty reservation slots instead of constructing partial task mappings", () => {
  const { destination, prepared } = treePlanFixture()
  const sparse = Array<PositiveInteger>(3)
  sparse[0] = PositiveInteger.make(4)
  sparse[2] = PositiveInteger.make(6)
  for (const reservations of [numbers().slice(0, 2), [4, 4, 6].map((value) => PositiveInteger.make(value)), sparse])
    expect(planTransferTreeWrites(prepared, destination, reservations, undefined)).toBeUndefined()
})

it("refuses a cyclic destination ancestry and a missing destination ancestor", () => {
  const { destination, prepared } = treePlanFixture()
  const parent = prepared.plan.parent
  expect(parent).toBeDefined()
  if (parent === undefined) return
  const cyclic = { ...parent, attachedTo: parent._id }
  const missing = { ...parent, attachedTo: IssueId.make("unobserved-parent") }
  for (const changed of [cyclic, missing]) {
    const inconsistent = {
      ...prepared,
      plan: {
        ...prepared.plan,
        parent: changed,
        relevant: prepared.plan.relevant.map((issue) => (issue._id === parent._id ? changed : issue))
      }
    }
    expect(planTransferTreeWrites(inconsistent, destination, numbers(), undefined)).toBeUndefined()
  }
})

it("default discovery scopes an explicit clear to one parsed task and reports its unresolved siblings", () => {
  const { prepared } = treePlanFixture()
  const reference = DocId.make("unmatched-component")
  const tasks = prepared.tasks.map((task) => ({
    ...task,
    protectedIssue: { ...task.protectedIssue, component: reference }
  }))
  const resolved = resolveTransferTreeAttributes(
    prepared.plan.root,
    tasks,
    [{ field: "component", source: [], destination: [], complete: true }],
    [{ issueId: prepared.plan.root._id, field: "component", from: reference, to: null }]
  )
  expect(resolved.changes).toEqual([
    { issueId: prepared.plan.root._id, field: "component", from: reference, to: null, reason: "explicit-clear" }
  ])
  expect(resolved.conflicts.map((conflict) => conflict.issueId)).toEqual(
    prepared.plan.tree.slice(1).map((issue) => issue._id)
  )
  expect(tasks.every((task) => task.protectedIssue.component === reference)).toBe(true)
})
