/**
 * Lead plugin class references.
 *
 * Upstream Huly reference:
 * .reference/huly-platform/plugins/lead/src/index.ts
 *
 * `@hcengineering/lead` exists in the Huly monorepo but is not published in the
 * package set used by this project, so we mirror the class and mixin refs here.
 *
 * These are stable internal identifiers from:
 * https://github.com/hcengineering/platform/tree/develop/plugins/lead
 *
 * @module
 */
import type { Class, Doc, Ref } from "@hcengineering/core"

// Lead plugin refs are opaque strings from upstream Huly. There is no published
// runtime factory for these phantom refs, so the bridge lives in one place.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream lead plugin refs are opaque phantom strings without constructors
const leadRef = (identifier: string): Ref<Class<Doc>> => identifier as Ref<Class<Doc>>

export const leadClassIds = {
  class: {
    Lead: leadRef("lead:class:Lead"),
    Funnel: leadRef("lead:class:Funnel")
  },
  mixin: {
    Customer: leadRef("lead:mixin:Customer")
  }
} as const
