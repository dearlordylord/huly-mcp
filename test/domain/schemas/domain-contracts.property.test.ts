import { describe } from "@effect/vitest"
import { Schema } from "effect"
import * as fc from "fast-check"
import { expect, it } from "vitest"

import {
  UPDATE_ATTACHMENT_FIELDS,
  updateAttachmentParamsJsonSchema,
  UpdateAttachmentParamsSchema
} from "../../../src/domain/schemas/attachments.js"
import {
  UPDATE_EVENT_FIELDS,
  updateEventParamsJsonSchema,
  UpdateEventParamsSchema
} from "../../../src/domain/schemas/calendar.js"
import {
  UPDATE_CARD_FIELDS,
  updateCardParamsJsonSchema,
  UpdateCardParamsSchema
} from "../../../src/domain/schemas/cards.js"
import {
  UPDATE_CHANNEL_FIELDS,
  updateChannelParamsJsonSchema,
  UpdateChannelParamsSchema
} from "../../../src/domain/schemas/channels.js"
import {
  UPDATE_COMPONENT_FIELDS,
  updateComponentParamsJsonSchema,
  UpdateComponentParamsSchema
} from "../../../src/domain/schemas/components.js"
import {
  UPDATE_ORGANIZATION_FIELDS,
  updateOrganizationParamsJsonSchema,
  UpdateOrganizationParamsSchema
} from "../../../src/domain/schemas/contact-organizations.js"
import {
  UPDATE_PERSON_FIELDS,
  updatePersonParamsJsonSchema,
  UpdatePersonParamsSchema
} from "../../../src/domain/schemas/contacts.js"
import {
  EDIT_DOCUMENT_UPDATE_FIELD_GROUPS,
  editDocumentParamsJsonSchema,
  EditDocumentParamsSchema,
  UPDATE_TEAMSPACE_FIELDS,
  updateTeamspaceParamsJsonSchema,
  UpdateTeamspaceParamsSchema
} from "../../../src/domain/schemas/documents.js"
import {
  UPDATE_ISSUE_TEMPLATE_FIELDS,
  updateIssueTemplateParamsJsonSchema,
  UpdateIssueTemplateParamsSchema
} from "../../../src/domain/schemas/issue-templates.js"
import {
  IssuePrioritySchema,
  IssuePriorityValues,
  UPDATE_ISSUE_FIELDS,
  updateIssueParamsJsonSchema,
  UpdateIssueParamsSchema
} from "../../../src/domain/schemas/issues.js"
import {
  UPDATE_LABEL_FIELDS,
  updateLabelParamsJsonSchema,
  UpdateLabelParamsSchema
} from "../../../src/domain/schemas/labels.js"
import { LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import {
  UPDATE_MILESTONE_FIELDS,
  updateMilestoneParamsJsonSchema,
  UpdateMilestoneParamsSchema
} from "../../../src/domain/schemas/milestones.js"
import {
  UPDATE_PROJECT_FIELDS,
  updateProjectParamsJsonSchema,
  UpdateProjectParamsSchema
} from "../../../src/domain/schemas/projects.js"
import { atLeastOneUpdateFieldMessage, NonEmptyString } from "../../../src/domain/schemas/shared.js"
import {
  UPDATE_SPACE_FIELDS,
  updateSpaceParamsJsonSchema,
  UpdateSpaceParamsSchema
} from "../../../src/domain/schemas/spaces.js"
import {
  UPDATE_TAG_CATEGORY_FIELDS,
  updateTagCategoryParamsJsonSchema,
  UpdateTagCategoryParamsSchema
} from "../../../src/domain/schemas/tag-categories.js"
import {
  UPDATE_TAG_FIELDS,
  updateTagParamsJsonSchema,
  UpdateTagParamsSchema
} from "../../../src/domain/schemas/tags.js"
import {
  UPDATE_TEST_CASE_FIELDS,
  UPDATE_TEST_SUITE_FIELDS,
  updateTestCaseParamsJsonSchema,
  UpdateTestCaseParamsSchema,
  updateTestSuiteParamsJsonSchema,
  UpdateTestSuiteParamsSchema
} from "../../../src/domain/schemas/test-management-core.js"
import {
  UPDATE_TEST_PLAN_FIELDS,
  UPDATE_TEST_RESULT_FIELDS,
  UPDATE_TEST_RUN_FIELDS,
  updateTestPlanParamsJsonSchema,
  UpdateTestPlanParamsSchema,
  updateTestResultParamsJsonSchema,
  UpdateTestResultParamsSchema,
  updateTestRunParamsJsonSchema,
  UpdateTestRunParamsSchema
} from "../../../src/domain/schemas/test-management-plans.js"
import {
  CreateAccessLinkParamsSchema,
  UPDATE_GUEST_SETTINGS_FIELDS,
  UPDATE_USER_PROFILE_FIELDS,
  updateGuestSettingsParamsJsonSchema,
  UpdateGuestSettingsParamsSchema,
  updateUserProfileParamsJsonSchema,
  UpdateUserProfileParamsSchema
} from "../../../src/domain/schemas/workspace.js"
import { propertyTestParameters } from "../../helpers/property.js"

type JsonSchemaObject = {
  readonly anyOf?: ReadonlyArray<{ readonly required?: ReadonlyArray<string> }>
  readonly allOf?: ReadonlyArray<unknown>
  readonly not?: { readonly required?: ReadonlyArray<string> }
  readonly properties?: Record<string, unknown>
}

interface UpdateSchemaCase {
  readonly name: string
  readonly schema: Schema.Schema.AnyNoContext
  readonly jsonSchema: JsonSchemaObject
  readonly base: Record<string, unknown>
  readonly fields: ReadonlyArray<string>
  readonly values: Readonly<Record<string, unknown>>
  readonly mutuallyExclusiveFieldSets?: ReadonlyArray<ReadonlyArray<string>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const decodeSucceeds = (schema: Schema.Schema.AnyNoContext, input: unknown): boolean =>
  Schema.decodeUnknownEither(schema)(input)._tag === "Right"

const jsonSchemaRequiredFields = (schema: JsonSchemaObject): ReadonlyArray<string> =>
  (schema.anyOf ?? []).flatMap((branch) => branch.required ?? [])

const expectDecodeFailure = (schema: Schema.Schema.AnyNoContext, input: unknown): void => {
  expect(Schema.decodeUnknownEither(schema)(input)._tag).toBe("Left")
}

const expectDecodeFailureContaining = (
  schema: Schema.Schema.AnyNoContext,
  input: unknown,
  message: string
): void => {
  const decoded = Schema.decodeUnknownEither(schema)(input)

  expect(decoded._tag).toBe("Left")
  if (decoded._tag === "Left") {
    expect(String(decoded.left)).toContain(message)
  }
}

const expectDecodeSuccess = (schema: Schema.Schema.AnyNoContext, input: unknown): void => {
  expect(Schema.decodeUnknownEither(schema)(input)._tag).toBe("Right")
}

const nonWhitespaceStringArbitrary = fc.string({ maxLength: 80 }).filter((value) => value.trim().length > 0)
const whitespaceOnlyStringArbitrary = fc.string({ maxLength: 40 }).filter((value) => value.trim().length === 0)

const caseVariant = (value: string): fc.Arbitrary<string> =>
  fc.array(fc.boolean(), { minLength: value.length, maxLength: value.length }).map((upperByIndex) =>
    value
      .split("")
      .map((char, index) => upperByIndex[index] === true ? char.toUpperCase() : char.toLowerCase())
      .join("")
  )

const priorityInputArbitrary = fc.constantFrom(...IssuePriorityValues).chain((priority) =>
  priority === "no-priority"
    ? fc.constantFrom("no-priority", "no_priority", "no priority", "nopriority", "NO-PRIORITY", "No Priority")
    : caseVariant(priority)
      .map((variant) => variant)
      .map((variant) => variant)
).chain((variant) =>
  fc.record({
    left: fc.constantFrom("", " "),
    right: fc.constantFrom("", " ")
  }).map(({ left, right }) => `${left}${variant}${right}`)
)

const invalidPriorityArbitrary = fc.stringMatching(/^x[A-Za-z0-9 _-]{0,16}$/)

const leadDigitsArbitrary = fc.nat({ max: 999_999 }).map(String)
const leadInputArbitrary = leadDigitsArbitrary.chain((digits) =>
  fc.record({
    prefix: fc.constantFrom("", "LEAD-", "lead-", "Lead-"),
    left: fc.stringMatching(/^\s{0,2}$/),
    right: fc.stringMatching(/^\s{0,2}$/)
  }).map(({ left, prefix, right }) => ({
    input: `${left}${prefix}${digits}${right}`,
    expected: `LEAD-${digits}`
  }))
)

const unixSecondsArbitrary = fc.integer({ min: 0, max: 9_999_999_998 })
const anonymousValidityWindowArbitrary = fc.integer({ min: 1, max: 86_400 }).chain((duration) =>
  fc.integer({ min: 0, max: 9_999_999_999 - duration }).map((notBefore) => ({
    duration,
    notBefore
  }))
)

const optionalStringArbitrary = fc.option(fc.string({ maxLength: 20 }), { nil: undefined })
const optionalNonEmptyStringArbitrary = fc.option(nonWhitespaceStringArbitrary, { nil: undefined })
const optionalBooleanArbitrary = fc.option(fc.boolean(), { nil: undefined })

const editDocumentParamsArbitrary = fc.record({
  title: optionalNonEmptyStringArbitrary,
  content: optionalStringArbitrary,
  old_text: optionalStringArbitrary,
  new_text: optionalStringArbitrary,
  replace_all: optionalBooleanArbitrary
}).map((params) => ({
  teamspace: "Engineering",
  document: "Runbook",
  ...params
}))

const modelEditDocumentAcceptance = (params: {
  readonly title?: string | undefined
  readonly content?: string | undefined
  readonly old_text?: string | undefined
  readonly new_text?: string | undefined
  readonly replace_all?: boolean | undefined
}): boolean => {
  const hasContent = params.content !== undefined
  const hasOldText = params.old_text !== undefined
  const hasNewText = params.new_text !== undefined
  const hasSearchReplace = hasOldText && hasNewText
  const hasUpdateField = params.title !== undefined || hasContent || hasSearchReplace

  return !(
    hasContent && (hasOldText || hasNewText)
    || hasOldText !== hasNewText
    || params.replace_all !== undefined && !hasOldText
    || !hasUpdateField
    || hasOldText && params.old_text.trim() === ""
  )
}

const updateSchemaCases: ReadonlyArray<UpdateSchemaCase> = [
  {
    name: "UpdateAttachmentParamsSchema",
    schema: UpdateAttachmentParamsSchema,
    jsonSchema: updateAttachmentParamsJsonSchema,
    base: { attachmentId: "attachment-1" },
    fields: UPDATE_ATTACHMENT_FIELDS,
    values: { description: null, pinned: true }
  },
  {
    name: "UpdateCardParamsSchema",
    schema: UpdateCardParamsSchema,
    jsonSchema: updateCardParamsJsonSchema,
    base: { cardSpace: "Cards", card: "Roadmap" },
    fields: UPDATE_CARD_FIELDS,
    values: { content: "Updated", title: "Updated" }
  },
  {
    name: "UpdateChannelParamsSchema",
    schema: UpdateChannelParamsSchema,
    jsonSchema: updateChannelParamsJsonSchema,
    base: { channel: "general" },
    fields: UPDATE_CHANNEL_FIELDS,
    values: { name: "Updated", topic: "Updated" }
  },
  {
    name: "UpdateComponentParamsSchema",
    schema: UpdateComponentParamsSchema,
    jsonSchema: updateComponentParamsJsonSchema,
    base: { project: "HULY", component: "Backend" },
    fields: UPDATE_COMPONENT_FIELDS,
    values: { description: "Updated", label: "Updated", lead: null }
  },
  {
    name: "UpdateEventParamsSchema",
    schema: UpdateEventParamsSchema,
    jsonSchema: updateEventParamsJsonSchema,
    base: { eventId: "event-1" },
    fields: UPDATE_EVENT_FIELDS,
    mutuallyExclusiveFieldSets: [["calendarId", "calendarName"]],
    values: {
      access: "reader",
      addExternalParticipants: ["guest@example.com"],
      addParticipants: ["john@example.com"],
      allDay: true,
      blockTime: true,
      calendarId: "calendar-1",
      calendarName: "Team Calendar",
      date: 1,
      description: "Updated",
      dueDate: 1,
      externalParticipants: ["guest@example.com"],
      location: "Updated",
      participants: ["john@example.com"],
      reminders: [1],
      removeExternalParticipants: ["guest@example.com"],
      removeParticipants: ["john@example.com"],
      timeZone: "UTC",
      title: "Updated",
      visibility: "public"
    }
  },
  {
    name: "UpdateIssueParamsSchema",
    schema: UpdateIssueParamsSchema,
    jsonSchema: updateIssueParamsJsonSchema,
    base: { project: "HULY", identifier: "HULY-1" },
    fields: UPDATE_ISSUE_FIELDS,
    values: {
      assignee: null,
      description: "Updated",
      dueDate: null,
      estimation: null,
      priority: "low",
      status: "Updated",
      taskType: "Updated",
      title: "Updated"
    }
  },
  {
    name: "UpdateIssueTemplateParamsSchema",
    schema: UpdateIssueTemplateParamsSchema,
    jsonSchema: updateIssueTemplateParamsJsonSchema,
    base: { project: "HULY", template: "Bug report" },
    fields: UPDATE_ISSUE_TEMPLATE_FIELDS,
    values: {
      assignee: null,
      component: null,
      description: "Updated",
      estimation: 1,
      priority: "low",
      title: "Updated"
    }
  },
  {
    name: "UpdateLabelParamsSchema",
    schema: UpdateLabelParamsSchema,
    jsonSchema: updateLabelParamsJsonSchema,
    base: { label: "bug" },
    fields: UPDATE_LABEL_FIELDS,
    values: { color: 1, description: "Updated", title: "Updated" }
  },
  {
    name: "UpdateMilestoneParamsSchema",
    schema: UpdateMilestoneParamsSchema,
    jsonSchema: updateMilestoneParamsJsonSchema,
    base: { project: "HULY", milestone: "v1" },
    fields: UPDATE_MILESTONE_FIELDS,
    values: { description: "Updated", label: "Updated", status: "planned", targetDate: 1 }
  },
  {
    name: "UpdateOrganizationParamsSchema",
    schema: UpdateOrganizationParamsSchema,
    jsonSchema: updateOrganizationParamsJsonSchema,
    base: { identifier: "Acme" },
    fields: UPDATE_ORGANIZATION_FIELDS,
    values: { city: null, description: null, name: "Updated" }
  },
  {
    name: "UpdatePersonParamsSchema",
    schema: UpdatePersonParamsSchema,
    jsonSchema: updatePersonParamsJsonSchema,
    base: { personId: "person-1" },
    fields: UPDATE_PERSON_FIELDS,
    values: { city: null, firstName: "Updated", lastName: "Updated" }
  },
  {
    name: "UpdateProjectParamsSchema",
    schema: UpdateProjectParamsSchema,
    jsonSchema: updateProjectParamsJsonSchema,
    base: { project: "HULY" },
    fields: UPDATE_PROJECT_FIELDS,
    values: { description: null, name: "Updated" }
  },
  {
    name: "UpdateSpaceParamsSchema",
    schema: UpdateSpaceParamsSchema,
    jsonSchema: updateSpaceParamsJsonSchema,
    base: { space: "Engineering" },
    fields: UPDATE_SPACE_FIELDS,
    values: {
      archived: true,
      autoJoin: true,
      description: "Updated",
      name: "Updated",
      private: true
    }
  },
  {
    name: "UpdateTagCategoryParamsSchema",
    schema: UpdateTagCategoryParamsSchema,
    jsonSchema: updateTagCategoryParamsJsonSchema,
    base: { category: "Priority" },
    fields: UPDATE_TAG_CATEGORY_FIELDS,
    values: { default: true, label: "Updated" }
  },
  {
    name: "UpdateTagParamsSchema",
    schema: UpdateTagParamsSchema,
    jsonSchema: updateTagParamsJsonSchema,
    base: { targetClass: "tracker:class:Issue", tag: "bug" },
    fields: UPDATE_TAG_FIELDS,
    values: { category: "Updated", color: 1, description: "Updated", title: "Updated" }
  },
  {
    name: "UpdateTeamspaceParamsSchema",
    schema: UpdateTeamspaceParamsSchema,
    jsonSchema: updateTeamspaceParamsJsonSchema,
    base: { teamspace: "Engineering" },
    fields: UPDATE_TEAMSPACE_FIELDS,
    values: { archived: true, description: null, name: "Updated" }
  },
  {
    name: "UpdateTestCaseParamsSchema",
    schema: UpdateTestCaseParamsSchema,
    jsonSchema: updateTestCaseParamsJsonSchema,
    base: { project: "QA", testCase: "Login" },
    fields: UPDATE_TEST_CASE_FIELDS,
    values: {
      assignee: null,
      description: null,
      name: "Updated",
      priority: "low",
      status: "draft",
      type: "functional"
    }
  },
  {
    name: "UpdateTestPlanParamsSchema",
    schema: UpdateTestPlanParamsSchema,
    jsonSchema: updateTestPlanParamsJsonSchema,
    base: { project: "QA", plan: "Regression" },
    fields: UPDATE_TEST_PLAN_FIELDS,
    values: { description: null, name: "Updated" }
  },
  {
    name: "UpdateTestResultParamsSchema",
    schema: UpdateTestResultParamsSchema,
    jsonSchema: updateTestResultParamsJsonSchema,
    base: { project: "QA", result: "Login result" },
    fields: UPDATE_TEST_RESULT_FIELDS,
    values: { assignee: null, description: null, status: "passed" }
  },
  {
    name: "UpdateTestRunParamsSchema",
    schema: UpdateTestRunParamsSchema,
    jsonSchema: updateTestRunParamsJsonSchema,
    base: { project: "QA", run: "Nightly" },
    fields: UPDATE_TEST_RUN_FIELDS,
    values: { description: null, dueDate: null, name: "Updated" }
  },
  {
    name: "UpdateTestSuiteParamsSchema",
    schema: UpdateTestSuiteParamsSchema,
    jsonSchema: updateTestSuiteParamsJsonSchema,
    base: { project: "QA", suite: "Smoke" },
    fields: UPDATE_TEST_SUITE_FIELDS,
    values: { description: null, name: "Updated" }
  },
  {
    name: "UpdateUserProfileParamsSchema",
    schema: UpdateUserProfileParamsSchema,
    jsonSchema: updateUserProfileParamsJsonSchema,
    base: {},
    fields: UPDATE_USER_PROFILE_FIELDS,
    values: {
      bio: "Updated",
      city: "Updated",
      country: "Updated",
      isPublic: true,
      socialLinks: null,
      website: "Updated"
    }
  },
  {
    name: "UpdateGuestSettingsParamsSchema",
    schema: UpdateGuestSettingsParamsSchema,
    jsonSchema: updateGuestSettingsParamsJsonSchema,
    base: {},
    fields: UPDATE_GUEST_SETTINGS_FIELDS,
    values: { allowReadOnly: true, allowSignUp: true }
  }
]

describe("shared/domain schema properties", () => {
  it("NonEmptyString decodes exactly trimmed non-empty strings and rejects blank strings", () => {
    fc.assert(
      fc.property(nonWhitespaceStringArbitrary, (input) => {
        const decoded = Schema.decodeUnknownEither(NonEmptyString)(input)

        expect(decoded._tag).toBe("Right")
        if (decoded._tag === "Right") {
          expect(decoded.right).toBe(input.trim())
        }
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(whitespaceOnlyStringArbitrary, (input) => {
        expect(Schema.decodeUnknownEither(NonEmptyString)(input)._tag).toBe("Left")
      }),
      propertyTestParameters
    )
  })

  it("IssuePrioritySchema normalizes accepted spellings and rejects unrelated values", () => {
    fc.assert(
      fc.property(priorityInputArbitrary, (input) => {
        const decoded = Schema.decodeUnknownEither(IssuePrioritySchema)(input)

        expect(decoded._tag).toBe("Right")
        if (decoded._tag === "Right") {
          expect(IssuePriorityValues).toContain(decoded.right)
        }
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(invalidPriorityArbitrary, (input) => {
        expect(Schema.decodeUnknownEither(IssuePrioritySchema)(input)._tag).toBe("Left")
      }),
      propertyTestParameters
    )
  })

  it("LeadIdentifier canonicalizes numeric and prefixed inputs to LEAD-number", () => {
    fc.assert(
      fc.property(leadInputArbitrary, ({ expected, input }) => {
        const decoded = Schema.decodeUnknownEither(LeadIdentifier)(input)

        expect(decoded._tag).toBe("Right")
        if (decoded._tag === "Right") {
          expect(decoded.right).toBe(expected)
        }
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(fc.stringMatching(/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/), (input) => {
        fc.pre(!/^LEAD-\d+$/i.test(input))
        expect(Schema.decodeUnknownEither(LeadIdentifier)(input)._tag).toBe("Left")
      }),
      propertyTestParameters
    )
  })
})

describe("access-link and document state-machine properties", () => {
  it("CreateAccessLinkParamsSchema enforces anonymous validity windows and timestamp ordering", () => {
    fc.assert(
      fc.property(anonymousValidityWindowArbitrary, ({ duration, notBefore }) => {
        expectDecodeSuccess(CreateAccessLinkParamsSchema, {
          personalized: false,
          notBefore,
          expiration: notBefore + duration
        })
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(unixSecondsArbitrary, (timestamp) => {
        expectDecodeFailure(CreateAccessLinkParamsSchema, { personalized: false, notBefore: timestamp })
        expectDecodeFailure(CreateAccessLinkParamsSchema, { personalized: false, expiration: timestamp })
        expectDecodeFailure(CreateAccessLinkParamsSchema, {
          personalized: false,
          notBefore: timestamp,
          expiration: timestamp
        })
      }),
      propertyTestParameters
    )
  })

  it("EditDocumentParamsSchema runtime acceptance matches the documented edit modes", () => {
    fc.assert(
      fc.property(editDocumentParamsArbitrary, (params) => {
        expect(decodeSucceeds(EditDocumentParamsSchema, params)).toBe(modelEditDocumentAcceptance(params))
      }),
      propertyTestParameters
    )
  })

  it("edit_document JSON Schema advertises the same update groups and old_text constraints", () => {
    expect(jsonSchemaRequiredFields(editDocumentParamsJsonSchema)).toEqual(["title", "content", "old_text", "new_text"])
    expect(editDocumentParamsJsonSchema.anyOf).toContainEqual({ required: ["old_text", "new_text"] })
    expect(editDocumentParamsJsonSchema.allOf).toEqual(expect.arrayContaining([
      { if: { required: ["old_text"] }, then: { required: ["new_text"] } },
      { if: { required: ["new_text"] }, then: { required: ["old_text"] } },
      { if: { required: ["replace_all"] }, then: { required: ["old_text", "new_text"] } }
    ]))

    const properties: Record<string, unknown> = isRecord(editDocumentParamsJsonSchema.properties)
      ? editDocumentParamsJsonSchema.properties
      : {}
    const oldText = isRecord(properties.old_text) ? properties.old_text : {}
    expect(oldText.pattern).toBe("\\S")
    expect(EDIT_DOCUMENT_UPDATE_FIELD_GROUPS).toEqual(["title", "content", "old_text/new_text"])
  })
})

describe("update schema runtime and JSON Schema agreement", () => {
  it("rejects locator-only updates at runtime and exports the same at-least-one field set in JSON Schema", () => {
    for (const testCase of updateSchemaCases) {
      expectDecodeFailure(testCase.schema, testCase.base)
      expect(jsonSchemaRequiredFields(testCase.jsonSchema)).toEqual(testCase.fields)
      const properties = isRecord(testCase.jsonSchema.properties) ? testCase.jsonSchema.properties : {}

      for (const field of testCase.fields) {
        expect(properties).toHaveProperty(field)
        expectDecodeSuccess(testCase.schema, { ...testCase.base, [field]: testCase.values[field] })
      }

      for (const fieldSet of testCase.mutuallyExclusiveFieldSets ?? []) {
        const payload = Object.fromEntries(fieldSet.map((field) => [field, testCase.values[field]]))
        expect(testCase.jsonSchema.not).toEqual({ required: fieldSet })
        expectDecodeFailure(testCase.schema, { ...testCase.base, ...payload })
      }

      fc.assert(
        fc.property(fc.subarray([...testCase.fields], { minLength: 1 }), (fields) => {
          if (
            (testCase.mutuallyExclusiveFieldSets ?? []).some((fieldSet) =>
              fieldSet.every((field) => fields.includes(field))
            )
          ) return

          const payload = Object.fromEntries(fields.map((field) => [field, testCase.values[field]]))

          expectDecodeSuccess(testCase.schema, { ...testCase.base, ...payload })
        }),
        propertyTestParameters
      )
    }
  })

  it("uses the shared at-least-one error message for update schemas", () => {
    for (const testCase of updateSchemaCases) {
      const message = atLeastOneUpdateFieldMessage(testCase.fields)

      expect(message).toContain(testCase.fields.join(", "))
      expectDecodeFailureContaining(testCase.schema, testCase.base, message)
    }
  })
})
