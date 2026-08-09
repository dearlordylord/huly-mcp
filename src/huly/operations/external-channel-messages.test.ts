import { describe, it } from "@effect/vitest"
import type { Channel } from "@hcengineering/contact"
import type { Doc, FindOptions, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { TelegramMessage } from "@hcengineering/telegram"
import { Effect, Either, Exit, Schema } from "effect"
import { expect } from "vitest"

import {
  DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT,
  ListExternalChannelMessagesParamsSchema,
  ListExternalChannelMessagesResultSchema
} from "../../domain/schemas/external-channel-messages.js"
import { ChannelIdentifier } from "../../domain/schemas/shared.js"
import type { ToolWarning } from "../../domain/schemas/tool-warnings.js"
import { channelTools } from "../../mcp/tools/channels.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import { Diagnostics, makeDiagnosticsScope } from "../diagnostics.js"
import { contact, core, gmail, telegram } from "../huly-plugins.js"
import { listExternalChannelMessages } from "./external-channel-messages.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "./markup.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toRef } from "./sdk-boundary.js"
import { docRef } from "../../../test/helpers/huly-sdk.js"

const decodeParams = Schema.decodeUnknownEither(ListExternalChannelMessagesParamsSchema)
const decodeResult = Schema.decodeUnknownEither(ListExternalChannelMessagesResultSchema)

// SDK brands are erased at runtime, and the SDK does not expose fixture constructors for these identities.
// eslint-disable-next-line no-restricted-syntax -- complete test fixture for an SDK PersonId
const actor = "account:person:test" as PersonId

const makeTelegramChannel = (id: string, value: string): Channel => ({
  _id: docRef<Channel>(id),
  _class: contact.class.Channel,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: 1,
  attachedTo: docRef("person-1"),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Telegram,
  value
})

const makeTelegramMessage = (
  id: string,
  channel: Channel,
  content: string,
  sendOn: number,
  incoming: boolean,
  attachments?: number
): TelegramMessage => ({
  _id: docRef<TelegramMessage>(id),
  _class: telegram.class.Message,
  space: core.space.Workspace,
  modifiedBy: actor,
  modifiedOn: sendOn,
  attachedTo: channel._id,
  attachedToClass: contact.class.Channel,
  collection: "items",
  content: markdownToMarkupString(content, testMarkupUrlConfig),
  incoming,
  sendOn,
  ...(attachments === undefined ? {} : { attachments })
})

const gmailModelLayer = (modelSupported: boolean): ReturnType<typeof HulyClient.testLayer> => {
  const modelClass: MetadataClassDoc = {
    _id: toRef<MetadataClassDoc>(gmail.class.Message),
    _class: core.class.Class,
    space: core.space.Model,
    modifiedBy: actor,
    modifiedOn: 0,
    label: "gmail:string:Message",
    kind: 0
  }
  // The complete MetadataClassDoc fixture is selected by both class and _id. The generic SDK port cannot retain
  // that runtime relationship, so this adapter restores the original port only after applying both predicates.
  const findAllInModel: HulyClientOperations["findAllInModel"] = ((classRef: unknown, query: Record<string, unknown>) =>
    Effect.succeed(
      toFindResult(
        modelSupported && classRef === core.class.Class && query["_id"] === gmail.class.Message ? [modelClass] : []
      )
    )) as HulyClientOperations["findAllInModel"]

  return HulyClient.testLayer({ findAllInModel })
}

interface TelegramTestState {
  readonly modelSupported: boolean
  readonly channels: ReadonlyArray<Channel>
  readonly messages: ReadonlyArray<TelegramMessage>
}

const telegramLayer = (state: TelegramTestState): ReturnType<typeof HulyClient.testLayer> => {
  const modelClass: MetadataClassDoc = {
    _id: toRef<MetadataClassDoc>(telegram.class.Message),
    _class: core.class.Class,
    space: core.space.Model,
    modifiedBy: actor,
    modifiedOn: 0,
    label: "telegram:string:Message",
    kind: 0
  }
  const findAllInModel: HulyClientOperations["findAllInModel"] = ((classRef: unknown, query: Record<string, unknown>) =>
    Effect.succeed(
      toFindResult(
        state.modelSupported && classRef === core.class.Class && query["_id"] === telegram.class.Message
          ? [modelClass]
          : []
      )
    )) as HulyClientOperations["findAllInModel"]

  const matches = (doc: Doc, query: Record<string, unknown>): boolean =>
    Object.entries(query).every(([key, expected]) => Reflect.get(doc, key) === expected)
  // The generic SDK port cannot express that the class-ref branches select fixtures compatible with T.
  const findAll: HulyClientOperations["findAll"] = ((
    classRef: unknown,
    query: Record<string, unknown>,
    options?: FindOptions<Doc>
  ) => {
    const docs: ReadonlyArray<Doc> =
      classRef === contact.class.Channel ? state.channels : classRef === telegram.class.Message ? state.messages : []
    const sorted = [...docs]
      .filter((doc) => matches(doc, query))
      .sort((left, right) => Number(Reflect.get(right, "sendOn") ?? 0) - Number(Reflect.get(left, "sendOn") ?? 0))
      .slice(0, options?.limit)
    return Effect.succeed(toFindResult(sorted))
  }) as HulyClientOperations["findAll"]
  // The generic SDK port cannot express that this class-ref branch selects Channel fixtures compatible with T.
  const findOne: HulyClientOperations["findOne"] = ((classRef: unknown, query: Record<string, unknown>) => {
    const docs = classRef === contact.class.Channel ? state.channels : []
    return Effect.succeed(docs.find((doc) => matches(doc, query)))
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findAllInModel, findOne })
}

const runOperation = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  modelSupported: boolean
): Effect.Effect<{ readonly result: A; readonly warnings: ReadonlyArray<ToolWarning> }, E> =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* effect.pipe(
      Effect.provide(gmailModelLayer(modelSupported)),
      Effect.provideService(Diagnostics, diagnostics.service)
    )
    return { result, warnings: yield* diagnostics.drainWarnings }
  })

const runTelegramOperation = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  state: TelegramTestState
): Effect.Effect<{ readonly result: A; readonly warnings: ReadonlyArray<ToolWarning> }, E> =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* effect.pipe(
      Effect.provide(telegramLayer(state)),
      Effect.provideService(Diagnostics, diagnostics.service)
    )
    return { result, warnings: yield* diagnostics.drainWarnings }
  })

describe("external channel message compatibility", () => {
  it("validates the assessed provider inputs and bounded limit", () => {
    expect(Either.isRight(decodeParams({ provider: "gmail", channel: "inbox@example.com", limit: 200 }))).toBe(true)
    expect(Either.isRight(decodeParams({ provider: "telegram", channel: "Ops" }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "gmail", channel: "Inbox", limit: 201 }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "email", channel: "Inbox" }))).toBe(true)
  })

  it("accepts honest unsupported states and typed Telegram message results", () => {
    expect(
      Either.isRight(
        decodeResult({
          supported: false,
          provider: "gmail",
          channel: "Inbox",
          limit: 5,
          unsupportedReasonCode: "runtime-unverifiable",
          unsupportedReason: "runtime-unverifiable",
          messages: []
        })
      )
    ).toBe(true)
    expect(
      Either.isLeft(decodeResult({ supported: true, provider: "gmail", channel: "Inbox", limit: 5, messages: [] }))
    ).toBe(true)
    expect(
      Either.isRight(
        decodeResult({
          supported: true,
          provider: "telegram",
          channel: { id: "channel-1", value: "@ops" },
          limit: 5,
          messages: [
            {
              id: "message-1",
              contentMarkdown: "Deploy complete",
              direction: "incoming",
              sentOn: 10,
              attachmentCount: 1
            }
          ]
        })
      )
    ).toBe(true)
  })

  it("loads the published Gmail Message runtime class reference", () => {
    expect(String(gmail.class.Message)).toBe("gmail:class:Message")
    expect(String(telegram.class.Message)).toBe("telegram:class:Message")
  })

  it("registers an LLM-readable no-fake-data tool contract", () => {
    const tool = channelTools.find(({ name }) => name === "list_external_channel_messages")

    expect(tool?.inputSchema).toBeDefined()
    expect(tool?.description).toContain("persisted Telegram")
    expect(tool?.description).toContain("live deployment-wide v1/v2 writer version")
    expect(tool?.description).toContain("never sends")
  })

  it.effect("returns supported=false when the Gmail model is unavailable", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runOperation(
        listExternalChannelMessages({ provider: "gmail", channel: ChannelIdentifier.make("recipient@example.com") }),
        false
      )

      expect(result.limit).toBe(DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT)
      expect(result).toMatchObject({ supported: false, provider: "gmail", messages: [] })
      if (result.supported) return yield* Effect.die("Gmail compatibility assessment cannot be supported")
      expect(result.unsupportedReason).toContain("model-unavailable")
      expect(result.unsupportedReasonCode).toBe("model-unavailable")
      expect(warnings).toHaveLength(1)
    })
  )

  it.effect("returns supported=false when the installed Gmail model cannot prove the live writer runtime", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runOperation(
        listExternalChannelMessages({
          provider: "gmail",
          channel: ChannelIdentifier.make("email-channel-1"),
          limit: 5
        }),
        true
      )

      expect(result).toMatchObject({ supported: false, provider: "gmail", limit: 5, messages: [] })
      if (result.supported) return yield* Effect.die("Gmail compatibility assessment cannot be supported")
      expect(result.unsupportedReason).toContain("runtime-unverifiable")
      expect(result.unsupportedReasonCode).toBe("runtime-unverifiable")
      expect(warnings[0]?.code).toBe("external_channel_runtime_unsupported")
    })
  )

  it.effect("reports an unavailable Telegram model with an agent warning", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runTelegramOperation(
        listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("Ops") }),
        { modelSupported: false, channels: [], messages: [] }
      )

      expect(result).toMatchObject({ supported: false, provider: "telegram", channel: "Ops", messages: [] })
      if (result.supported) return yield* Effect.die("Telegram model should be unavailable")
      expect(result.unsupportedReasonCode).toBe("model-unavailable")
      expect(warnings[0]?.code).toBe("external_channel_runtime_unsupported")
    })
  )

  it.effect("reports missing Telegram setup without inventing messages", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runTelegramOperation(
        listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("Ops") }),
        { modelSupported: true, channels: [], messages: [] }
      )

      expect(result).toMatchObject({ supported: false, provider: "telegram", channel: "Ops", messages: [] })
      if (result.supported) return yield* Effect.die("Telegram channel should be unavailable")
      expect(result.unsupportedReasonCode).toBe("channel-unavailable")
      expect(warnings).toEqual([])
    })
  )

  it.effect("resolves Telegram channels by exact value or stable ID and returns newest persisted messages", () =>
    Effect.gen(function* () {
      const channel = makeTelegramChannel("channel-1", "@ops")
      const messages = [
        makeTelegramMessage("message-old", channel, "Old", 5, false),
        makeTelegramMessage("message-new", channel, "Deploy complete", 10, true, 1)
      ]
      const byValue = yield* runTelegramOperation(
        listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("@ops"), limit: 1 }),
        { modelSupported: true, channels: [channel], messages }
      )
      const byId = yield* runTelegramOperation(
        listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("channel-1") }),
        { modelSupported: true, channels: [channel], messages }
      )

      expect(byValue.result).toEqual({
        supported: true,
        provider: "telegram",
        channel: { id: "channel-1", value: "@ops" },
        limit: 1,
        messages: [
          {
            id: "message-new",
            contentMarkdown: "Deploy complete",
            direction: "incoming",
            sentOn: 10,
            attachmentCount: 1
          }
        ]
      })
      expect(byId.result.messages).toHaveLength(2)
      expect(byValue.warnings).toEqual([])
    })
  )

  it.effect("rejects ambiguous Telegram channel values", () =>
    Effect.gen(function* () {
      const effect = runTelegramOperation(
        listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("@shared") }),
        {
          modelSupported: true,
          channels: [makeTelegramChannel("channel-1", "@shared"), makeTelegramChannel("channel-2", "@shared")],
          messages: []
        }
      )
      const exit = yield* Effect.exit(effect)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("TelegramChannelIdentifierAmbiguousError")
    })
  )

  it.effect("fails safely on malformed Telegram message records", () =>
    Effect.gen(function* () {
      const channel = makeTelegramChannel("channel-1", "@ops")
      const message = makeTelegramMessage("message-1", channel, "Deploy complete", 10, true)
      Reflect.set(message, "content", 42)
      const exit = yield* Effect.exit(
        runTelegramOperation(
          listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("@ops") }),
          { modelSupported: true, channels: [channel], messages: [message] }
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("malformed Telegram message metadata")
    })
  )

  it.effect("fails safely on malformed Telegram contact-channel records", () =>
    Effect.gen(function* () {
      const channel = makeTelegramChannel("channel-1", "@ops")
      Reflect.set(channel, "value", 42)
      const exit = yield* Effect.exit(
        runTelegramOperation(
          listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("channel-1") }),
          { modelSupported: true, channels: [channel], messages: [] }
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("malformed Telegram contact-channel metadata")
    })
  )
})
