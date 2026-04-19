import {
  addOrganizationChannelParamsJsonSchema,
  addOrganizationMemberParamsJsonSchema,
  createOrganizationParamsJsonSchema,
  createPersonParamsJsonSchema,
  deleteOrganizationParamsJsonSchema,
  deletePersonParamsJsonSchema,
  getOrganizationParamsJsonSchema,
  getPersonParamsJsonSchema,
  listEmployeesParamsJsonSchema,
  listOrganizationMembersParamsJsonSchema,
  listOrganizationsParamsJsonSchema,
  listPersonOrganizationsParamsJsonSchema,
  listPersonsParamsJsonSchema,
  parseAddOrganizationChannelParams,
  parseAddOrganizationMemberParams,
  parseCreateOrganizationParams,
  parseCreatePersonParams,
  parseDeleteOrganizationParams,
  parseDeletePersonParams,
  parseGetOrganizationParams,
  parseGetPersonParams,
  parseListEmployeesParams,
  parseListOrganizationMembersParams,
  parseListOrganizationsParams,
  parseListPersonOrganizationsParams,
  parseListPersonsParams,
  parseRemoveOrganizationMemberParams,
  parseUpdateOrganizationParams,
  parseUpdatePersonParams,
  removeOrganizationMemberParamsJsonSchema,
  updateOrganizationParamsJsonSchema,
  updatePersonParamsJsonSchema
} from "../../domain/schemas.js"
import {
  addOrganizationChannel,
  addOrganizationMember,
  createOrganization,
  createPerson,
  deleteOrganization,
  deletePerson,
  getOrganization,
  getPerson,
  listEmployees,
  listOrganizationMembers,
  listOrganizations,
  listPersonOrganizations,
  listPersons,
  makeOrganizationCustomer,
  removeOrganizationMember,
  updateOrganization,
  updatePerson
} from "../../huly/operations/contacts.js"

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
      "Create a new organization in Huly. Optionally add members by person ID or email. Returns the created organization ID.",
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
      "Retrieve full details for an organization by ID or exact name - including city, description, member count, and modification timestamp.",
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
      "Update fields on an existing organization identified by ID or exact name. Only provided fields are modified. Description supports multi-line plain text and is the right place to store CRM notes / revenue summaries / context. Pass null to clear city or description.",
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
      "Permanently delete an organization identified by ID or exact name. Use with care - this cannot be undone. Useful for cleaning up duplicate organizations after merging their data elsewhere.",
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
      "Apply the Customer mixin to an organization so it appears in the Huly Leads > Customers view. Idempotent - safe to call on organizations that are already customers. Takes the organization ID or exact name.",
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
      "Add a contact channel (phone, email, website/homepage, LinkedIn, Twitter, GitHub, Facebook, Telegram) to an organization. Provider names: email, phone, linkedin, twitter, github, facebook, telegram, homepage.",
    category: CATEGORY,
    inputSchema: addOrganizationChannelParamsJsonSchema,
    handler: createToolHandler(
      "add_organization_channel",
      parseAddOrganizationChannelParams,
      addOrganizationChannel
    )
  },
  {
    name: "add_organization_member",
    description:
      "Link a person as a member of an organization. The person appears under the org's Members tab in Huly. Use person ID or email to identify the person.",
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
      "List all persons who are members of an organization. Returns each member's person ID, name, and primary email (if any).",
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
      "Unlink a person from an organization's members. Reverses add_organization_member. Returns removed: false if the person was not a member.",
    category: CATEGORY,
    inputSchema: removeOrganizationMemberParamsJsonSchema,
    handler: createToolHandler(
      "remove_organization_member",
      parseRemoveOrganizationMemberParams,
      removeOrganizationMember
    )
  }
]
