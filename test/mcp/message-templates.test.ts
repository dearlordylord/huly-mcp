import { describe, it } from "@effect/vitest"
import type { Class, Doc, PersonId, Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { TemplateCategory as HulyTemplateCategory } from "@hcengineering/templates"
import { Context, Effect, Layer } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { core, templates } from "../../src/huly/huly-plugins.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { McpErrorCode } from "../../src/mcp/error-mapping.js"
import { createMcpProtocolHandlers } from "../../src/mcp/protocol-handlers.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import type { TelemetryOperations } from "../../src/telemetry/telemetry.js"

const person = "person-1" as PersonId
const workspace = core.space.Workspace
const ref = <T extends Doc>(id: string): Ref<T> => id as Ref<T>

const category = (id: string, name: string): HulyTemplateCategory => ({
  _id: ref<HulyTemplateCategory>(id),
  _class: templates.class.TemplateCategory,
  space: workspace,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1,
  name,
  description: `${name} templates`,
  private: false,
  members: [],
  archived: false
})

const templateAwareClient = (categories: ReadonlyArray<HulyTemplateCategory>) => {
  const findAll: HulyClientOperations["findAll"] = ((
    _class: Ref<Class<Doc>>
  ) =>
    Effect.succeed(
      _class === templates.class.TemplateCategory
        ? toFindResult(categories.map((item) => item as Doc))
        : toFindResult<Doc>([])
    )) as HulyClientOperations["findAll"]

  return HulyClient.testLayer({
    findAll,
    findOne: (() => Effect.succeed(undefined)) as HulyClientOperations["findOne"]
  })
}

const buildClients = (categories: ReadonlyArray<HulyTemplateCategory>) =>
  Effect.gen(function*() {
    const context = yield* Layer.build(
      Layer.merge(templateAwareClient(categories), HulyStorageClient.testLayer({}))
    ).pipe(Effect.scoped)

    return {
      hulyClient: Context.get(context, HulyClient),
      storageClient: Context.get(context, HulyStorageClient)
    }
  })

const telemetry: TelemetryOperations = createNoopTelemetry()

describe("message template MCP tools", () => {
  it("registers tools near tag/template-adjacent tools", () => {
    const names = toolRegistry.definitions.map((tool) => tool.name)
    const start = names.indexOf("delete_tag_category") + 1

    expect(names.slice(start, start + 4)).toEqual([
      "list_message_template_categories",
      "list_message_templates",
      "get_message_template",
      "list_message_template_fields"
    ])
  })

  it("exposes message template tools through tools/list", async () => {
    const handlers = createMcpProtocolHandlers(
      () => Promise.reject(new Error("resolveClients not used by tools/list")),
      telemetry,
      toolRegistry,
      () => {
        throw new Error("getHulyContext not used by tools/list")
      }
    )

    const result = await handlers.listTools()
    const names = result.tools.map((tool) => tool.name)

    expect(names).toContain("list_message_template_categories")
    expect(names).toContain("list_message_templates")
    expect(names).toContain("get_message_template")
    expect(names).toContain("list_message_template_fields")
  })

  it.effect("serializes a successful category list response", () =>
    Effect.gen(function*() {
      const clients = yield* buildClients([category("cat-sales", "Sales")])
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "list_message_template_categories",
          {},
          clients.hulyClient,
          clients.storageClient
        )
      )

      expect(result?.isError).not.toBe(true)
      expect(result?.structuredContent?.result).toEqual([
        {
          id: "cat-sales",
          name: "Sales",
          description: "Sales templates",
          archived: false,
          private: false,
          createdOn: 1,
          modifiedOn: 1
        }
      ])
      expect(JSON.parse(result?.content[0]?.text ?? "null")).toEqual(result?.structuredContent?.result)
    }))

  it.effect("maps not-found template locator errors to invalid params", () =>
    Effect.gen(function*() {
      const clients = yield* buildClients([])
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_message_template",
          { template: "missing" },
          clients.hulyClient,
          clients.storageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(result?.content[0]?.text).toContain("Message template 'missing' not found")
    }))
})
