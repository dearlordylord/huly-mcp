import { expect, it } from "vitest"
import { DocId, ObjectClassName, ProjectIdentifier } from "../../src/domain/schemas/shared.js"
import { cleanupTree, type CleanupLocation, type TreeCleanupPorts } from "../../scripts/issue-tree-cleanup.js"
const input = { issueIds: [DocId.make("fixture")], projects: [], documentIds: [], teamspaceIds: [], recordIds: [] }
const row: CleanupLocation = {
  _id: DocId.make("fixture"),
  _class: ObjectClassName.make("tracker:class:Issue"),
  space: DocId.make("project")
}
it("requires independent absence after acknowledged deletion", async () => {
  const removed = new Set<string>()
  const ports: TreeCleanupPorts = {
    read: async (kind) => ({
      rows: kind === "issue" && !removed.has(kind) ? [row] : [],
      total: kind === "issue" && !removed.has(kind) ? 1 : 0
    }),
    remove: async (kind) => {
      removed.add(kind)
    }
  }
  const result = await cleanupTree(input, ports)
  expect(result.complete).toBe(true)
  expect(result.receipts.find((receipt) => receipt.kind === "issue")).toEqual({
    kind: "issue",
    acknowledged: 1,
    absenceConfirmed: true,
    status: "absence-confirmed"
  })
})
it("does not equate successful deletion acknowledgement with absence", async () => {
  const result = await cleanupTree(input, {
    read: async (kind) => ({ rows: kind === "issue" ? [row] : [], total: kind === "issue" ? 1 : 0 }),
    remove: async () => {}
  })
  expect(result.complete).toBe(false)
  expect(result.receipts.find((receipt) => receipt.kind === "issue")?.acknowledged).toBe(1)
})
it("retains unresolved observation without retrying a failed delete", async () => {
  const attempts: string[] = []
  const result = await cleanupTree(input, {
    read: async (kind) => ({ rows: kind === "issue" ? [row] : [], total: kind === "issue" ? 1 : 0 }),
    remove: async (kind) => {
      attempts.push(kind)
      throw new Error("private diagnostic")
    }
  })
  expect(result.complete).toBe(false)
  expect(attempts).toEqual(["issue"])
  expect(JSON.stringify(result)).not.toContain("private diagnostic")
})
it("refuses unknown query totals", async () => {
  const attempts: string[] = []
  const result = await cleanupTree(input, {
    read: async () => ({ rows: [], total: -1 }),
    remove: async (kind) => {
      attempts.push(kind)
    }
  })
  expect(result.complete).toBe(false)
  expect(attempts).toEqual([])
})
it("does not claim cleanup when fixture project locations are unavailable", async () => {
  const attempts: string[] = []
  const result = await cleanupTree(
    { ...input, projects: [ProjectIdentifier.make("FIX")] },
    {
      read: async () => ({ rows: [], total: 0 }),
      remove: async (kind) => {
        attempts.push(kind)
      }
    }
  )
  expect(result.complete).toBe(false)
  expect(attempts).toEqual([])
})
it("does not treat a permission or transport read failure as absence", async () => {
  const result = await cleanupTree(input, {
    read: async (kind) => {
      if (kind === "issue") throw new Error("private permission failure")
      return { rows: [], total: 0 }
    },
    remove: async () => {}
  })
  expect(result.complete).toBe(false)
  expect(result.receipts.find((receipt) => receipt.kind === "issue")?.status).toBe("unresolved")
  expect(JSON.stringify(result)).not.toContain("private permission failure")
})
