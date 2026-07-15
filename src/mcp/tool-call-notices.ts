import type { SanitizedHulyRuntimeConfigContext } from "../config/config.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import {
  HOSTED_HULY_MIGRATION_INSTRUCTIONS,
  HOSTED_HULY_MIGRATION_WARNING,
  type HostedHulyMigrationInstructions,
  isDefaultHulyCloudOrigin,
  normalizeHulyOrigin
} from "../huly/unavailable-diagnostics.js"

type HostedHulyMigrationNoticeDelivery = "once" | "always"
type SanitizedHulyOrigin = SanitizedHulyRuntimeConfigContext["huly"]["url"]["origin"]
type PersistentNoticeState = "pending" | "claimed" | "delivered"

export type ToolCallNoticeClaim =
  | { readonly _tag: "None" }
  | {
    readonly _tag: "Claimed"
    readonly warning: ToolWarning
    readonly delivered: () => void
    readonly release: () => void
  }

export interface ToolCallNoticeProvider {
  readonly claim: () => ToolCallNoticeClaim
}

interface HostedHulyMigrationNoticeConfig {
  readonly delivery: HostedHulyMigrationNoticeDelivery
  readonly hulyOrigin: SanitizedHulyOrigin
}

const noNoticeClaim: ToolCallNoticeClaim = { _tag: "None" }

export const noToolCallNoticeProvider: ToolCallNoticeProvider = {
  claim: () => noNoticeClaim
}

const isHostedHulyOrigin = (origin: SanitizedHulyOrigin): boolean =>
  origin !== undefined && isDefaultHulyCloudOrigin(normalizeHulyOrigin(origin))

export const hostedHulyMigrationInstructionsForOrigin = (
  origin: SanitizedHulyOrigin
): HostedHulyMigrationInstructions | undefined =>
  isHostedHulyOrigin(origin) ? HOSTED_HULY_MIGRATION_INSTRUCTIONS : undefined

const alwaysNoticeProvider = (): ToolCallNoticeProvider => ({
  claim: () => ({
    _tag: "Claimed",
    warning: HOSTED_HULY_MIGRATION_WARNING,
    delivered: () => {},
    release: () => {}
  })
})

const onceNoticeProvider = (): ToolCallNoticeProvider => {
  let state: PersistentNoticeState = "pending"

  return {
    claim: () => {
      if (state !== "pending") return noNoticeClaim
      state = "claimed"
      return {
        _tag: "Claimed",
        warning: HOSTED_HULY_MIGRATION_WARNING,
        delivered: () => {
          if (state === "claimed") state = "delivered"
        },
        release: () => {
          if (state === "claimed") state = "pending"
        }
      }
    }
  }
}

export const createHostedHulyMigrationNoticeProvider = (
  config: HostedHulyMigrationNoticeConfig
): ToolCallNoticeProvider => {
  if (hostedHulyMigrationInstructionsForOrigin(config.hulyOrigin) === undefined) return noToolCallNoticeProvider
  return config.delivery === "always" ? alwaysNoticeProvider() : onceNoticeProvider()
}
