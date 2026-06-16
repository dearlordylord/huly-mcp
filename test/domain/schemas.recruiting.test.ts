import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  parseGetRecruitingOpinionParams,
  parseGetRecruitingReviewParams,
  parseUpdateRecruitingOpinionParams,
  parseUpdateRecruitingReviewParams
} from "../../src/domain/schemas/recruiting-extended.js"
import {
  parseCreateRecruitingVacancyParams,
  parseGetRecruitingApplicantParams,
  parseGetRecruitingVacancyParams,
  parseListRecruitingCandidatesParams,
  parseListRecruitingSkillsParams,
  parseSetRecruitingCandidateProfileParams,
  parseUpdateRecruitingApplicantParams,
  parseUpdateRecruitingVacancyParams
} from "../../src/domain/schemas/recruiting.js"

describe("Recruiting Schemas", () => {
  it.effect("rejects empty vacancy locators", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseGetRecruitingVacancyParams({ vacancy: "" }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("normalizes vacancy numeric locators", () =>
    Effect.gen(function*() {
      const bare = yield* parseGetRecruitingVacancyParams({ vacancy: "1" })
      const prefixed = yield* parseGetRecruitingVacancyParams({ vacancy: "vcn-2" })
      const exactName = yield* parseGetRecruitingVacancyParams({ vacancy: "Backend Engineer" })

      expect(bare.vacancy).toBe("VCN-1")
      expect(prefixed.vacancy).toBe("VCN-2")
      expect(exactName.vacancy).toBe("Backend Engineer")
    }))

  it.effect("normalizes applicant numeric locators", () =>
    Effect.gen(function*() {
      const bare = yield* parseGetRecruitingApplicantParams({ applicant: "3" })
      const prefixed = yield* parseGetRecruitingApplicantParams({ applicant: "app-4" })

      expect(bare.applicant).toBe("APP-3")
      expect(prefixed.applicant).toBe("APP-4")
    }))

  it.effect("normalizes review and opinion numeric locators", () =>
    Effect.gen(function*() {
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
    }))

  it.effect("rejects vacancy updates with no mutable fields", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseUpdateRecruitingVacancyParams({ vacancy: "VCN-1" }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("accepts nullable vacancy clear fields", () =>
    Effect.gen(function*() {
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
    }))

  it.effect("rejects empty vacancy text fields", () =>
    Effect.gen(function*() {
      const createError = yield* Effect.flip(parseCreateRecruitingVacancyParams({
        name: "Backend Engineer",
        shortDescription: ""
      }))
      const updateError = yield* Effect.flip(parseUpdateRecruitingVacancyParams({
        vacancy: "VCN-1",
        location: ""
      }))

      expect(createError._tag).toBe("ParseError")
      expect(updateError._tag).toBe("ParseError")
    }))

  it.effect("rejects candidate profile writes with no profile fields", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseSetRecruitingCandidateProfileParams({ candidate: "Ada Lovelace" }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("accepts candidate profile writes with a mutable field", () =>
    Effect.gen(function*() {
      const result = yield* parseSetRecruitingCandidateProfileParams({
        candidate: "Ada Lovelace",
        title: "Engineer"
      })
      expect(result.title).toBe("Engineer")
    }))

  it.effect("rejects empty candidate and skill search text", () =>
    Effect.gen(function*() {
      const candidateError = yield* Effect.flip(parseListRecruitingCandidatesParams({ query: "" }))
      const skillError = yield* Effect.flip(parseListRecruitingSkillsParams({ titleSearch: "   " }))

      expect(candidateError._tag).toBe("ParseError")
      expect(skillError._tag).toBe("ParseError")
    }))

  it.effect("rejects empty candidate profile text", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseSetRecruitingCandidateProfileParams({
        candidate: "Ada Lovelace",
        title: ""
      }))

      expect(error._tag).toBe("ParseError")
    }))

  it.effect("rejects applicant updates with no mutable fields", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseUpdateRecruitingApplicantParams({ applicant: "APP-1" }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("rejects review and opinion updates with no mutable fields", () =>
    Effect.gen(function*() {
      const review = yield* Effect.flip(parseUpdateRecruitingReviewParams({ review: "RVE-1" }))
      const opinion = yield* Effect.flip(parseUpdateRecruitingOpinionParams({ opinion: "OPE-1" }))

      expect(review._tag).toBe("ParseError")
      expect(opinion._tag).toBe("ParseError")
    }))

  it.effect("accepts nullable review and opinion clear fields", () =>
    Effect.gen(function*() {
      const review = yield* parseUpdateRecruitingReviewParams({
        review: "RVE-1",
        description: null,
        verdict: null,
        application: null,
        company: null,
        location: null
      })
      const opinion = yield* parseUpdateRecruitingOpinionParams({
        opinion: "OPE-1",
        description: null
      })

      expect(review.description).toBeNull()
      expect(review.verdict).toBeNull()
      expect(review.application).toBeNull()
      expect(review.company).toBeNull()
      expect(review.location).toBeNull()
      expect(opinion.description).toBeNull()
    }))

  it.effect("accepts nullable applicant clear fields", () =>
    Effect.gen(function*() {
      const result = yield* parseUpdateRecruitingApplicantParams({
        applicant: "APP-1",
        assignee: null,
        startDate: null,
        dueDate: null
      })

      expect(result.assignee).toBeNull()
      expect(result.startDate).toBeNull()
      expect(result.dueDate).toBeNull()
    }))
})
