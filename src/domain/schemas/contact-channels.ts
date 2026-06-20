import { JSONSchema, Schema } from "effect"

import {
  ChannelId,
  Count,
  Email,
  EmptyParamsSchema,
  enumValuesDescription,
  hasAtLeastOneDefined,
  NonEmptyString,
  OrganizationId,
  PersonId,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

const CHANNEL_UPDATE_FIELDS = ["newProvider", "newValue"] as const

export const ContactChannelProviderValues = [
  "email",
  "phone",
  "linkedin",
  "twitter",
  "github",
  "facebook",
  "telegram",
  "homepage",
  "whatsapp",
  "skype",
  "profile",
  "viber"
] as const

export type ContactChannelProvider = typeof ContactChannelProviderValues[number]

export const ContactChannelProviderSdkKeys = {
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  twitter: "Twitter",
  github: "GitHub",
  facebook: "Facebook",
  telegram: "Telegram",
  homepage: "Homepage",
  whatsapp: "Whatsapp",
  skype: "Skype",
  profile: "Profile",
  viber: "Viber"
} as const satisfies Record<ContactChannelProvider, string>

export const ContactChannelProviderSchema = Schema.Literal(...ContactChannelProviderValues)

export const ContactChannelSummarySchema = Schema.Struct({
  channelId: ChannelId,
  provider: ContactChannelProviderSchema,
  value: NonEmptyString,
  items: Schema.optional(Count),
  lastMessage: Schema.optional(Timestamp)
})
export type ContactChannelSummary = Schema.Schema.Type<typeof ContactChannelSummarySchema>

export const ListContactChannelProvidersParamsSchema = EmptyParamsSchema.annotations({
  title: "ListContactChannelProvidersParams",
  description: "Parameters for listing supported contact channel provider labels."
})

export type ListContactChannelProvidersParams = Schema.Schema.Type<typeof ListContactChannelProvidersParamsSchema>

const providerDescription = `Channel provider label: ${enumValuesDescription(ContactChannelProviderValues)}.`

const validateEmailChannelValue = (provider: ContactChannelProvider, value: string): string | undefined =>
  provider === "email" && !Schema.is(Email)(value)
    ? "email provider values must be valid email addresses."
    : undefined

const ChannelProviderValueSchema = Schema.Struct({
  provider: ContactChannelProviderSchema.annotations({ description: providerDescription }),
  value: NonEmptyString.annotations({
    description: "Channel value. Email providers require a valid email address; all other providers require text."
  })
}).pipe(Schema.filter((params) => validateEmailChannelValue(params.provider, params.value)))

const hasProviderValueLocator = (params: {
  readonly provider?: ContactChannelProvider | undefined
  readonly value?: string | undefined
}): boolean => params.provider !== undefined && params.value !== undefined

const channelLocatorMessage = "Provide exactly one channel locator: channelId, or provider plus value."

const validateChannelLocator = (params: {
  readonly channelId?: ChannelId | undefined
  readonly provider?: ContactChannelProvider | undefined
  readonly value?: string | undefined
}): string | undefined => {
  const hasChannelId = params.channelId !== undefined
  const hasAnyProviderValue = params.provider !== undefined || params.value !== undefined
  const hasProviderValue = hasProviderValueLocator(params)
  if (hasChannelId && !hasAnyProviderValue) return undefined
  if (!hasChannelId && hasProviderValue) return undefined
  return channelLocatorMessage
}

const updateTargetValueMessage = "At least one update field must be provided: newProvider, newValue."

const validateUpdateTargetValue = (params: {
  readonly provider?: ContactChannelProvider | undefined
  readonly value?: string | undefined
  readonly newProvider?: ContactChannelProvider | undefined
  readonly newValue?: string | undefined
}): string | undefined => {
  if (!hasAtLeastOneDefined(params, CHANNEL_UPDATE_FIELDS)) return updateTargetValueMessage

  const targetProvider = params.newProvider ?? params.provider
  const targetValue = params.newValue ?? params.value
  return targetProvider !== undefined && targetValue !== undefined
    ? validateEmailChannelValue(targetProvider, targetValue)
    : undefined
}

const ContactChannelLocatorFieldsSchema = Schema.Struct({
  channelId: Schema.optional(ChannelId.annotations({
    description: "Raw channel document ID returned by list/get/add channel tools."
  })),
  provider: Schema.optional(ContactChannelProviderSchema.annotations({ description: providerDescription })),
  value: Schema.optional(NonEmptyString.annotations({
    description: "Existing channel value to pair with provider when channelId is not used."
  }))
}).pipe(
  Schema.filter((params) =>
    params.provider !== undefined && params.value !== undefined
      ? validateEmailChannelValue(params.provider, params.value)
      : undefined
  ),
  Schema.filter(validateChannelLocator)
)

export const AddPersonChannelParamsSchema = ChannelProviderValueSchema.pipe(
  Schema.extend(Schema.Struct({
    person: NonEmptyString.annotations({
      description: "Person ID, exact email address, or exact Huly display name."
    })
  }))
).annotations({
  title: "AddPersonChannelParams",
  description: "Add a contact channel to a person. Idempotent by exact provider plus value."
})

export type AddPersonChannelParams = Schema.Schema.Type<typeof AddPersonChannelParamsSchema>

export const ListPersonChannelsParamsSchema = Schema.Struct({
  person: NonEmptyString.annotations({
    description: "Person ID, exact email address, or exact Huly display name."
  })
}).annotations({
  title: "ListPersonChannelsParams",
  description: "List contact channels for a person."
})

export type ListPersonChannelsParams = Schema.Schema.Type<typeof ListPersonChannelsParamsSchema>

export const UpdatePersonChannelParamsSchema = ContactChannelLocatorFieldsSchema.pipe(
  Schema.extend(Schema.Struct({
    person: NonEmptyString.annotations({
      description: "Person ID, exact email address, or exact Huly display name."
    }),
    newProvider: Schema.optional(ContactChannelProviderSchema.annotations({ description: providerDescription })),
    newValue: Schema.optional(NonEmptyString.annotations({ description: "Replacement channel value." }))
  })),
  Schema.filter(validateUpdateTargetValue)
).annotations({
  title: "UpdatePersonChannelParams",
  description: `Update one contact channel on a person. ${channelLocatorMessage} ${updateTargetValueMessage}`
})

export type UpdatePersonChannelParams = Schema.Schema.Type<typeof UpdatePersonChannelParamsSchema>

export const RemovePersonChannelParamsSchema = ContactChannelLocatorFieldsSchema.pipe(
  Schema.extend(Schema.Struct({
    person: NonEmptyString.annotations({
      description: "Person ID, exact email address, or exact Huly display name."
    })
  }))
).annotations({
  title: "RemovePersonChannelParams",
  description: `Remove one contact channel from a person. ${channelLocatorMessage}`
})

export type RemovePersonChannelParams = Schema.Schema.Type<typeof RemovePersonChannelParamsSchema>

export const ListOrganizationChannelsParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotations({
    description: "Organization ID or exact unique organization name."
  })
}).annotations({
  title: "ListOrganizationChannelsParams",
  description: "List contact channels for an organization."
})

export type ListOrganizationChannelsParams = Schema.Schema.Type<typeof ListOrganizationChannelsParamsSchema>

export const AddOrganizationChannelParamsSchema = ChannelProviderValueSchema.pipe(
  Schema.extend(Schema.Struct({
    organizationId: NonEmptyString.annotations({
      description: "Organization ID or exact unique organization name."
    })
  }))
).annotations({
  title: "AddOrganizationChannelParams",
  description: "Add a contact channel to an organization. Idempotent by exact provider plus value."
})

export type AddOrganizationChannelParams = Schema.Schema.Type<typeof AddOrganizationChannelParamsSchema>

export const UpdateOrganizationChannelParamsSchema = ContactChannelLocatorFieldsSchema.pipe(
  Schema.extend(Schema.Struct({
    organizationId: NonEmptyString.annotations({
      description: "Organization ID or exact unique organization name."
    }),
    newProvider: Schema.optional(ContactChannelProviderSchema.annotations({ description: providerDescription })),
    newValue: Schema.optional(NonEmptyString.annotations({ description: "Replacement channel value." }))
  })),
  Schema.filter(validateUpdateTargetValue)
).annotations({
  title: "UpdateOrganizationChannelParams",
  description: `Update one contact channel on an organization. ${channelLocatorMessage} ${updateTargetValueMessage}`
})

export type UpdateOrganizationChannelParams = Schema.Schema.Type<typeof UpdateOrganizationChannelParamsSchema>

export const RemoveOrganizationChannelParamsSchema = ContactChannelLocatorFieldsSchema.pipe(
  Schema.extend(Schema.Struct({
    organizationId: NonEmptyString.annotations({
      description: "Organization ID or exact unique organization name."
    })
  }))
).annotations({
  title: "RemoveOrganizationChannelParams",
  description: `Remove one contact channel from an organization. ${channelLocatorMessage}`
})

export type RemoveOrganizationChannelParams = Schema.Schema.Type<typeof RemoveOrganizationChannelParamsSchema>
export const AddPersonChannelResultSchema = Schema.Struct({
  personId: PersonId,
  added: Schema.Boolean,
  channel: ContactChannelSummarySchema
})
export type AddPersonChannelResult = Schema.Schema.Type<typeof AddPersonChannelResultSchema>
export const ListPersonChannelsResultSchema = Schema.Struct({
  personId: PersonId,
  channels: Schema.Array(ContactChannelSummarySchema)
})
export type ListPersonChannelsResult = Schema.Schema.Type<typeof ListPersonChannelsResultSchema>
export const UpdatePersonChannelResultSchema = Schema.Struct({
  personId: PersonId,
  updated: Schema.Boolean,
  channel: ContactChannelSummarySchema
})
export type UpdatePersonChannelResult = Schema.Schema.Type<typeof UpdatePersonChannelResultSchema>
export const RemovePersonChannelResultSchema = Schema.Struct({
  personId: PersonId,
  removed: Schema.Boolean,
  channelId: Schema.optional(ChannelId)
})
export type RemovePersonChannelResult = Schema.Schema.Type<typeof RemovePersonChannelResultSchema>
export const AddOrganizationChannelResultSchema = Schema.Struct({
  id: OrganizationId,
  added: Schema.Boolean,
  channel: ContactChannelSummarySchema
})
export type AddOrganizationChannelResult = Schema.Schema.Type<typeof AddOrganizationChannelResultSchema>
export const ListOrganizationChannelsResultSchema = Schema.Struct({
  organizationId: OrganizationId,
  channels: Schema.Array(ContactChannelSummarySchema)
})
export type ListOrganizationChannelsResult = Schema.Schema.Type<typeof ListOrganizationChannelsResultSchema>
export const UpdateOrganizationChannelResultSchema = Schema.Struct({
  organizationId: OrganizationId,
  updated: Schema.Boolean,
  channel: ContactChannelSummarySchema
})
export type UpdateOrganizationChannelResult = Schema.Schema.Type<typeof UpdateOrganizationChannelResultSchema>
export const RemoveOrganizationChannelResultSchema = Schema.Struct({
  organizationId: OrganizationId,
  removed: Schema.Boolean,
  channelId: Schema.optional(ChannelId)
})
export type RemoveOrganizationChannelResult = Schema.Schema.Type<typeof RemoveOrganizationChannelResultSchema>

export const addPersonChannelParamsJsonSchema = JSONSchema.make(AddPersonChannelParamsSchema)
export const listContactChannelProvidersParamsJsonSchema = JSONSchema.make(ListContactChannelProvidersParamsSchema)
export const listPersonChannelsParamsJsonSchema = JSONSchema.make(ListPersonChannelsParamsSchema)
export const updatePersonChannelParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdatePersonChannelParamsSchema),
  CHANNEL_UPDATE_FIELDS
)
export const removePersonChannelParamsJsonSchema = JSONSchema.make(RemovePersonChannelParamsSchema)
export const addOrganizationChannelParamsJsonSchema = JSONSchema.make(AddOrganizationChannelParamsSchema)
export const listOrganizationChannelsParamsJsonSchema = JSONSchema.make(ListOrganizationChannelsParamsSchema)
export const updateOrganizationChannelParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateOrganizationChannelParamsSchema),
  CHANNEL_UPDATE_FIELDS
)
export const removeOrganizationChannelParamsJsonSchema = JSONSchema.make(RemoveOrganizationChannelParamsSchema)

export const parseAddPersonChannelParams = Schema.decodeUnknown(AddPersonChannelParamsSchema)
export const parseListContactChannelProvidersParams = Schema.decodeUnknown(ListContactChannelProvidersParamsSchema)
export const parseListPersonChannelsParams = Schema.decodeUnknown(ListPersonChannelsParamsSchema)
export const parseUpdatePersonChannelParams = Schema.decodeUnknown(UpdatePersonChannelParamsSchema)
export const parseRemovePersonChannelParams = Schema.decodeUnknown(RemovePersonChannelParamsSchema)
export const parseAddOrganizationChannelParams = Schema.decodeUnknown(AddOrganizationChannelParamsSchema)
export const parseListOrganizationChannelsParams = Schema.decodeUnknown(ListOrganizationChannelsParamsSchema)
export const parseUpdateOrganizationChannelParams = Schema.decodeUnknown(UpdateOrganizationChannelParamsSchema)
export const parseRemoveOrganizationChannelParams = Schema.decodeUnknown(RemoveOrganizationChannelParamsSchema)

export const ListContactChannelProvidersResultSchema = Schema.Array(ContactChannelProviderSchema)
