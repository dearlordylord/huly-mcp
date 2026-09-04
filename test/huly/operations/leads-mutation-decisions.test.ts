import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import type { LeadPersonDocument } from "../../../src/domain/schemas/leads-mutations.js"
import { DocId, PersonId, PersonLocator, PersonName, SpaceId } from "../../../src/domain/schemas/shared.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import { selectUniquePerson } from "../../../src/huly/operations/leads-mutation-decisions.js"

const person = (id: string): LeadPersonDocument => ({
  _id: PersonId.make(id),
  _class: DocId.make(contact.class.Person),
  space: SpaceId.make(String(contact.space.Contacts)),
  name: PersonName.make("Prospect,Pat")
})

describe("lead mutation person selection", () => {
  it.effect("deduplicates modalities that resolve to the same person", () =>
    Effect.gen(function* () {
      const match = person("person-1")
      expect(yield* selectUniquePerson(PersonLocator.make("Prospect,Pat"), [match, match])).toEqual(match)
    })
  )

  it.effect("distinguishes no match from ambiguous distinct matches", () =>
    Effect.gen(function* () {
      const identifier = PersonLocator.make("Prospect,Pat")
      const missing = yield* Effect.flip(selectUniquePerson(identifier, [undefined]))
      const ambiguous = yield* Effect.flip(selectUniquePerson(identifier, [person("person-1"), person("person-2")]))
      expect(missing._tag).toBe("PersonNotFoundError")
      expect(ambiguous._tag).toBe("PersonIdentifierAmbiguousError")
    })
  )
})
