import { describe, expect, it } from "vitest"

import { cliCommandCatalog } from "../../packages/huly-cli/src/catalog.js"
import {
  cliDescriptionProblem,
  cliDescriptionProblems,
  cliFieldDescriptionProblems
} from "../../scripts/cli-documentation-contract.js"

describe("CLI documentation contract", () => {
  it("accepts an action-specific description that names its target", () => {
    expect(cliDescriptionProblem({ command: "issues list", description: "List issues for a project" })).toBeUndefined()
  })

  it("rejects vague and framework-facing descriptions", () => {
    expect(
      cliDescriptionProblems([
        { command: "issues list", description: "Issues" },
        { command: "issues get", description: "Get internal SDK data" }
      ])
    ).toEqual([
      "issues list: description must start with a reviewed imperative action and name its target.",
      "issues get: description exposes framework or implementation wording."
    ])
  })

  it("rejects exposed fields without a resolved description", () => {
    expect(
      cliFieldDescriptionProblems([
        { command: "issues list", field: "project", description: "  " },
        { command: "issues list", field: "limit", description: "Maximum number of issues to return." }
      ])
    ).toEqual(["issues list --project: exposed field has no resolved description."])
  })

  it("keeps every catalog description action-specific and implementation-free", () => {
    const entries = Object.values(cliCommandCatalog).map((spec) => ({
      command: spec.path.join(" "),
      description: spec.description
    }))

    expect(entries).toHaveLength(550)
    expect(cliDescriptionProblems(entries)).toEqual([])
  })
})
