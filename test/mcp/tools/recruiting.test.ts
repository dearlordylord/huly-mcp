import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { recruitingTools } from "../../../src/mcp/tools/recruiting.js"

const expectedRecruitingToolNames = [
  "list_recruiting_vacancy_types",
  "list_recruiting_vacancy_statuses",
  "list_recruiting_vacancies",
  "get_recruiting_vacancy",
  "create_recruiting_vacancy",
  "update_recruiting_vacancy",
  "archive_recruiting_vacancy",
  "unarchive_recruiting_vacancy",
  "list_recruiting_candidates",
  "get_recruiting_candidate",
  "set_recruiting_candidate_profile",
  "list_recruiting_skills",
  "list_recruiting_candidate_skills",
  "add_recruiting_candidate_skill",
  "remove_recruiting_candidate_skill",
  "list_recruiting_applicants",
  "get_recruiting_applicant",
  "create_recruiting_applicant",
  "update_recruiting_applicant",
  "delete_recruiting_applicant",
  "list_recruiting_applicant_matches",
  "get_recruiting_applicant_match",
  "list_recruiting_reviews",
  "get_recruiting_review",
  "create_recruiting_review",
  "update_recruiting_review",
  "delete_recruiting_review",
  "list_recruiting_opinions",
  "get_recruiting_opinion",
  "create_recruiting_opinion",
  "update_recruiting_opinion",
  "delete_recruiting_opinion"
] as const

const noopHulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,

  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
  findAllInModel: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
  findOne: () => Effect.succeed(undefined),
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.die(new Error("not implemented")),
  addCollection: () => Effect.die(new Error("not implemented")),
  removeDoc: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  createMixin: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
}

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

describe("Recruiting MCP Tools", () => {
  it.effect("registers the complete expected tool tuple", () =>
    Effect.gen(function*() {
      expect(recruitingTools.map((tool) => tool.name)).toEqual([...expectedRecruitingToolNames])
    }))

  it.effect("uses the recruiting category for every tool", () =>
    Effect.gen(function*() {
      expect(recruitingTools).toHaveLength(expectedRecruitingToolNames.length)
      for (const tool of recruitingTools) {
        expect(tool.category).toBe("recruiting")
        expect(tool.description.length).toBeGreaterThan(20)
        expect(tool.inputSchema).toBeDefined()
      }
    }))

  it.effect("encodes list vacancy success responses", () =>
    Effect.gen(function*() {
      const tool = recruitingTools.find((candidate) => candidate.name === "list_recruiting_vacancies")
      expect(tool).toBeDefined()
      if (tool === undefined) return

      const response = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(response.isError).toBeUndefined()
      expect(response.content[0]?.text).toBe("{\"vacancies\":[],\"total\":0}")
    }))
})
