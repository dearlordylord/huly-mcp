import { describe, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import { expect } from "vitest"

import {
  parseGetRecruitingOpinionParams,
  parseGetRecruitingReviewParams,
  parseUpdateRecruitingOpinionParams,
  parseUpdateRecruitingReviewParams
} from "../../src/domain/schemas/recruiting-extended.js"
import {
  addRecruitingAttachmentParamsJsonSchema,
  listRecruitingActivityParamsJsonSchema,
  listRecruitingAttachmentsParamsJsonSchema,
  listRecruitingCommentsParamsJsonSchema,
  parseAddRecruitingAttachmentParams,
  parseListRecruitingActivityParams,
  parseListRecruitingAttachmentsParams,
  parseListRecruitingCommentsParams,
  parseListRecruitingRelatedIssuesParams,
  parseUpdateRecruitingAttachmentParams,
  updateRecruitingAttachmentParamsJsonSchema,
  updateRecruitingCommentParamsJsonSchema
} from "../../src/domain/schemas/recruiting-media.js"
import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import {
  CUSTOM_FIELDS_DEFAULT_LIMIT,
  GetRecruitingCandidateCustomFieldValuesResultSchema
} from "../../src/domain/schemas/custom-fields.js"
import {
  RecruitingCandidateCustomFieldMutationResultSchema,
  parseCreateRecruitingVacancyParams,
  parseGetRecruitingCandidateCustomFieldValuesParams,
  parseGetRecruitingApplicantParams,
  parseGetRecruitingVacancyParams,
  parseListRecruitingCandidateCustomFieldsParams,
  listRecruitingCandidateCustomFieldsParamsJsonSchema,
  parseListRecruitingCandidatesParams,
  parseListRecruitingSkillsParams,
  parseSetRecruitingCandidateCustomFieldParams,
  parseSetRecruitingCandidateProfileParams,
  setRecruitingCandidateCustomFieldParamsJsonSchema,
  parseUpdateRecruitingApplicantParams,
  parseUpdateRecruitingVacancyParams
} from "../../src/domain/schemas/recruiting.js"

describe("Recruiting Schemas", () => {
  const propertyDescription = (schema: object, field: string): unknown => {
    const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
    return parseJsonSchemaRecord(properties?.[field])?.description
  }

  it.effect("rejects empty vacancy locators", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseGetRecruitingVacancyParams({ vacancy: "" }))
      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("normalizes vacancy numeric locators", () =>
    Effect.gen(function* () {
      const bare = yield* parseGetRecruitingVacancyParams({ vacancy: "1" })
      const prefixed = yield* parseGetRecruitingVacancyParams({ vacancy: "vcn-2" })
      const exactName = yield* parseGetRecruitingVacancyParams({ vacancy: "Backend Engineer" })

      expect(bare.vacancy).toBe("VCN-1")
      expect(prefixed.vacancy).toBe("VCN-2")
      expect(exactName.vacancy).toBe("Backend Engineer")
    })
  )

  it.effect("normalizes applicant numeric locators", () =>
    Effect.gen(function* () {
      const bare = yield* parseGetRecruitingApplicantParams({ applicant: "3" })
      const prefixed = yield* parseGetRecruitingApplicantParams({ applicant: "app-4" })

      expect(bare.applicant).toBe("APP-3")
      expect(prefixed.applicant).toBe("APP-4")
    })
  )

  it.effect("normalizes review and opinion numeric locators", () =>
    Effect.gen(function* () {
      const bareReview = yield* parseGetRecruitingReviewParams({ review: "5" })
      const prefixedReview = yield* parseGetRecruitingReviewParams({ review: "rve-6" })
      const exactTitle = yield* parseGetRecruitingReviewParams({ review: "Technical Interview" })
      const bareOpinion = yield* parseGetRecruitingOpinionParams({ opinion: "7" })
      const prefixedOpinion = yield* parseGetRecruitingOpinionParams({ opinion: "ope-8" })

      expect(bareReview.review).toBe("RVE-5")
      expect(prefixedReview.review).toBe("RVE-6")
      expect(exactTitle.review).toBe("Technical Interview")
      expect(bareOpinion.opinion).toBe("OPE-7")
      expect(prefixedOpinion.opinion).toBe("OPE-8")
    })
  )

  it.effect("validates recruiting media target support by surface", () =>
    Effect.gen(function* () {
      const emptyTarget = yield* Effect.flip(
        parseListRecruitingCommentsParams({ target: { kind: "vacancy", vacancy: "" } })
      )
      const reviewAttachments = yield* Effect.flip(
        parseListRecruitingAttachmentsParams({ target: { kind: "review", review: "RVE-1" } })
      )
      const opinionActivity = yield* Effect.flip(
        parseListRecruitingActivityParams({ target: { kind: "opinion", opinion: "OPE-1" } })
      )
      const reviewRelatedIssues = yield* Effect.flip(
        parseListRecruitingRelatedIssuesParams({ target: { kind: "review", review: "RVE-1" } })
      )

      expect(emptyTarget._tag).toBe("SchemaError")
      expect(reviewAttachments._tag).toBe("SchemaError")
      expect(opinionActivity._tag).toBe("SchemaError")
      expect(reviewRelatedIssues._tag).toBe("SchemaError")
    })
  )

  it.effect("normalizes nested recruiting media target identifiers", () =>
    Effect.gen(function* () {
      const applicant = yield* parseListRecruitingCommentsParams({
        target: { kind: "applicant", applicant: "7", vacancy: "2" }
      })
      const review = yield* parseListRecruitingActivityParams({
        target: { kind: "review", review: "5", application: "3" }
      })
      const opinion = yield* parseListRecruitingCommentsParams({
        target: { kind: "opinion", opinion: "6", review: "5" }
      })

      expect(applicant.target).toEqual({ kind: "applicant", applicant: "APP-7", vacancy: "VCN-2" })
      expect(review.target).toEqual({ kind: "review", review: "RVE-5", application: "APP-3" })
      expect(opinion.target).toEqual({ kind: "opinion", opinion: "OPE-6", review: "RVE-5" })
    })
  )

  it.effect("requires exactly one recruiting attachment source", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        parseAddRecruitingAttachmentParams({
          target: { kind: "vacancy", vacancy: "VCN-1" },
          filename: "resume.txt",
          contentType: "text/plain"
        })
      )
      const multiple = yield* Effect.flip(
        parseAddRecruitingAttachmentParams({
          target: { kind: "vacancy", vacancy: "VCN-1" },
          filename: "resume.txt",
          contentType: "text/plain",
          filePath: "/tmp/resume.txt",
          data: "cmVzdW1l"
        })
      )
      const parsed = yield* parseAddRecruitingAttachmentParams({
        target: { kind: "vacancy", vacancy: "VCN-1" },
        filename: "resume.txt",
        contentType: "text/plain",
        data: "cmVzdW1l"
      })

      expect(missing._tag).toBe("SchemaError")
      expect(multiple._tag).toBe("SchemaError")
      expect(parsed.data).toBe("cmVzdW1l")
    })
  )

  it.effect("rejects no-op recruiting attachment updates", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        parseUpdateRecruitingAttachmentParams({
          target: { kind: "candidate", candidate: "ada@example.com" },
          attachmentId: "attachment-1"
        })
      )
      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("accepts recruiting attachment updates with mutable fields", () =>
    Effect.gen(function* () {
      const result = yield* parseUpdateRecruitingAttachmentParams({
        target: { kind: "candidate", candidate: "ada@example.com" },
        attachmentId: "attachment-1",
        pinned: false
      })
      expect(result.pinned).toBe(false)
    })
  )

  it("preserves operation-specific recruiting media descriptions", () => {
    expect(propertyDescription(updateRecruitingCommentParamsJsonSchema, "body")).toContain("New comment body")
    expect(propertyDescription(listRecruitingCommentsParamsJsonSchema, "limit")).toContain("comments")
    expect(propertyDescription(listRecruitingAttachmentsParamsJsonSchema, "limit")).toContain("attachments")
    expect(propertyDescription(listRecruitingActivityParamsJsonSchema, "limit")).toContain("activity messages")
    expect(propertyDescription(addRecruitingAttachmentParamsJsonSchema, "description")).toBe(
      "Optional attachment description."
    )
    expect(propertyDescription(updateRecruitingAttachmentParamsJsonSchema, "description")).toBe(
      "New attachment description; null clears it."
    )
  })

  it.effect("rejects vacancy updates with no mutable fields", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseUpdateRecruitingVacancyParams({ vacancy: "VCN-1" }))
      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("accepts nullable vacancy clear fields", () =>
    Effect.gen(function* () {
      const result = yield* parseUpdateRecruitingVacancyParams({
        vacancy: "VCN-1",
        fullDescription: null,
        company: null,
        location: null,
        dueTo: null
      })

      expect(result.fullDescription).toBeNull()
      expect(result.company).toBeNull()
      expect(result.location).toBeNull()
      expect(result.dueTo).toBeNull()
    })
  )

  it.effect("rejects empty vacancy text fields", () =>
    Effect.gen(function* () {
      const createError = yield* Effect.flip(
        parseCreateRecruitingVacancyParams({ name: "Backend Engineer", shortDescription: "" })
      )
      const updateError = yield* Effect.flip(parseUpdateRecruitingVacancyParams({ vacancy: "VCN-1", location: "" }))

      expect(createError._tag).toBe("SchemaError")
      expect(updateError._tag).toBe("SchemaError")
    })
  )

  it.effect("rejects candidate profile writes with no profile fields", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseSetRecruitingCandidateProfileParams({ candidate: "Ada Lovelace" }))
      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("accepts candidate profile writes with a mutable field", () =>
    Effect.gen(function* () {
      const result = yield* parseSetRecruitingCandidateProfileParams({ candidate: "Ada Lovelace", title: "Engineer" })
      expect(result.title).toBe("Engineer")
    })
  )

  it.effect("parses candidate custom-field locators and documents the explicit write value", () =>
    Effect.gen(function* () {
      const listed = yield* parseListRecruitingCandidateCustomFieldsParams({ candidate: "Ada Lovelace", limit: 10 })
      const values = yield* parseGetRecruitingCandidateCustomFieldValuesParams({ candidate: "Ada Lovelace" })
      const write = yield* parseSetRecruitingCandidateCustomFieldParams({
        candidate: "Ada Lovelace",
        fieldId: "field-1",
        value: "2026-07-24"
      })

      expect(listed).toEqual({ candidate: "Ada Lovelace", limit: 10 })
      expect(values).toEqual({ candidate: "Ada Lovelace" })
      expect(write).toEqual({ candidate: "Ada Lovelace", fieldId: "field-1", value: "2026-07-24" })
      expect(propertyDescription(setRecruitingCandidateCustomFieldParamsJsonSchema, "fieldId")).toContain(
        "list_recruiting_candidate_custom_fields"
      )
      expect(propertyDescription(setRecruitingCandidateCustomFieldParamsJsonSchema, "value")).toContain(
        "documented wire format"
      )
      expect(propertyDescription(listRecruitingCandidateCustomFieldsParamsJsonSchema, "limit")).toContain(
        `default: ${CUSTOM_FIELDS_DEFAULT_LIMIT}`
      )
    })
  )

  it.effect("rejects candidate custom-field writes without a field ID or value", () =>
    Effect.gen(function* () {
      const missingField = yield* Effect.flip(
        parseSetRecruitingCandidateCustomFieldParams({ candidate: "Ada Lovelace", value: "x" })
      )
      const missingValue = yield* Effect.flip(
        parseSetRecruitingCandidateCustomFieldParams({ candidate: "Ada Lovelace", fieldId: "field-1" })
      )

      expect(missingField._tag).toBe("SchemaError")
      expect(missingValue._tag).toBe("SchemaError")
    })
  )

  it("keeps candidate custom-field result type/value pairs and update flags typed", () => {
    const candidate = { id: "person-1", name: "Ada Lovelace" }
    const getResult = Schema.decodeUnknownResult(GetRecruitingCandidateCustomFieldValuesResultSchema)
    const mutationResult = Schema.decodeUnknownResult(RecruitingCandidateCustomFieldMutationResultSchema)

    expect(
      Result.isFailure(
        getResult({
          fieldId: "number-field",
          name: "yearsExperience",
          label: "Years Experience",
          ownerClassId: "recruit:mixin:Candidate",
          ownerLabel: "Candidate",
          type: "number",
          value: "8"
        })
      )
    ).toBe(true)
    expect(
      Result.isFailure(
        mutationResult({
          candidate,
          fieldId: "number-field",
          name: "yearsExperience",
          label: "Years Experience",
          ownerClassId: "recruit:mixin:Candidate",
          type: "number",
          value: 8,
          updated: false
        })
      )
    ).toBe(true)
    expect(
      Result.isSuccess(
        mutationResult({
          candidate,
          fieldId: "number-field",
          name: "yearsExperience",
          label: "Years Experience",
          ownerClassId: "recruit:mixin:Candidate",
          type: "number",
          value: 8,
          updated: true
        })
      )
    ).toBe(true)
  })

  it.effect("rejects empty candidate and skill search text", () =>
    Effect.gen(function* () {
      const candidateError = yield* Effect.flip(parseListRecruitingCandidatesParams({ query: "" }))
      const skillError = yield* Effect.flip(parseListRecruitingSkillsParams({ titleSearch: "   " }))

      expect(candidateError._tag).toBe("SchemaError")
      expect(skillError._tag).toBe("SchemaError")
    })
  )

  it.effect("rejects empty candidate profile text", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        parseSetRecruitingCandidateProfileParams({ candidate: "Ada Lovelace", title: "" })
      )

      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("rejects applicant updates with no mutable fields", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseUpdateRecruitingApplicantParams({ applicant: "APP-1" }))
      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("rejects review and opinion updates with no mutable fields", () =>
    Effect.gen(function* () {
      const review = yield* Effect.flip(parseUpdateRecruitingReviewParams({ review: "RVE-1" }))
      const opinion = yield* Effect.flip(parseUpdateRecruitingOpinionParams({ opinion: "OPE-1" }))

      expect(review._tag).toBe("SchemaError")
      expect(opinion._tag).toBe("SchemaError")
    })
  )

  it.effect("accepts nullable review and opinion clear fields", () =>
    Effect.gen(function* () {
      const review = yield* parseUpdateRecruitingReviewParams({
        review: "RVE-1",
        description: null,
        verdict: null,
        application: null,
        company: null,
        location: null
      })
      const opinion = yield* parseUpdateRecruitingOpinionParams({ opinion: "OPE-1", description: null })

      expect(review.description).toBeNull()
      expect(review.verdict).toBeNull()
      expect(review.application).toBeNull()
      expect(review.company).toBeNull()
      expect(review.location).toBeNull()
      expect(opinion.description).toBeNull()
    })
  )

  it.effect("accepts nullable applicant clear fields", () =>
    Effect.gen(function* () {
      const result = yield* parseUpdateRecruitingApplicantParams({
        applicant: "APP-1",
        assignee: null,
        startDate: null,
        dueDate: null
      })

      expect(result.assignee).toBeNull()
      expect(result.startDate).toBeNull()
      expect(result.dueDate).toBeNull()
    })
  )
})
