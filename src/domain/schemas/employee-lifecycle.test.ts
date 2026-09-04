import { Effect, Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  DeactivateEmployeeParamsSchema,
  EmployeeLifecycleStateSchema,
  parseDeactivateEmployeeParams,
  parseInviteEmployeeParams
} from "./employee-lifecycle.js"

describe("employee lifecycle schemas", () => {
  it("accepts exact email/name locators and rejects combined locators", () => {
    expect(
      Effect.runSync(parseInviteEmployeeParams({ mode: "invite-existing", employee: { email: "new@example.test" } }))
    ).toEqual({ mode: "invite-existing", employee: { email: "new@example.test" } })
    expect(
      Effect.runSync(parseInviteEmployeeParams({ mode: "invite-existing", employee: { name: "Lovelace,Ada" } }))
    ).toEqual({ mode: "invite-existing", employee: { name: "Lovelace,Ada" } })
    expect(
      Effect.runSync(
        parseInviteEmployeeParams({ mode: "create-or-promote", name: "Lovelace,Ada", email: "new@example.test" })
      )
    ).toMatchObject({ mode: "create-or-promote" })
    expect(
      Exit.isFailure(
        Effect.runSync(
          Effect.exit(
            parseInviteEmployeeParams({
              mode: "invite-existing",
              employee: { email: "new@example.test", name: "Lovelace,Ada" }
            })
          )
        )
      )
    ).toBe(true)
  })

  it("keeps preview and guarded execution inputs distinct", () => {
    expect(
      Schema.decodeUnknownSync(DeactivateEmployeeParamsSchema)({
        employee: { email: "employee@example.test" },
        action: "kick"
      })
    ).toMatchObject({ action: "kick" })
    expect(
      Effect.runSync(
        Effect.exit(
          parseDeactivateEmployeeParams({ employee: { email: "employee@example.test" }, action: "kick", execute: true })
        )
      )._tag
    ).toBe("Failure")
    expect(
      Schema.decodeUnknownSync(DeactivateEmployeeParamsSchema)({
        employee: { email: "employee@example.test" },
        action: "kick",
        execute: true,
        expectedPersonId: "person-1",
        expectedPersonUuid: null,
        expectedEmployeeActive: false,
        expectedWorkspaceRole: null
      })
    ).toMatchObject({ execute: true, expectedPersonUuid: null, expectedWorkspaceRole: null })
  })

  it("rejects impossible lifecycle projection states", () => {
    expect(() =>
      Schema.decodeUnknownSync(EmployeeLifecycleStateSchema)({
        personId: "person-1",
        name: "Lovelace,Ada",
        account: { state: "linked" },
        workspaceMembership: { state: "member" },
        employee: { state: "inactive" }
      })
    ).toThrow()
  })
})
