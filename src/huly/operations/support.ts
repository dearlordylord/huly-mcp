import type { Space } from "@hcengineering/core"
import type { SupportConversation, SupportSystem } from "@hcengineering/support"
import { Effect, Either, Schema } from "effect"

import type {
  GetSupportStatusParams,
  GetSupportStatusResult,
  SupportSetup,
  SupportStatusRecord,
  SupportSystemSummary
} from "../../domain/schemas/support.js"
import {
  SupportProviderConversationId,
  SupportStatusRecordId,
  SupportSystemId,
  SupportSystemName,
  SupportUnsupportedReason
} from "../../domain/schemas/support.js"
import { NonEmptyString, Timestamp } from "../../domain/schemas/shared.js"
import {
  SupportRuntimeUnsupportedWarningCode,
  SupportStatusMetadataDegradedWarningCode
} from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { HulyError } from "../errors.js"
import { core, support } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

const SUPPORT_MODEL_UNAVAILABLE_REASON = SupportUnsupportedReason.make(
  "model-unavailable: this Huly workspace does not expose both support:class:SupportSystem and support:class:SupportConversation"
)
const supportModelIds = [support.class.SupportSystem, support.class.SupportConversation]
const modelClassRef = toClassRef<MetadataClassDoc>(core.class.Class)

const SupportSystemProjectionSchema = Schema.Struct({ _id: SupportSystemId, name: SupportSystemName })
type SupportSystemProjection = Schema.Schema.Type<typeof SupportSystemProjectionSchema>

const SupportConversationProjectionSchema = Schema.Struct({
  _id: SupportStatusRecordId,
  conversationId: SupportProviderConversationId,
  hasUnreadMessages: Schema.Boolean,
  modifiedOn: Timestamp
})
type SupportConversationProjection = Schema.Schema.Type<typeof SupportConversationProjectionSchema>

const parseSystem = (input: unknown): Effect.Effect<SupportSystemProjection, HulyError> =>
  Schema.decodeUnknown(SupportSystemProjectionSchema)(input).pipe(
    Effect.mapError((cause) => new HulyError({ message: "Huly returned malformed support-system metadata.", cause }))
  )

const parseConversation = Schema.decodeUnknownEither(SupportConversationProjectionSchema)

const hasSupportModel = (client: HulyClient["Type"]): Effect.Effect<boolean, HulyClientError> =>
  Effect.map(
    client.findAllInModel<MetadataClassDoc>(
      modelClassRef,
      hulyQuery<MetadataClassDoc>({ _id: { $in: supportModelIds.map(toRef<MetadataClassDoc>) } })
    ),
    (classes) => {
      const foundIds = new Set(classes.map((classDoc) => String(classDoc._id)))
      return supportModelIds.every((id) => foundIds.has(String(id)))
    }
  )

const warnModelUnavailable = (diagnostics: Diagnostics["Type"]): Effect.Effect<void> =>
  diagnostics.warnAgent({ code: SupportRuntimeUnsupportedWarningCode, message: SUPPORT_MODEL_UNAVAILABLE_REASON })

const parseStatusRecords = (
  diagnostics: Diagnostics["Type"],
  records: ReadonlyArray<SupportConversation>
): Effect.Effect<Array<SupportStatusRecord>> => {
  const decoded = records.map((record) => parseConversation(record))
  const valid = decoded.flatMap((result) => (Either.isRight(result) ? [summarizeConversation(result.right)] : []))
  const malformedCount = decoded.length - valid.length
  return malformedCount === 0
    ? Effect.succeed(valid)
    : diagnostics
        .warnAgent({
          code: SupportStatusMetadataDegradedWarningCode,
          message: NonEmptyString.make(
            `Skipped ${malformedCount} malformed private support-status record${malformedCount === 1 ? "" : "s"}; no provider identifiers were logged.`
          )
        })
        .pipe(Effect.as(valid))
}

const summarizeSystem = (system: SupportSystemProjection): SupportSystemSummary => ({
  id: system._id,
  name: system.name
})

const classifySetup = (systems: ReadonlyArray<SupportSystemSummary>): SupportSetup => {
  const first = systems[0]
  if (first === undefined) return { status: "missing" }
  if (systems.length === 1) return { status: "configured", system: first }
  return { status: "ambiguous", systems }
}

const summarizeConversation = (conversation: SupportConversationProjection): SupportStatusRecord => ({
  recordId: conversation._id,
  providerConversationId: conversation.conversationId,
  storedHasUnreadMessages: conversation.hasUnreadMessages,
  modifiedOn: conversation.modifiedOn
})

export const getSupportStatus = (
  _params: GetSupportStatusParams
): Effect.Effect<GetSupportStatusResult, HulyClientError | HulyError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const modelAvailable = yield* hasSupportModel(client)
    if (!modelAvailable) {
      yield* warnModelUnavailable(diagnostics)
      return {
        supported: false,
        unsupportedReasonCode: "model-unavailable",
        unsupportedReason: SUPPORT_MODEL_UNAVAILABLE_REASON
      }
    }
    const caller = client.getPrimarySocialId()
    const callerSpace = toRef<Space>(NonEmptyString.make(String(caller)))
    const rawSystems = yield* client.findAllInModel<SupportSystem>(support.class.SupportSystem, {})
    const rawConversations = yield* client.findAll<SupportConversation>(
      support.class.SupportConversation,
      hulyQuery<SupportConversation>({ space: callerSpace, createdBy: caller })
    )
    const systems = yield* Effect.forEach(rawSystems, parseSystem)
    const statusRecords = yield* parseStatusRecords(diagnostics, rawConversations)
    return { supported: true, setup: classifySetup(systems.map(summarizeSystem)), statusRecords }
  })
