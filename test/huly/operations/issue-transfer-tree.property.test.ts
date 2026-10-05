import { Schema } from "effect"
import fc from "fast-check"
import { expect, it } from "vitest"
import {
  MovementIssueSchema,
  MovementProjectSchema,
  type MovementIssue
} from "../../../src/domain/schemas/issue-movement-state.js"
import { TransferIssueSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { IssueId, IssueIdentifier, PositiveInteger } from "../../../src/domain/schemas/shared.js"
import { discoverTransferTree, transferTreeParent } from "../../../src/huly/operations/issue-transfer-tree.js"
import { planTransferTreeWrites } from "../../../src/huly/operations/issue-transfer-tree-planning.js"
import { movementNoParent } from "../../../src/huly/operations/issue-movement-hierarchy.js"
import { transferFixture } from "../../helpers/transfer.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)
const parseProtected = (input: unknown) => Schema.decodeUnknownSync(TransferIssueSchema)(input)

it("generated attachment trees retain every stable ID and internal edge regardless of inventory order", () => {
  fc.assert(
    fc.property(fc.array(fc.nat(), { maxLength: 60 }), (parents) => {
      const root = parseIssue(transferFixture().root)
      const tree: Array<MovementIssue> = [root]
      for (const [index, choice] of parents.entries()) {
        const parent = tree[choice % tree.length] ?? root
        tree.push({
          ...root,
          _id: IssueId.make(`generated-${index}`),
          identifier: IssueIdentifier.make(`SRC-${index + 2}`),
          attachedTo: parent._id
        })
      }
      const found = discoverTransferTree(root, [...tree].reverse())
      expect(found.complete).toBe(true)
      expect(new Set(found.issues.map((issue) => issue._id))).toEqual(new Set(tree.map((issue) => issue._id)))
      for (const issue of found.issues.filter((entry) => entry._id !== root._id))
        expect(transferTreeParent(issue, root, undefined)).toBe(issue.attachedTo)
    })
  )
})

it("generated plans retain stable identities and internal edges with unique numbers, identifiers and ordered ranks", () => {
  fc.assert(
    fc.property(fc.array(fc.nat(), { maxLength: 60 }), (parents) => {
      const fixture = transferFixture()
      const root = parseIssue(fixture.root)
      const tree: Array<MovementIssue> = [root]
      for (const [index, choice] of parents.entries()) {
        const parent = tree[choice % tree.length] ?? root
        tree.push({
          ...root,
          _id: IssueId.make(`planned-${index}`),
          identifier: IssueIdentifier.make(`SRC-${index + 2}`),
          attachedTo: parent._id
        })
      }
      const protectedIssue = parseProtected(fixture.root)
      const source = parseProject(fixture.source)
      const destination = parseProject(fixture.destination)
      const numbers = tree.map((_, index) => PositiveInteger.make(index + 10))
      const planned = planTransferTreeWrites(
        {
          plan: { root, parent: undefined, source, tree, relevant: tree },
          protectedIssue,
          tasks: tree.map((issue) => ({ issue, protectedIssue, records: [], recordClasses: [] })),
          records: [],
          recordClasses: [],
          attributeChanges: []
        },
        destination,
        numbers,
        undefined
      )
      expect(planned).toBeDefined()
      if (planned === undefined) return
      expect(planned.tasks.map((task) => task.issueId)).toEqual(tree.map((issue) => issue._id))
      expect(planned.tasks.map((task) => task.number)).toEqual(numbers)
      expect(new Set(planned.tasks.map((task) => task.identifier)).size).toBe(tree.length)
      expect(new Set(planned.tasks.map((task) => task.rank)).size).toBe(tree.length)
      expect(planned.tasks.map((task) => task.rank)).toEqual(planned.tasks.map((task) => task.rank).toSorted())
      for (const task of planned.tasks)
        expect(task.parentId).toBe(task.issueId === root._id ? movementNoParent : task.expectedHierarchy.attachedTo)
    })
  )
})
