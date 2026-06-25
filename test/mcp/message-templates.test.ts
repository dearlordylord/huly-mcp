import { describe, it } from "@effect/vitest"
import type { Class, Doc, PersonId, Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type {
  MessageTemplate as HulyMessageTemplate,
  TemplateCategory as HulyTemplateCategory
} from "@hcengineering/templates"
import { Context, Effect, Layer } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { core, templates } from "../../src/huly/huly-plugins.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../src/huly/operations/markup.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { McpErrorCode } from "../../src/mcp/error-mapping.js"
import { createMcpProtocolHandlers } from "../../src/mcp/protocol-handlers.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import { makeToolName } from "../../src/mcp/tools/registry.js"
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

const messageTemplate = (
  id: string,
  title: string,
  templateCategory: HulyTemplateCategory,
  markdown: string
): HulyMessageTemplate => ({
  _id: ref<HulyMessageTemplate>(id),
  _class: templates.class.MessageTemplate,
  space: templateCategory._id,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1,
  title,
  message: markdownToMarkupString(markdown, testMarkupUrlConfig)
})

const templateAwareClient = (
  categories: ReadonlyArray<HulyTemplateCategory>,
  messageTemplates: ReadonlyArray<HulyMessageTemplate> = []
) => {
  const findAllImpl = (_class: Ref<Class<Doc>>) => {
    const docs: Array<Doc> = _class === templates.class.TemplateCategory
      ? [...categories]
      : _class === templates.class.MessageTemplate
      ? [...messageTemplates]
      : []

    return Effect.succeed(toFindResult(docs))
  }

  // HulyClientOperations.findAll is generic over the class ref. This fixture returns docs selected by that
  // same runtime class ref; TypeScript cannot express that Ref<Class<T>> equality narrows docs to T.
  const findAll = findAllImpl as HulyClientOperations["findAll"]
  const findOne: HulyClientOperations["findOne"] = (_class, query, options) =>
    Effect.map(findAll(_class, query, options), (result) => result.at(0))

  return HulyClient.testLayer({
    findAll,
    findOne
  })
}

const buildClients = (
  categories: ReadonlyArray<HulyTemplateCategory>,
  messageTemplates: ReadonlyArray<HulyMessageTemplate> = []
) =>
  Effect.gen(function*() {
    const context = yield* Layer.build(
      Layer.merge(templateAwareClient(categories, messageTemplates), HulyStorageClient.testLayer({}))
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

    expect(names.slice(start, start + 5)).toEqual([
      "list_message_template_categories",
      "list_message_templates",
      "get_message_template",
      "render_message_template",
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
    expect(names).toContain("render_message_template")
    expect(names).toContain("list_message_template_fields")
  })

  it.effect("serializes a successful category list response", () =>
    Effect.gen(function*() {
      const clients = yield* buildClients([category("cat-sales", "Sales")])
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          makeToolName("list_message_template_categories"),
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

  it.effect("serializes a successful render response", () =>
    Effect.gen(function*() {
      const sales = category("cat-sales", "Sales")
      const clients = yield* buildClients([
        sales
      ], [
        messageTemplate("tmpl-sales-welcome", "Welcome", sales, "Hello ${field-owner}, meet ${field-company}.")
      ])
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          makeToolName("render_message_template"),
          {
            template: "tmpl-sales-welcome",
            values: [
              { field: "field-owner", value: "Ada" },
              { field: "field-unused", value: "Ignored" }
            ]
          },
          clients.hulyClient,
          clients.storageClient
        )
      )

      expect(result?.isError).not.toBe(true)
      expect(result?.structuredContent?.result).toMatchObject({
        id: "tmpl-sales-welcome",
        title: "Welcome",
        renderedMessage: expect.stringContaining("Hello Ada, meet ${field-company}."),
        usedFields: [{ field: "field-owner", value: "Ada" }],
        unresolvedFieldIds: ["field-company"],
        unusedValueFields: ["field-unused"]
      })
      expect(JSON.parse(result?.content[0]?.text ?? "null")).toEqual(result?.structuredContent?.result)
    }))

  it.effect("maps not-found template locator errors to invalid params", () =>
    Effect.gen(function*() {
      const clients = yield* buildClients([])
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          makeToolName("get_message_template"),
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
