import {
  addOrganizationChannelParamsJsonSchema,
  addOrganizationMemberParamsJsonSchema,
  addPersonChannelParamsJsonSchema,
  createOrganizationParamsJsonSchema,
  createPersonParamsJsonSchema,
  deleteOrganizationParamsJsonSchema,
  deletePersonParamsJsonSchema,
  getOrganizationParamsJsonSchema,
  getPersonParamsJsonSchema,
  listContactChannelProvidersParamsJsonSchema,
  listEmployeesParamsJsonSchema,
  listOrganizationChannelsParamsJsonSchema,
  listOrganizationMembersParamsJsonSchema,
  listOrganizationsParamsJsonSchema,
  listPersonChannelsParamsJsonSchema,
  listPersonOrganizationsParamsJsonSchema,
  listPersonsParamsJsonSchema,
  parseAddOrganizationChannelParams,
  parseAddOrganizationMemberParams,
  parseAddPersonChannelParams,
  parseCreateOrganizationParams,
  parseCreatePersonParams,
  parseDeleteOrganizationParams,
  parseDeletePersonParams,
  parseGetOrganizationParams,
  parseGetPersonParams,
  parseListContactChannelProvidersParams,
  parseListEmployeesParams,
  parseListOrganizationChannelsParams,
  parseListOrganizationMembersParams,
  parseListOrganizationsParams,
  parseListPersonChannelsParams,
  parseListPersonOrganizationsParams,
  parseListPersonsParams,
  parseRemoveOrganizationChannelParams,
  parseRemoveOrganizationMemberParams,
  parseRemovePersonChannelParams,
  parseUpdateOrganizationChannelParams,
  parseUpdateOrganizationParams,
  parseUpdatePersonChannelParams,
  parseUpdatePersonParams,
  removeOrganizationChannelParamsJsonSchema,
  removeOrganizationMemberParamsJsonSchema,
  removePersonChannelParamsJsonSchema,
  updateOrganizationChannelParamsJsonSchema,
  updateOrganizationParamsJsonSchema,
  updatePersonChannelParamsJsonSchema,
  updatePersonParamsJsonSchema
} from "../../domain/schemas.js"
import {
  addPersonChannel,
  listContactChannelProviders,
  listOrganizationChannels,
  listPersonChannels,
  removeOrganizationChannel,
  removePersonChannel,
  updateOrganizationChannel,
  updatePersonChannel
} from "../../huly/operations/contact-channels.js"
import {
  addOrganizationChannel,
  addOrganizationMember,
  createOrganization,
  deleteOrganization,
  getOrganization,
  listOrganizationMembers,
  listOrganizations,
  makeOrganizationCustomer,
  removeOrganizationMember,
  updateOrganization
} from "../../huly/operations/organizations.js"
import {
  createPerson,
  deletePerson,
  getPerson,
  listEmployees,
  listPersonOrganizations,
  listPersons,
  updatePerson
} from "../../huly/operations/persons.js"

import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "contacts" as const

export const contactTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_persons",
    description:
      "List all persons in the Huly workspace. Returns persons sorted by modification date (newest first). Supports searching by name substring (nameSearch) and email substring (emailSearch).",
    category: CATEGORY,
    inputSchema: listPersonsParamsJsonSchema,
    handler: createToolHandler(
      "list_persons",
      parseListPersonsParams,
      listPersons
    )
  },
  {
    name: "get_person",
    description:
      "Retrieve full details for a person including contact channels. Use personId or email to identify the person.",
    category: CATEGORY,
    inputSchema: getPersonParamsJsonSchema,
    handler: createToolHandler(
      "get_person",
      parseGetPersonParams,
      getPerson
    )
  },
  {
    name: "create_person",
    description: "Create a new person in Huly. Returns the created person ID.",
    category: CATEGORY,
    inputSchema: createPersonParamsJsonSchema,
    handler: createToolHandler(
      "create_person",
      parseCreatePersonParams,
      createPerson
    )
  },
  {
    name: "update_person",
    description: "Update fields on an existing person. Only provided fields are modified.",
    category: CATEGORY,
    inputSchema: updatePersonParamsJsonSchema,
    handler: createToolHandler(
      "update_person",
      parseUpdatePersonParams,
      updatePerson
    )
  },
  {
    name: "delete_person",
    description: "Permanently delete a person from Huly. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deletePersonParamsJsonSchema,
    handler: createToolHandler(
      "delete_person",
      parseDeletePersonParams,
      deletePerson
    )
  },
  {
    name: "list_employees",
    description:
      "List employees (persons who are team members). Returns employees sorted by modification date (newest first).",
    category: CATEGORY,
    inputSchema: listEmployeesParamsJsonSchema,
    handler: createToolHandler(
      "list_employees",
      parseListEmployeesParams,
      listEmployees
    )
  },
  {
    name: "list_contact_channel_providers",
    description: "List supported contact channel provider labels for person and organization channel tools.",
    category: CATEGORY,
    inputSchema: listContactChannelProvidersParamsJsonSchema,
    handler: createToolHandler(
      "list_contact_channel_providers",
      parseListContactChannelProvidersParams,
      listContactChannelProviders
    )
  },
  {
    name: "list_person_channels",
    description:
      "List contact channels for a person. Person accepts person ID, exact email address, or exact Huly display name; ambiguous names fail and should be retried with email or person ID.",
    category: CATEGORY,
    inputSchema: listPersonChannelsParamsJsonSchema,
    handler: createToolHandler(
      "list_person_channels",
      parseListPersonChannelsParams,
      listPersonChannels
    )
  },
  {
    name: "add_person_channel",
    description:
      "Idempotently add a contact channel to a person. Person accepts person ID, exact email address, or exact Huly display name. Provider labels match list_contact_channel_providers. Returns added=false and the existing channel when the exact provider+value already exists.",
    category: CATEGORY,
    inputSchema: addPersonChannelParamsJsonSchema,
    handler: createToolHandler(
      "add_person_channel",
      parseAddPersonChannelParams,
      addPersonChannel
    )
  },
  {
    name: "update_person_channel",
    description:
      "Update one contact channel on a person. Person accepts person ID, exact email, or exact display name. Identify the channel with exactly one locator: channelId, or provider plus value. Provide newProvider, newValue, or both. Updating to an existing provider+value on the same person fails with a conflict.",
    category: CATEGORY,
    inputSchema: updatePersonChannelParamsJsonSchema,
    handler: createToolHandler(
      "update_person_channel",
      parseUpdatePersonChannelParams,
      updatePersonChannel
    )
  },
  {
    name: "remove_person_channel",
    description:
      "Remove one contact channel from a person. Person accepts person ID, exact email, or exact display name. Identify the channel with exactly one locator: channelId, or provider plus value. Returns removed=false when the locator is absent for that person.",
    category: CATEGORY,
    inputSchema: removePersonChannelParamsJsonSchema,
    handler: createToolHandler(
      "remove_person_channel",
      parseRemovePersonChannelParams,
      removePersonChannel
    )
  },
  {
    name: "list_organizations",
    description:
      "List all organizations in the Huly workspace. Returns organizations sorted by modification date (newest first).",
    category: CATEGORY,
    inputSchema: listOrganizationsParamsJsonSchema,
    handler: createToolHandler(
      "list_organizations",
      parseListOrganizationsParams,
      listOrganizations
    )
  },
  {
    name: "create_organization",
    description:
      "Create a new organization in Huly. Optionally add members by person ID or email. Fails if any requested member cannot be resolved. Returns the created organization ID.",
    category: CATEGORY,
    inputSchema: createOrganizationParamsJsonSchema,
    handler: createToolHandler(
      "create_organization",
      parseCreateOrganizationParams,
      createOrganization
    )
  },
  {
    name: "get_organization",
    description:
      "Retrieve full details for an organization by ID or exact name when that name is unique - including city, description, member count, and modification timestamp. If multiple organizations share the same name, use the organization ID.",
    category: CATEGORY,
    inputSchema: getOrganizationParamsJsonSchema,
    handler: createToolHandler(
      "get_organization",
      parseGetOrganizationParams,
      getOrganization
    )
  },
  {
    name: "update_organization",
    description:
      "Update fields on an existing organization identified by ID or exact name when that name is unique. Only provided fields are modified. Description supports multi-line plain text and is the right place to store CRM notes / revenue summaries / context. Pass null to clear city or description. If multiple organizations share the same name, use the organization ID.",
    category: CATEGORY,
    inputSchema: updateOrganizationParamsJsonSchema,
    handler: createToolHandler(
      "update_organization",
      parseUpdateOrganizationParams,
      updateOrganization
    )
  },
  {
    name: "delete_organization",
    description:
      "Permanently delete an organization identified by ID or exact name when that name is unique. Use with care - this cannot be undone. Useful for cleaning up duplicate organizations after merging their data elsewhere. If multiple organizations share the same name, use the organization ID.",
    category: CATEGORY,
    inputSchema: deleteOrganizationParamsJsonSchema,
    handler: createToolHandler(
      "delete_organization",
      parseDeleteOrganizationParams,
      deleteOrganization
    )
  },
  {
    name: "make_organization_customer",
    description:
      "Apply the Customer mixin to an organization so it appears in the Huly Leads > Customers view. Idempotent - safe to call on organizations that are already customers. Takes the organization ID or exact name when that name is unique.",
    category: CATEGORY,
    inputSchema: getOrganizationParamsJsonSchema,
    handler: createToolHandler(
      "make_organization_customer",
      parseGetOrganizationParams,
      makeOrganizationCustomer
    )
  },
  {
    name: "add_organization_channel",
    description:
      "Idempotently add a contact channel to an organization identified by ID or exact unique name. Provider labels: email, phone, linkedin, twitter, github, facebook, telegram, homepage, whatsapp, skype, profile, viber. Returns added=false and the existing channel when the exact provider+value already exists.",
    category: CATEGORY,
    inputSchema: addOrganizationChannelParamsJsonSchema,
    handler: createToolHandler(
      "add_organization_channel",
      parseAddOrganizationChannelParams,
      addOrganizationChannel
    )
  },
  {
    name: "list_organization_channels",
    description:
      "List contact channels for an organization identified by ID or exact unique organization name. Returns channelId, provider label, value, and optional activity metadata.",
    category: CATEGORY,
    inputSchema: listOrganizationChannelsParamsJsonSchema,
    handler: createToolHandler(
      "list_organization_channels",
      parseListOrganizationChannelsParams,
      listOrganizationChannels
    )
  },
  {
    name: "update_organization_channel",
    description:
      "Update one contact channel on an organization identified by ID or exact unique name. Identify the channel with exactly one locator: channelId, or provider plus value. Provide newProvider, newValue, or both. Updating to an existing provider+value on the same organization fails with a conflict.",
    category: CATEGORY,
    inputSchema: updateOrganizationChannelParamsJsonSchema,
    handler: createToolHandler(
      "update_organization_channel",
      parseUpdateOrganizationChannelParams,
      updateOrganizationChannel
    )
  },
  {
    name: "remove_organization_channel",
    description:
      "Remove one contact channel from an organization identified by ID or exact unique name. Identify the channel with exactly one locator: channelId, or provider plus value. Returns removed=false when the locator is absent for that organization.",
    category: CATEGORY,
    inputSchema: removeOrganizationChannelParamsJsonSchema,
    handler: createToolHandler(
      "remove_organization_channel",
      parseRemoveOrganizationChannelParams,
      removeOrganizationChannel
    )
  },
  {
    name: "add_organization_member",
    description:
      "Link a person as a member of an organization. The person appears under the org's Members tab in Huly. Use person ID or email to identify the person. Idempotent: returns added=false if that person is already a member.",
    category: CATEGORY,
    inputSchema: addOrganizationMemberParamsJsonSchema,
    handler: createToolHandler(
      "add_organization_member",
      parseAddOrganizationMemberParams,
      addOrganizationMember
    )
  },
  {
    name: "list_organization_members",
    description:
      "List all persons who are members of an organization. Returns each member's person ID, name, and primary email (if any). When using a name instead of an ID, that name must identify exactly one organization.",
    category: CATEGORY,
    inputSchema: listOrganizationMembersParamsJsonSchema,
    handler: createToolHandler(
      "list_organization_members",
      parseListOrganizationMembersParams,
      listOrganizationMembers
    )
  },
  {
    name: "list_person_organizations",
    description:
      "List all organizations that a person is a member of. Provide personId or email. Returns each organization's ID and name.",
    category: CATEGORY,
    inputSchema: listPersonOrganizationsParamsJsonSchema,
    handler: createToolHandler(
      "list_person_organizations",
      parseListPersonOrganizationsParams,
      listPersonOrganizations
    )
  },
  {
    name: "remove_organization_member",
    description:
      "Unlink a person from an organization's members. Reverses add_organization_member. Returns removed: false if the person was not a member. When using an organization name instead of an ID, that name must identify exactly one organization.",
    category: CATEGORY,
    inputSchema: removeOrganizationMemberParamsJsonSchema,
    handler: createToolHandler(
      "remove_organization_member",
      parseRemoveOrganizationMemberParams,
      removeOrganizationMember
    )
  }
]
