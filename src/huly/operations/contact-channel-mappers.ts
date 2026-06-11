import type { Channel } from "@hcengineering/contact"
import { Effect } from "effect"

import type { ContactChannelProvider, ContactChannelSummary } from "../../domain/schemas/contact-channels.js"
import { ChannelId, Count, Timestamp } from "../../domain/schemas/shared.js"
import { InvalidContactProviderError } from "../errors.js"
import { fromContactChannelProviderRef } from "./contact-channel-providers.js"

export const channelSummary = (
  channel: Channel
): Effect.Effect<ContactChannelSummary, InvalidContactProviderError> =>
  Effect.gen(function*() {
    const provider = fromContactChannelProviderRef(channel.provider)
    if (provider instanceof InvalidContactProviderError) {
      return yield* provider
    }

    return {
      channelId: ChannelId.make(channel._id),
      provider,
      value: channel.value,
      items: channel.items !== undefined ? Count.make(channel.items) : undefined,
      lastMessage: channel.lastMessage !== undefined ? Timestamp.make(channel.lastMessage) : undefined
    }
  })

export const channelSummaryWithValue = (
  channel: Channel,
  provider: ContactChannelProvider,
  value: string
): ContactChannelSummary => ({
  channelId: ChannelId.make(channel._id),
  provider,
  value,
  items: channel.items !== undefined ? Count.make(channel.items) : undefined,
  lastMessage: channel.lastMessage !== undefined ? Timestamp.make(channel.lastMessage) : undefined
})
