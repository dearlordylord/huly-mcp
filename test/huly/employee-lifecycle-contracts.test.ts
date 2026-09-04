import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { Email, PersonId, PersonUuid } from "../../src/domain/schemas/shared.js"
import {
  EmployeeDeactivationPartialFailureError,
  EmployeeInvitationPartialFailureError,
  EmployeeLifecycleImpactMismatchError,
  EmployeeLifecycleStateError,
  EmployeePreparationConflictError
} from "../../src/huly/errors.js"
import {
  decodeEmployeeLifecycleDocument,
  decodeEmployeeLifecycleDocuments
} from "../../src/huly/operations/employee-lifecycle-boundaries.js"

const personUuid = PersonUuid.make("00000000-0000-4000-8000-000000000251")

describe("employee lifecycle boundary contracts", () => {
  it("renders typed lifecycle recovery errors without losing completed progress", () => {
    const state = new EmployeeLifecycleStateError({ identifier: Email.make("ada@example.test"), reason: "inactive" })
    const impact = new EmployeeLifecycleImpactMismatchError({
      identifier: PersonId.make("person-1"),
      reason: "role differs"
    })
    const noProgress = new EmployeeInvitationPartialFailureError({
      personId: PersonId.make("person-1"),
      email: Email.make("ada@example.test"),
      operation: "sendInvite",
      completedChanges: [],
      reason: "unavailable"
    })
    const progress = new EmployeeInvitationPartialFailureError({
      personId: PersonId.make("person-1"),
      email: Email.make("ada@example.test"),
      operation: "sendInvite",
      completedChanges: ["employeeCreated"],
      reason: "unavailable"
    })
    const preparation = new EmployeePreparationConflictError({
      personId: PersonId.make("person-1"),
      email: Email.make("ada@example.test"),
      operation: "prepareEmployee",
      reason: "condition changed"
    })
    const removal = new EmployeeDeactivationPartialFailureError({
      personId: PersonId.make("person-1"),
      personUuid,
      action: "kick",
      failedOperation: "leaveWorkspace",
      completedChanges: [],
      reason: "unavailable"
    })

    expect(state.message).toContain("not valid")
    expect(impact.message).toContain("Preview again")
    expect(noProgress.message).toContain("no material changes")
    expect(progress.message).toContain("employeeCreated")
    expect(preparation.message).toContain("did not commit")
    expect(removal.message).toContain("completed changes: none")
  })

  it.effect("decodes nested Employee mixins with optional account links in singular and batch results", () =>
    Effect.gen(function* () {
      const linked = yield* decodeEmployeeLifecycleDocument(
        {
          _id: "person-linked",
          space: "contact:space:Contacts",
          name: "Lovelace,Ada",
          personUuid,
          "contact:mixin:Employee": { active: false, role: "USER" }
        },
        "listInactiveEmployees"
      )
      const batch = yield* decodeEmployeeLifecycleDocuments(
        [
          {
            _id: "person-linked",
            space: "contact:space:Contacts",
            name: "Lovelace,Ada",
            personUuid,
            "contact:mixin:Employee": { active: false, role: "USER" }
          },
          {
            _id: "person-unlinked",
            space: "contact:space:Contacts",
            name: "Hopper,Grace",
            "contact:mixin:Employee": { active: false, role: "GUEST" }
          }
        ],
        "listInactiveEmployees"
      )

      expect(linked.personUuid).toBe(personUuid)
      expect(batch).toEqual([
        {
          _id: "person-linked",
          space: "contact:space:Contacts",
          name: "Lovelace,Ada",
          personUuid,
          active: false,
          role: "USER"
        },
        { _id: "person-unlinked", space: "contact:space:Contacts", name: "Hopper,Grace", active: false, role: "GUEST" }
      ])
    })
  )
})
