import { describe, it } from "@effect/vitest"
import type { MarkupRef } from "@hcengineering/api-client"
import {
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type FindOptions,
  type FindResult,
  type Ref as DocRef,
  type Space,
  toFindResult,
  type TxResult,
  type WithLookup
} from "@hcengineering/core"
import { Cause, Effect, Exit, Fiber, Layer, TestClock } from "effect"
import { beforeEach, expect, vi } from "vitest"
import { HulyConfigService } from "../../src/config/config.js"
import { HulyClient, type HulyClientError } from "../../src/huly/client.js"
import { HulyAuthError, HulyConnectionError } from "../../src/huly/errors.js"

// --- Mock setup ---

const mockFindAll = vi.fn()
const mockFindOne = vi.fn()
const mockCreateDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockAddCollection = vi.fn()
const mockRemoveDoc = vi.fn()
const mockClose = vi.fn()

const mockTxOperations = {
  findAll: mockFindAll,
  findOne: mockFindOne,
  createDoc: mockCreateDoc,
  updateDoc: mockUpdateDoc,
  addCollection: mockAddCollection,
  removeDoc: mockRemoveDoc,
  close: mockClose
}

const mockGetMarkup = vi.fn()
const mockCreateMarkup = vi.fn()
const mockUpdateMarkup = vi.fn()

const mockCollaboratorClient = {
  getMarkup: mockGetMarkup,
  createMarkup: mockCreateMarkup,
  updateMarkup: mockUpdateMarkup
}

vi.mock("@hcengineering/api-client", () => ({
  createRestTxOperations: vi.fn().mockImplementation(() => Promise.resolve(mockTxOperations)),
  getWorkspaceToken: vi.fn().mockImplementation(() =>
    Promise.resolve({
      endpoint: "http://localhost:9090",
      token: "test-token",
      workspaceId: "ws-123"
    })
  ),
  loadServerConfig: vi.fn().mockImplementation(() =>
    Promise.resolve({
      COLLABORATOR_URL: "http://localhost:3078",
      ACCOUNTS_URL: "http://localhost:8083"
    })
  )
}))

vi.mock("@hcengineering/collaborator-client", () => ({
  getClient: vi.fn().mockImplementation(() => mockCollaboratorClient)
}))

vi.mock("@hcengineering/text", () => ({
  htmlToJSON: vi.fn().mockImplementation((html: string) => ({ type: "html-parsed", content: html })),
  jsonToHTML: vi.fn().mockImplementation((json: unknown) => `<html>${JSON.stringify(json)}</html>`),
  jsonToMarkup: vi.fn().mockImplementation((json: unknown) => `markup:${JSON.stringify(json)}`),
  markupToJSON: vi.fn().mockImplementation((markup: string) => ({ type: "markup-parsed", content: markup }))
}))

vi.mock("@hcengineering/text-markdown", () => ({
  markdownToMarkup: vi.fn().mockImplementation((md: string) => ({ type: "md-parsed", content: md })),
  markupToMarkdown: vi.fn().mockImplementation((_json: unknown, _opts: unknown) => "# Markdown output")
}))

// Test config layer
const testConfigLayer = HulyConfigService.testLayer({
  url: "http://localhost:8080",
  email: "test@example.com",
  password: "test-pass",
  workspace: "test-workspace"
})

// Combined layer: HulyClient.layer provided with test config
const liveClientLayer = HulyClient.layer.pipe(Layer.provide(testConfigLayer))

// Mock doc for testing
interface TestDoc extends Doc {
  title: string
}

describe("HulyClient Service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindAll.mockResolvedValue(toFindResult([]))
    mockFindOne.mockResolvedValue(undefined)
    mockCreateDoc.mockResolvedValue("new-id")
    mockUpdateDoc.mockResolvedValue({})
    mockAddCollection.mockResolvedValue("new-attached-id")
    mockRemoveDoc.mockResolvedValue({})
    mockGetMarkup.mockResolvedValue("raw-markup")
    mockCreateMarkup.mockResolvedValue("markup-ref-id")
    mockUpdateMarkup.mockResolvedValue(undefined)
  })

  describe("testLayer", () => {
    // test-revizorro: suspect | only checks .toBeDefined() for existence, not actual behavior/implementation
    it.effect("provides default noop operations", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))

        expect(client.findAll).toBeDefined()
        expect(client.findOne).toBeDefined()
        expect(client.createDoc).toBeDefined()
        expect(client.updateDoc).toBeDefined()
        expect(client.addCollection).toBeDefined()
        expect(client.uploadMarkup).toBeDefined()
        expect(client.fetchMarkup).toBeDefined()
      }))

    // test-revizorro: approved
    it.effect("allows overriding specific operations", () =>
      Effect.gen(function*() {
        const testDoc: TestDoc = {
          _id: "1" as DocRef<TestDoc>,
          _class: "class" as DocRef<Class<TestDoc>>,
          space: "space" as DocRef<Space>,
          title: "Test",
          modifiedBy: "user" as DocRef<Doc>,
          modifiedOn: 0,
          createdBy: "user" as DocRef<Doc>,
          createdOn: 0
        }
        const mockResults = toFindResult([testDoc])

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() => Effect.succeed(mockResults as FindResult<T>)
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const results = yield* client.findAll(
          "class" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )

        expect(results).toHaveLength(1)
      }))

    // test-revizorro: approved
    it.effect("default findAll returns empty array", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const results = yield* client.findAll(
          "class" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )

        expect(results).toHaveLength(0)
      }))

    // test-revizorro: scheduled
    it.effect("default findOne returns undefined", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* client.findOne(
          "class" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )

        expect(result).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("default uploadMarkup dies (not implemented)", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(client.uploadMarkup(
          "class" as DocRef<Class<Doc>>,
          "id" as DocRef<Doc>,
          "attr",
          "content",
          "markdown"
        ))

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
      }))

    // test-revizorro: scheduled
    it.effect("default fetchMarkup returns empty string", () =>
      Effect.gen(function*() {
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
      }))

    // test-revizorro: approved
    it.effect("default removeDoc dies (not implemented)", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.removeDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            "id" as DocRef<TestDoc>
          )
        )

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("default updateMarkup dies (not implemented)", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.updateMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "content",
            "markdown"
          )
        )

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("default addCollection dies (not implemented)", () =>
      Effect.gen(function*() {
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

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("default createDoc dies (not implemented)", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.createDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            { title: "t" } as Data<TestDoc>
          )
        )

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("default updateDoc dies (not implemented)", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const exit = yield* Effect.exit(
          client.updateDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            "id" as DocRef<TestDoc>,
            {}
          )
        )

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
      }))
  })

  describe("mock operations with errors", () => {
    // test-revizorro: approved
    it.effect("can mock operations to return HulyConnectionError", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({
          findAll: () =>
            Effect.fail(
              new HulyConnectionError({
                message: "Network error"
              })
            )
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.findAll(
            "class" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Network error")
      }))

    // test-revizorro: approved
    it.effect("can mock operations to return HulyAuthError", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({
          findOne: () =>
            Effect.fail(
              new HulyAuthError({
                message: "Invalid credentials"
              })
            )
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.findOne(
            "class" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
        )

        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toBe("Invalid credentials")
      }))
  })

  describe("error handling patterns", () => {
    // test-revizorro: approved
    it.effect("can catch HulyConnectionError with catchTag", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({
          findAll: () =>
            Effect.fail(
              new HulyConnectionError({
                message: "Connection timeout"
              })
            )
        })

        const result = yield* Effect.gen(function*() {
          const client = yield* HulyClient
          return yield* client.findAll(
            "class" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
        }).pipe(
          Effect.catchTag("HulyConnectionError", (e) => Effect.succeed(`Recovered from: ${e.message}`)),
          Effect.provide(testLayer)
        )

        expect(result).toBe("Recovered from: Connection timeout")
      }))

    // test-revizorro: approved
    it.effect("can catch HulyAuthError with catchTag", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({
          createDoc: () =>
            Effect.fail(
              new HulyAuthError({
                message: "Session expired"
              })
            )
        })

        const result = yield* Effect.gen(function*() {
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
      }))

    // test-revizorro: approved
    it.effect("can handle both error types with catchTags", () =>
      Effect.gen(function*() {
        const connectionErrorLayer = HulyClient.testLayer({
          findAll: () =>
            Effect.fail(
              new HulyConnectionError({ message: "Network down" })
            )
        })

        const handleErrors = <A>(
          effect: Effect.Effect<A, HulyClientError, HulyClient>
        ) =>
          effect.pipe(
            Effect.catchTags({
              HulyConnectionError: (e) => Effect.succeed(`Connection: ${e.message}`),
              HulyAuthError: (e) => Effect.succeed(`Auth: ${e.message}`)
            })
          )

        const result = yield* Effect.gen(function*() {
          const client = yield* HulyClient
          return yield* handleErrors(
            client.findAll(
              "class" as DocRef<Class<TestDoc>>,
              {} as DocumentQuery<TestDoc>
            )
          )
        }).pipe(Effect.provide(connectionErrorLayer))

        expect(result).toBe("Connection: Network down")
      }))
  })

  describe("service composition", () => {
    // test-revizorro: approved
    it.effect("can be composed with other services", () =>
      Effect.gen(function*() {
        const mockFindAllOp = <T extends Doc>() =>
          Effect.succeed(toFindResult([
            { _id: "1", title: "Issue 1" },
            { _id: "2", title: "Issue 2" }
          ] as Array<Doc>) as FindResult<T>)

        const testLayer = HulyClient.testLayer({
          findAll: mockFindAllOp
        })

        const listIssues = Effect.gen(function*() {
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
      }))

    // test-revizorro: approved
    it.effect("multiple operations reuse same mock layer", () =>
      Effect.gen(function*() {
        const callCount = { findAll: 0, findOne: 0 }

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() => {
            callCount.findAll++
            return Effect.succeed(toFindResult([]) as FindResult<T>)
          },
          findOne: <T extends Doc>() => {
            callCount.findOne++
            return Effect.succeed({ _id: "1", title: "Found" } as WithLookup<T>)
          }
        })

        const result = yield* Effect.gen(function*() {
          const client = yield* HulyClient

          const all = yield* client.findAll(
            "class" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
          const one = yield* client.findOne(
            "class" as DocRef<Class<TestDoc>>,
            { _id: "1" } as DocumentQuery<TestDoc>
          )

          return { allCount: all.length, found: one !== undefined }
        }).pipe(Effect.provide(testLayer))

        expect(result.allCount).toBe(0)
        expect(result.found).toBe(true)
        expect(callCount.findAll).toBe(1)
        expect(callCount.findOne).toBe(1)
      }))
  })

  describe("HulyClientError type", () => {
    // test-revizorro: approved
    it.effect("is union of HulyConnectionError and HulyAuthError", () =>
      Effect.gen(function*() {
        const handleError = (error: HulyClientError): string => {
          switch (error._tag) {
            case "HulyConnectionError":
              return `Connection: ${error.message}`
            case "HulyAuthError":
              return `Auth: ${error.message}`
          }
        }

        const connErr = new HulyConnectionError({ message: "timeout" })
        const authErr = new HulyAuthError({ message: "invalid" })

        expect(handleError(connErr)).toBe("Connection: timeout")
        expect(handleError(authErr)).toBe("Auth: invalid")
      }))
  })

  describe("operation tracking", () => {
    // test-revizorro: scheduled
    it.effect("tracks operation calls for testing", () =>
      Effect.gen(function*() {
        const operations: Array<string> = []

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() => {
            operations.push("findAll")
            return Effect.succeed(toFindResult([]) as FindResult<T>)
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

        yield* Effect.gen(function*() {
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
      }))
  })
})

describe("Connection error classification", () => {
  describe("HulyConnectionError", () => {
    // test-revizorro: approved
    it.effect("has correct tag", () =>
      Effect.gen(function*() {
        const error = new HulyConnectionError({ message: "timeout" })
        expect(error._tag).toBe("HulyConnectionError")
      }))

    // test-revizorro: approved
    it.effect("includes cause", () =>
      Effect.gen(function*() {
        const cause = new Error("underlying")
        const error = new HulyConnectionError({
          message: "failed",
          cause
        })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("HulyAuthError", () => {
    // test-revizorro: approved
    it.effect("has correct tag", () =>
      Effect.gen(function*() {
        const error = new HulyAuthError({ message: "invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
      }))
  })
})

describe("HulyClient.layer (live layer with mocked externals)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindAll.mockResolvedValue(toFindResult([]))
    mockFindOne.mockResolvedValue(undefined)
    mockCreateDoc.mockResolvedValue("new-id")
    mockUpdateDoc.mockResolvedValue({})
    mockAddCollection.mockResolvedValue("new-attached-id")
    mockRemoveDoc.mockResolvedValue({})
    mockGetMarkup.mockResolvedValue("raw-markup")
    mockCreateMarkup.mockResolvedValue("markup-ref-id")
    mockUpdateMarkup.mockResolvedValue(undefined)
  })

  describe("connection", () => {
    // test-revizorro: suspect | Only checks methods exist via toBeDefined(), not actual behavior or connection. Misleading test name claims connection testing.
    it.effect("connects via connectRestWithRetry and creates client", () =>
      Effect.gen(function*() {
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
      }))
  })

  describe("findAll", () => {
    // test-revizorro: approved
    it.effect("delegates to TxOperations.findAll", () =>
      Effect.gen(function*() {
        const docs = [{ _id: "d1", title: "Doc 1" }]
        mockFindAll.mockResolvedValue(toFindResult(docs as Array<Doc>))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const results = yield* client.findAll(
          "class" as DocRef<Class<TestDoc>>,
          { title: "Doc 1" } as DocumentQuery<TestDoc>,
          { limit: 10 } as FindOptions<TestDoc>
        )

        expect(results).toHaveLength(1)
        expect(mockFindAll).toHaveBeenCalledWith(
          "class",
          { title: "Doc 1" },
          { limit: 10 }
        )
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockFindAll.mockRejectedValue(new Error("network failure"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.findAll(
            "c" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("findAll failed")
        expect(error.message).toContain("network failure")
      }))
  })

  describe("findOne", () => {
    // test-revizorro: approved
    it.effect("delegates to TxOperations.findOne", () =>
      Effect.gen(function*() {
        const doc = { _id: "d1", title: "Found" }
        mockFindOne.mockResolvedValue(doc)

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.findOne(
          "class" as DocRef<Class<TestDoc>>,
          { _id: "d1" } as DocumentQuery<TestDoc>
        )

        expect(result).toEqual(doc)
        expect(mockFindOne).toHaveBeenCalledWith("class", { _id: "d1" }, undefined)
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockFindOne.mockRejectedValue(new Error("query error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.findOne(
            "c" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("findOne failed")
      }))
  })

  describe("createDoc", () => {
    // test-revizorro: approved
    it.effect("delegates to TxOperations.createDoc", () =>
      Effect.gen(function*() {
        mockCreateDoc.mockResolvedValue("created-id")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.createDoc(
          "class" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          { title: "New" } as Data<TestDoc>,
          "preset-id" as DocRef<TestDoc>
        )

        expect(result).toBe("created-id")
        expect(mockCreateDoc).toHaveBeenCalledWith(
          "class",
          "space",
          { title: "New" },
          "preset-id"
        )
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockCreateDoc.mockRejectedValue(new Error("create failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.createDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            { title: "x" } as Data<TestDoc>
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("createDoc failed")
      }))
  })

  describe("updateDoc", () => {
    // test-revizorro: approved
    it.effect("delegates to TxOperations.updateDoc", () =>
      Effect.gen(function*() {
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
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          "class",
          "space",
          "id",
          { title: "Updated" },
          true
        )
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockUpdateDoc.mockRejectedValue(new Error("update error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.updateDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            "id" as DocRef<TestDoc>,
            {}
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("updateDoc failed")
      }))
  })

  describe("addCollection", () => {
    // test-revizorro: approved
    it.effect("delegates to TxOperations.addCollection", () =>
      Effect.gen(function*() {
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
        expect(mockAddCollection).toHaveBeenCalledWith(
          "childClass",
          "space",
          "parentId",
          "parentClass",
          "comments",
          { text: "hello" },
          "preset-id"
        )
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
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
      }))
  })

  describe("removeDoc", () => {
    // test-revizorro: approved
    it.effect("delegates to TxOperations.removeDoc", () =>
      Effect.gen(function*() {
        const txResult = { id: "tx-rm" }
        mockRemoveDoc.mockResolvedValue(txResult)

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.removeDoc(
          "class" as DocRef<Class<TestDoc>>,
          "space" as DocRef<Space>,
          "id" as DocRef<TestDoc>
        )

        expect(result).toEqual(txResult)
        expect(mockRemoveDoc).toHaveBeenCalledWith("class", "space", "id")
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockRemoveDoc.mockRejectedValue(new Error("remove error"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.removeDoc(
            "c" as DocRef<Class<TestDoc>>,
            "s" as DocRef<Space>,
            "id" as DocRef<TestDoc>
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("removeDoc failed")
      }))
  })

  describe("uploadMarkup", () => {
    // test-revizorro: approved
    it.effect("uploads with markup format (passthrough)", () =>
      Effect.gen(function*() {
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
        expect(mockCreateMarkup).toHaveBeenCalledOnce()
        // In markup mode, toInternalMarkup returns the value as-is
        expect(mockCreateMarkup.mock.calls[0][1]).toBe("raw markup value")
      }))

    // test-revizorro: approved
    it.effect("uploads with html format (converts via htmlToJSON + jsonToMarkup)", () =>
      Effect.gen(function*() {
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
        expect(mockCreateMarkup).toHaveBeenCalledOnce()
        // htmlToJSON returns json object, jsonToMarkup converts to string
        const uploadedValue = mockCreateMarkup.mock.calls[0][1] as string
        expect(uploadedValue).toContain("html-parsed")
      }))

    // test-revizorro: approved
    it.effect("uploads with markdown format (converts via markdownToMarkup + jsonToMarkup)", () =>
      Effect.gen(function*() {
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
        expect(mockCreateMarkup).toHaveBeenCalledOnce()
        const uploadedValue = mockCreateMarkup.mock.calls[0][1] as string
        expect(uploadedValue).toContain("md-parsed")
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockCreateMarkup.mockRejectedValue(new Error("upload failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.uploadMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "content",
            "markup"
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("uploadMarkup failed")
      }))
  })

  describe("fetchMarkup", () => {
    // test-revizorro: approved
    it.effect("fetches with markup format (passthrough)", () =>
      Effect.gen(function*() {
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
      }))

    // test-revizorro: approved
    it.effect("fetches with html format (converts via markupToJSON + jsonToHTML)", () =>
      Effect.gen(function*() {
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
      }))

    // test-revizorro: suspect | All text-markdown functions mocked with hardcoded returns; doesn't test actual conversion logic
    it.effect("fetches with markdown format (converts via markupToJSON + markupToMarkdown)", () =>
      Effect.gen(function*() {
        mockGetMarkup.mockResolvedValue("stored-markup")

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const result = yield* client.fetchMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "ref-md" as MarkupRef,
          "markdown"
        )

        expect(result).toBe("# Markdown output")
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockGetMarkup.mockRejectedValue(new Error("fetch failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.fetchMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "ref" as MarkupRef,
            "markup"
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("fetchMarkup failed")
      }))
  })

  describe("updateMarkup", () => {
    // test-revizorro: approved
    it.effect("updates with markup format (passthrough)", () =>
      Effect.gen(function*() {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "updated markup",
          "markup"
        )

        expect(mockUpdateMarkup).toHaveBeenCalledOnce()
        expect(mockUpdateMarkup.mock.calls[0][1]).toBe("updated markup")
      }))

    // test-revizorro: approved
    it.effect("updates with html format", () =>
      Effect.gen(function*() {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "<p>Updated</p>",
          "html"
        )

        expect(mockUpdateMarkup).toHaveBeenCalledOnce()
        const uploadedValue = mockUpdateMarkup.mock.calls[0][1] as string
        expect(uploadedValue).toContain("html-parsed")
      }))

    // test-revizorro: approved
    it.effect("updates with markdown format", () =>
      Effect.gen(function*() {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        yield* client.updateMarkup(
          "docClass" as DocRef<Class<Doc>>,
          "docId" as DocRef<Doc>,
          "content",
          "# Updated",
          "markdown"
        )

        expect(mockUpdateMarkup).toHaveBeenCalledOnce()
        const uploadedValue = mockUpdateMarkup.mock.calls[0][1] as string
        expect(uploadedValue).toContain("md-parsed")
      }))

    // test-revizorro: approved
    it.effect("wraps errors in HulyConnectionError", () =>
      Effect.gen(function*() {
        mockUpdateMarkup.mockRejectedValue(new Error("update failed"))

        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        const error = yield* Effect.flip(
          client.updateMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "content",
            "markup"
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("updateMarkup failed")
      }))
  })

  describe("toInternalMarkup default branch (invalid format)", () => {
    // test-revizorro: approved
    it.effect("throws on invalid format during uploadMarkup", () =>
      Effect.gen(function*() {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        // Force an invalid format to hit the default/absurd branch
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidFormat = "invalid" as any
        const exit = yield* Effect.exit(
          client.uploadMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "content",
            invalidFormat
          )
        )

        expect(Exit.isFailure(exit)).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("throws on invalid format during updateMarkup", () =>
      Effect.gen(function*() {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidFormat = "bogus" as any
        const exit = yield* Effect.exit(
          client.updateMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "content",
            invalidFormat
          )
        )

        expect(Exit.isFailure(exit)).toBe(true)
      }))
  })

  describe("fromInternalMarkup default branch (invalid format)", () => {
    // test-revizorro: approved
    it.effect("throws on invalid format during fetchMarkup", () =>
      Effect.gen(function*() {
        const client = yield* HulyClient.pipe(Effect.provide(liveClientLayer))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidFormat = "invalid" as any
        const exit = yield* Effect.exit(
          client.fetchMarkup(
            "c" as DocRef<Class<Doc>>,
            "id" as DocRef<Doc>,
            "attr",
            "ref" as MarkupRef,
            invalidFormat
          )
        )

        expect(Exit.isFailure(exit)).toBe(true)
      }))
  })

  describe("connection failure", () => {
    // test-revizorro: approved
    it.effect("connectRestWithRetry wraps connection errors", () =>
      Effect.gen(function*() {
        const apiClient = yield* Effect.promise(() => import("@hcengineering/api-client"))
        vi.mocked(apiClient.loadServerConfig).mockRejectedValue(new Error("server unreachable"))

        const freshLayer = HulyClient.layer.pipe(Layer.provide(testConfigLayer))

        const fiber = yield* Effect.fork(
          HulyClient.pipe(Effect.provide(freshLayer))
        )

        yield* TestClock.adjust("500 millis")

        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
      }))
  })
})
