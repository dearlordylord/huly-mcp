/**
 * Lead plugin class references.
 *
 * @hcengineering/lead is not published on npm, so we define the class IDs
 * as string literals matching the Huly platform source.
 *
 * These are stable internal identifiers from:
 * https://github.com/hcengineering/platform/tree/main/models/lead
 *
 * @module
 */
import type { Class, Doc, Ref } from "@hcengineering/core"

/* eslint-disable no-restricted-syntax -- SDK boundary: lead plugin is not published on npm, string literal class refs required */
export const leadClassIds = {
  class: {
    Lead: "lead:class:Lead" as Ref<Class<Doc>>,
    Funnel: "lead:class:Funnel" as Ref<Class<Doc>>
  },
  mixin: {
    Customer: "lead:mixin:Customer" as Ref<Class<Doc>>
  }
} as const
/* eslint-enable no-restricted-syntax */
