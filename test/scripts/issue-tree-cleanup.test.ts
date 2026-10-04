import { Schema } from "effect"
import { expect, it } from "vitest"
import { DocId, ObjectClassName, UNKNOWN_TOTAL } from "../../src/domain/schemas/shared.js"
import {
  cleanupTree,
  CleanupKind,
  type CleanupLocation,
  type TreeCleanupPorts
} from "../../scripts/issue-tree-cleanup.js"
const input = {
  issueIds: [DocId.make("fixture")],
  projectIds: [DocId.make("known-project")],
  unresolvedCreation: false,
  documentIds: [],
  teamspaceIds: [],
  recordIds: []
}
const row: CleanupLocation = {
  _id: DocId.make("fixture"),
  _class: ObjectClassName.make("tracker:class:Issue"),
  space: DocId.make("known-project")
}
it("requires independent absence after acknowledged deletion", async () => {
  const removed = new Set<CleanupKind>()
  const ports: TreeCleanupPorts = {
    read: async (kind) => ({
      status: "observed",
      rows: kind === "issue" && !removed.has(kind) ? [row] : [],
      total: kind === "issue" && !removed.has(kind) ? 1 : 0
    }),
    remove: async (kind) => {
      removed.add(kind)
      return { status: "acknowledged" }
    }
  }
  const result = await cleanupTree(input, ports)
  expect(result.complete).toBe(true)
  expect(result.receipts.find((receipt) => receipt.kind === "issue")).toEqual({
    kind: "issue",
    acknowledged: 1,
    status: "absence-confirmed"
  })
})
it("does not equate successful deletion acknowledgement with absence", async () => {
  const result = await cleanupTree(input, {
    read: async (kind) => ({
      status: "observed",
      rows: kind === "issue" ? [row] : [],
      total: kind === "issue" ? 1 : 0
    }),
    remove: async () => ({ status: "acknowledged" })
  })
  expect(result.complete).toBe(false)
  expect(result.receipts.find((receipt) => receipt.kind === "issue")?.acknowledged).toBe(1)
})
it("retains unresolved observation without retrying unavailable deletion", async () => {
  const attempts: CleanupKind[] = []
  const result = await cleanupTree(input, {
    read: async (kind) => ({
      status: "observed",
      rows: kind === "issue" ? [row] : [],
      total: kind === "issue" ? 1 : 0
    }),
    remove: async (kind) => {
      attempts.push(kind)
      return { status: "unavailable" }
    }
  })
  expect(result.complete).toBe(false)
  expect(attempts).toEqual(["issue"])
})
it("refuses unknown query totals", async () => {
  const attempts: CleanupKind[] = []
  const result = await cleanupTree(input, {
    read: async () => ({ status: "observed", rows: [], total: UNKNOWN_TOTAL }),
    remove: async (kind) => {
      attempts.push(kind)
      return { status: "acknowledged" }
    }
  })
  expect(result.complete).toBe(false)
  expect(attempts).toEqual([])
})
it("does not treat an unavailable read as absence", async () => {
  const result = await cleanupTree(input, {
    read: async (kind) => (kind === "issue" ? { status: "unavailable" } : { status: "observed", rows: [], total: 0 }),
    remove: async () => ({ status: "acknowledged" })
  })
  expect(result.complete).toBe(false)
})
for (const kind of ["issue", "project", "component", "milestone", "document", "teamspace", "reference", "todo"]) {
  const parsedKind = Schema.decodeUnknownSync(CleanupKind)(kind)
  it(`refuses out-of-scope ${kind} rows before destructive calls`, async () => {
    const attempts: CleanupKind[] = []
    const foreign = { ...row, _id: DocId.make("foreign-resource"), space: DocId.make("foreign-project") }
    const result = await cleanupTree(input, {
      read: async (current) => ({
        status: "observed",
        rows: current === parsedKind ? [foreign] : [],
        total: current === parsedKind ? 1 : 0
      }),
      remove: async (current) => {
        attempts.push(current)
        return { status: "acknowledged" }
      }
    })
    expect(result.complete).toBe(false)
    expect(attempts).toEqual([])
  })
}
it("retains acknowledged creation without a captured stable ID as unresolved", async () => {
  const result = await cleanupTree(
    { ...input, unresolvedCreation: true },
    { read: async () => ({ status: "observed", rows: [], total: 0 }), remove: async () => ({ status: "acknowledged" }) }
  )
  expect(result.complete).toBe(false)
})
