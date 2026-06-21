import { JSONSchema, Schema } from "effect"

import { optionalOutput } from "./output-helpers.js"
import {
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ListTotal,
  ObjectClassName,
  SpaceClassFilter,
  SpaceId,
  SpaceIdentifier,
  SpaceTypeId
} from "./shared.js"
import { SpaceSummarySchema } from "./spaces.js"

export const SpacePreferenceId = DocId.pipe(Schema.brand("SpacePreferenceId"))
export type SpacePreferenceId = Schema.Schema.Type<typeof SpacePreferenceId>

const spaceResolverOptionsRequireSpace = "includeArchived, class, and type can only be provided when space is provided."

export const ListSpacePreferencesParamsSchema = Schema.Struct({
  space: Schema.optional(SpaceIdentifier.annotations({
    description:
      "Optional space _id or exact space name whose low-level SpacePreference record should be listed. Resolution tries _id first, then exact name."
  })),
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description:
      "Allow matching archived spaces by exact name when space is provided. ID lookup can return archived spaces."
  })),
  class: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly space class ID used to disambiguate exact-name lookup when space is provided."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup when space is provided."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of space preferences to return (default: ${DEFAULT_LIMIT}).`
  }))
}).pipe(
  Schema.filter((params) =>
    params.space !== undefined || (
        params.includeArchived === undefined && params.class === undefined && params.type === undefined
      )
      ? undefined
      : spaceResolverOptionsRequireSpace
  )
).annotations({
  title: "ListSpacePreferencesParams",
  description:
    "List low-level Huly SpacePreference records. These records are generic space-attached preference markers; module-specific preference payloads remain exposed through module-specific tools."
})
export type ListSpacePreferencesParams = Schema.Schema.Type<typeof ListSpacePreferencesParamsSchema>

export const GetSpacePreferenceParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotations({
    description:
      "Space _id or exact space name whose low-level SpacePreference record should be read. Resolution tries _id first, then exact name."
  }),
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: "Allow matching archived spaces by exact name. ID lookup can return archived spaces."
  })),
  class: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup."
  }))
}).annotations({
  title: "GetSpacePreferenceParams",
  description:
    "Read the low-level Huly SpacePreference record attached to one space. Absence is returned as present=false."
})
export type GetSpacePreferenceParams = Schema.Schema.Type<typeof GetSpacePreferenceParamsSchema>

export const SpacePreferenceSchema = Schema.Struct({
  preferenceId: SpacePreferenceId,
  attachedTo: SpaceId.annotations({
    description: "Raw Huly space ID stored in SpacePreference.attachedTo."
  }),
  attachedSpace: optionalOutput(SpaceSummarySchema),
  class: ObjectClassName.annotations({
    description: "Raw Huly class ID for the returned preference document."
  })
}).annotations({
  title: "SpacePreference",
  description:
    "Low-level Huly SpacePreference row attached to a space. The published SDK model exposes no safe generic writable preference fields beyond attachedTo."
})
export type SpacePreference = Schema.Schema.Type<typeof SpacePreferenceSchema>

export const ListSpacePreferencesResultSchema = Schema.Struct({
  preferences: Schema.Array(SpacePreferenceSchema),
  total: ListTotal
})
export type ListSpacePreferencesResult = Schema.Schema.Type<typeof ListSpacePreferencesResultSchema>

export const GetSpacePreferenceResultSchema = Schema.Union(
  Schema.Struct({
    present: Schema.Literal(true),
    preference: SpacePreferenceSchema
  }),
  Schema.Struct({
    present: Schema.Literal(false),
    attachedTo: SpaceId,
    attachedSpace: SpaceSummarySchema
  })
)
export type GetSpacePreferenceResult = Schema.Schema.Type<typeof GetSpacePreferenceResultSchema>

export const listSpacePreferencesParamsJsonSchema = JSONSchema.make(ListSpacePreferencesParamsSchema)
export const getSpacePreferenceParamsJsonSchema = JSONSchema.make(GetSpacePreferenceParamsSchema)

export const parseListSpacePreferencesParams = Schema.decodeUnknown(ListSpacePreferencesParamsSchema)
export const parseGetSpacePreferenceParams = Schema.decodeUnknown(GetSpacePreferenceParamsSchema)
