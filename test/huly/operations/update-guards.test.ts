import { describe, expect, it } from "vitest"

import {
  coveredUpdateEntry,
  mergeCoveredUpdateEntries,
  mergeUpdateEntries
} from "../../../src/huly/operations/update-guards.js"

describe("update guard helpers", () => {
  it("merges direct fields and nested update operators", () => {
    const result = mergeUpdateEntries([
      { title: "Updated", $inc: { sequence: 1 }, $pull: { labels: "old" } },
      { description: null, $push: { labels: "new" }, $update: { nested: { name: "value" } } },
      { $unset: { dueDate: "" } },
      { $unset: { assignee: "" } }
    ])

    expect(result).toEqual({
      title: "Updated",
      description: null,
      $inc: { sequence: 1 },
      $pull: { labels: "old" },
      $push: { labels: "new" },
      $update: { nested: { name: "value" } },
      $unset: { dueDate: "", assignee: "" }
    })
  })

  it("merges covered update entries through their operation payloads", () => {
    const result = mergeCoveredUpdateEntries([
      coveredUpdateEntry("assignee", { $unset: { assignee: "" } }),
      coveredUpdateEntry("dueDate", { $unset: { dueDate: "" } }),
      coveredUpdateEntry("title", { title: "Covered" })
    ])

    expect(result).toEqual({
      title: "Covered",
      $unset: { assignee: "", dueDate: "" }
    })
  })
})
