/* eslint-disable no-restricted-syntax -- generic Huly SDK port fixtures require nominal-ref bridges at this isolated test boundary. */
import { describe, it } from "@effect/vitest"
import type { Card as HulyCard, MasterTag } from "@hcengineering/card"
import type { Blob, Class, Doc, DocumentQuery, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { cardPlugin, core, mail } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { GenericSpace } from "../../../src/huly/operations/spaces-shared.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { mailTools } from "../../../src/mcp/tools/mail.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { corePersonId, docRef } from "../../helpers/huly-sdk.js"

const person: PersonId = corePersonId("mail-tool-person")
const account = toAccountUuid("00000000-0000-4000-8000-000000000001")
const threadClass = docRef<MasterTag>("chat:masterTag:Thread")

const makeSpace = (id: string): GenericSpace => ({
  _id: docRef<GenericSpace>(id),
  _class: core.class.Space,
  space: core.space.Space,
  name: "Shared",
  description: "",
  private: true,
  members: [],
  archived: false,
  modifiedBy: person,
  modifiedOn: 1
})

const makeCard = (id: string, space: Ref<Space>, title: string, parent?: Ref<HulyCard>): HulyCard => ({
  _id: docRef<HulyCard>(id),
  _class: threadClass,
  space,
  title,
  content: toRef<Blob>("opaque-content-that-must-not-leak"),
  blobs: {},
  attachments: 4,
  parentInfo: [],
  parent: parent ?? null,
  rank: "0|aaa",
  modifiedBy: person,
  modifiedOn: 2,
  createdBy: person,
  createdOn: 1
})

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId) => `https://test.huly.io/files?file=${blobId}`
}

const makeClient = (spaces: ReadonlyArray<GenericSpace>): HulyClientOperations => {
  const thread = makeCard("thread-1", docRef<Space>("space-1"), "alerts@example.com")
  const subject = makeCard("subject-1", docRef<Space>("space-1"), "Build complete", thread._id)
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(classId: Ref<Class<T>>, query: DocumentQuery<T>) => {
    const docs: ReadonlyArray<Doc> =
      classId === mail.tag.MailThread
        ? [thread]
        : classId === cardPlugin.class.Card
          ? [subject]
          : classId === core.class.Space
            ? spaces
            : []
    const filtered =
      classId === core.class.Space && "name" in query
        ? docs.filter((doc) => Reflect.get(doc, "name") === query.name)
        : docs
    // The class ref branches above select fixtures compatible with T at this fake-client boundary.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects each Doc fixture as T
    return Effect.succeed(toFindResult(filtered as unknown as Array<T>))
  }
  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(classId: Ref<Class<T>>) =>
    classId === core.class.Space && spaces.length === 1
      ? // The class-ref branch selects the GenericSpace fixture for T.
        // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects GenericSpace as T
        Effect.succeed(assertAt(spaces, 0) as unknown as T)
      : Effect.succeed(undefined)

  return {
    getAccountUuid: () => account,
    getPrimarySocialId: () => person,
    markupUrlConfig: testMarkupUrlConfig,
    workbenchUrlConfig: testWorkbenchUrlConfig,
    findAll,
    findAllInModel: findAll,
    findOne,
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
}

const tool = assertAt(mailTools, 0)

describe("mailTools", () => {
  it("registers the provider-neutral read-only tool globally", () => {
    expect(tool.name).toBe("list_mail_threads")
    expect(tool.category).toBe("mail")
    expect(TOOL_DEFINITIONS.list_mail_threads).toBe(tool)
  })

  it.effect("encodes metadata-only structured output without card content or attachment fields", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() => tool.handler({}, makeClient([makeSpace("space-1")]), storageClient))

      expect(response.isError).toBeUndefined()
      expect(response.structuredContent?.result).toEqual({
        threads: [
          {
            id: "thread-1",
            channelTitle: "alerts@example.com",
            space: { id: "space-1", name: "Shared" },
            createdOn: 1,
            modifiedOn: 2,
            subjects: [{ id: "subject-1", subject: "Build complete", createdOn: 1, modifiedOn: 2 }]
          }
        ]
      })
      expect(JSON.stringify(response.structuredContent)).not.toContain("opaque-content")
      expect(JSON.stringify(response.structuredContent)).not.toContain("attachment")
    })
  )

  it.effect("maps invalid input and ambiguous space names to MCP invalid params", () =>
    Effect.gen(function* () {
      const invalid = yield* Effect.promise(() => tool.handler({ limit: 0 }, makeClient([]), storageClient))
      const ambiguous = yield* Effect.promise(() =>
        tool.handler({ space: "Shared" }, makeClient([makeSpace("space-1"), makeSpace("space-2")]), storageClient)
      )

      expect(invalid.isError).toBe(true)
      expect(assertAt(invalid.content, 0).text).toContain("Invalid parameters")
      expect(ambiguous.isError).toBe(true)
      expect(assertAt(ambiguous.content, 0).text).toContain("Space 'Shared' is ambiguous")
    })
  )
})
