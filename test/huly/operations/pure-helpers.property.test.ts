import type { Doc, FindOptions, Lookup, Ref, Status } from "@hcengineering/core"
import type { TagElement, TagReference } from "@hcengineering/tags"
import { IssuePriority } from "@hcengineering/tracker"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"
import { assertExists } from "../../../src/utils/assertions.js"

import { IssuePriorityValues } from "../../../src/domain/schemas/issues.js"
import {
  DocId,
  MAX_COLOR_INDEX,
  MAX_LIMIT,
  NonNegativeNumber,
  TagReferenceId
} from "../../../src/domain/schemas/shared.js"
import { AttachedTagSummarySchema } from "../../../src/domain/schemas/tags.js"
import {
  TestCasePriorityValues,
  TestCaseStatusValues,
  TestCaseTypeValues,
  TestRunStatusValues
} from "../../../src/domain/schemas/test-management-core.js"
import { core } from "../../../src/huly/huly-plugins.js"
import {
  parseIssueIdentifier,
  priorityToString,
  stringToPriority,
  uniqueStatusDocs,
  uniqueStatusRefs,
  zeroAsUnset
} from "../../../src/huly/operations/issues-shared.js"
import { clampLimit, escapeLikeWildcards, withLookup } from "../../../src/huly/operations/query-helpers.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { normalizeColorCode, toAttachedTagSummary } from "../../../src/huly/operations/tags-shared.js"
import {
  stringToTestCasePriority,
  stringToTestCaseStatus,
  stringToTestCaseType,
  stringToTestRunStatus,
  testCasePriorityToString,
  testCaseStatusToString,
  testCaseTypeToString,
  testRunStatusToString
} from "../../../src/huly/operations/test-management-shared.js"
import {
  TestCasePriority,
  TestCaseStatus,
  TestCaseType,
  TestRunStatus
} from "../../../src/huly/test-management-types.js"
import { assertDecodeSuccess, propertyTestParameters } from "../../helpers/property.js"

interface LookupFixtureDoc extends Doc {
  readonly reviewer?: Ref<Doc> | undefined
}

const hulyRefArbitrary = fc.stringMatching(/^[a-z][a-z0-9:._-]{0,24}$/)
const projectIdentifierArbitrary = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/)
const issuePrefixArbitrary = fc.stringMatching(/^[a-zA-Z]{1,8}$/)
const issueNumberArbitrary = fc.integer({ min: 0, max: 999_999 })
const nonMatchingIssueIdentifierArbitrary = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((value) => !/^([A-Z]+)-(\d+)$/i.test(value.trim()) && !/^\d+$/.test(value.trim()))
const statusDocArbitrary = fc.record({
  _id: hulyRefArbitrary.map((id) => toRef<Status>(DocId.make(id))),
  marker: fc.string({ maxLength: 20 })
})
const finiteNonNegativeArbitrary = fc.double({
  min: 0,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true
})

const escapedCharacterSet = new Set(["\\", "%", "_"])

const isEscapedLikePattern = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === "%" || char === "_") {
      return false
    }
    if (char === "\\") {
      if (index + 1 >= value.length) {
        return false
      }
      const escaped = assertExists(value[index + 1])
      if (!escapedCharacterSet.has(escaped)) {
        return false
      }
      index += 1
    }
  }

  return true
}

const firstIndexesByStatusRef = (refs: ReadonlyArray<Ref<Status>>): Map<Ref<Status>, number> => {
  const firstIndexes = new Map<Ref<Status>, number>()
  refs.forEach((ref, index) => {
    if (!firstIndexes.has(ref)) {
      firstIndexes.set(ref, index)
    }
  })
  return firstIndexes
}

const priorityEnumValues = [
  IssuePriority.Urgent,
  IssuePriority.High,
  IssuePriority.Medium,
  IssuePriority.Low,
  IssuePriority.NoPriority
] as const

const assertEnumMappingProperties = <EnumValue, WireValue extends string>(
  values: ReadonlyArray<WireValue>,
  enumValues: ReadonlyArray<EnumValue>,
  toString: (value: EnumValue) => WireValue,
  fromString: (value: string) => EnumValue | undefined
): void => {
  const validValues = new Set<string>(values)

  for (const enumValue of enumValues) {
    expect(fromString(toString(enumValue))).toBe(enumValue)
  }

  fc.assert(
    fc.property(fc.constantFrom(...values), fc.boolean(), (value, uppercase) => {
      const input = uppercase ? value.toUpperCase() : value
      const parsed = fromString(input)

      expect(parsed).not.toBeUndefined()
      if (parsed !== undefined) {
        expect(toString(parsed)).toBe(value)
      }
    }),
    propertyTestParameters
  )

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 30 }).filter((value) => !validValues.has(value.toLowerCase())),
      (unknown) => {
        expect(fromString(unknown)).toBeUndefined()
      }
    ),
    propertyTestParameters
  )
}

describe("pure Huly operation helper properties", () => {
  it("parseIssueIdentifier canonicalizes full identifiers and keeps numeric value", () => {
    fc.assert(
      fc.property(issuePrefixArbitrary, issueNumberArbitrary, fc.boolean(), (project, issueNumber, lowerCase) => {
        const prefix = lowerCase ? project.toLowerCase() : project.toUpperCase()
        const identifier = `${prefix}-${issueNumber}`

        expect(parseIssueIdentifier(identifier, "fallback")).toEqual({
          fullIdentifier: `${project.toUpperCase()}-${issueNumber}`,
          number: issueNumber
        })
      }),
      propertyTestParameters
    )
  })

  it("parseIssueIdentifier expands bare numbers with the project identifier", () => {
    fc.assert(
      fc.property(projectIdentifierArbitrary, issueNumberArbitrary, (project, issueNumber) => {
        expect(parseIssueIdentifier(String(issueNumber), project)).toEqual({
          fullIdentifier: `${project.toUpperCase()}-${issueNumber}`,
          number: issueNumber
        })
      }),
      propertyTestParameters
    )
  })

  it("parseIssueIdentifier leaves malformed identifiers unresolved", () => {
    fc.assert(
      fc.property(nonMatchingIssueIdentifierArbitrary, projectIdentifierArbitrary, (identifier, project) => {
        expect(parseIssueIdentifier(identifier, project)).toEqual({
          fullIdentifier: identifier.trim(),
          number: null
        })
      }),
      propertyTestParameters
    )
  })

  it("issue priority mapping roundtrips every SDK and wire value", () => {
    fc.assert(
      fc.property(fc.constantFrom(...priorityEnumValues), (priority) => {
        expect(stringToPriority(priorityToString(priority))).toBe(priority)
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(fc.constantFrom(...IssuePriorityValues), (priority) => {
        expect(priorityToString(stringToPriority(priority))).toBe(priority)
      }),
      propertyTestParameters
    )
  })

  it("uniqueStatusRefs preserves first occurrence order and removes duplicates", () => {
    fc.assert(
      fc.property(fc.array(hulyRefArbitrary.map((id) => toRef<Status>(DocId.make(id))), { maxLength: 50 }), (refs) => {
        const unique = uniqueStatusRefs(refs)
        const firstIndexes = firstIndexesByStatusRef(refs)

        expect(unique).toHaveLength(firstIndexes.size)
        expect(new Set(unique).size).toBe(unique.length)
        expect(unique.map((ref) => firstIndexes.get(ref))).toEqual(
          [...firstIndexes.values()]
        )
      }),
      propertyTestParameters
    )
  })

  it("uniqueStatusDocs preserves the first document for each status ref", () => {
    fc.assert(
      fc.property(fc.array(statusDocArbitrary, { maxLength: 50 }), (statuses) => {
        const unique = uniqueStatusDocs(statuses)
        const firstIndexes = firstIndexesByStatusRef(statuses.map((status) => status._id))

        expect(unique).toHaveLength(firstIndexes.size)
        expect(unique.map((status) => status._id)).toEqual([...firstIndexes.keys()])
        for (const status of unique) {
          expect(status).toBe(statuses[firstIndexes.get(status._id) ?? 0])
        }
      }),
      propertyTestParameters
    )
  })

  it("zeroAsUnset treats only zero as unset for non-negative values", () => {
    expect(zeroAsUnset(NonNegativeNumber.make(0))).toBeUndefined()

    fc.assert(
      fc.property(finiteNonNegativeArbitrary.filter((value) => value > 0), (value) => {
        expect(zeroAsUnset(NonNegativeNumber.make(value))).toBe(value)
      }),
      propertyTestParameters
    )
  })

  it("escapeLikeWildcards emits a pattern with no raw LIKE wildcard characters", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (input) => {
        const escaped = escapeLikeWildcards(input)

        expect(escaped.length).toBeGreaterThanOrEqual(input.length)
        expect(isEscapedLikePattern(escaped)).toBe(true)
      }),
      propertyTestParameters
    )
  })

  it("withLookup preserves options and lets incoming lookup keys override existing keys", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_LIMIT }), fc.boolean(), (limit, showArchived) => {
        const options = {
          limit,
          showArchived,
          lookup: {
            space: core.class.Space,
            reviewer: core.class.Space
          }
        } satisfies FindOptions<LookupFixtureDoc>
        const lookup: Lookup<LookupFixtureDoc> = { reviewer: core.class.Doc }

        expect(withLookup<LookupFixtureDoc>(options, lookup)).toEqual({
          limit,
          showArchived,
          lookup: {
            space: core.class.Space,
            reviewer: core.class.Doc
          }
        })
      }),
      propertyTestParameters
    )
  })

  it("clampLimit defaults undefined and never returns values above MAX_LIMIT", () => {
    expect(clampLimit()).toBe(50)

    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_LIMIT }), (limit) => {
        expect(clampLimit(limit)).toBe(limit)
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(
        fc.double({ min: MAX_LIMIT, noNaN: true, noDefaultInfinity: true }).filter((limit) => limit > MAX_LIMIT),
        (
          limit
        ) => {
          expect(clampLimit(limit)).toBe(MAX_LIMIT)
        }
      ),
      propertyTestParameters
    )
  })

  it("normalizeColorCode is idempotent and always returns a palette index", () => {
    fc.assert(
      fc.property(fc.double(), (color) => {
        const normalized = normalizeColorCode(color)

        expect(Number.isInteger(normalized)).toBe(true)
        expect(normalized).toBeGreaterThanOrEqual(0)
        expect(normalized).toBeLessThanOrEqual(MAX_COLOR_INDEX)
        expect(normalizeColorCode(normalized)).toBe(normalized)
      }),
      propertyTestParameters
    )
  })

  it("toAttachedTagSummary normalizes color and only includes defined weight", () => {
    const weightArbitrary = fc.option(fc.constantFrom(0, 1, 2, 3, 4, 5, 6, 7, 8), { nil: undefined })

    fc.assert(
      fc.property(
        hulyRefArbitrary,
        hulyRefArbitrary,
        fc.string({ minLength: 1, maxLength: 60 }).filter((title) => title.trim().length > 0),
        fc.double(),
        weightArbitrary,
        (id, tag, title, color, weight) => {
          const baseTagRef = {
            _id: toRef<TagReference>(TagReferenceId.make(id)),
            tag: toRef<TagElement>(DocId.make(tag)),
            title,
            color
          } satisfies Pick<TagReference, "_id" | "tag" | "title" | "color">
          const tagRef = weight === undefined ? baseTagRef : { ...baseTagRef, weight }
          const summary = toAttachedTagSummary(tagRef)
          const decoded = assertDecodeSuccess(AttachedTagSummarySchema, summary)

          expect(decoded).toMatchObject({
            id,
            tag,
            title: title.trim(),
            color: normalizeColorCode(color)
          })
          expect("weight" in decoded).toBe(weight !== undefined)
          if (weight !== undefined) {
            expect(decoded.weight).toBe(weight)
          }
        }
      ),
      propertyTestParameters
    )
  })

  it("test-management enum mappings roundtrip and reject unknown strings", () => {
    assertEnumMappingProperties(
      TestCaseTypeValues,
      [
        TestCaseType.Functional,
        TestCaseType.Performance,
        TestCaseType.Regression,
        TestCaseType.Security,
        TestCaseType.Smoke,
        TestCaseType.Usability
      ],
      testCaseTypeToString,
      stringToTestCaseType
    )
    assertEnumMappingProperties(
      TestCasePriorityValues,
      [
        TestCasePriority.Low,
        TestCasePriority.Medium,
        TestCasePriority.High,
        TestCasePriority.Urgent
      ],
      testCasePriorityToString,
      stringToTestCasePriority
    )
    assertEnumMappingProperties(
      TestCaseStatusValues,
      [
        TestCaseStatus.Draft,
        TestCaseStatus.ReadyForReview,
        TestCaseStatus.FixReviewComments,
        TestCaseStatus.Approved,
        TestCaseStatus.Rejected
      ],
      testCaseStatusToString,
      stringToTestCaseStatus
    )
    assertEnumMappingProperties(
      TestRunStatusValues,
      [
        TestRunStatus.Untested,
        TestRunStatus.Blocked,
        TestRunStatus.Passed,
        TestRunStatus.Failed
      ],
      testRunStatusToString,
      stringToTestRunStatus
    )
  })
})
