/**
 * Shared channel-lookup helper.
 *
 * Extracted from channels.ts so channel-messages-shared.ts (and other channel
 * operation modules) can resolve a channel without importing channels.ts, which
 * would form an import cycle (channels → channels-messages → channel-messages-shared).
 *
 * @module
 */
import type { Channel as HulyChannel } from "@hcengineering/chunter"
import { Effect } from "effect"

import { HulyClient, type HulyClientError } from "../client.js"
import { ChannelNotFoundError } from "../errors.js"
import { findByNameOrId } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { chunter } from "../huly-plugins.js"

export const findChannel = (
  identifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; channel: HulyChannel },
  ChannelNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const channel = yield* findByNameOrId(
      client,
      chunter.class.Channel,
      { name: identifier },
      { _id: toRef<HulyChannel>(identifier) }
    )

    if (channel === undefined) {
      return yield* new ChannelNotFoundError({ identifier })
    }

    return { client, channel }
  })
