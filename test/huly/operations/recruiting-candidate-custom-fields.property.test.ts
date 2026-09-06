import { describe, expect, it } from "vitest"
import type { Person } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import { Effect } from "effect"
import * as fc from "fast-check"

import { ObjectClassName } from "../../../src/domain/schemas/shared.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import { parseCustomFieldValue, readCustomFieldValue } from "../../../src/huly/operations/custom-fields.js"
import { corePersonId, personRef } from "../../helpers/huly-sdk.js"
import { propertyTestParameters } from "../../helpers/property.js"

const candidateOwner = ObjectClassName.make("recruit:mixin:Candidate")

const basePerson: Person = {
  _id: personRef("person-1"),
  _class: contact.class.Person,
  space: contact.space.Contacts,
  modifiedBy: corePersonId("user-1"),
  modifiedOn: 0,
  createdBy: corePersonId("user-1"),
  createdOn: 0,
  name: "Ada Lovelace",
  city: "",
  avatarType: AvatarType.COLOR
}

const fieldNameArbitrary = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,16}$/u)

describe("recruiting candidate custom-field properties", () => {
  it("reads every generated top-level Person projection without changing the value", () => {
    fc.assert(
      fc.property(
        fieldNameArbitrary,
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        (name, value) => {
          const doc = Object.assign({}, basePerson, { [name]: value })
          expect(readCustomFieldValue(doc, ObjectClassName.make("contact:class:Person"), name)).toBe(value)
        }
      ),
      propertyTestParameters
    )
  })

  it("always prefers the native Candidate mixin payload over a projected property", () => {
    fc.assert(
      fc.property(fieldNameArbitrary, fc.string(), fc.string(), (name, nestedValue, projectedValue) => {
        const doc = Object.assign({}, basePerson, {
          [String(candidateOwner)]: { [name]: nestedValue },
          [name]: projectedValue
        })
        expect(readCustomFieldValue(doc, candidateOwner, name)).toBe(nestedValue)
      }),
      propertyTestParameters
    )
  })

  it("parses every generated integer number wire value to its numeric value", () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        expect(Effect.runSync(parseCustomFieldValue(String(value), "number"))).toBe(value)
      }),
      propertyTestParameters
    )
  })
})
