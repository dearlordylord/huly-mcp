/* eslint-disable no-restricted-syntax -- Huly SDK fixtures and generic client ports require nominal-ref bridges at this isolated test boundary. */
import { describe, it } from "@effect/vitest"
import type { Doc, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { SupportConversation, SupportSystem } from "@hcengineering/support"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import { GetSupportStatusResultSchema } from "../../../src/domain/schemas/support.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics } from "../../../src/huly/diagnostics.js"
import { core, support } from "../../../src/huly/huly-plugins.js"
import { getSupportStatus } from "../../../src/huly/operations/support.js"
import { supportTools } from "../../../src/mcp/tools/support.js"

const caller = "caller-social-id" as PersonId

interface State {
  readonly systems: ReadonlyArray<SupportSystem>
  readonly conversations: ReadonlyArray<RawSupportConversation>
  readonly modelSupported: boolean
  readonly queries: Array<unknown>
  readonly warnings: Array<ToolWarning>
}

type RawSupportConversation = Omit<SupportConversation, "hasUnreadMessages"> & { readonly hasUnreadMessages: unknown }

type ModelClassFixture = Doc & { readonly _id: SupportConversation["_class"] | SupportSystem["_class"] }

const layer = (state: State) => {
  const findAll = ((_class: unknown, query: unknown) => {
    state.queries.push(query)
    return Effect.succeed(toFindResult(Array.from(state.conversations)))
  }) as HulyClientOperations["findAll"]
  const findAllInModel = ((classRef: unknown) =>
    Effect.succeed(toFindResult(modelDocuments(classRef, state)))) as HulyClientOperations["findAllInModel"]
  return HulyClient.testLayer({ findAll, findAllInModel, getPrimarySocialId: () => caller })
}

const makeState = (
  systems: ReadonlyArray<SupportSystem> = [],
  conversations: ReadonlyArray<RawSupportConversation> = [],
  modelSupported = true
): State => ({ systems, conversations, modelSupported, queries: [], warnings: [] })

const modelClassFixture = (id: ModelClassFixture["_id"]): ModelClassFixture => ({
  _id: id,
  _class: core.class.Class,
  space: core.space.Model,
  modifiedBy: caller,
  modifiedOn: 1
})

const modelDocuments = (classRef: unknown, state: State): Array<Doc> =>
  String(classRef) === String(core.class.Class)
    ? state.modelSupported
      ? [modelClassFixture(support.class.SupportConversation), modelClassFixture(support.class.SupportSystem)]
      : []
    : Array.from(state.systems)

const system = (id: string, name: string): SupportSystem => ({
  _id: id as SupportSystem["_id"],
  _class: support.class.SupportSystem,
  space: "model" as SupportSystem["space"],
  name,
  factory: "support:resource:factory" as SupportSystem["factory"],
  modifiedBy: caller,
  modifiedOn: 1
})

const conversation = (id: string): SupportConversation => ({
  _id: id as SupportConversation["_id"],
  _class: support.class.SupportConversation,
  space: caller as unknown as Ref<Space>,
  conversationId: `provider-${id}`,
  hasUnreadMessages: true,
  modifiedBy: caller,
  modifiedOn: 2,
  createdBy: caller,
  createdOn: 1
})

const run = (state: State) =>
  getSupportStatus({}).pipe(
    Effect.provide(layer(state)),
    Effect.provideService(Diagnostics, {
      warnAgent: (warning) => Effect.sync(() => state.warnings.push(warning)),
      trail: () => Effect.void
    })
  )

describe("getSupportStatus", () => {
  it("loads the published support class references", () => {
    expect(String(support.class.SupportConversation)).toBe("support:class:SupportConversation")
    expect(String(support.class.SupportSystem)).toBe("support:class:SupportSystem")
  })

  it("publishes the privacy, freshness, and unsupported-message contract", () => {
    const tool = supportTools[0]
    expect(tool.name).toBe("get_support_status")
    expect(tool.description).toContain("authenticated account")
    expect(tool.description).toContain("no provider-freshness guarantee")
    expect(tool.description).toContain("no support message bodies")
    expect(tool.description).toContain("never loads the executable widget factory")
  })

  it.effect("returns missing setup and caller-scoped stored status", () =>
    Effect.gen(function* () {
      const state = makeState([], [conversation("conversation-1")])
      const result = yield* run(state)
      if (!result.supported) return yield* Effect.die("Support model should be available")
      expect(result.setup).toEqual({ status: "missing" })
      expect(result.statusRecords).toEqual([
        {
          recordId: "conversation-1",
          providerConversationId: "provider-conversation-1",
          storedHasUnreadMessages: true,
          modifiedOn: 2
        }
      ])
      expect(state.queries).toEqual([{ space: caller, createdBy: caller }])
      expect(Schema.decodeUnknownEither(GetSupportStatusResultSchema)(result)._tag).toBe("Right")
    })
  )

  it.effect("returns configured setup without exposing the executable factory", () =>
    Effect.gen(function* () {
      const result = yield* run(makeState([system("system-1", "Intercom")]))
      if (!result.supported) return yield* Effect.die("Support model should be available")
      expect(result.setup).toEqual({ status: "configured", system: { id: "system-1", name: "Intercom" } })
      expect(JSON.stringify(result)).not.toContain("factory")
    })
  )

  it.effect("reports multiple systems as ambiguous instead of choosing one", () =>
    Effect.gen(function* () {
      const result = yield* run(makeState([system("system-1", "One"), system("system-2", "Two")]))
      if (!result.supported) return yield* Effect.die("Support model should be available")
      expect(result.setup.status).toBe("ambiguous")
      if (result.setup.status === "ambiguous") expect(result.setup.systems).toHaveLength(2)
    })
  )

  it.effect("skips malformed private status metadata with a provider-safe warning", () =>
    Effect.gen(function* () {
      const malformed = { ...conversation("conversation-1"), hasUnreadMessages: "yes" }
      const state = makeState([], [malformed, conversation("conversation-2")])
      const result = yield* run(state)
      if (!result.supported) return yield* Effect.die("Support model should be available")
      expect(result.statusRecords.map(({ recordId }) => recordId)).toEqual(["conversation-2"])
      expect(state.warnings).toHaveLength(1)
      expect(state.warnings[0]?.code).toBe("support_status_metadata_degraded")
      expect(state.warnings[0]?.message).not.toContain("provider-conversation-1")
    })
  )

  it.effect("reports an unavailable workspace model without querying private rows", () =>
    Effect.gen(function* () {
      const state = makeState([], [], false)
      const result = yield* run(state)
      expect(result).toEqual({
        supported: false,
        unsupportedReasonCode: "model-unavailable",
        unsupportedReason:
          "model-unavailable: this Huly workspace does not expose both support:class:SupportSystem and support:class:SupportConversation"
      })
      expect(state.queries).toEqual([])
      expect(state.warnings[0]?.code).toBe("support_runtime_unsupported")
    })
  )
})
