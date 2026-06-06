import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { AccountUuid } from "../../../src/domain/schemas/shared.js"

describe("shared identifier schemas", () => {
  it("validates Huly account UUIDs as UUID strings", () => {
    expect(Schema.decodeUnknownSync(AccountUuid)("08e44bb3-dcb0-4564-9599-676dd16941ad")).toBe(
      "08e44bb3-dcb0-4564-9599-676dd16941ad"
    )

    expect(() => Schema.decodeUnknownSync(AccountUuid)("account-1")).toThrow()
    expect(() => Schema.decodeUnknownSync(AccountUuid)("")).toThrow()
  })
})
