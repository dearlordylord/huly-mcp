import { describe, it } from "@effect/vitest"
import type { Channel, Person as HulyPerson } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type {
  AccountUuid,
  AttachedData,
  AttachedDoc,
  Class,
  Doc,
  DocumentQuery,
  PersonId,
  Ref,
  Space,
  Tx
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Request as HulyApprovalRequest } from "@hcengineering/request"
import { RequestStatus as HulyRequestStatus } from "@hcengineering/request"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { chunter, contact, core, request as requestPlugin } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { approvalRequestTools } from "../../../src/mcp/tools/approval-requests.js"
import { resolveAnnotations, TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

const actor: PersonId = corePersonId("person-social-1")
const accountUuid: AccountUuid = toAccountUuid("00000000-0000-4000-8000-000000000001")

const tx: Tx = {
  _id: toRef<Tx>("tx-1"),
  _class: core.class.Tx,
  space: core.space.Tx,
  modifiedBy: actor,
  modifiedOn: 1,
  createdBy: actor,
  createdOn: 1,
  objectSpace: core.space.Workspace
}

const approvalRequest: HulyApprovalRequest = {
  _id: toRef<HulyApprovalRequest>("request-1"),
  _class: requestPlugin.class.Request,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 20,
  createdBy: actor,
  createdOn: 10,
  attachedTo: toRef<Doc>("issue-1"),
  attachedToClass: toClassRef<Doc>("tracker:class:Issue"),
  collection: "requests",
  requested: [toRef<HulyPerson>("person-1")],
  approved: [],
  requiredApprovesCount: 1,
  status: HulyRequestStatus.Active,
  tx
}

const person: HulyPerson = {
  _id: toRef<HulyPerson>("person-1"),
  _class: contact.class.Person,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 1,
  createdBy: actor,
  createdOn: 1,
  name: "Doe,Jane",
  avatarType: AvatarType.COLOR
}

const channel: Channel = {
  _id: toRef<Channel>("channel-1"),
  _class: contact.class.Channel,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 1,
  createdBy: actor,
  createdOn: 1,
  attachedTo: toRef<Doc>("person-1"),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: "jane@example.com"
}

const docsForClass = (classId: Ref<Class<Doc>>): ReadonlyArray<Doc> => {
  if (classId === requestPlugin.class.Request) return [approvalRequest]
  if (classId === contact.class.Person) return [person]
  if (classId === contact.class.Channel) return [channel]
  return []
}

const docsForSdkClass = <T extends Doc>(classId: Ref<Class<T>>): Array<T> => {
  const docs = docsForClass(classId)
  // Brands are erased at runtime, and this fake client dispatches by the same SDK class ref passed to findAll/findOne.
  // HulyClientOperations ties T to that class ref, but TypeScript cannot narrow T from runtime ref equality.

  return docs as Array<T>
}

const addCaptures: Array<{ readonly classId: string; readonly collection: string }> = []

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => accountUuid,
  getPrimarySocialId: () => actor,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: (<T extends Doc>(classId: Ref<Class<T>>) => Effect.succeed(toFindResult(docsForSdkClass(classId)))),
  findAllInModel: (<T extends Doc>() => Effect.succeed(toFindResult<T>([]))),
  findOne:
    (<T extends Doc>(classId: Ref<Class<T>>, _query: DocumentQuery<T>) => Effect.succeed(docsForSdkClass(classId)[0])),
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.die(new Error("not implemented")),
  addCollection: (<T extends Doc, P extends AttachedDoc>(
    classId: Ref<Class<P>>,
    _space: Ref<Space>,
    _attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string,
    _attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    addCaptures.push({ classId: String(classId), collection })
    return Effect.succeed(id ?? toRef<P>("generated-id"))
  }) as HulyClientOperations["addCollection"],
  removeDoc: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  createMixin: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
}

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.local/files?file=${blobId}`
}

const findTool = (name: string) => {
  const tool = approvalRequestTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("approvalRequestTools", () => {
  it.effect("exports approval request tools in the approvals category and registers them globally", () =>
    Effect.gen(function*() {
      expect(approvalRequestTools.map((tool) => tool.name)).toEqual([
        "list_approval_requests",
        "get_approval_request",
        "add_approval_request",
        "add_approval_request_comment",
        "approve_approval_request",
        "reject_approval_request",
        "cancel_approval_request"
      ])
      for (const tool of approvalRequestTools) {
        expect(tool.category).toBe("approvals")
        expect(TOOL_DEFINITIONS[tool.name]).toBe(tool)
      }
      expect(resolveAnnotations(findTool("list_approval_requests")).readOnlyHint).toBe(true)
      expect(resolveAnnotations(findTool("get_approval_request")).readOnlyHint).toBe(true)
      expect(resolveAnnotations(findTool("add_approval_request")).readOnlyHint).toBe(false)
      expect(resolveAnnotations(findTool("approve_approval_request")).destructiveHint).toBe(false)
      expect(resolveAnnotations(findTool("approve_approval_request")).idempotentHint).toBe(false)
      expect(resolveAnnotations(findTool("reject_approval_request")).idempotentHint).toBe(false)
      expect(resolveAnnotations(findTool("cancel_approval_request")).destructiveHint).toBe(false)
      expect(resolveAnnotations(findTool("cancel_approval_request")).idempotentHint).toBe(false)
    }))

  it.effect("list_approval_requests handler encodes successful structured output", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findTool("list_approval_requests").handler({ limit: 5 }, hulyClient, storageClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent?.result).toMatchObject({
        requests: [{
          id: "request-1",
          status: "Active",
          attachedTo: "issue-1",
          requested: [{ id: "person-1", email: "jane@example.com" }]
        }],
        total: 1
      })
      expect(JSON.parse(assertAt(result.content, 0).text)).toMatchObject({ total: 1 })
    }))

  it.effect("get_approval_request maps validation errors to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findTool("get_approval_request").handler({}, hulyClient, storageClient)
      )

      expect(result.isError).toBe(true)
      expect(assertAt(result.content, 0).text).toContain("Invalid parameters for get_approval_request")
    }))

  it.effect("add_approval_request_comment handler encodes mutation output", () =>
    Effect.gen(function*() {
      addCaptures.length = 0
      const result = yield* Effect.promise(() =>
        findTool("add_approval_request_comment").handler(
          { request: "request-1", body: "Looks good" },
          hulyClient,
          storageClient
        )
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent?.result).toMatchObject({
        request: "request-1",
        action: "comment_added",
        changed: true,
        comment: expect.any(String)
      })
      expect(addCaptures).toEqual([{ classId: chunter.class.ChatMessage, collection: "comments" }])
    }))
})
