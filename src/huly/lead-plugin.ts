/**
 * Lead plugin class references.
 *
 * Upstream Huly reference:
 * https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/plugins/lead/src/index.ts#L71-L82
 *
 * `@hcengineering/lead` exists in the Huly monorepo but is not published in the
 * package set used by this project, so we mirror the class and mixin refs here.
 *
 * These are stable internal identifiers from the upstream plugin definition.
 *
 * @module
 */
import type { Contact } from "@hcengineering/contact"
import type { Attribute, Class, Doc, Mixin, Ref, Status } from "@hcengineering/core"
import type { Project, ProjectType, ProjectTypeDescriptor, TaskType } from "@hcengineering/task"

// Lead plugin refs are opaque strings from upstream Huly. There is no published
// runtime factory for these phantom refs, so the bridge lives in one place.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream lead plugin refs are opaque phantom strings without constructors
const leadRef = (identifier: string): Ref<Class<Doc>> => identifier as Ref<Class<Doc>>
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream lead document refs are opaque phantom strings without constructors
const leadDocRef = <T extends Doc>(identifier: string): Ref<T> => identifier as Ref<T>
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream lead mixin refs are opaque phantom strings without constructors
const leadMixinRef = <T extends Doc>(identifier: string): Ref<Mixin<T>> => identifier as Ref<Mixin<T>>

export const leadClassIds = {
  class: { Lead: leadRef("lead:class:Lead"), Funnel: leadRef("lead:class:Funnel") },
  mixin: {
    Customer: leadMixinRef<Contact>("lead:mixin:Customer"),
    DefaultFunnelTypeData: leadMixinRef<Project>("lead:mixin:DefaultFunnelTypeData"),
    LeadTypeData: leadMixinRef<Doc>("lead:mixin:LeadTypeData")
  },
  attribute: { State: leadDocRef<Attribute<Status>>("lead:attribute:State") },
  descriptor: { FunnelType: leadDocRef<ProjectTypeDescriptor>("lead:descriptor:FunnelType") },
  taskType: { Lead: leadDocRef<TaskType>("lead:taskType:Lead") },
  template: { DefaultFunnel: leadDocRef<ProjectType>("lead:projectType:DefaultFunnel") }
} as const
