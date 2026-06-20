import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../src/huly/client.js"
import { HulyClient } from "../../src/huly/client.js"
import { Diagnostics } from "../../src/huly/diagnostics.js"
import { HulyError } from "../../src/huly/errors.js"
import { testMarkupUrlConfig } from "../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../src/huly/url-builders.js"
import type { WorkspaceClientOperations } from "../../src/huly/workspace-client.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { McpErrorCode } from "../../src/mcp/error-mapping.js"
import {
  defineCombinedTool,
  defineNoParamsWorkspaceTool,
  defineStorageTool,
  defineTool,
  defineWorkspaceTool,
  type RegisteredTool
} from "../../src/mcp/tools/registry.js"
import { assertAt } from "../../src/utils/assertions.js"

const Params = Schema.Struct({ name: Schema.String })
type Params = typeof Params.Type

const GreetingResult = Schema.Struct({ greeting: Schema.String })
const UrlResult = Schema.Struct({ url: Schema.String })
const CombinedResult = Schema.Struct({ combined: Schema.String })
const WorkspaceResult = Schema.Struct({ ws: Schema.String })
const MembersResult = Schema.Struct({ members: Schema.Number })
const PositiveResult = Schema.Struct({ count: Schema.Number.pipe(Schema.positive()) })

const parse = (input: unknown) => Schema.decodeUnknown(Params)(input)

const toolInputSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
  additionalProperties: false
}

const makeToolHandler = (tool: RegisteredTool) => tool.handler

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
  createAccessLink: () => Effect.die(new Error("not implemented")),
  updateAllowReadOnlyGuests: () => Effect.die(new Error("not implemented")),
  updateAllowGuestSignUp: () => Effect.die(new Error("not implemented")),
  getRegionInfo: () => Effect.succeed([])
}

describe("defineTool", () => {
  it.effect("returns encoded success response on valid input", () =>
    Effect.gen(function*() {
      const tool = defineTool(
        {
          name: "test_tool",
          description: "test tool",
          inputSchema: toolInputSchema,
          resultSchema: GreetingResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.succeed({ greeting: `hello ${params.name}` }).pipe(
            Effect.tap(() => HulyClient)
          )
      )

      expect(tool.outputSchema.properties?.result).toMatchObject({ type: "object" })

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "world" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toEqual({ result: { greeting: "hello world" } })
      expect(assertAt(result.content, 0).text).toBe("{\"greeting\":\"hello world\"}")
    }))

  it.effect("returns parse error on invalid input", () =>
    Effect.gen(function*() {
      const tool = defineTool(
        {
          name: "test_tool",
          description: "test tool",
          inputSchema: toolInputSchema,
          resultSchema: GreetingResult,
          category: "test"
        },
        parse,
        (_params: Params) =>
          Effect.succeed({ greeting: "ok" }).pipe(
            Effect.tap(() => HulyClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ wrong: 123 }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
      expect(result.structuredContent).toBeUndefined()
      expect(result._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(result.content, 0).text).toContain("Invalid parameters")
    }))

  it.effect("returns domain error on operation failure", () =>
    Effect.gen(function*() {
      const tool = defineTool(
        {
          name: "test_tool",
          description: "test tool",
          inputSchema: toolInputSchema,
          resultSchema: GreetingResult,
          category: "test"
        },
        parse,
        (_params: Params) =>
          Effect.fail(new HulyError({ message: "something broke" })) as Effect.Effect<
            never,
            HulyError,
            HulyClient
          >
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "world" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(assertAt(result.content, 0).text).toContain("something broke")
    }))

  it.effect("returns internal error when result encoding fails", () =>
    Effect.gen(function*() {
      const tool = defineTool(
        {
          name: "encoded_tool",
          description: "encoded tool",
          inputSchema: toolInputSchema,
          resultSchema: PositiveResult,
          category: "test"
        },
        parse,
        (_params: Params) =>
          Effect.succeed({ count: -1 }).pipe(
            Effect.tap(() => HulyClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "world" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(assertAt(result.content, 0).text).toContain("invalid output")
    }))

  it.effect("adds diagnostics warnings to encoded success envelopes", () =>
    Effect.gen(function*() {
      const tool = defineTool(
        {
          name: "test_tool",
          description: "test tool",
          inputSchema: toolInputSchema,
          resultSchema: GreetingResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.gen(function*() {
            const diagnostics = yield* Diagnostics
            yield* diagnostics.warnAgent({
              code: "status_metadata_unresolved",
              message: `Status metadata was degraded for ${params.name}.`
            })
            return { greeting: `hello ${params.name}` }
          })
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "world" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toEqual({
        result: { greeting: "hello world" },
        warnings: [{
          code: "status_metadata_unresolved",
          message: "Status metadata was degraded for world."
        }]
      })
      expect(result.content).toHaveLength(2)
    }))

  it.effect("adds diagnostics warnings to failure envelopes", () =>
    Effect.gen(function*() {
      const tool = defineTool(
        {
          name: "test_tool",
          description: "test tool",
          inputSchema: toolInputSchema,
          resultSchema: GreetingResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.gen(function*() {
            const diagnostics = yield* Diagnostics
            yield* diagnostics.warnAgent({
              code: "status_metadata_unresolved",
              message: `Status metadata was degraded for ${params.name}.`
            })
            return yield* Effect.fail(new HulyError({ message: "failed after warning" }))
          })
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "world" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
      expect(result.structuredContent).toBeUndefined()
      expect(assertAt(result.content, 0).text).toContain("failed after warning")
      expect(JSON.parse(assertAt(result.content, 1).text)).toEqual({
        warnings: [{
          code: "status_metadata_unresolved",
          message: "Status metadata was degraded for world."
        }]
      })
    }))
})

describe("defineStorageTool", () => {
  it.effect("provides the storage client", () =>
    Effect.gen(function*() {
      const tool = defineStorageTool(
        {
          name: "storage_tool",
          description: "storage tool",
          inputSchema: toolInputSchema,
          resultSchema: UrlResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.succeed({ url: `file://${params.name}` }).pipe(
            Effect.tap(() => HulyStorageClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "doc.pdf" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toEqual({ result: { url: "file://doc.pdf" } })
    }))
})

describe("defineCombinedTool", () => {
  it.effect("provides both Huly and storage clients", () =>
    Effect.gen(function*() {
      const tool = defineCombinedTool(
        {
          name: "combined_tool",
          description: "combined tool",
          inputSchema: toolInputSchema,
          resultSchema: CombinedResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.gen(function*() {
            yield* HulyClient
            yield* HulyStorageClient
            return { combined: params.name }
          })
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "both" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toEqual({ result: { combined: "both" } })
    }))
})

describe("defineWorkspaceTool", () => {
  it.effect("provides the workspace client when available", () =>
    Effect.gen(function*() {
      const tool = defineWorkspaceTool(
        {
          name: "workspace_tool",
          description: "workspace tool",
          inputSchema: toolInputSchema,
          resultSchema: WorkspaceResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.succeed({ ws: params.name }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "myws" }, noopHulyClient, noopStorageClient, noopWorkspaceClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toEqual({ result: { ws: "myws" } })
    }))

  it.effect("returns error when workspace client is undefined", () =>
    Effect.gen(function*() {
      const tool = defineWorkspaceTool(
        {
          name: "workspace_tool",
          description: "workspace tool",
          inputSchema: toolInputSchema,
          resultSchema: WorkspaceResult,
          category: "test"
        },
        parse,
        (params: Params) =>
          Effect.succeed({ ws: params.name }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({ name: "myws" }, noopHulyClient, noopStorageClient, undefined)
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(assertAt(result.content, 0).text).toContain("WorkspaceClient not available")
    }))
})

describe("defineNoParamsWorkspaceTool", () => {
  it.effect("provides the workspace client without requiring params", () =>
    Effect.gen(function*() {
      const tool = defineNoParamsWorkspaceTool(
        {
          name: "workspace_members",
          description: "workspace members",
          inputSchema: {},
          resultSchema: MembersResult,
          category: "test"
        },
        () =>
          Effect.succeed({ members: 5 }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({}, noopHulyClient, noopStorageClient, noopWorkspaceClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toEqual({ result: { members: 5 } })
    }))

  it.effect("returns workspace error before running no-param operation", () =>
    Effect.gen(function*() {
      const tool = defineNoParamsWorkspaceTool(
        {
          name: "workspace_members",
          description: "workspace members",
          inputSchema: {},
          resultSchema: MembersResult,
          category: "test"
        },
        () =>
          Effect.succeed({ members: 5 }).pipe(
            Effect.tap(() => WorkspaceClient)
          )
      )

      const result = yield* Effect.promise(() =>
        makeToolHandler(tool)({}, noopHulyClient, noopStorageClient, undefined)
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(assertAt(result.content, 0).text).toContain("WorkspaceClient not available")
    }))
})
