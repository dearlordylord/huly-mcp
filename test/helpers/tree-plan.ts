import { Schema } from "effect"
import { MovementIssueSchema, MovementProjectSchema } from "../../src/domain/schemas/issue-movement-state.js"
import { TransferIssueSchema } from "../../src/domain/schemas/issue-transfer.js"
import type { TransferPlan } from "../../src/huly/operations/issue-transfer-preflight.js"
import { transferTreeFixture } from "./transfer-tree.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)
const parseProtected = (input: unknown) => Schema.decodeUnknownSync(TransferIssueSchema)(input)

export const treePlanFixture = (fixture = transferTreeFixture()) => {
  const issues = [fixture.root, fixture.child, fixture.grandchild]
  const tree = issues.map(parseIssue)
  const root = parseIssue(fixture.root)
  const source = parseProject(fixture.source)
  const destination = parseProject(fixture.destination)
  const prepared: TransferPlan = {
    plan: { root, source, parent: parseIssue(fixture.parent), tree, relevant: fixture.issues.map(parseIssue) },
    tasks: issues.map((issue) => ({
      issue: parseIssue(issue),
      protectedIssue: parseProtected(issue),
      records: [],
      recordClasses: []
    })),
    protectedIssue: parseProtected(fixture.root),
    records: [],
    recordClasses: [],
    attributeChanges: []
  }
  return { fixture, prepared, destination }
}
