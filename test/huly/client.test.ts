import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import type {
  Class,
  Data,
  Doc,
  DocumentQuery,
  FindOptions,
  FindResult,
  Ref as DocRef,
  Space,
  TxResult,
  WithLookup,
} from "@hcengineering/core"
import type { MarkupRef } from "@hcengineering/api-client"
import {
  HulyClient,
  type HulyClientError,
} from "../../src/huly/client.js"
import { HulyConnectionError, HulyAuthError } from "../../src/huly/errors.js"

// Mock doc for testing
interface TestDoc extends Doc {
  title: string
}

describe("HulyClient Service", () => {
  describe("testLayer", () => {
        it.effect("provides default noop operations", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))

        expect(client.findAll).toBeDefined()
        expect(client.findOne).toBeDefined()
        expect(client.createDoc).toBeDefined()
        expect(client.updateDoc).toBeDefined()
        expect(client.addCollection).toBeDefined()
        expect(client.uploadMarkup).toBeDefined()
        expect(client.fetchMarkup).toBeDefined()
      })
    )

        it.effect("allows overriding specific operations", () =>
      Effect.gen(function* () {
        const mockResults: FindResult<TestDoc> = [
          { _id: "1", _class: "class" as DocRef<Class<TestDoc>>, space: "space" as DocRef<Space>, title: "Test", modifiedBy: "user" as DocRef<Doc>, modifiedOn: 0, createdBy: "user" as DocRef<Doc>, createdOn: 0 },
        ] as unknown as FindResult<TestDoc>

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() =>
            Effect.succeed(mockResults as unknown as FindResult<T>),
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const results = yield* client.findAll(
          "class" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )

        expect(results).toHaveLength(1)
      })
    )

        it.effect("default findAll returns empty array", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const results = yield* client.findAll(
          "class" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )

        expect(results).toHaveLength(0)
      })
    )

        it.effect("default findOne returns undefined", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* client.findOne(
          "class" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )

        expect(result).toBeUndefined()
      })
    )

        it.effect("default uploadMarkup returns empty string", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({})

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* client.uploadMarkup(
          "class" as DocRef<Class<Doc>>,
          "id" as DocRef<Doc>,
          "attr",
          "content",
          "markdown"
        )

        expect(result).toBe("")
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
  })

  describe("mock operations with errors", () => {
        it.effect("can mock operations to return HulyConnectionError", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findAll: () =>
            Effect.fail(
              new HulyConnectionError({
                message: "Network error",
              })
            ),
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
      })
    )

        it.effect("can mock operations to return HulyAuthError", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findOne: () =>
            Effect.fail(
              new HulyAuthError({
                message: "Invalid credentials",
              })
            ),
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
      })
    )
  })

  describe("error handling patterns", () => {
        it.effect("can catch HulyConnectionError with catchTag", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findAll: () =>
            Effect.fail(
              new HulyConnectionError({
                message: "Connection timeout",
              })
            ),
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* client.findAll(
            "class" as DocRef<Class<TestDoc>>,
            {} as DocumentQuery<TestDoc>
          )
        }).pipe(
          Effect.catchTag("HulyConnectionError", (e) =>
            Effect.succeed(`Recovered from: ${e.message}`)
          ),
          Effect.provide(testLayer)
        )

        expect(result).toBe("Recovered from: Connection timeout")
      })
    )

        it.effect("can catch HulyAuthError with catchTag", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          createDoc: () =>
            Effect.fail(
              new HulyAuthError({
                message: "Session expired",
              })
            ),
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* client.createDoc(
            "class" as DocRef<Class<TestDoc>>,
            "space" as DocRef<Space>,
            { title: "Test" } as Data<TestDoc>
          )
        }).pipe(
          Effect.catchTag("HulyAuthError", (e) =>
            Effect.succeed(`Auth error: ${e.message}`)
          ),
          Effect.provide(testLayer)
        )

        expect(result).toBe("Auth error: Session expired")
      })
    )

        it.effect("can handle both error types with catchTags", () =>
      Effect.gen(function* () {
        const connectionErrorLayer = HulyClient.testLayer({
          findAll: () =>
            Effect.fail(
              new HulyConnectionError({ message: "Network down" })
            ),
        })

        const handleErrors = <A>(
          effect: Effect.Effect<A, HulyClientError, HulyClient>
        ) =>
          effect.pipe(
            Effect.catchTags({
              HulyConnectionError: (e) =>
                Effect.succeed(`Connection: ${e.message}`),
              HulyAuthError: (e) =>
                Effect.succeed(`Auth: ${e.message}`),
            })
          )

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* handleErrors(
            client.findAll(
              "class" as DocRef<Class<TestDoc>>,
              {} as DocumentQuery<TestDoc>
            )
          )
        }).pipe(Effect.provide(connectionErrorLayer))

        expect(result).toBe("Connection: Network down")
      })
    )
  })

  describe("service composition", () => {
        it.effect("can be composed with other services", () =>
      Effect.gen(function* () {
        // Mock a higher-level service that uses HulyClient
        const mockFindAll = <T extends Doc>() =>
          Effect.succeed([
            { _id: "1", title: "Issue 1" },
            { _id: "2", title: "Issue 2" },
          ] as unknown as FindResult<T>)

        const testLayer = HulyClient.testLayer({
          findAll: mockFindAll,
        })

        // Higher-level program using the client
        const listIssues = Effect.gen(function* () {
          const client = yield* HulyClient
          const issues = yield* client.findAll(
            "tracker.class.Issue" as DocRef<Class<TestDoc>>,
            { space: "project-1" } as DocumentQuery<TestDoc>,
            { limit: 50 } as FindOptions<TestDoc>
          )
          return issues.map((i) => (i as unknown as { title: string }).title)
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
            return Effect.succeed([] as unknown as FindResult<T>)
          },
          findOne: <T extends Doc>() => {
            callCount.findOne++
            return Effect.succeed({ _id: "1", title: "Found" } as unknown as WithLookup<T>)
          },
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient

          // Call both operations
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
      })
    )
  })

  describe("HulyClientError type", () => {
        it.effect("is union of HulyConnectionError and HulyAuthError", () =>
      Effect.gen(function* () {
        // Type test - this should compile
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
      })
    )
  })

  describe("operation tracking", () => {
        it.effect("tracks operation calls for testing", () =>
      Effect.gen(function* () {
        const operations: string[] = []

        const testLayer = HulyClient.testLayer({
          findAll: <T extends Doc>() => {
            operations.push("findAll")
            return Effect.succeed([] as unknown as FindResult<T>)
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
          },
        })

        yield* Effect.gen(function* () {
          const client = yield* HulyClient
          yield* client.findAll("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
          yield* client.findOne("c" as DocRef<Class<TestDoc>>, {} as DocumentQuery<TestDoc>)
          yield* client.createDoc("c" as DocRef<Class<TestDoc>>, "s" as DocRef<Space>, { title: "test" } as Data<TestDoc>)
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
      Effect.gen(function* () {
        const error = new HulyConnectionError({ message: "timeout" })
        expect(error._tag).toBe("HulyConnectionError")
      })
    )

        it.effect("includes cause", () =>
      Effect.gen(function* () {
        const cause = new Error("underlying")
        const error = new HulyConnectionError({
          message: "failed",
          cause,
        })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("HulyAuthError", () => {
        it.effect("has correct tag", () =>
      Effect.gen(function* () {
        const error = new HulyAuthError({ message: "invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
      })
    )
  })
})
