import { describe, it } from "@effect/vitest"
import { AvatarType, type Person } from "@hcengineering/contact"
import { Effect } from "effect"
import { expect } from "vitest"

import { FunnelIdentifier, LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import {
  BlobId,
  DocId,
  NonEmptyString,
  OrganizationId,
  PersonId,
  PersonLocator,
  PersonName,
  SpaceId,
  TaskTypeId,
  Timestamp,
  WorkflowStatusId
} from "../../../src/domain/schemas/shared.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  customerMixinWriteAttributes,
  parseLeadPersonDocument,
  parseOptionalLeadPersonDocument,
  requireEmployee,
  requireLeadDocument,
  resolveLeadCustomer
} from "../../../src/huly/operations/leads-mutations-boundary.js"
import type { HulyLead } from "../../../src/huly/operations/leads-mutations-boundary.js"
import { corePersonId, personRef } from "../../helpers/huly-sdk.js"

const personDocument = {
  _id: PersonId.make("person-1"),
  _class: DocId.make(contact.class.Person),
  space: SpaceId.make(String(contact.space.Contacts)),
  name: PersonName.make("Prospect,Pat")
}

const lead: HulyLead = {
  _id: DocId.make("lead-1"),
  _class: DocId.make("lead:class:Lead"),
  space: SpaceId.make("funnel-1"),
  title: NonEmptyString.make("A lead"),
  identifier: LeadIdentifier.make("LEAD-1"),
  status: WorkflowStatusId.make("lead:status:Incoming"),
  kind: TaskTypeId.make("lead:taskType:Lead"),
  assignee: null,
  description: null,
  startDate: null,
  dueDate: null,
  attachedTo: DocId.make("person-1"),
  attachedToClass: DocId.make(contact.class.Person),
  collection: "leads"
}

describe("lead mutation schema boundaries", () => {
  it.effect("parses present and absent person documents", () =>
    Effect.gen(function* () {
      const nativePerson: Person = {
        _id: personRef("person-1"),
        _class: contact.class.Person,
        space: contact.space.Contacts,
        modifiedBy: corePersonId("user-1"),
        modifiedOn: Timestamp.make(0),
        name: "Prospect,Pat",
        city: "",
        avatarType: AvatarType.COLOR
      }
      expect(yield* parseOptionalLeadPersonDocument(undefined)).toBeUndefined()
      expect(yield* parseOptionalLeadPersonDocument(nativePerson)).toMatchObject({ _id: "person-1" })
      expect((yield* Effect.flip(parseLeadPersonDocument({ _id: "broken" })))._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("requires a schema-valid employee document", () =>
    Effect.gen(function* () {
      const identifier = PersonLocator.make("Prospect,Pat")
      expect((yield* Effect.flip(requireEmployee(identifier, undefined)))._tag).toBe("PersonNotAnEmployeeError")
      expect(
        yield* requireEmployee(identifier, {
          ...personDocument,
          _class: DocId.make(contact.mixin.Employee),
          position: "Sales"
        })
      ).toBe("person-1")
    })
  )

  it.effect("requires a schema-valid lead document", () =>
    Effect.gen(function* () {
      const identifier = LeadIdentifier.make("LEAD-1")
      const funnel = FunnelIdentifier.make("funnel-1")
      expect((yield* Effect.flip(requireLeadDocument(undefined, identifier, funnel)))._tag).toBe("LeadNotFoundError")
      expect(
        yield* requireLeadDocument(
          { ...lead, modifiedBy: PersonId.make("user-1"), modifiedOn: Timestamp.make(0) },
          identifier,
          funnel
        )
      ).toEqual(lead)
    })
  )

  it.effect("resolves person and organization customers and rejects missing customers", () =>
    Effect.gen(function* () {
      const organization = {
        _id: OrganizationId.make("organization-1"),
        _class: DocId.make(contact.class.Organization),
        space: SpaceId.make(String(contact.space.Contacts)),
        name: NonEmptyString.make("Acme")
      }
      expect(yield* resolveLeadCustomer(personDocument, undefined, lead)).toEqual(personDocument)
      expect(yield* resolveLeadCustomer(undefined, organization, lead)).toEqual(organization)
      expect((yield* Effect.flip(resolveLeadCustomer(undefined, undefined, lead)))._tag).toBe("HulyError")
    })
  )

  it.effect("parses null and blob-backed customer mixin attributes", () =>
    Effect.gen(function* () {
      expect(yield* customerMixinWriteAttributes({ customerDescription: null })).toEqual({ customerDescription: null })
      expect(yield* customerMixinWriteAttributes({ customerDescription: BlobId.make("customer-markup") })).toEqual({
        customerDescription: "customer-markup"
      })
    })
  )
})
