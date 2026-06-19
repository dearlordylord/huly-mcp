import { describe, it } from "@effect/vitest"
import type { AccountUuid, Association as HulyAssociation, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { genericAssociationTools } from "../../../src/mcp/tools/generic-associations.js"

const person = "person-1" as PersonId
const space = "space-1" as Ref<Space>

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK fixture builder
const makeAssociation = (): HulyAssociation => ({
  _id: "assoc-1" as Ref<HulyAssociation>,
  _class: core.class.Association,
  space,
  modifiedBy: person,
  modifiedOn: 100,
  createdBy: person,
  createdOn: 100,
  classA: tracker.class.Issue,
  classB: tracker.class.Issue,
  nameA: "relates",
  nameB: "relates",
  type: "N:N"
} as HulyAssociation)

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000001" as AccountUuid,
  getPrimarySocialId: () => person,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: ((_class: unknown) =>
    _class === core.class.Association
      ? Effect.succeed(toFindResult([makeAssociation()]))
      : Effect.succeed(toFindResult([]))) as HulyClientOperations["findAll"],
  findAllInModel: () => Effect.succeed(toFindResult([])),
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

const findTool = (name: string) => {
  const tool = genericAssociationTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("genericAssociationTools", () => {
  it.effect("exports association tools in the associations category", () =>
    Effect.gen(function*() {
      expect(genericAssociationTools.map((tool) => tool.name)).toEqual([
        "list_associations",
        "create_association",
        "delete_association",
        "list_relations",
        "create_relation",
        "delete_relation"
      ])
      for (const tool of genericAssociationTools) {
        expect(tool.category).toBe("associations")
      }
    }))

  it.effect("list_associations handler encodes successful output", () =>
    Effect.gen(function*() {
      const tool = findTool("list_associations")
      const result = yield* Effect.promise(() => tool.handler({}, hulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(assertAt(result.content, 0).text) as { associations: Array<{ associationId: string }> }
      expect(assertAt(parsed.associations, 0).associationId).toBe("assoc-1")
    }))

  it.effect("list_relations handler maps schema parse errors", () =>
    Effect.gen(function*() {
      const tool = findTool("list_relations")
      const result = yield* Effect.promise(() => tool.handler({}, hulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
    }))

  it.effect("create_relation annotations mark the operation idempotent and non-destructive", () =>
    Effect.gen(function*() {
      const tool = findTool("create_relation")

      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      })
    }))

  it.effect("create_association annotations mark the operation idempotent and non-destructive", () =>
    Effect.gen(function*() {
      const tool = findTool("create_association")

      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      })
    }))

  it.effect("delete_association annotations mark the operation idempotent and destructive", () =>
    Effect.gen(function*() {
      const tool = findTool("delete_association")

      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      })
    }))

  it.effect("delete_relation input schema stays list_tools compatible while describing both delete modes", () =>
    Effect.gen(function*() {
      const tool = findTool("delete_relation")

      expect(tool.inputSchema).toMatchObject({
        type: "object",
        anyOf: [
          {
            required: ["relation"]
          },
          {
            required: ["association", "source", "target"]
          }
        ]
      })
    }))

  it.effect("delete_relation annotations mark the operation idempotent and destructive", () =>
    Effect.gen(function*() {
      const tool = findTool("delete_relation")

      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      })
    }))
})
