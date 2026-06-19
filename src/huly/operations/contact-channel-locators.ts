import { Effect, Schema } from "effect"

import type { ContactChannelProvider } from "../../domain/schemas/contact-channels.js"
import { ChannelId, Email } from "../../domain/schemas/shared.js"
import { NoUpdateFieldsError } from "../errors-base.js"
import { InvalidContactChannelLocatorError, InvalidContactChannelValueError } from "../errors.js"

export interface ChannelLocator {
  readonly channelId?: string | undefined
  readonly provider?: ContactChannelProvider | undefined
  readonly value?: string | undefined
}

export interface ChannelMutationParams extends ChannelLocator {
  readonly newProvider?: ContactChannelProvider | undefined
  readonly newValue?: string | undefined
}

export type ResolvedChannelLocator =
  | {
    readonly _tag: "channelId"
    readonly channelId: ChannelId
  }
  | {
    readonly _tag: "providerValue"
    readonly provider: ContactChannelProvider
    readonly value: string
  }

export const channelIdentifier = (locator: ResolvedChannelLocator): string =>
  locator._tag === "channelId" ? locator.channelId : `${locator.provider}:${locator.value}`

const INVALID_CHANNEL_LOCATOR_REASON = "provide exactly one channel locator: channelId, or provider plus value"

export const validateProviderValue = (
  provider: ContactChannelProvider,
  value: string
): Effect.Effect<void, InvalidContactChannelValueError> =>
  value.length === 0 || (provider === "email" && !Schema.is(Email)(value))
    ? Effect.fail(new InvalidContactChannelValueError({ provider, value }))
    : Effect.void

export const validateChannelLocator = (
  ownerIdentifier: string,
  locator: ChannelLocator
): Effect.Effect<ResolvedChannelLocator, InvalidContactChannelLocatorError | InvalidContactChannelValueError> =>
  Effect.gen(function*() {
    const hasChannelId = locator.channelId !== undefined
    const hasProvider = locator.provider !== undefined
    const hasValue = locator.value !== undefined

    if (hasChannelId && !hasProvider && !hasValue) {
      return { _tag: "channelId", channelId: ChannelId.make(locator.channelId) }
    }
    if (!hasChannelId && hasProvider && hasValue) {
      yield* validateProviderValue(locator.provider, locator.value)
      return { _tag: "providerValue", provider: locator.provider, value: locator.value }
    }
    return yield* new InvalidContactChannelLocatorError({
      ownerIdentifier,
      reason: INVALID_CHANNEL_LOCATOR_REASON
    })
  })

export const requireChannelUpdateFields = (
  params: ChannelMutationParams
): Effect.Effect<void, NoUpdateFieldsError> =>
  params.newProvider === undefined && params.newValue === undefined
    ? Effect.fail(new NoUpdateFieldsError({ operation: "update_contact_channel", fields: ["newProvider", "newValue"] }))
    : Effect.void
