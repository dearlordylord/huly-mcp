import { describe, it } from "@effect/vitest"
import type { MarkupRef } from "@hcengineering/api-client"
import {
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type Ref as DocRef,
  type Space,
  toFindResult,
  type WithLookup
} from "@hcengineering/core"
import { Cause, Effect, Exit } from "effect"
import { expect } from "vitest"
import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError } from "../../src/huly/errors.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"

interface TestDoc extends Doc {
  title: string
}

describe("HulyClient.testLayer defaults", () => {
  // test-revizorro: approved
  it.effect("findAll returns empty FindResult", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
      const results = yield* client.findAll(
        "c" as DocRef<Class<TestDoc>>,
        {} as DocumentQuery<TestDoc>
      )
      expect(results).toHaveLength(0)
      expect(results.total).toBe(0)
    }))

  // test-revizorro: approved
  it.effect("findOne returns undefined", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
      const result = yield* client.findOne(
        "c" as DocRef<Class<TestDoc>>,
        {} as DocumentQuery<TestDoc>
      )
      expect(result).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("fetchMarkup returns empty string", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
      const result = yield* client.fetchMarkup(
        "c" as DocRef<Class<Doc>>,
        "id" as DocRef<Doc>,
        "attr",
        "ref" as MarkupRef,
        "markdown"
      )
      expect(result).toBe("")
    }))

  // test-revizorro: approved
  it.effect("createDoc dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
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
  it.effect("updateDoc dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
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

  // test-revizorro: approved
  it.effect("addCollection dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
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
  it.effect("removeDoc dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
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
  it.effect("uploadMarkup dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
      const exit = yield* Effect.exit(
        client.uploadMarkup(
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
  it.effect("updateMarkup dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer({}))
      )
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
})

describe("HulyClient.testLayer with custom operations", () => {
  // test-revizorro: approved
  it.effect("custom findAll returns provided data", () =>
    Effect.gen(function*() {
      const docs = [
        { _id: "d1", title: "A" },
        { _id: "d2", title: "B" }
      ]
      const layer = HulyClient.testLayer({
        findAll: <T extends Doc>() =>
          // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
          Effect.succeed(toFindResult(docs as Array<Doc>) as unknown as import("@hcengineering/core").FindResult<T>)
      })
      const client = yield* HulyClient.pipe(Effect.provide(layer))
      const results = yield* client.findAll(
        "c" as DocRef<Class<TestDoc>>,
        {} as DocumentQuery<TestDoc>
      )
      expect(results).toHaveLength(2)
    }))

  // test-revizorro: suspect | Weak assertion: only checks toBeDefined(), doesn't validate returned doc matches mock
  it.effect("custom findOne returns provided value", () =>
    Effect.gen(function*() {
      const doc = { _id: "d1", title: "Found" }
      const layer = HulyClient.testLayer({
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        findOne: <T extends Doc>() => Effect.succeed(doc as unknown as WithLookup<T>)
      })
      const client = yield* HulyClient.pipe(Effect.provide(layer))
      const result = yield* client.findOne(
        "c" as DocRef<Class<TestDoc>>,
        {} as DocumentQuery<TestDoc>
      )
      expect(result).toBeDefined()
    }))

  // test-revizorro: approved
  it.effect("custom operation can return error", () =>
    Effect.gen(function*() {
      const layer = HulyClient.testLayer({
        findAll: () =>
          Effect.fail(
            new HulyConnectionError({ message: "mock connection error" })
          )
      })
      const client = yield* HulyClient.pipe(Effect.provide(layer))
      const err = yield* Effect.flip(
        client.findAll(
          "c" as DocRef<Class<TestDoc>>,
          {} as DocumentQuery<TestDoc>
        )
      )
      expect(err._tag).toBe("HulyConnectionError")
    }))

  // test-revizorro: approved
  it.effect("overriding one op does not affect others", () =>
    Effect.gen(function*() {
      const layer = HulyClient.testLayer({
        findAll: <T extends Doc>() =>
          Effect.succeed(
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/consistent-type-assertions -- test mock requires double cast through unknown
            toFindResult([{ _id: "x" } as Doc]) as unknown as import("@hcengineering/core").FindResult<T>
          )
      })
      const client = yield* HulyClient.pipe(Effect.provide(layer))

      const all = yield* client.findAll(
        "c" as DocRef<Class<TestDoc>>,
        {} as DocumentQuery<TestDoc>
      )
      expect(all).toHaveLength(1)

      const one = yield* client.findOne(
        "c" as DocRef<Class<TestDoc>>,
        {} as DocumentQuery<TestDoc>
      )
      expect(one).toBeUndefined()
    }))
})

describe("WorkspaceClient.testLayer defaults", () => {
  // test-revizorro: approved
  it.effect("getWorkspaceMembers returns empty array", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const members = yield* client.getWorkspaceMembers()
      expect(members).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("getUserWorkspaces returns empty array", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const workspaces = yield* client.getUserWorkspaces()
      expect(workspaces).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("getUserProfile returns null", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const profile = yield* client.getUserProfile()
      expect(profile).toBeNull()
    }))

  // test-revizorro: approved
  it.effect("getRegionInfo returns empty array", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const regions = yield* client.getRegionInfo()
      expect(regions).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("getPersonInfo dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(
        client.getPersonInfo("person-uuid" as import("@hcengineering/core").PersonUuid)
      )
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("updateWorkspaceRole dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(
        client.updateWorkspaceRole("account", 0 as import("@hcengineering/core").AccountRole)
      )
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: scheduled
  it.effect("getWorkspaceInfo dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.getWorkspaceInfo())
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("createWorkspace dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.createWorkspace("new-ws"))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("deleteWorkspace dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.deleteWorkspace())
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("setMyProfile dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.setMyProfile({}))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("updateAllowReadOnlyGuests dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.updateAllowReadOnlyGuests(true))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("updateAllowGuestSignUp dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.updateAllowGuestSignUp(true))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))
})

describe("WorkspaceClient.testLayer with custom operations", () => {
  // test-revizorro: suspect | Only checks length, not actual data; should verify members[0].person === "p1"
  it.effect("custom getWorkspaceMembers returns provided data", () =>
    Effect.gen(function*() {
      const mockMembers = [{ person: "p1" }]
      const layer = WorkspaceClient.testLayer({
        getWorkspaceMembers: () =>
          Effect.succeed(
            // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
            mockMembers as unknown as Array<import("@hcengineering/core").WorkspaceMemberInfo>
          )
      })
      const client = yield* WorkspaceClient.pipe(Effect.provide(layer))
      const members = yield* client.getWorkspaceMembers()
      expect(members).toHaveLength(1)
    }))

  // test-revizorro: approved
  it.effect("custom operation can return error", () =>
    Effect.gen(function*() {
      const layer = WorkspaceClient.testLayer({
        getWorkspaceMembers: () =>
          Effect.fail(
            new HulyConnectionError({ message: "workspace unavailable" })
          )
      })
      const client = yield* WorkspaceClient.pipe(Effect.provide(layer))
      const err = yield* Effect.flip(client.getWorkspaceMembers())
      expect(err._tag).toBe("HulyConnectionError")
    }))

  // test-revizorro: approved
  it.effect("overriding one op preserves other defaults", () =>
    Effect.gen(function*() {
      const layer = WorkspaceClient.testLayer({
        getWorkspaceMembers: () =>
          Effect.succeed(
            // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
            [{ person: "p1" }] as unknown as Array<import("@hcengineering/core").WorkspaceMemberInfo>
          )
      })
      const client = yield* WorkspaceClient.pipe(Effect.provide(layer))

      const members = yield* client.getWorkspaceMembers()
      expect(members).toHaveLength(1)

      const profile = yield* client.getUserProfile()
      expect(profile).toBeNull()
    }))
})
