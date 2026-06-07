import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { ListActivityParamsSchema } from "../../../src/domain/schemas/activity.js"
import { ListCardsParamsSchema, UpdateCardParamsSchema } from "../../../src/domain/schemas/cards.js"
import { ListChannelsParamsSchema } from "../../../src/domain/schemas/channels.js"
import { ListPersonsParamsSchema } from "../../../src/domain/schemas/contacts.js"
import { CustomFieldInfoWireSchema } from "../../../src/domain/schemas/custom-fields.js"
import { ListDocumentsParamsSchema } from "../../../src/domain/schemas/documents.js"
import { assertDecodeFailure, assertDecodeSuccess } from "../../helpers/property.js"

describe("ListActivityParamsSchema target-mode refinement", () => {
  it("rejects objectId without objectClass", () => {
    assertDecodeFailure(ListActivityParamsSchema, { objectId: "obj-1" })
  })

  it("rejects project without issueIdentifier", () => {
    assertDecodeFailure(ListActivityParamsSchema, { project: "HULY" })
  })

  it("rejects teamspace without document", () => {
    assertDecodeFailure(ListActivityParamsSchema, { teamspace: "Docs" })
  })

  it("rejects when no target mode is provided", () => {
    assertDecodeFailure(ListActivityParamsSchema, {})
  })

  it("rejects when more than one target mode is provided", () => {
    assertDecodeFailure(ListActivityParamsSchema, {
      channel: "general",
      objectId: "obj-1",
      objectClass: "tracker:class:Issue"
    })
  })

  it("accepts exactly one target mode", () => {
    assertDecodeSuccess(ListActivityParamsSchema, { channel: "general" })
  })
})

describe("ListCardsParamsSchema search refinement", () => {
  it("rejects providing both titleSearch and titleRegex", () => {
    assertDecodeFailure(ListCardsParamsSchema, { cardSpace: "Cards", titleSearch: "a", titleRegex: "b" })
  })

  it("accepts a single search filter", () => {
    assertDecodeSuccess(ListCardsParamsSchema, { cardSpace: "Cards", titleSearch: "a" })
  })
})

describe("ListDocumentsParamsSchema search refinement", () => {
  it("rejects providing both titleSearch and titleRegex", () => {
    assertDecodeFailure(ListDocumentsParamsSchema, { teamspace: "Docs", titleSearch: "a", titleRegex: "b" })
  })

  it("accepts a single search filter", () => {
    assertDecodeSuccess(ListDocumentsParamsSchema, { teamspace: "Docs", titleRegex: "RFC%" })
  })
})

describe("ListChannelsParamsSchema search refinement", () => {
  it("rejects providing both nameSearch and nameRegex", () => {
    assertDecodeFailure(ListChannelsParamsSchema, { nameSearch: "dev", nameRegex: "dev-%" })
  })

  it("accepts a single search filter", () => {
    assertDecodeSuccess(ListChannelsParamsSchema, { nameSearch: "dev" })
  })
})

describe("ListPersonsParamsSchema search refinement", () => {
  it("rejects providing both nameSearch and nameRegex", () => {
    assertDecodeFailure(ListPersonsParamsSchema, { nameSearch: "Smith", nameRegex: "Smith%" })
  })

  it("accepts a single search filter", () => {
    assertDecodeSuccess(ListPersonsParamsSchema, { nameSearch: "Smith" })
  })
})

describe("UpdateCardParamsSchema at-least-one-field refinement", () => {
  it("rejects an update with no mutable fields", () => {
    assertDecodeFailure(UpdateCardParamsSchema, { cardSpace: "Cards", card: "Roadmap" })
  })

  it("accepts an update that changes the title", () => {
    assertDecodeSuccess(UpdateCardParamsSchema, { cardSpace: "Cards", card: "Roadmap", title: "Renamed" })
  })
})

describe("CustomFieldInfoWireSchema typeDetails refinements", () => {
  const base = {
    id: "cf-1",
    name: "Priority",
    label: "Priority",
    ownerClassId: "tracker:class:Issue",
    ownerLabel: "Issue"
  }

  // decodeUnknownSync forces error formatting, which evaluates the filters' message thunks.
  const decode = Schema.decodeUnknownSync(CustomFieldInfoWireSchema)

  it("requires enumRef for enum custom fields", () => {
    expect(() => decode({ ...base, type: "enum", typeDetails: {} })).toThrow(
      "enum custom field typeDetails must include enumRef"
    )
  })

  it("requires of for array custom fields", () => {
    expect(() => decode({ ...base, type: "array", typeDetails: {} })).toThrow(
      "array custom field typeDetails must include of"
    )
  })

  it("requires to for ref custom fields", () => {
    expect(() => decode({ ...base, type: "ref", typeDetails: {} })).toThrow(
      "ref custom field typeDetails must include to"
    )
  })

  it("accepts an enum custom field carrying enumRef", () => {
    assertDecodeSuccess(CustomFieldInfoWireSchema, {
      ...base,
      type: "enum",
      typeDetails: { enumRef: "enum-1" }
    })
  })
})
