import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import { IssueIdentifier } from "../../src/domain/schemas/shared.js"
import type { HulyClientOperations } from "../../src/huly/client.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyError } from "../../src/huly/errors.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import type { WorkspaceClientOperations } from "../../src/huly/workspace-client.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { McpErrorCode } from "../../src/mcp/error-mapping.js"
import {
  createCombinedToolHandler,
  createEncodedToolHandler,
  createNoParamsWorkspaceToolHandler,
  createStorageToolHandler,
  createToolHandler,
  createWorkspaceToolHandler
} from "../../src/mcp/tools/registry.js"

const Params = Schema.Struct({ name: Schema.String })
type Params = typeof Params.Type

const parse = (input: unknown) => Schema.decodeUnknown(Params)(input)

const noopHulyClient: HulyClientOperations = {
  getAccountUuid: () => "test-account-uuid" as AccountUuid,
  findAll: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
  findOne: () => Effect.succeed(undefined),
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.die(new Error("not implemented")),
  addCollection: () => Effect.die(new Error("not implemented")),
  removeDoc: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
}

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

const noopWorkspaceClient: WorkspaceClientOperations = {
  getWorkspaceMembers: () => Effect.succeed([]),
  getPersonInfo: () => Effect.die(new Error("not implemented")),
  updateWorkspaceRole: () => Effect.die(new Error("not implemented")),
  getWorkspaceInfo: () => Effect.die(new Error("not implemented")),
  getUserWorkspaces: () => Effect.succeed([]),
  createWorkspace: () => Effect.die(new Error("not implemented")),
  deleteWorkspace: () => Effect.die(new Error("not implemented")),
  getUserProfile: () => Effect.succeed(null),
  setMyProfile: () => Effect.die(new Error("not implemented")),
  updateAllowReadOnlyGuests: () => Effect.die(new Error("not implemented")),
  updateAllowGuestSignUp: () => Effect.die(new Error("not implemented")),
  getRegionInfo: () => Effect.succeed([])
}

describe("createToolHandler", () => {
  // test-revizorro: approved
  it.effect("returns success response on valid input", () =>
    Effect.gen(function*() {
      const handler = createToolHandler(
        "test_tool",
        parse,
        (params: Params) =>
          Effect.succeed({ greeting: `hello ${params.name}` }).pipe(
            Effect.tap(() => HulyClient)
          )
      )

      const result = yield* Effect.promise(() => handler({ name: "world" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toContain("hello world")
    }))

  // test-revizorro: approved
  it.effect("returns parse error on invalid input", () =>
    Effect.gen(function*() {
      const handler = createToolHandler(
        "test_tool",
        parse,
        (_params: Params) =>
          Effect.succeed("ok").pipe(
            Effect.tap(() => HulyClient)
          )
      )

      const result = yield* Effect.promise(() => handler({ wrong: 123 }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(result.content[0].text).toContain("Invalid parameters")
    }))

  // test-revizorro: approved
  it.effect("returns domain error on operation failure", () =>
    Effect.gen(function*() {
      const handler = createToolHandler(
        "test_tool",
        parse,
        (_params: Params) =>
          Effect.fail(new HulyError({ message: "something broke" })) as Effect.Effect<
            never,
            HulyError,
            HulyClient
          >
      )

      const result = yield* Effect.promise(() => handler({ name: "world" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(result.content[0].text).toContain("something broke")
    }))
})

describe("createEncodedToolHandler", () => {
  it.effect("encodes branded output through the provided schema", () =>
    Effect.gen(function*() {
      const Output = Schema.Struct({ identifier: IssueIdentifier })
      const handler = createEncodedToolHandler(
        "encoded_tool",
        parse,
        (_params: Params) =>
          Effect.succeed({ identifier: IssueIdentifier.make("HULY-1") }).pipe(
            Effect.tap(() => HulyClient)
          ),
        Output
      )

      const result = yield* Effect.promise(() => handler({ name: "world" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toBe("{\"identifier\":\"HULY-1\"}")
    }))

  it.effect("returns internal error when output encoding fails", () =>
    Effect.gen(function*() {
      const Output = Schema.Struct({ identifier: IssueIdentifier })
      const handler = createEncodedToolHandler(
        "encoded_tool",
        parse,
        (_params: Params) =>
          Effect.succeed({ identifier: "" }).pipe(
            Effect.tap(() => HulyClient)
          ),
        Output
      )

      const result = yield* Effect.promise(() => handler({ name: "world" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(result.content[0].text).toContain("invalid output")
    }))
})

describe("createStorageToolHandler", () => {
  // test-revizorro: approved
  it.effect("returns success response via storage client", () =>
    Effect.gen(function*() {
      const handler = createStorageToolHandler(
        "storage_tool",
        parse,
        (params: Params) =>
          Effect.succeed({ url: `file://${params.name}` }).pipe(
            Effect.tap(() => HulyStorageClient)
          )
      )

      const result = yield* Effect.promise(() => handler({ name: "doc.pdf" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toContain("file://doc.pdf")
    }))

  // test-revizorro: approved
  it.effect("returns parse error on invalid input", () =>
    Effect.gen(function*() {
      const handler = createStorageToolHandler(
        "storage_tool",
        parse,
        (_params: Params) =>
          Effect.succeed("ok").pipe(
            Effect.tap(() => HulyStorageClient)
          )
      )

      const result = yield* Effect.promise(() => handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
    }))
})

describe("createCombinedToolHandler", () => {
  // test-revizorro: approved
  it.effect("returns success response via both clients", () =>
    Effect.gen(function*() {
      const handler = createCombinedToolHandler(
        "combined_tool",
        parse,
        (params: Params) =>
          Effect.gen(function*() {
            yield* HulyClient
            yield* HulyStorageClient
            return { combined: params.name }
          })
      )

      const result = yield* Effect.promise(() => handler({ name: "both" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toContain("both")
    }))
})

describe("createWorkspaceToolHandler", () => {
  // test-revizorro: approved
  it.effect("returns success response when workspace client available", () =>
    Effect.gen(function*() {
      const handler = createWorkspaceToolHandler(
        "workspace_tool",
        parse,
        (params: Params) =>
          Effect.succeed({ ws: params.name }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        handler({ name: "myws" }, noopHulyClient, noopStorageClient, noopWorkspaceClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toContain("myws")
    }))

  // test-revizorro: approved
  it.effect("returns error when workspace client is undefined", () =>
    Effect.gen(function*() {
      const handler = createWorkspaceToolHandler(
        "workspace_tool",
        parse,
        (params: Params) =>
          Effect.succeed({ ws: params.name }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        handler({ name: "myws" }, noopHulyClient, noopStorageClient, undefined)
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(result.content[0].text).toContain("WorkspaceClient not available")
    }))

  // test-revizorro: approved
  it.effect("returns parse error on invalid input", () =>
    Effect.gen(function*() {
      const handler = createWorkspaceToolHandler(
        "workspace_tool",
        parse,
        (_params: Params) =>
          Effect.succeed("ok").pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        handler({ bad: true }, noopHulyClient, noopStorageClient, noopWorkspaceClient)
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
    }))
})

describe("createNoParamsWorkspaceToolHandler", () => {
  // test-revizorro: approved
  it.effect("returns success response with no params", () =>
    Effect.gen(function*() {
      const handler = createNoParamsWorkspaceToolHandler(
        () =>
          Effect.succeed({ members: 5 }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() => handler({}, noopHulyClient, noopStorageClient, noopWorkspaceClient))

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toContain("5")
    }))

  // test-revizorro: approved
  it.effect("returns error when workspace client is undefined", () =>
    Effect.gen(function*() {
      const handler = createNoParamsWorkspaceToolHandler(
        () =>
          Effect.succeed("ok").pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() => handler({}, noopHulyClient, noopStorageClient, undefined))

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(result.content[0].text).toContain("WorkspaceClient not available")
    }))

  // test-revizorro: approved
  it.effect("returns domain error on operation failure", () =>
    Effect.gen(function*() {
      const handler = createNoParamsWorkspaceToolHandler(
        () =>
          Effect.fail(new HulyError({ message: "ws broke" })) as Effect.Effect<
            never,
            HulyError,
            WorkspaceClient
          >
      )

      const result = yield* Effect.promise(() => handler({}, noopHulyClient, noopStorageClient, noopWorkspaceClient))

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(result.content[0].text).toContain("ws broke")
    }))
})
