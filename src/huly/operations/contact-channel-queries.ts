import type { Channel } from "@hcengineering/contact"
import { Effect, Option } from "effect"

import type { ContactChannelProvider } from "../../domain/schemas/contact-channels.js"
import type { ChannelId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { contact } from "../huly-plugins.js"
import type { ChannelOwner, ResolvedOwner } from "./contact-channel-owners.js"
import { toContactChannelProviderRef } from "./contact-channel-providers.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export const findChannelsForOwner = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>
): Effect.Effect<Array<Channel>, HulyClientError> =>
  client.findAll<Channel>(
    contact.class.Channel,
    hulyQuery<Channel>({
      attachedTo: owner.id,
      attachedToClass: owner.ownerClass
    })
  )

export const findExactChannels = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  provider: ContactChannelProvider,
  value: string
): Effect.Effect<Array<Channel>, HulyClientError> =>
  client.findAll<Channel>(
    contact.class.Channel,
    hulyQuery<Channel>({
      attachedTo: owner.id,
      attachedToClass: owner.ownerClass,
      provider: toContactChannelProviderRef(provider),
      value
    })
  )

export const findChannelByIdForOwner = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  channelId: ChannelId
): Effect.Effect<Option.Option<Channel>, HulyClientError> =>
  Effect.map(
    client.findOne<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({
        _id: toRef<Channel>(channelId),
        attachedTo: owner.id,
        attachedToClass: owner.ownerClass
      })
    ),
    Option.fromNullable
  )
