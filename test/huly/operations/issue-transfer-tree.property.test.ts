import { Schema } from "effect"
import fc from "fast-check"
import { expect, it } from "vitest"
import { MovementIssueSchema, type MovementIssue } from "../../../src/domain/schemas/issue-movement-state.js"
import { IssueId, IssueIdentifier } from "../../../src/domain/schemas/shared.js"
import { discoverTransferTree, transferTreeParent } from "../../../src/huly/operations/issue-transfer-tree.js"
import { transferFixture } from "../../helpers/transfer.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)

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
