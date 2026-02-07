import {
  createOrganizationParamsJsonSchema,
  createPersonParamsJsonSchema,
  deletePersonParamsJsonSchema,
  getPersonParamsJsonSchema,
  listEmployeesParamsJsonSchema,
  listOrganizationsParamsJsonSchema,
  listPersonsParamsJsonSchema,
  parseCreateOrganizationParams,
  parseCreatePersonParams,
  parseDeletePersonParams,
  parseGetPersonParams,
  parseListEmployeesParams,
  parseListOrganizationsParams,
  parseListPersonsParams,
  parseUpdatePersonParams,
  updatePersonParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createOrganization,
  createPerson,
  deletePerson,
  getPerson,
  listEmployees,
  listOrganizations,
  listPersons,
  updatePerson
} from "../../huly/operations/contacts.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

export const contactTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_persons",
    description: "List all persons in the Huly workspace. Returns persons sorted by modification date (newest first). Supports searching by name substring (nameSearch) and email substring (emailSearch).",
    inputSchema: listPersonsParamsJsonSchema,
    handler: createToolHandler(
      "list_persons",
      parseListPersonsParams,
      (params) => listPersons(params)
    )
  },
  {
    name: "get_person",
    description:
      "Retrieve full details for a person including contact channels. Use personId or email to identify the person.",
    inputSchema: getPersonParamsJsonSchema,
    handler: createToolHandler(
      "get_person",
      parseGetPersonParams,
      (params) => getPerson(params)
    )
  },
  {
    name: "create_person",
    description: "Create a new person in Huly. Returns the created person ID.",
    inputSchema: createPersonParamsJsonSchema,
    handler: createToolHandler(
      "create_person",
      parseCreatePersonParams,
      (params) => createPerson(params)
    )
  },
  {
    name: "update_person",
    description: "Update fields on an existing person. Only provided fields are modified.",
    inputSchema: updatePersonParamsJsonSchema,
    handler: createToolHandler(
      "update_person",
      parseUpdatePersonParams,
      (params) => updatePerson(params)
    )
  },
  {
    name: "delete_person",
    description: "Permanently delete a person from Huly. This action cannot be undone.",
    inputSchema: deletePersonParamsJsonSchema,
    handler: createToolHandler(
      "delete_person",
      parseDeletePersonParams,
      (params) => deletePerson(params)
    )
  },
  {
    name: "list_employees",
    description:
      "List employees (persons who are team members). Returns employees sorted by modification date (newest first).",
    inputSchema: listEmployeesParamsJsonSchema,
    handler: createToolHandler(
      "list_employees",
      parseListEmployeesParams,
      (params) => listEmployees(params)
    )
  },
  {
    name: "list_organizations",
    description:
      "List all organizations in the Huly workspace. Returns organizations sorted by modification date (newest first).",
    inputSchema: listOrganizationsParamsJsonSchema,
    handler: createToolHandler(
      "list_organizations",
      parseListOrganizationsParams,
      (params) => listOrganizations(params)
    )
  },
  {
    name: "create_organization",
    description:
      "Create a new organization in Huly. Optionally add members by person ID or email. Returns the created organization ID.",
    inputSchema: createOrganizationParamsJsonSchema,
    handler: createToolHandler(
      "create_organization",
      parseCreateOrganizationParams,
      (params) => createOrganization(params)
    )
  }
]
