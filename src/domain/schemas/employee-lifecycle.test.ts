import { Effect, Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  DeactivateEmployeeParamsSchema,
  DeactivateEmployeeResultSchema,
  EmployeeLifecycleStateSchema,
  InviteEmployeeParamsGuards,
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
    for (const role of ["READONLYGUEST", "DocGuest"]) {
      expect(
        Exit.isFailure(
          Effect.runSync(
            Effect.exit(
              parseInviteEmployeeParams({
                mode: "create-or-promote",
                name: "Lovelace,Ada",
                email: "new@example.test",
                role
              })
            )
          )
        )
      ).toBe(true)
    }
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
    const parsed = Effect.runSync(
      parseInviteEmployeeParams({ mode: "create-or-promote", name: "Lovelace,Ada", email: "new@example.test" })
    )
    expect(InviteEmployeeParamsGuards["create-or-promote"](parsed)).toBe(true)
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
        expected: { relationship: "unlinked", personId: "person-1", employeeActive: false }
      })
    ).toMatchObject({ execute: true, expected: { relationship: "unlinked" } })
    expect(
      Schema.decodeUnknownSync(DeactivateEmployeeParamsSchema)({
        employee: { email: "employee@example.test" },
        action: "kick",
        execute: true,
        expected: {
          relationship: "workspace-member",
          personId: "person-1",
          personUuid: "00000000-0000-4000-8000-000000000251",
          employeeActive: true,
          workspaceRole: "USER"
        }
      })
    ).toMatchObject({ expected: { relationship: "workspace-member", workspaceRole: "USER" } })
  })

  it("rejects impossible lifecycle projection states", () => {
    const unlinkedState = {
      relationship: "unlinked",
      personId: "person-1",
      name: "Lovelace,Ada",
      account: { state: "unlinked" },
      workspaceMembership: { state: "absent" },
      employee: { state: "inactive", role: "USER" }
    }
    expect(Schema.decodeUnknownSync(EmployeeLifecycleStateSchema)(unlinkedState)).toMatchObject({
      relationship: "unlinked"
    })
    expect(() =>
      Schema.decodeUnknownSync(EmployeeLifecycleStateSchema)({
        relationship: "unlinked",
        personId: "person-1",
        name: "Lovelace,Ada",
        account: { state: "unlinked" },
        workspaceMembership: { state: "member", role: "USER" },
        employee: { state: "inactive" }
      })
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(DeactivateEmployeeResultSchema)({
        outcome: "deactivated",
        executed: true,
        action: "kick",
        impactBefore: unlinkedState,
        changes: { employeeDeactivated: true, workspaceMemberRemoved: true }
      })
    ).toThrow()
  })
})
