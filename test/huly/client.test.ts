import { describe, it } from "@effect/vitest"
import type { MarkupRef } from "@hcengineering/api-client"
import {
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  type Mixin,
  type MixinData,
  type MixinUpdate,
  type PersonId,
  type Ref as DocRef,
  SocialIdType,
  type Space,
  toFindResult,
  type TxResult,
  type WithLookup
} from "@hcengineering/core"
import { jsonToMarkup as realJsonToMarkup, markupToJSON as parseMarkupToJSON } from "@hcengineering/text"
import {
  markdownToMarkup as realMarkdownToMarkup,
  markupToMarkdown as realMarkupToMarkdown
} from "@hcengineering/text-markdown"
import { Cause, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { beforeEach, expect } from "vitest"
import { HulyConfigService } from "../../src/config/config.js"
import { SocialIdentityId } from "../../src/domain/schemas/person-administration.js"
import { PersonMergeReferenceImpactSchema } from "../../src/domain/schemas/person-merge.js"
import {
  Email,
  HulyTransactionScope,
  NonEmptyString,
  PersonId as DomainPersonId,
  PersonName
} from "../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../../src/huly/client.js"
import type { EmployeePreparationPlan } from "../../src/huly/employee-preparation.js"
import {
  HulyAuthError,
  HulyConnectionError,
  PersonMergeSnapshotStaleError,
  HulyUnavailableError,
  makeOperationConnectionError
} from "../../src/huly/errors.js"
import { INLINE_COMMENT_MARK_TYPE } from "../../src/huly/operations/inline-comment-mark.js"
import { MARKDOWN_INPUT_REF_URL } from "../../src/huly/operations/markup.js"
import { attachment, chunter, contact, core } from "../../src/huly/huly-plugins.js"
import { toClassRef, toMixinRef, toRef } from "../../src/huly/operations/sdk-boundary.js"
import { HulySdk, type HulySdkDependencies } from "../../src/huly/sdk-deps.js"
import { normalizeHulyOrigin } from "../../src/huly/unavailable-diagnostics.js"
import { assertAt } from "../../src/utils/assertions.js"
import { mockFn } from "../helpers/mock-fn.js"

// --- Mock setup ---

const decodePersonMergeReferenceImpact = Schema.decodeSync(PersonMergeReferenceImpactSchema)
const mockFindAll = mockFn()
const mockFindOne = mockFn()
const mockFindAllInModel = mockFn()
const mockCreateDoc = mockFn()
const mockUpdateDoc = mockFn()
const mockUpdate = mockFn()
const mockAddCollection = mockFn()
const mockRemoveCollection = mockFn()
const mockRemoveDoc = mockFn()
const mockApply = mockFn()
const mockApplyNotMatch = mockFn()
const mockApplyMatch = mockFn()
const mockApplyCreateDoc = mockFn()
const mockApplyAddCollection = mockFn()
const mockApplyCreateMixin = mockFn()
const mockApplyUpdateDoc = mockFn()
const mockApplyUpdateMixin = mockFn()
const mockApplyRemoveDoc = mockFn()
const mockApplyCommit = mockFn()
const mockCreateMixin = mockFn()
const mockUpdateMixin = mockFn()
const mockSearchFulltext = mockFn()
const mockClose = mockFn()
const mockLoadServerConfig = mockFn()
const mockGetBaseClass = mockFn()
const mockGetAncestors = mockFn()
const mockGetDescendants = mockFn()
const mockHierarchyIsDerived = mockFn()
const mockFindDomain = mockFn()
const mockHierarchyIsMixin = mockFn()

const mockHierarchy = {
  getBaseClass: mockGetBaseClass,
  getAncestors: mockGetAncestors,
  getDescendants: mockGetDescendants,
  isDerived: mockHierarchyIsDerived,
  findDomain: mockFindDomain,
  isMixin: mockHierarchyIsMixin
}

const mockTxOperations = {
  findAll: mockFindAll,
  findOne: mockFindOne,
  getModel: () => ({ findAllSync: mockFindAllInModel }),
  getHierarchy: () => mockHierarchy,
  createDoc: mockCreateDoc,
  updateDoc: mockUpdateDoc,
  update: mockUpdate,
  addCollection: mockAddCollection,
  removeCollection: mockRemoveCollection,
  removeDoc: mockRemoveDoc,
  apply: mockApply,
  createMixin: mockCreateMixin,
  updateMixin: mockUpdateMixin,
  searchFulltext: mockSearchFulltext,
  close: mockClose
}

const mockGetMarkup = mockFn()
const mockCreateMarkup = mockFn()
const mockUpdateMarkup = mockFn()
const mockMarkdownToMarkup = mockFn().mockImplementation((md: string) => ({ type: "md-parsed", content: md }))
const mockCreateRestTxOperations = mockFn().mockImplementation(() => Promise.resolve(mockTxOperations))

const clearAllMockFns = () => {
  mockFindAll.mockClear()
  mockFindOne.mockClear()
  mockFindAllInModel.mockClear()
  mockCreateDoc.mockClear()
  mockUpdateDoc.mockClear()
  mockUpdate.mockClear()
  mockAddCollection.mockClear()
  mockRemoveCollection.mockClear()
  mockRemoveDoc.mockClear()
  mockApply.mockClear()
  mockApplyNotMatch.mockClear()
  mockApplyMatch.mockClear()
  mockApplyCreateDoc.mockClear()
  mockApplyAddCollection.mockClear()
  mockApplyCreateMixin.mockClear()
  mockApplyUpdateDoc.mockClear()
  mockApplyUpdateMixin.mockClear()
  mockApplyRemoveDoc.mockClear()
  mockApplyCommit.mockClear()
  mockCreateMixin.mockClear()
  mockUpdateMixin.mockClear()
  mockSearchFulltext.mockClear()
  mockClose.mockClear()
  mockLoadServerConfig.mockClear()
  mockGetBaseClass.mockClear()
  mockGetAncestors.mockClear()
  mockGetDescendants.mockClear()
  mockHierarchyIsDerived.mockClear()
  mockFindDomain.mockClear()
  mockHierarchyIsMixin.mockClear()
  mockGetMarkup.mockClear()
  mockCreateMarkup.mockClear()
  mockUpdateMarkup.mockClear()
  mockMarkdownToMarkup.mockClear()
  mockCreateRestTxOperations.mockClear()
}

const resetApplyDefaults = () => {
  mockApplyCreateDoc.mockResolvedValue(undefined)
  mockApplyAddCollection.mockResolvedValue(undefined)
  mockApplyCreateMixin.mockResolvedValue(undefined)
  mockApplyUpdateDoc.mockResolvedValue(undefined)
  mockApplyUpdateMixin.mockResolvedValue(undefined)
  mockApplyRemoveDoc.mockResolvedValue(undefined)
  mockApplyCommit.mockResolvedValue({ result: true })
  mockApply.mockReturnValue({
    notMatch: mockApplyNotMatch,
    match: mockApplyMatch,
    createDoc: mockApplyCreateDoc,
    addCollection: mockApplyAddCollection,
    createMixin: mockApplyCreateMixin,
    updateDoc: mockApplyUpdateDoc,
    updateMixin: mockApplyUpdateMixin,
    removeDoc: mockApplyRemoveDoc,
    commit: mockApplyCommit
  })
}

const mockCollaboratorClient = {
  getMarkup: mockGetMarkup,
  createMarkup: mockCreateMarkup,
  updateMarkup: mockUpdateMarkup
}

const testSdk: HulySdkDependencies = {
  createRestClient: mockFn().mockImplementation(() => ({
    getAccount: mockFn().mockResolvedValue({ uuid: "00000000-0000-4000-8000-000000000000" })
  })),
  createRestTxOperations: mockCreateRestTxOperations,
  getWorkspaceToken: mockFn().mockImplementation(() =>
    Promise.resolve({
      endpoint: "http://localhost:9090",
      token: "test-token",
      workspaceId: "ws-123",
      info: { workspaceUrl: "ws-slug" }
    })
  ),
  loadServerConfig: mockLoadServerConfig,
  createStorageClient: mockFn(),
  getAccountClient: mockFn(),
  getCollaboratorClient: mockFn().mockImplementation(() => mockCollaboratorClient),
  htmlToJSON: mockFn().mockImplementation((html: string) => ({ type: "html-parsed", content: html })),
  jsonToHTML: mockFn().mockImplementation((json: unknown) => `<html>${JSON.stringify(json)}</html>`),
  jsonToMarkup: mockFn().mockImplementation((json: unknown) => `markup:${JSON.stringify(json)}`),
  markdownToMarkup: mockMarkdownToMarkup,
  markupToJSON: mockFn().mockImplementation((markup: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: markup }] }]
  })),
  markupToMarkdown: mockFn().mockImplementation((_json: unknown, _opts: unknown) => "# Markdown output")
}

const testSdkLayer = Layer.succeed(HulySdk, testSdk)

const inlineCommentMarkup = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "highlighted text",
          marks: [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "thread-1" } }]
        }
      ]
    }
  ]
})

const resetSdkDefaults = () => {
  mockCreateRestTxOperations.mockResolvedValue(mockTxOperations)
  mockLoadServerConfig.mockResolvedValue({
    COLLABORATOR_URL: "http://localhost:3078",
    ACCOUNTS_URL: "http://localhost:8083"
  })
}

mockLoadServerConfig.mockImplementation(() =>
  Promise.resolve({ COLLABORATOR_URL: "http://localhost:3078", ACCOUNTS_URL: "http://localhost:8083" })
)

// Test config layer
const testConfigLayer = HulyConfigService.testLayer({
  url: "http://localhost:8080",
  email: "test@example.com",
  password: "test-pass",
  workspace: "test-workspace"
})

// Combined layer: HulyClient.layer provided with test config
const liveClientLayer = HulyClient.layerWithDependencies.pipe(Layer.provide(Layer.merge(testConfigLayer, testSdkLayer)))

// Mock doc for testing
interface TestDoc extends Doc {
  title: string
}

describe("HulyClient Service", () => {
  beforeEach(() => {
    clearAllMockFns()
    mockFindAll.mockResolvedValue(toFindResult([]))
    mockFindOne.mockResolvedValue(undefined)
    mockFindAllInModel.mockReturnValue(toFindResult([]))
    mockCreateDoc.mockResolvedValue("new-id")
    mockUpdateDoc.mockResolvedValue({})
    mockUpdate.mockResolvedValue({})
    mockAddCollection.mockResolvedValue("new-attached-id")
    mockRemoveCollection.mockResolvedValue("parent-id")
    mockRemoveDoc.mockResolvedValue({})
    mockGetMarkup.mockResolvedValue("raw-markup")
    mockCreateMarkup.mockResolvedValue("markup-ref-id")
    mockUpdateMarkup.mockResolvedValue(undefined)
    mockClose.mockResolvedValue(undefined)
    resetApplyDefaults()
    resetSdkDefaults()
    mockGetBaseClass.mockImplementation((value: string) => value)
    mockGetAncestors.mockReturnValue([])
    mockGetDescendants.mockImplementation((value: string) => [value])
    mockHierarchyIsDerived.mockImplementation((value: string, target: string) => value === target)
    mockFindDomain.mockReturnValue("test-domain")
    mockHierarchyIsMixin.mockReturnValue(false)
  })

  describe("testLayer", () => {
    it.effect("provides default noop operations", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))

        expect(client.findAll).toBeDefined()
        expect(client.findOne).toBeDefined()
        expect(client.findAllInModel).toBeDefined()
        expect(client.createDoc).toBeDefined()
        expect(client.updateDoc).toBeDefined()
        expect(client.addCollection).toBeDefined()
        expect(client.uploadMarkup).toBeDefined()
        expect(client.fetchMarkup).toBeDefined()
      })
    )

    it.effect("allows overriding specific operations", () =>
      Effect.gen(function* () {
        const testDoc: TestDoc = {
          _id: "1" as DocRef<TestDoc>,
          _class: "class" as DocRef<Class<TestDoc>>,
          space: "space" as DocRef<Space>,
          title: "Test",
          modifiedBy: "user" as PersonId,
          modifiedOn: 0,
          createdBy: "user" as PersonId,
          createdOn: 0
        }
        const mockResults = toFindResult([testDoc])

        const testLayer = HulyClient.testLayer({
          // eslint-disable-next-line no-restricted-syntax -- FindResult<TestDoc> doesn't overlap with FindResult<T>
          findAll: <T extends Doc>() => Effect.succeed(mockResults as unknown as FindResult<T>)
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const results = yield* client.findAll("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)

        expect(results).toHaveLength(1)
      })
    )

    it.effect("default findAll returns empty array", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const results = yield* client.findAll("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)

        expect(results).toHaveLength(0)
      })
    )

    it.effect("default findOne returns undefined", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* client.findOne("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)

        expect(result).toBeUndefined()
      })
    )

    it.effect("default uploadMarkup dies (not implemented)", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.uploadMarkup("class" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "content", "markdown")
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      })
    )

    it.effect("default fetchMarkup returns empty string", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* client.fetchMarkup(
          "class" as DocRef<Class<Doc>>,
          "id" as DocRef<Doc>,
          "attr",
          "markupId" as MarkupRef,
          "markdown"
        )

        expect(result).toBe("")
      })
    )

    it.effect("default removeDoc dies (not implemented)", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.removeDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, "id" as DocRef<TestDoc>)
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      })
    )

    it.effect("default updateMarkup dies (not implemented)", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.updateMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "content", "markdown")
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      })
    )

    it.effect("default addCollection dies (not implemented)", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.addCollection(
            "c" as DocRef<Class<AttachedDoc>>,
            "s" as DocRef<Space>,
            "parent" as DocRef<Doc>,
            "pc" as DocRef<Class<Doc>>,
            "col",
            {} as AttachedData<AttachedDoc>
          )
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      })
    )

    it.effect("default createDoc dies (not implemented)", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.createDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, { title: "t" } as Data<TestDoc>)
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      })
    )

    it.effect("default updateDoc dies (not implemented)", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.updateDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, "id" as DocRef<TestDoc>, {})
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      })
    )
  })

  describe("mock operations with errors", () => {
    it.effect("can mock operations to return HulyConnectionError", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findAll: () => Effect.fail(new HulyConnectionError({ message: "Network error" }))
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.findAll("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Network error")
      })
    )

    it.effect("can mock operations to return HulyAuthError", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findOne: () => Effect.fail(new HulyAuthError({ message: "Invalid credentials" }))
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.findOne("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
        )

        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toBe("Invalid credentials")
      })
    )
  })

  describe("error handling patterns", () => {
    it.effect("can catch HulyConnectionError with catchTag", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findAll: () => Effect.fail(new HulyConnectionError({ message: "Connection timeout" }))
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* client.findAll("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
        }).pipe(
          Effect.catchTag("HulyConnectionError", (e) => Effect.succeed(`Recovered from: ${e.message}`)),
          Effect.provide(testLayer)
        )

        expect(result).toBe("Recovered from: Connection timeout")
      })
    )

    it.effect("can catch HulyAuthError with catchTag", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          createDoc: () => Effect.fail(new HulyAuthError({ message: "Session expired" }))
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* client.createDoc(
            "class" as DocRef<Class<TestDoc>>,
            "space" as DocRef<Space>,
            { title: "Test" } as Data<TestDoc>
          )
        }).pipe(
          Effect.catchTag("HulyAuthError", (e) => Effect.succeed(`Auth error: ${e.message}`)),
          Effect.provide(testLayer)
        )

        expect(result).toBe("Auth error: Session expired")
      })
    )

    it.effect("can handle both error types with catchTags", () =>
      Effect.gen(function* () {
        const connectionErrorLayer = HulyClient.testLayer({
          findAll: () => Effect.fail(new HulyConnectionError({ message: "Network down" }))
        })

        const handleErrors = <A>(effect: Effect.Effect<A, HulyClientError, HulyClient>) =>
          effect.pipe(
            Effect.catchTags({
              HulyConnectionError: (e) => Effect.succeed(`Connection: ${e.message}`),
              HulyAuthError: (e) => Effect.succeed(`Auth: ${e.message}`)
            })
          )

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* handleErrors(client.findAll("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>))
        }).pipe(Effect.provide(connectionErrorLayer))

        expect(result).toBe("Connection: Network down")
      })
    )
  })

  describe("service composition", () => {
    it.effect("can be composed with other services", () =>
      Effect.gen(function* () {
        const asDoc = (v: unknown): Doc => v as Doc
        const mockFindAllOp = <T extends Doc>() =>
          Effect.succeed(
            toFindResult<T>([asDoc({ _id: "1", title: "Issue 1" }), asDoc({ _id: "2", title: "Issue 2" })] as Array<T>)
          )

        const testLayer = HulyClient.testLayer({ findAll: mockFindAllOp })

        const listIssues = Effect.gen(function* () {
          const client = yield* HulyClient
          const issues = yield* client.findAll(
            "tracker.class.Issue" as DocRef<Class<TestDoc>>,
            { space: "project-1" } as DocumentQuery<TestDoc>,
            { limit: 50 } as FindOptions<TestDoc>
          )
          return issues.map((i) => (i as Doc & { title: string }).title)
        })

        const result = yield* listIssues.pipe(Effect.provide(testLayer))

        expect(result).toEqual(["Issue 1", "Issue 2"])
      })
    )

    it.effect("multiple operations reuse same mock layer", () =>
      Effect.gen(function* () {
        const callCount = { findAll: 0, findOne: 0 }

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() => {
            callCount.findAll++
            return Effect.succeed(toFindResult<T>([]))
          },
          findOne: <T extends Doc>() => {
            callCount.findOne++
            // eslint-disable-next-line no-restricted-syntax -- partial mock object doesn't overlap with WithLookup<T>
            return Effect.succeed({ _id: "1", title: "Found" } as unknown as WithLookup<T>)
          }
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient

          const all = yield* client.findAll("class" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
          const one = yield* client.findOne("class" as DocRef<Class<TestDoc>>, { _id: "1" } as DocumentQuery<TestDoc>)

          return { allCount: all.length, found: one !== undefined }
        }).pipe(Effect.provide(testLayer))

        expect(result.allCount).toBe(0)
        expect(result.found).toBe(true)
        expect(callCount.findAll).toBe(1)
        expect(callCount.findOne).toBe(1)
      })
    )
  })

  describe("HulyClientError type", () => {
    it.effect("is union of HulyConnectionError and HulyAuthError", () =>
      Effect.sync(function () {
        const handleError = (error: HulyClientError): string => {
          switch (error._tag) {
            case "HulyConnectionError":
              return `Connection: ${error.message}`
            case "HulyUnavailableError":
              return `Unavailable: ${error.endpointOrigin}`
            case "HulyAuthError":
              return `Auth: ${error.message}`
          }
        }

        const connErr = new HulyConnectionError({ message: "timeout" })
        const authErr = new HulyAuthError({ message: "invalid" })
        const unavailableErr = new HulyUnavailableError({
          endpointOrigin: normalizeHulyOrigin("https://huly.app"),
          failureKind: "timeout"
        })

        expect(handleError(connErr)).toBe("Connection: timeout")
        expect(handleError(authErr)).toBe("Auth: invalid")
        expect(handleError(unavailableErr)).toBe("Unavailable: https://huly.app")
      })
    )
  })

  describe("operation tracking", () => {
    it.effect("tracks operation calls for testing", () =>
      Effect.gen(function* () {
        const operations: Array<string> = []

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() => {
            operations.push("findAll")
            return Effect.succeed(toFindResult<T>([]))
          },
          findOne: <T extends Doc>() => {
            operations.push("findOne")
            return Effect.succeed(undefined as WithLookup<T> | undefined)
          },
          createDoc: <T extends Doc>() => {
            operations.push("createDoc")
            return Effect.succeed("new-id" as DocRef<T>)
          },
          updateDoc: () => {
            operations.push("updateDoc")
            return Effect.succeed({} as TxResult)
          }
        })

        yield* Effect.gen(function* () {
          const client = yield* HulyClient
          yield* client.findAll("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
          yield* client.findOne("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
          yield* client.createDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            { title: "test" } as Data<TestDoc>
          )
          yield* client.updateDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, "id" as DocRef<TestDoc>, {})
        }).pipe(Effect.provide(testLayer))

        expect(operations).toEqual(["findAll", "findOne", "createDoc", "updateDoc"])
      })
    )
  })
})

describe("Connection error classification", () => {
  describe("HulyConnectionError", () => {
    it.effect("has correct tag", () =>
      Effect.sync(function () {
        const error = new HulyConnectionError({ message: "timeout" })
        expect(error._tag).toBe("HulyConnectionError")
      })
    )

    it.effect("includes cause", () =>
      Effect.sync(function () {
        const cause = new Error("underlying")
        const error = new HulyConnectionError({ message: "failed", cause })
        expect(error.cause).toBe(cause)
      })
    )

    it.effect("drops non-Error operation rejection details", () =>
      Effect.sync(function () {
        const error = makeOperationConnectionError("findAll", "token=secret")

        expect(error.message).toBe("findAll failed")
        expect(error.diagnostic).toEqual({ operation: "findAll" })
        expect(JSON.stringify(error)).not.toContain("token=secret")
      })
    )
  })

  describe("HulyAuthError", () => {
    it.effect("has correct tag", () =>
      Effect.sync(function () {
        const error = new HulyAuthError({ message: "invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
      })
    )
  })
})

describe("HulyClient.layer (live layer with mocked externals)", () => {
  beforeEach(() => {
    clearAllMockFns()
    mockFindAll.mockResolvedValue(toFindResult([]))
    mockFindOne.mockResolvedValue(undefined)
    mockCreateDoc.mockResolvedValue("new-id")
    mockUpdateDoc.mockResolvedValue({})
    mockAddCollection.mockResolvedValue("new-attached-id")
    mockRemoveDoc.mockResolvedValue({})
    mockGetMarkup.mockResolvedValue("raw-markup")
    mockCreateMarkup.mockResolvedValue("markup-ref-id")
    mockUpdateMarkup.mockResolvedValue(undefined)
    mockClose.mockResolvedValue(undefined)
    resetApplyDefaults()
    resetSdkDefaults()
  })

  describe("connection", () => {
    it.effect("connects with the full model needed by authoritative metadata operations", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        expect(client.findAll).toBeDefined()
        expect(client.findOne).toBeDefined()
        expect(client.createDoc).toBeDefined()
        expect(client.updateDoc).toBeDefined()
        expect(client.addCollection).toBeDefined()
        expect(client.removeDoc).toBeDefined()
        expect(client.uploadMarkup).toBeDefined()
        expect(client.fetchMarkup).toBeDefined()
        expect(client.updateMarkup).toBeDefined()
        expect(mockCreateRestTxOperations.mock.calls).toContainEqual([
          "http://localhost:9090",
          "ws-123",
          "test-token",
          true
        ])
      })
    )

    it.effect("resolves an exact Person through the live client operation", () =>
      Effect.gen(function* () {
        mockFindOne.mockResolvedValue({
          _id: "person-1",
          _class: String(contact.class.Person),
          space: String(contact.space.Contacts),
          name: "Ada Lovelace",
          avatarType: "color"
        })

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.resolvePersonAdministrationTarget === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person administration resolution"))
        }
        const person = yield* client.resolvePersonAdministrationTarget({ id: DomainPersonId.make("person-1") })

        expect(person).toMatchObject({ _id: "person-1", name: "Ada Lovelace" })
      })
    )
  })

  describe("native person-reference migration", () => {
    const sourceId = DomainPersonId.make("source-person")
    const survivorId = DomainPersonId.make("survivor-person")
    const commentClass = String(chunter.class.ChatMessage)
    const singleAttribute = {
      _id: "attribute-created-by",
      attributeOf: commentClass,
      name: "createdByPerson",
      type: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
    }
    const sourceComment = {
      _id: "comment-1",
      _class: commentClass,
      space: "space-1",
      modifiedOn: 1,
      modifiedBy: "system",
      createdByPerson: sourceId
    }
    const findResult = <A>(items: Array<A>, total = items.length) => Object.assign(items, { total })

    it.effect("discovers metadata-owned references and migrates them through Huly's native updater", () =>
      Effect.gen(function* () {
        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment])))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        expect(impacts).toEqual([
          {
            attributeId: "attribute-created-by",
            ownerClass: commentClass,
            concreteClass: commentClass,
            targetClass: String(contact.class.Person),
            field: "createdByPerson",
            kind: "single",
            category: "comment",
            count: 1,
            snapshotDigest: expect.stringMatching(/^[0-9a-f]{64}$/u)
          }
        ])

        mockFindAll.mockImplementationOnce(() => Promise.resolve(findResult([sourceComment])))
        yield* client.migratePersonReferences(impacts, sourceId, survivorId)

        expect(mockUpdate.mock.calls).toContainEqual([
          sourceComment,
          { createdByPerson: survivorId },
          false,
          expect.any(Number),
          undefined
        ])
      })
    )

    it.effect("preserves and deduplicates array members when replacing a source reference", () =>
      Effect.gen(function* () {
        const arrayAttribute = {
          _id: "attribute-members",
          attributeOf: commentClass,
          name: "members",
          type: {
            _class: String(core.class.ArrOf),
            of: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
          }
        }
        const message = { ...sourceComment, members: ["other", sourceId, survivorId] }
        mockFindAllInModel.mockReturnValue([arrayAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([message])))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)
        mockFindAll.mockImplementationOnce(() => Promise.resolve(findResult([message])))
        yield* client.migratePersonReferences(impacts, sourceId, survivorId)

        expect(mockUpdate.mock.calls).toContainEqual([
          message,
          { $pull: { members: { $in: [sourceId] } } },
          false,
          expect.any(Number),
          undefined
        ])
      })
    )

    it.effect("rejects equal-cardinality document churn before any write", () =>
      Effect.gen(function* () {
        const replacementComment = { ...sourceComment, _id: "comment-2" }
        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment])))
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([replacementComment])))
        const error = yield* Effect.flip(client.migratePersonReferences(impacts, sourceId, survivorId))

        expect(error).toBeInstanceOf(PersonMergeSnapshotStaleError)
        expect(error.message).toContain("changed after preflight")
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )

    it.effect("canonicalizes snapshot document order", () =>
      Effect.gen(function* () {
        const secondComment = { ...sourceComment, _id: "comment-2" }
        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation((_class, _query, options) =>
          Promise.resolve(
            options?.limit === 1 ? findResult([sourceComment], 2) : findResult([secondComment, sourceComment])
          )
        )
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference inspection"))
        }
        const first = yield* client.inspectPersonReferences(sourceId)

        mockFindAll.mockImplementation((_class, _query, options) =>
          Promise.resolve(
            options?.limit === 1 ? findResult([sourceComment], 2) : findResult([sourceComment, secondComment])
          )
        )
        const second = yield* client.inspectPersonReferences(sourceId)

        expect(first[0]?.snapshotDigest).toBe(second[0]?.snapshotDigest)
      })
    )

    it.effect("rejects array-value churn before any write", () =>
      Effect.gen(function* () {
        const arrayAttribute = {
          _id: "attribute-members",
          attributeOf: commentClass,
          name: "members",
          type: {
            _class: String(core.class.ArrOf),
            of: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
          }
        }
        const reviewed = { ...sourceComment, members: [sourceId, "reviewed-member"] }
        const changed = { ...sourceComment, members: [sourceId, "changed-member"] }
        mockFindAllInModel.mockReturnValue([arrayAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([reviewed])))
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([changed])))
        const error = yield* Effect.flip(client.migratePersonReferences(impacts, sourceId, survivorId))

        expect(error).toBeInstanceOf(PersonMergeSnapshotStaleError)
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )

    it.effect("rejects reference metadata churn before any write", () =>
      Effect.gen(function* () {
        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment])))
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        mockFindAllInModel.mockReturnValue([{ ...singleAttribute, type: { _class: "core:class:TypeString" } }])
        const error = yield* Effect.flip(client.migratePersonReferences(impacts, sourceId, survivorId))

        expect(error).toBeInstanceOf(PersonMergeSnapshotStaleError)
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )

    it.effect("rejects document write-routing churn before any write", () =>
      Effect.gen(function* () {
        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment])))
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        mockFindAll.mockImplementation(() =>
          Promise.resolve(findResult([{ ...sourceComment, space: "changed-space" }]))
        )
        const error = yield* Effect.flip(client.migratePersonReferences(impacts, sourceId, survivorId))

        expect(error).toBeInstanceOf(PersonMergeSnapshotStaleError)
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )

    it.effect("validates every descriptor before applying an earlier prepared write", () =>
      Effect.gen(function* () {
        const arrayAttribute = {
          _id: "attribute-members",
          attributeOf: commentClass,
          name: "members",
          type: {
            _class: String(core.class.ArrOf),
            of: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
          }
        }
        const reviewedArray = { ...sourceComment, members: [sourceId, "reviewed-member"] }
        const changedArray = { ...sourceComment, members: [sourceId, "changed-member"] }
        mockFindAllInModel.mockReturnValue([singleAttribute, arrayAttribute])
        mockFindAll.mockImplementation((_class, query) =>
          Promise.resolve(findResult([Object.hasOwn(query, "members") ? reviewedArray : sourceComment]))
        )
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        mockFindAll.mockImplementation((_class, query) =>
          Promise.resolve(findResult([Object.hasOwn(query, "members") ? changedArray : sourceComment]))
        )
        const error = yield* Effect.flip(client.migratePersonReferences(impacts, sourceId, survivorId))

        expect(error).toBeInstanceOf(PersonMergeSnapshotStaleError)
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )

    it.effect("validates late attached routing before applying any planned write", () =>
      Effect.gen(function* () {
        const attachmentClass = String(attachment.class.Attachment)
        const attachmentAttribute = {
          ...singleAttribute,
          _id: "attribute-attachment-created-by",
          attributeOf: attachmentClass
        }
        const reviewedAttachment = {
          ...sourceComment,
          _id: "attachment-1",
          _class: attachmentClass,
          attachedTo: "parent-1",
          attachedToClass: commentClass,
          collection: "attachments"
        }
        const malformedAttachment = { ...reviewedAttachment, collection: undefined }
        mockHierarchyIsDerived.mockImplementation(
          (value: string, target: string) =>
            value === target || (value === attachmentClass && target === String(core.class.AttachedDoc))
        )
        mockFindAllInModel.mockReturnValue([singleAttribute, attachmentAttribute])
        mockFindAll.mockImplementation((concreteClass) =>
          Promise.resolve(findResult([String(concreteClass) === attachmentClass ? reviewedAttachment : sourceComment]))
        )
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)

        mockFindAll.mockImplementation((concreteClass) =>
          Promise.resolve(findResult([String(concreteClass) === attachmentClass ? malformedAttachment : sourceComment]))
        )
        const error = yield* Effect.flip(client.migratePersonReferences(impacts, sourceId, survivorId))

        expect(error).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${attachmentClass}.createdByPerson document`
        })
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )

    it.effect("rejects malformed model attributes before making migration decisions", () =>
      Effect.gen(function* () {
        mockFindAllInModel.mockReturnValue([{ _id: "broken" }])
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference inspection"))
        }
        const error = yield* Effect.flip(client.inspectPersonReferences(sourceId))
        expect(error).toMatchObject({ _tag: "HulyDataInvalidError", entity: "model Attribute" })
      })
    )

    it.effect("rejects malformed known reference metadata instead of silently omitting it", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference inspection"))
        }

        mockFindAllInModel.mockReturnValue([{ ...singleAttribute, type: { _class: String(core.class.RefTo) } }])
        const malformedSingle = yield* Effect.flip(client.inspectPersonReferences(sourceId))
        expect(malformedSingle).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: "Attribute 'attribute-created-by' reference type"
        })

        mockFindAllInModel.mockReturnValue([{ ...singleAttribute, type: { _class: String(core.class.ArrOf) } }])
        const malformedArray = yield* Effect.flip(client.inspectPersonReferences(sourceId))
        expect(malformedArray).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: "Attribute 'attribute-created-by' reference type"
        })

        mockFindAllInModel.mockReturnValue([
          { ...singleAttribute, type: { _class: String(core.class.ArrOf), of: { _class: String(core.class.RefTo) } } }
        ])
        const malformedArrayReference = yield* Effect.flip(client.inspectPersonReferences(sourceId))
        expect(malformedArrayReference).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: "Attribute 'attribute-created-by' reference type"
        })
      })
    )

    it.effect("classifies every declared reference family and ignores non-person metadata", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference inspection"))
        }
        const cases: ReadonlyArray<readonly [string, string]> = [
          [String(contact.class.SocialIdentity), "identity"],
          [String(contact.class.Channel), "channel"],
          [String(contact.class.Member), "membership"],
          [String(attachment.class.Attachment), "attachment"],
          ["test:class:Other", "other"]
        ]
        for (const [concreteClass, category] of cases) {
          mockFindAllInModel.mockReturnValue([
            { ...singleAttribute, _id: `attribute-${category}`, attributeOf: concreteClass }
          ])
          mockFindAll.mockImplementation(() =>
            Promise.resolve(
              findResult([
                {
                  ...sourceComment,
                  _class: concreteClass,
                  attachedTo: "parent-1",
                  attachedToClass: "test:class:Parent",
                  collection: "attachments"
                }
              ])
            )
          )
          expect(yield* client.inspectPersonReferences(sourceId)).toMatchObject([{ category, concreteClass }])
        }

        mockFindAllInModel.mockReturnValue([
          { ...singleAttribute, _id: "_id", name: "_id" },
          { ...singleAttribute, _id: "primitive", type: { _class: "core:class:TypeString" } },
          {
            ...singleAttribute,
            _id: "primitive-array",
            type: { _class: String(core.class.ArrOf), of: { _class: "core:class:TypeString" } }
          },
          {
            ...singleAttribute,
            _id: "not-person",
            type: { _class: String(core.class.RefTo), to: "test:class:Unrelated" }
          }
        ])
        expect(yield* client.inspectPersonReferences(sourceId)).toEqual([])
      })
    )

    it.effect("uses descendant domains, ancestor targets, totals, and specificity safely", () =>
      Effect.gen(function* () {
        const inheritedAttribute = {
          ...singleAttribute,
          _id: "attribute-inherited",
          attributeOf: "test:class:Base",
          type: { _class: String(core.class.RefTo), to: "test:class:Employee" }
        }
        const mixinAttribute = { ...singleAttribute, _id: "attribute-mixin", attributeOf: "test:mixin:PersonRef" }
        mockFindAllInModel.mockReturnValue([inheritedAttribute, mixinAttribute, singleAttribute, inheritedAttribute])
        mockGetBaseClass.mockImplementation((value: string) => value)
        mockGetAncestors.mockReturnValue(["test:class:Employee"])
        mockGetDescendants.mockImplementation((value: string) =>
          value === "test:class:Base"
            ? [String(core.class.Tx), String(core.class.BenchmarkDoc), "test:class:NoDomain", commentClass]
            : [commentClass]
        )
        mockFindDomain.mockImplementation((value: string) =>
          value === "test:class:NoDomain" ? undefined : "test-domain"
        )
        mockHierarchyIsMixin.mockImplementation((value: string) => value === "test:mixin:PersonRef")
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment])))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference inspection"))
        }
        const impacts = yield* client.inspectPersonReferences(sourceId)
        expect(impacts).toHaveLength(1)
        expect(impacts[0]).toMatchObject({ attributeId: "attribute-created-by", ownerClass: commentClass })

        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([], 0)))
        expect(yield* client.inspectPersonReferences(sourceId)).toEqual([])

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([], -1)))
        const invalidTotal = yield* Effect.flip(client.inspectPersonReferences(sourceId))
        expect(invalidTotal).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson total`
        })

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([], Number.NaN)))
        const invalidImpact = yield* Effect.flip(client.inspectPersonReferences(sourceId))
        expect(invalidImpact).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson total`
        })
      })
    )

    it.effect("deduplicates reference descriptors with injective structured tuple keys", () =>
      Effect.gen(function* () {
        const firstClass = "test:class:a\u0000b"
        const firstField = "c"
        const secondClass = "test:class:a"
        const secondField = "b\u0000c"
        mockFindAllInModel.mockReturnValue([
          { ...singleAttribute, _id: "attribute-first", attributeOf: firstClass, name: firstField },
          { ...singleAttribute, _id: "attribute-second", attributeOf: secondClass, name: secondField }
        ])
        mockFindAll.mockImplementation((concreteClass, query) => {
          const field = Object.hasOwn(query, firstField) ? firstField : secondField
          return Promise.resolve(findResult([{ ...sourceComment, _class: String(concreteClass), [field]: sourceId }]))
        })
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference inspection"))
        }

        const impacts = yield* client.inspectPersonReferences(sourceId)

        expect(impacts).toHaveLength(2)
        expect(impacts.map(({ attributeId }) => attributeId)).toEqual(["attribute-first", "attribute-second"])
      })
    )

    it.effect("reports missing metadata, cardinality drift, duplicate documents, invalid data, and SDK failures", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const impact = decodePersonMergeReferenceImpact({
          attributeId: "attribute-created-by",
          ownerClass: commentClass,
          concreteClass: commentClass,
          targetClass: String(contact.class.Person),
          field: "createdByPerson",
          kind: "single",
          category: "comment",
          count: 1,
          snapshotDigest: "0".repeat(64)
        })

        mockFindAllInModel.mockReturnValue([])
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: "Attribute 'attribute-created-by'"
        })

        mockFindAllInModel.mockReturnValue([{ _id: "attribute-created-by" }])
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: "Attribute 'attribute-created-by'"
        })

        mockFindAllInModel.mockReturnValue([singleAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([{ _id: "broken" }])))
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson document`
        })

        mockFindAll.mockImplementation(() =>
          Promise.resolve(findResult([{ ...sourceComment, _class: "test:class:Wrong" }]))
        )
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson document class correlation`
        })

        mockFindAll.mockImplementation(() =>
          Promise.resolve(findResult([{ ...sourceComment, createdByPerson: "different-person" }]))
        )
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson source correlation`
        })

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([{ ...sourceComment, createdByPerson: 42 }])))
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson reference value`
        })

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([])))
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson cardinality changed during snapshot`
        })

        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment], 2)))
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.createdByPerson cardinality changed during snapshot`
        })

        const duplicateImpact = decodePersonMergeReferenceImpact({ ...impact, count: 2 })
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([sourceComment, sourceComment])))
        expect(
          yield* Effect.flip(client.migratePersonReferences([duplicateImpact], sourceId, survivorId))
        ).toMatchObject({ _tag: "HulyDataInvalidError", entity: `${commentClass}.createdByPerson duplicate document` })

        mockFindAll.mockRejectedValue(new Error("network unavailable"))
        expect(yield* Effect.flip(client.migratePersonReferences([impact], sourceId, survivorId))).toMatchObject({
          _tag: "HulyConnectionError"
        })
      })
    )

    it.effect("rejects invalid array reference payloads", () =>
      Effect.gen(function* () {
        const arrayAttribute = {
          _id: "attribute-members",
          attributeOf: commentClass,
          name: "members",
          type: {
            _class: String(core.class.ArrOf),
            of: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
          }
        }
        const arrayImpact = decodePersonMergeReferenceImpact({
          attributeId: "attribute-members",
          ownerClass: commentClass,
          concreteClass: commentClass,
          targetClass: String(contact.class.Person),
          field: "members",
          kind: "array",
          category: "comment",
          count: 1,
          snapshotDigest: "0".repeat(64)
        })
        mockFindAllInModel.mockReturnValue([arrayAttribute])
        mockFindAll.mockImplementation(() => Promise.resolve(findResult([{ ...sourceComment, members: 42 }])))
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        if (client.migratePersonReferences === undefined) {
          return yield* Effect.die(new Error("live HulyClient omitted person-reference migration"))
        }
        const error = yield* Effect.flip(client.migratePersonReferences([arrayImpact], sourceId, survivorId))
        expect(error).toMatchObject({ _tag: "HulyDataInvalidError", entity: `${commentClass}.members reference value` })

        mockFindAll.mockImplementation(() =>
          Promise.resolve(findResult([{ ...sourceComment, members: ["different-person"] }]))
        )
        const uncorrelated = yield* Effect.flip(client.migratePersonReferences([arrayImpact], sourceId, survivorId))
        expect(uncorrelated).toMatchObject({
          _tag: "HulyDataInvalidError",
          entity: `${commentClass}.members source correlation`
        })
        expect(mockUpdate.mock.calls).toEqual([])
      })
    )
  })

  describe("findAll", () => {
    it.effect("delegates to TxOperations.findAll", () =>
      Effect.gen(function* () {
        const docs = [{ _id: "d1", title: "Doc 1" }]
        // eslint-disable-next-line no-restricted-syntax -- partial mock objects don't overlap with Doc[]
        mockFindAll.mockResolvedValue(toFindResult(docs as unknown as Array<Doc>))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const results = yield* client.findAll(
          "class" as DocRef<Class<TestDoc>>,
          { title: "Doc 1" } as DocumentQuery<TestDoc>,
          { limit: 10 } as FindOptions<TestDoc>
        )

        expect(results).toHaveLength(1)
        expect(mockFindAll.mock.calls).toContainEqual(["class", { title: "Doc 1" }, { limit: 10 }])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockFindAll.mockRejectedValue(new Error("network failure token=secret"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(client.findAll("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("findAll failed")
        expect(error).toMatchObject({ diagnostic: { operation: "findAll" } })
        expect(JSON.stringify(error)).not.toContain("token=secret")
      })
    )
  })

  describe("findOne", () => {
    it.effect("delegates to TxOperations.findOne", () =>
      Effect.gen(function* () {
        const doc = { _id: "d1", title: "Found" }
        mockFindOne.mockResolvedValue(doc)

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.findOne("class" as DocRef<Class<TestDoc>>, { _id: "d1" } as DocumentQuery<TestDoc>)

        expect(result).toEqual(doc)
        expect(mockFindOne.mock.calls).toContainEqual(["class", { _id: "d1" }, undefined])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockFindOne.mockRejectedValue(new Error("query error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(client.findOne("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("findOne failed")
      })
    )
  })

  describe("findAllInModel", () => {
    it.effect("delegates to the local model findAllSync", () =>
      Effect.gen(function* () {
        const docs = [{ _id: "d1", title: "Model Doc" }]
        // eslint-disable-next-line no-restricted-syntax -- partial mock objects don't overlap with Doc[]
        mockFindAllInModel.mockReturnValue(toFindResult(docs as unknown as Array<Doc>))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const results = yield* client.findAllInModel(
          "class" as DocRef<Class<TestDoc>>,
          { title: "Model Doc" } as DocumentQuery<TestDoc>,
          { limit: 10 } as FindOptions<TestDoc>
        )

        expect(results).toHaveLength(1)
        expect(mockFindAllInModel.mock.calls).toContainEqual(["class", { title: "Model Doc" }, { limit: 10 }])
      })
    )

    it.effect("wraps local model errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockFindAllInModel.mockImplementation(() => {
          throw new Error("model query failure")
        })

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.findAllInModel("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("findAllInModel failed")
        expect(error).toMatchObject({ diagnostic: { operation: "findAllInModel" } })
        expect(error.message).not.toContain("model query failure")
      })
    )
  })

  describe("identity and mixin operations", () => {
    it.effect("exposes the connected account uuid and primary social id", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        expect(client.getAccountUuid()).toBe("00000000-0000-4000-8000-000000000000")
        // exercises the accessor; the primary social id is only populated from a live connection
        client.getPrimarySocialId()
      })
    )

    it.effect("delegates createMixin to TxOperations", () =>
      Effect.gen(function* () {
        mockCreateMixin.mockResolvedValue({})
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.createMixin(
          "obj" as DocRef<TestDoc>,
          "cls" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          "mixin" as DocRef<Mixin<TestDoc>>,
          {} as MixinData<TestDoc, TestDoc>
        )
        expect(mockCreateMixin.mock.calls[0]?.[0]).toBe("obj")
      })
    )

    it.effect("delegates updateMixin to TxOperations", () =>
      Effect.gen(function* () {
        mockUpdateMixin.mockResolvedValue({})
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMixin(
          "obj" as DocRef<TestDoc>,
          "cls" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          "mixin" as DocRef<Mixin<TestDoc>>,
          {} as MixinUpdate<TestDoc, TestDoc>
        )
        expect(mockUpdateMixin.mock.calls[0]?.[0]).toBe("obj")
      })
    )

    it.effect("commits a new Employee preparation once and exposes a false authoritative result", () =>
      Effect.gen(function* () {
        mockApplyCommit.mockResolvedValue({ result: false })
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const commit = client.commitEmployeePreparation
        expect(commit).toBeDefined()
        if (commit === undefined) return
        const preparation: EmployeePreparationPlan = {
          kind: "create-person",
          personId: DomainPersonId.make("person-new"),
          identityId: SocialIdentityId.make("identity-new"),
          name: PersonName.make("Person,New"),
          email: Email.make("new@example.test"),
          targetRole: "USER",
          scope: HulyTransactionScope.make("employee:new@example.test")
        }
        expect(yield* commit(preparation)).toBe("condition-not-met")
        expect(mockApply.mock.calls).toEqual([["employee:new@example.test"]])
        expect(mockApplyCreateDoc.mock.calls).toHaveLength(1)
        expect(mockApplyAddCollection.mock.calls).toHaveLength(1)
        expect(mockApplyCreateMixin.mock.calls).toHaveLength(1)
        expect(mockApplyCommit.mock.calls).toHaveLength(1)
        expect(mockApplyNotMatch.mock.calls.length).toBeGreaterThanOrEqual(6)
      })
    )

    it.effect("queues existing promotion in one Apply and never commits an incomplete preparation", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const commit = client.commitEmployeePreparation
        expect(commit).toBeDefined()
        if (commit === undefined) return
        const preparation: EmployeePreparationPlan = {
          kind: "prepare-existing",
          personId: DomainPersonId.make("person-existing"),
          previousName: PersonName.make("Person,Old"),
          identity: { state: "existing", identityId: SocialIdentityId.make("identity-existing") },
          employee: { state: "update", previousActive: false, previousRole: "USER" },
          name: PersonName.make("Person,Renamed"),
          email: Email.make("existing@example.test"),
          targetRole: "GUEST",
          scope: HulyTransactionScope.make("employee:existing@example.test")
        }
        expect(yield* commit(preparation)).toBe("applied")
        expect(mockApplyMatch.mock.calls).toHaveLength(3)
        expect(mockApplyNotMatch.mock.calls).toContainEqual([
          expect.anything(),
          expect.objectContaining({
            _id: { $ne: "identity-existing" },
            type: SocialIdType.EMAIL,
            value: "existing@example.test"
          })
        ])
        expect(mockApplyNotMatch.mock.calls).toContainEqual([
          expect.anything(),
          expect.objectContaining({ _id: { $ne: "person-existing" }, name: "Person,Renamed" })
        ])
        expect(mockApplyUpdateDoc.mock.calls).toHaveLength(1)
        expect(mockApplyUpdateMixin.mock.calls).toHaveLength(1)
        expect(mockApplyCommit.mock.calls).toHaveLength(1)

        resetApplyDefaults()
        mockApplyCommit.mockClear()
        mockApplyAddCollection.mockRejectedValue(new Error("cannot queue identity"))
        const incomplete: EmployeePreparationPlan = {
          ...preparation,
          identity: { state: "create", identityId: SocialIdentityId.make("identity-retry") }
        }
        const error = yield* Effect.flip(commit(incomplete))
        expect(error).toBeInstanceOf(HulyConnectionError)
        expect(mockApplyCommit.mock.calls).toHaveLength(0)
      })
    )

    it.effect("covers existing Employee creation and inactive role reconciliation preparation variants", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const commit = client.commitEmployeePreparation
        expect(commit).toBeDefined()
        if (commit === undefined) return
        const createEmployee: EmployeePreparationPlan = {
          kind: "prepare-existing",
          personId: DomainPersonId.make("person-existing"),
          previousName: PersonName.make("Person,Existing"),
          identity: { state: "create", identityId: SocialIdentityId.make("identity-new") },
          employee: { state: "create" },
          name: PersonName.make("Person,Existing"),
          email: Email.make("existing@example.test"),
          targetRole: "USER",
          scope: HulyTransactionScope.make("employee:existing@example.test")
        }
        expect(yield* commit(createEmployee)).toBe("applied")
        expect(mockApplyUpdateDoc.mock.calls).toHaveLength(0)
        expect(mockApplyAddCollection.mock.calls).toHaveLength(1)
        expect(mockApplyCreateMixin.mock.calls).toHaveLength(1)

        resetApplyDefaults()
        mockApplyAddCollection.mockClear()
        mockApplyMatch.mockClear()
        mockApplyNotMatch.mockClear()
        mockApplyUpdateMixin.mockClear()
        const reconcileRole: EmployeePreparationPlan = {
          kind: "reconcile-role",
          personId: DomainPersonId.make("person-existing"),
          previousName: PersonName.make("Person,Existing"),
          employee: { state: "update", previousActive: false },
          name: PersonName.make("Person,Existing"),
          email: Email.make("existing@example.test"),
          targetRole: "GUEST",
          scope: HulyTransactionScope.make("employee:existing@example.test")
        }
        expect(yield* commit(reconcileRole)).toBe("applied")
        expect(mockApplyAddCollection.mock.calls).toHaveLength(0)
        expect(mockApplyNotMatch.mock.calls).toHaveLength(0)
        expect(mockApplyUpdateMixin.mock.calls).toHaveLength(1)
        expect(mockApplyMatch.mock.calls).toContainEqual([
          expect.anything(),
          expect.objectContaining({ active: false, role: { $exists: false } })
        ])
      })
    )

    it.effect("delegates searchFulltext to TxOperations and wraps errors", () =>
      Effect.gen(function* () {
        mockSearchFulltext.mockResolvedValue({ docs: [] })
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.searchFulltext({ query: "hello" }, {})
        expect(result.docs).toEqual([])

        mockSearchFulltext.mockRejectedValue(new Error("search down"))
        const failing = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(failing.searchFulltext({ query: "x" }, {}))
        expect(error.message).toContain("searchFulltext failed")
      })
    )
  })

  describe("createDoc", () => {
    it.effect("delegates to TxOperations.createDoc", () =>
      Effect.gen(function* () {
        mockCreateDoc.mockResolvedValue("created-id")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.createDoc(
          "class" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          { title: "New" } as Data<TestDoc>,
          "preset-id" as DocRef<TestDoc>
        )

        expect(result).toBe("created-id")
        expect(mockCreateDoc.mock.calls).toContainEqual(["class", "space", { title: "New" }, "preset-id"])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockCreateDoc.mockRejectedValue(new Error("create failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.createDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, { title: "x" } as Data<TestDoc>)
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("createDoc failed")
      })
    )
  })

  describe("conditional document writes", () => {
    it.effect("delegates guarded create, update, and removal through ApplyOperations", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const createDocIfNotMatched = client.createDocIfNotMatched
        const updateDocIfMatched = client.updateDocIfMatched
        const removeDocIfMatched = client.removeDocIfMatched
        if (
          createDocIfNotMatched === undefined ||
          updateDocIfMatched === undefined ||
          removeDocIfMatched === undefined
        ) {
          return yield* Effect.die(new Error("conditional document operations missing"))
        }
        const objectClass = toClassRef<TestDoc>("class")
        const space = toRef<Space>("space")
        const objectId = toRef<TestDoc>("id")
        const attributes: Data<TestDoc> = { title: "Initial" }
        const matchQuery: DocumentQuery<TestDoc> = { _id: objectId, title: "Initial" }
        const update: DocumentUpdate<TestDoc> = { title: "Updated" }

        const created = yield* createDocIfNotMatched(
          objectClass,
          space,
          attributes,
          objectId,
          objectClass,
          matchQuery,
          HulyTransactionScope.make("create-scope")
        )
        const updated = yield* updateDocIfMatched(
          objectClass,
          space,
          objectId,
          matchQuery,
          update,
          HulyTransactionScope.make("update-scope")
        )
        const removed = yield* removeDocIfMatched(
          objectClass,
          space,
          objectId,
          matchQuery,
          HulyTransactionScope.make("remove-scope")
        )

        expect(created).toBe("applied")
        expect(updated).toBe("applied")
        expect(removed).toBe("applied")
        expect(mockApply.mock.calls).toEqual([["create-scope"], ["update-scope"], ["remove-scope"]])
        expect(mockApplyNotMatch.mock.calls).toEqual([[objectClass, matchQuery]])
        expect(mockApplyMatch.mock.calls).toEqual([
          [objectClass, matchQuery],
          [objectClass, matchQuery]
        ])
        expect(mockApplyCreateDoc.mock.calls).toEqual([[objectClass, space, attributes, objectId]])
        expect(mockApplyUpdateDoc.mock.calls).toEqual([[objectClass, space, objectId, update]])
        expect(mockApplyRemoveDoc.mock.calls).toEqual([[objectClass, space, objectId]])
        expect(mockApplyCommit.mock.calls).toHaveLength(3)

        mockApplyCommit.mockResolvedValue({ result: false })
        const refused = yield* Effect.all([
          createDocIfNotMatched(
            objectClass,
            space,
            attributes,
            objectId,
            objectClass,
            matchQuery,
            HulyTransactionScope.make("refused-create")
          ),
          updateDocIfMatched(
            objectClass,
            space,
            objectId,
            matchQuery,
            update,
            HulyTransactionScope.make("refused-update")
          ),
          removeDocIfMatched(objectClass, space, objectId, matchQuery, HulyTransactionScope.make("refused-remove"))
        ])
        expect(refused).toEqual(["condition-not-met", "condition-not-met", "condition-not-met"])
      })
    )
  })

  describe("updateDoc", () => {
    it.effect("delegates to TxOperations.updateDoc", () =>
      Effect.gen(function* () {
        const txResult = { id: "tx-1" }
        mockUpdateDoc.mockResolvedValue(txResult)

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.updateDoc(
          "class" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          "id" as DocRef<TestDoc>,
          { title: "Updated" },
          true
        )

        expect(result).toEqual(txResult)
        expect(mockUpdateDoc.mock.calls).toContainEqual(["class", "space", "id", { title: "Updated" }, true])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockUpdateDoc.mockRejectedValue(new Error("update error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.updateDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, "id" as DocRef<TestDoc>, {})
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("updateDoc failed")
      })
    )
  })

  describe("addCollection", () => {
    it.effect("delegates to TxOperations.addCollection", () =>
      Effect.gen(function* () {
        mockAddCollection.mockResolvedValue("attached-id")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.addCollection(
          "childClass" as DocRef<Class<AttachedDoc>>,
          "space" as DocRef<Space>,
          "parentId" as DocRef<Doc>,
          "parentClass" as DocRef<Class<Doc>>,
          "comments",
          { text: "hello" } as AttachedData<AttachedDoc>,
          "preset-id" as DocRef<AttachedDoc>
        )

        expect(result).toBe("attached-id")
        expect(mockAddCollection.mock.calls).toContainEqual([
          "childClass",
          "space",
          "parentId",
          "parentClass",
          "comments",
          { text: "hello" },
          "preset-id"
        ])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockAddCollection.mockRejectedValue(new Error("collection error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.addCollection(
            "c" as DocRef<Class<AttachedDoc>>,
            "s" as DocRef<Space>,
            "p" as DocRef<Doc>,
            "pc" as DocRef<Class<Doc>>,
            "col",
            {} as AttachedData<AttachedDoc>
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("addCollection failed")
      })
    )
  })

  describe("removeCollection", () => {
    it.effect("delegates to TxOperations.removeCollection", () =>
      Effect.gen(function* () {
        mockRemoveCollection.mockResolvedValue("parent-id")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const removeCollection = client.removeCollection
        if (removeCollection === undefined) return yield* Effect.die(new Error("removeCollection missing"))
        const result = yield* removeCollection(
          "childClass" as DocRef<Class<AttachedDoc>>,
          "space" as DocRef<Space>,
          "childId" as DocRef<AttachedDoc>,
          "parentId" as DocRef<Doc>,
          "parentClass" as DocRef<Class<Doc>>,
          "comments"
        )

        expect(result).toBe("parent-id")
        expect(mockRemoveCollection.mock.calls).toContainEqual([
          "childClass",
          "space",
          "childId",
          "parentId",
          "parentClass",
          "comments"
        ])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockRemoveCollection.mockRejectedValue(new Error("collection remove error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const removeCollection = client.removeCollection
        if (removeCollection === undefined) return yield* Effect.die(new Error("removeCollection missing"))
        const error = yield* Effect.flip(
          removeCollection(
            "c" as DocRef<Class<AttachedDoc>>,
            "s" as DocRef<Space>,
            "id" as DocRef<AttachedDoc>,
            "p" as DocRef<Doc>,
            "pc" as DocRef<Class<Doc>>,
            "col"
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("removeCollection failed")
      })
    )
  })

  describe("removeDoc", () => {
    it.effect("delegates to TxOperations.removeDoc", () =>
      Effect.gen(function* () {
        const txResult = { id: "tx-rm" }
        mockRemoveDoc.mockResolvedValue(txResult)

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.removeDoc(
          "class" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          "id" as DocRef<TestDoc>
        )

        expect(result).toEqual(txResult)
        expect(mockRemoveDoc.mock.calls).toContainEqual(["class", "space", "id"])
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockRemoveDoc.mockRejectedValue(new Error("remove error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.removeDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, "id" as DocRef<TestDoc>)
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("removeDoc failed")
      })
    )
  })

  describe("uploadMarkup", () => {
    it.effect("uploads with markup format (passthrough)", () =>
      Effect.gen(function* () {
        mockCreateMarkup.mockResolvedValue("ref-123")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.uploadMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "raw markup value",
          "markup"
        )

        expect(result).toBe("ref-123")
        expect(mockCreateMarkup.mock.calls).toHaveLength(1)
        // In markup mode, toInternalMarkup returns the value as-is
        expect(assertAt(mockCreateMarkup.mock.calls, 0)[1]).toBe("raw markup value")
      })
    )

    it.effect("uploads with html format (converts via htmlToJSON + jsonToMarkup)", () =>
      Effect.gen(function* () {
        mockCreateMarkup.mockResolvedValue("ref-html")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.uploadMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "<p>Hello</p>",
          "html"
        )

        expect(result).toBe("ref-html")
        expect(mockCreateMarkup.mock.calls).toHaveLength(1)
        // htmlToJSON returns json object, jsonToMarkup converts to string
        const uploadedValue = assertAt(mockCreateMarkup.mock.calls, 0)[1] as string
        expect(uploadedValue).toContain("html-parsed")
      })
    )

    it.effect("uploads with markdown format (converts via markdownToMarkup + jsonToMarkup)", () =>
      Effect.gen(function* () {
        mockCreateMarkup.mockResolvedValue("ref-md")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.uploadMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "# Hello",
          "markdown"
        )

        expect(result).toBe("ref-md")
        expect(mockCreateMarkup.mock.calls).toHaveLength(1)
        expect(assertAt(mockMarkdownToMarkup.mock.calls, 0)[1]).toEqual({
          refUrl: MARKDOWN_INPUT_REF_URL,
          imageUrl: "http://localhost:8080/files?workspace=ws-123&file="
        })
        const uploadedValue = assertAt(mockCreateMarkup.mock.calls, 0)[1] as string
        expect(uploadedValue).toContain("md-parsed")
      })
    )

    it.effect("uploads markdown Huly browse links as native reference nodes", () =>
      Effect.gen(function* () {
        mockCreateMarkup.mockResolvedValue("ref-native")
        const realMarkdownSdk: HulySdkDependencies = {
          ...testSdk,
          jsonToMarkup: realJsonToMarkup,
          markdownToMarkup: realMarkdownToMarkup
        }
        const layer = HulyClient.layerWithDependencies.pipe(
          Layer.provide(Layer.merge(testConfigLayer, Layer.succeed(HulySdk, realMarkdownSdk)))
        )

        const client = yield* HulyClient.pipe(Effect.provide(layer))
        yield* client.uploadMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "[HULY-1](http://localhost:8080/browse?workspace=ws-123&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=HULY-1)",
          "markdown"
        )

        const uploadedValue = assertAt(mockCreateMarkup.mock.calls, 0)[1] as string
        const root = parseMarkupToJSON(uploadedValue)
        const reference = root.content?.[0]?.content?.find((node) => node.type === "reference")
        expect(reference).toMatchObject({
          type: "reference",
          attrs: { id: "issue-1", objectclass: "tracker:class:Issue", label: "HULY-1" }
        })
      })
    )

    it.effect("uploads malformed markdown Huly browse links as ordinary links", () =>
      Effect.gen(function* () {
        mockCreateMarkup.mockResolvedValue("ref-malformed")
        const realMarkdownSdk: HulySdkDependencies = {
          ...testSdk,
          jsonToMarkup: realJsonToMarkup,
          markdownToMarkup: realMarkdownToMarkup
        }
        const layer = HulyClient.layerWithDependencies.pipe(
          Layer.provide(Layer.merge(testConfigLayer, Layer.succeed(HulySdk, realMarkdownSdk)))
        )

        const client = yield* HulyClient.pipe(Effect.provide(layer))
        yield* client.uploadMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "[Broken](http://localhost:8080/browse?workspace=ws-123&_id=doc-1)",
          "markdown"
        )

        const uploadedValue = assertAt(mockCreateMarkup.mock.calls, 0)[1] as string
        const root = parseMarkupToJSON(uploadedValue)
        const content = root.content?.[0]?.content ?? []
        expect(content.some((node) => node.type === "reference")).toBe(false)
        expect(content.find((node) => node.type === "text" && node.text === "Broken")?.marks).toContainEqual({
          type: "link",
          attrs: { href: "http://localhost:8080/browse?workspace=ws-123&_id=doc-1" }
        })
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockCreateMarkup.mockRejectedValue(new Error("upload failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.uploadMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "content", "markup")
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("uploadMarkup failed")
      })
    )
  })

  describe("fetchMarkup", () => {
    it.effect("fetches with markup format (passthrough)", () =>
      Effect.gen(function* () {
        mockGetMarkup.mockResolvedValue("raw-internal-markup")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.fetchMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "ref-123" as MarkupRef,
          "markup"
        )

        // In markup mode, fromInternalMarkup returns as-is
        expect(result).toBe("raw-internal-markup")
      })
    )

    it.effect("fetches with html format (converts via markupToJSON + jsonToHTML)", () =>
      Effect.gen(function* () {
        mockGetMarkup.mockResolvedValue("stored-markup")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.fetchMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "ref-html" as MarkupRef,
          "html"
        )

        // markupToJSON returns json, jsonToHTML wraps in <html>
        expect(result).toContain("<html>")
      })
    )

    it.effect("fetches with markdown format (converts via markupToJSON + markupToMarkdown)", () =>
      Effect.gen(function* () {
        mockGetMarkup.mockResolvedValue("stored-markup")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.fetchMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "ref-md" as MarkupRef,
          "markdown"
        )

        // Verifies the wiring: getMarkup -> markupToJSON -> markupToMarkdown
        expect(mockGetMarkup.mock.calls).toHaveLength(1)
        // markupToJSON mock receives the stored markup and returns a parsed object
        // markupToMarkdown mock receives that object and returns "# Markdown output"
        expect(result).toBe("# Markdown output")
      })
    )

    it.effect("fetches markdown content with inline comment marks without exposing thread metadata", () =>
      Effect.gen(function* () {
        mockGetMarkup.mockResolvedValue("stored-markup")
        const realMarkdownSdk: HulySdkDependencies = {
          ...testSdk,
          markupToJSON: mockFn().mockImplementation(() => parseMarkupToJSON(inlineCommentMarkup)),
          markupToMarkdown: realMarkupToMarkdown
        }
        const layer = HulyClient.layerWithDependencies.pipe(
          Layer.provide(Layer.merge(testConfigLayer, Layer.succeed(HulySdk, realMarkdownSdk)))
        )

        const client = yield* HulyClient.pipe(Effect.provide(layer))
        const result = yield* client.fetchMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "ref-md" as MarkupRef,
          "markdown"
        )

        expect(result.trim()).toBe("highlighted text")
        expect(result).not.toContain(INLINE_COMMENT_MARK_TYPE)
        expect(result).not.toContain("thread-1")
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockGetMarkup.mockRejectedValue(new Error("fetch failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.fetchMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "ref" as MarkupRef, "markup")
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("fetchMarkup failed")
      })
    )
  })

  describe("updateMarkup", () => {
    it.effect("updates with markup format (passthrough)", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "updated markup",
          "markup"
        )

        expect(mockUpdateMarkup.mock.calls).toHaveLength(1)
        expect(assertAt(mockUpdateMarkup.mock.calls, 0)[1]).toBe("updated markup")
      })
    )

    it.effect("updates with html format", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "<p>Updated</p>",
          "html"
        )

        expect(mockUpdateMarkup.mock.calls).toHaveLength(1)
        const uploadedValue = assertAt(mockUpdateMarkup.mock.calls, 0)[1] as string
        expect(uploadedValue).toContain("html-parsed")
      })
    )

    it.effect("updates with markdown format", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "# Updated",
          "markdown"
        )

        expect(mockUpdateMarkup.mock.calls).toHaveLength(1)
        expect(assertAt(mockMarkdownToMarkup.mock.calls, 0)[1]).toEqual({
          refUrl: MARKDOWN_INPUT_REF_URL,
          imageUrl: "http://localhost:8080/files?workspace=ws-123&file="
        })
        const uploadedValue = assertAt(mockUpdateMarkup.mock.calls, 0)[1] as string
        expect(uploadedValue).toContain("md-parsed")
      })
    )

    it.effect("updates markdown Huly browse links as native reference nodes", () =>
      Effect.gen(function* () {
        const realMarkdownSdk: HulySdkDependencies = {
          ...testSdk,
          jsonToMarkup: realJsonToMarkup,
          markdownToMarkup: realMarkdownToMarkup
        }
        const layer = HulyClient.layerWithDependencies.pipe(
          Layer.provide(Layer.merge(testConfigLayer, Layer.succeed(HulySdk, realMarkdownSdk)))
        )

        const client = yield* HulyClient.pipe(Effect.provide(layer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "[HULY-1](http://localhost:8080/browse?workspace=ws-123&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=HULY-1)",
          "markdown"
        )

        const uploadedValue = assertAt(mockUpdateMarkup.mock.calls, 0)[1] as string
        const root = parseMarkupToJSON(uploadedValue)
        const reference = root.content?.[0]?.content?.find((node) => node.type === "reference")
        expect(reference).toMatchObject({
          type: "reference",
          attrs: { id: "issue-1", objectclass: "tracker:class:Issue", label: "HULY-1" }
        })
      })
    )

    it.effect("updates malformed markdown Huly browse links as ordinary links", () =>
      Effect.gen(function* () {
        const realMarkdownSdk: HulySdkDependencies = {
          ...testSdk,
          jsonToMarkup: realJsonToMarkup,
          markdownToMarkup: realMarkdownToMarkup
        }
        const layer = HulyClient.layerWithDependencies.pipe(
          Layer.provide(Layer.merge(testConfigLayer, Layer.succeed(HulySdk, realMarkdownSdk)))
        )

        const client = yield* HulyClient.pipe(Effect.provide(layer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "[Broken](http://localhost:8080/browse?workspace=ws-123&_id=doc-1)",
          "markdown"
        )

        const uploadedValue = assertAt(mockUpdateMarkup.mock.calls, 0)[1] as string
        const root = parseMarkupToJSON(uploadedValue)
        const content = root.content?.[0]?.content ?? []
        expect(content.some((node) => node.type === "reference")).toBe(false)
        expect(content.find((node) => node.type === "text" && node.text === "Broken")?.marks).toContainEqual({
          type: "link",
          attrs: { href: "http://localhost:8080/browse?workspace=ws-123&_id=doc-1" }
        })
      })
    )

    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function* () {
        mockUpdateMarkup.mockRejectedValue(
          new Error("HTTP error 502 from https://user:password@example.test/path?token=secret")
        )

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.updateMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "content", "markup")
        )

        expect(error._tag).toBe("HulyConnectionError")
        if (!(error instanceof HulyConnectionError)) throw new Error("Expected HulyConnectionError")
        expect(error.message).toBe("updateMarkup failed with HTTP 502")
        expect(error.diagnostic).toEqual({ operation: "updateMarkup", httpStatus: 502 })
        expect(error.cause).toBeUndefined()
        expect(JSON.stringify(error)).not.toContain("example.test")
        expect(JSON.stringify(error)).not.toContain("password")
        expect(JSON.stringify(error)).not.toContain("token=secret")
      })
    )
  })

  describe("toInternalMarkup default branch (invalid format)", () => {
    it.effect("throws on invalid format during uploadMarkup", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        // Force an invalid format to hit the default/absurd branch
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidFormat = "invalid" as any
        const exit = yield* Effect.exit(
          client.uploadMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "content", invalidFormat)
        )

        expect(Exit.isFailure(exit)).toBe(true)
      })
    )

    it.effect("throws on invalid format during updateMarkup", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidFormat = "bogus" as any
        const exit = yield* Effect.exit(
          client.updateMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "content", invalidFormat)
        )

        expect(Exit.isFailure(exit)).toBe(true)
      })
    )
  })

  describe("fromInternalMarkup default branch (invalid format)", () => {
    it.effect("throws on invalid format during fetchMarkup", () =>
      Effect.gen(function* () {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidFormat = "invalid" as any
        const exit = yield* Effect.exit(
          client.fetchMarkup("c" as DocRef<Class<Doc>>, "id" as DocRef<Doc>, "attr", "ref" as MarkupRef, invalidFormat)
        )

        expect(Exit.isFailure(exit)).toBe(true)
      })
    )
  })

  describe("connection failure", () => {
    it.effect("connectRestWithRetry wraps connection errors", () =>
      Effect.gen(function* () {
        mockLoadServerConfig.mockRejectedValue(new Error("server unreachable"))

        const freshLayer = HulyClient.layerWithDependencies.pipe(
          Layer.provide(Layer.merge(testConfigLayer, testSdkLayer))
        )

        const fiber = yield* HulyClient.pipe(Effect.provide(freshLayer), Effect.forkScoped)

        yield* TestClock.adjust("500 millis")

        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
      })
    )
  })
})
