import { Schema } from "effect"
import { expect, it } from "vitest"
import { MovementIssueSchema, type MovementIssue } from "../../../src/domain/schemas/issue-movement-state.js"
import { DocId, IssueId, IssueIdentifier } from "../../../src/domain/schemas/shared.js"
import {
  discoverTransferTree,
  MAX_TRANSFER_TASKS,
  transferTreeParent
} from "../../../src/huly/operations/issue-transfer-tree.js"
import { movementNoParent } from "../../../src/huly/operations/issue-movement-hierarchy.js"
import { transferFixture } from "../../helpers/transfer.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const root = () => parseIssue(transferFixture().root)
const child = (parent: MovementIssue, number: number): MovementIssue => ({
  ...parent,
  _id: IssueId.make(`tree-${number}`),
  identifier: IssueIdentifier.make(`SRC-${number}`),
  attachedTo: parent._id
})

it("discovers three levels from attachments even when child counts are stale", () => {
  const first = root()
  const second = child(first, 2)
  const third = child(second, 3)
  const found = discoverTransferTree(first, [third, first, second])
  expect(found).toEqual({ complete: true, issues: [first, second, third] })
  expect(transferTreeParent(first, first, undefined)).toBe(movementNoParent)
  expect(transferTreeParent(second, first, third)).toBe(first._id)
})

it("refuses duplicate snapshots, cycles and foreign-project descendants", () => {
  const first = root()
  const second = child(first, 2)
  for (const inventory of [
    [first, second, second],
    [{ ...first, attachedTo: second._id }, second],
    [first, { ...second, space: DocId.make("other-project") }]
  ]) {
    const observedRoot = inventory.find((issue) => issue._id === first._id) ?? first
    expect(discoverTransferTree(observedRoot, inventory).complete).toBe(false)
  }
})

it("refuses an oversized tree without claiming the returned prefix is complete", () => {
  const first = root()
  const inventory = [first, ...Array.from({ length: MAX_TRANSFER_TASKS }, (_, index) => child(first, index + 2))]
  const found = discoverTransferTree(first, inventory)
  expect(found.complete).toBe(false)
  expect(found.issues).toHaveLength(MAX_TRANSFER_TASKS)
  if (!found.complete) expect(found.reasons.join(" ")).toContain("no prefix can move")
})
