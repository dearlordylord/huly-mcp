import { JSONSchema, Schema } from "effect"

import {
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ListTotal,
  NonEmptyString,
  ProjectIdentifier,
  SpaceId,
  Timestamp
} from "./shared.js"

export const ProjectTargetPreferenceId = DocId.pipe(Schema.brand("ProjectTargetPreferenceId"))
export type ProjectTargetPreferenceId = Schema.Schema.Type<typeof ProjectTargetPreferenceId>

export const TrackerPreferencePropertyKey = NonEmptyString.pipe(Schema.brand("TrackerPreferencePropertyKey"))
export type TrackerPreferencePropertyKey = Schema.Schema.Type<typeof TrackerPreferencePropertyKey>

const ProjectTargetPreferencePropertyValueSchema = Schema.Unknown.annotations({
  jsonSchema: {
    description: "SDK-open target preference property value. Passed through to Huly without narrowing.",
    anyOf: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" },
      { type: "object", additionalProperties: true },
      { type: "array", items: {} },
      { type: "null" }
    ]
  }
})

export const ProjectTargetPreferencePropertySchema = Schema.Struct({
  key: TrackerPreferencePropertyKey.annotations({
    description: "Low-level tracker target preference property key. Huly stores arbitrary preference keys here."
  }),
  value: ProjectTargetPreferencePropertyValueSchema
}).annotations({
  title: "ProjectTargetPreferenceProperty",
  description: "One SDK-open low-level ProjectTargetPreference props entry."
})
export type ProjectTargetPreferenceProperty = Schema.Schema.Type<typeof ProjectTargetPreferencePropertySchema>

export const ListProjectTargetPreferencesParamsSchema = Schema.Struct({
  project: Schema.optional(ProjectIdentifier.annotations({
    description:
      "Optional project identifier. Omit to list recent low-level project target preference records across projects."
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of preferences to return (default: ${DEFAULT_LIMIT}).`
    })
  )
}).annotations({
  title: "ListProjectTargetPreferencesParams",
  description: "List low-level Huly tracker ProjectTargetPreference records, sorted by most recently used."
})
export type ListProjectTargetPreferencesParams = Schema.Schema.Type<typeof ListProjectTargetPreferencesParamsSchema>

export const UpsertProjectTargetPreferenceParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier whose low-level ProjectTargetPreference record should be created or updated."
  }),
  props: Schema.optional(
    Schema.Array(ProjectTargetPreferencePropertySchema).annotations({
      description:
        "Optional SDK-open target preference props to merge by key. Existing keys are replaced; other existing props are preserved."
    })
  )
}).annotations({
  title: "UpsertProjectTargetPreferenceParams",
  description:
    "Create or update the low-level ProjectTargetPreference record for a project. The operation always refreshes usedOn from Effect.Clock."
})
export type UpsertProjectTargetPreferenceParams = Schema.Schema.Type<typeof UpsertProjectTargetPreferenceParamsSchema>

export const ProjectTargetPreferenceSchema = Schema.Struct({
  preferenceId: ProjectTargetPreferenceId,
  attachedTo: SpaceId.annotations({
    description: "Raw project space ID stored in low-level ProjectTargetPreference.attachedTo."
  }),
  project: Schema.optional(ProjectIdentifier),
  usedOn: Timestamp,
  props: Schema.Array(ProjectTargetPreferencePropertySchema)
}).annotations({
  title: "ProjectTargetPreference",
  description:
    "Low-level Huly tracker ProjectTargetPreference record used by tracker UI/workflows to remember target-related preference props."
})
export type ProjectTargetPreference = Schema.Schema.Type<typeof ProjectTargetPreferenceSchema>
export const ListProjectTargetPreferencesResultSchema = Schema.Struct({
  preferences: Schema.Array(ProjectTargetPreferenceSchema),
  total: ListTotal
})
export type ListProjectTargetPreferencesResult = Schema.Schema.Type<typeof ListProjectTargetPreferencesResultSchema>
export const UpsertProjectTargetPreferenceResultSchema = Schema.Struct({
  preference: ProjectTargetPreferenceSchema,
  created: Schema.Boolean
})
export type UpsertProjectTargetPreferenceResult = Schema.Schema.Type<typeof UpsertProjectTargetPreferenceResultSchema>

export const listProjectTargetPreferencesParamsJsonSchema = JSONSchema.make(ListProjectTargetPreferencesParamsSchema)
export const upsertProjectTargetPreferenceParamsJsonSchema = JSONSchema.make(UpsertProjectTargetPreferenceParamsSchema)

export const parseListProjectTargetPreferencesParams = Schema.decodeUnknown(ListProjectTargetPreferencesParamsSchema)
export const parseUpsertProjectTargetPreferenceParams = Schema.decodeUnknown(UpsertProjectTargetPreferenceParamsSchema)
