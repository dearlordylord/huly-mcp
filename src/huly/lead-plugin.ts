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
