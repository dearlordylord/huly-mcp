import { Schema } from "effect"

import {
  ApplicantIdentifier,
  ApplicantMatchIdentifier,
  CandidateIdentifier,
  OpinionIdentifier,
  ReviewIdentifier,
  VacancyIdentifier
} from "../domain/schemas/recruiting-common.js"
import { Count, NonEmptyString } from "../domain/schemas/shared.js"

export class RecruitingVacancyNotFoundError extends Schema.TaggedError<RecruitingVacancyNotFoundError>()(
  "RecruitingVacancyNotFoundError",
  { identifier: VacancyIdentifier }
) {
  override get message(): string {
    return `Recruiting vacancy '${this.identifier}' not found`
  }
}

export class RecruitingVacancyIdentifierAmbiguousError
  extends Schema.TaggedError<RecruitingVacancyIdentifierAmbiguousError>()(
    "RecruitingVacancyIdentifierAmbiguousError",
    { identifier: VacancyIdentifier, matches: Count }
  )
{
  override get message(): string {
    return `Recruiting vacancy identifier '${this.identifier}' matched ${this.matches} vacancies; use the vacancy ID`
  }
}

export class RecruitingVacancyTypeNotFoundError extends Schema.TaggedError<RecruitingVacancyTypeNotFoundError>()(
  "RecruitingVacancyTypeNotFoundError",
  { identifier: NonEmptyString }
) {
  override get message(): string {
    return `Recruiting vacancy type '${this.identifier}' not found`
  }
}

export class RecruitingCandidateNotFoundError extends Schema.TaggedError<RecruitingCandidateNotFoundError>()(
  "RecruitingCandidateNotFoundError",
  { identifier: CandidateIdentifier }
) {
  override get message(): string {
    return `Recruiting candidate '${this.identifier}' not found`
  }
}

export class RecruitingApplicantNotFoundError extends Schema.TaggedError<RecruitingApplicantNotFoundError>()(
  "RecruitingApplicantNotFoundError",
  { identifier: ApplicantIdentifier }
) {
  override get message(): string {
    return `Recruiting applicant '${this.identifier}' not found`
  }
}

export class RecruitingApplicantIdentifierAmbiguousError
  extends Schema.TaggedError<RecruitingApplicantIdentifierAmbiguousError>()(
    "RecruitingApplicantIdentifierAmbiguousError",
    { identifier: ApplicantIdentifier, matches: Count }
  )
{
  override get message(): string {
    return `Recruiting applicant identifier '${this.identifier}' matched ${this.matches} applicants; pass vacancy or candidate`
  }
}

export class RecruitingDuplicateApplicantError extends Schema.TaggedError<RecruitingDuplicateApplicantError>()(
  "RecruitingDuplicateApplicantError",
  { vacancy: VacancyIdentifier, candidate: CandidateIdentifier }
) {
  override get message(): string {
    return `Recruiting applicant already exists for vacancy '${this.vacancy}' and candidate '${this.candidate}'`
  }
}

export class RecruitingReviewNotFoundError extends Schema.TaggedError<RecruitingReviewNotFoundError>()(
  "RecruitingReviewNotFoundError",
  { identifier: ReviewIdentifier }
) {
  override get message(): string {
    return `Recruiting review '${this.identifier}' not found`
  }
}

export class RecruitingReviewIdentifierAmbiguousError
  extends Schema.TaggedError<RecruitingReviewIdentifierAmbiguousError>()(
    "RecruitingReviewIdentifierAmbiguousError",
    { identifier: ReviewIdentifier, matches: Count }
  )
{
  override get message(): string {
    return `Recruiting review identifier '${this.identifier}' matched ${this.matches} reviews; use the review ID`
  }
}

export class RecruitingOpinionNotFoundError extends Schema.TaggedError<RecruitingOpinionNotFoundError>()(
  "RecruitingOpinionNotFoundError",
  { identifier: OpinionIdentifier }
) {
  override get message(): string {
    return `Recruiting opinion '${this.identifier}' not found`
  }
}

export class RecruitingOpinionIdentifierAmbiguousError
  extends Schema.TaggedError<RecruitingOpinionIdentifierAmbiguousError>()(
    "RecruitingOpinionIdentifierAmbiguousError",
    { identifier: OpinionIdentifier, matches: Count }
  )
{
  override get message(): string {
    return `Recruiting opinion identifier '${this.identifier}' matched ${this.matches} opinions; pass review`
  }
}

export class RecruitingApplicantMatchNotFoundError extends Schema.TaggedError<RecruitingApplicantMatchNotFoundError>()(
  "RecruitingApplicantMatchNotFoundError",
  { identifier: ApplicantMatchIdentifier }
) {
  override get message(): string {
    return `Recruiting applicant match '${this.identifier}' not found`
  }
}

export class RecruitingModelMissingError extends Schema.TaggedError<RecruitingModelMissingError>()(
  "RecruitingModelMissingError",
  { message: Schema.String }
) {}

export class RecruitingMutationUnsupportedError extends Schema.TaggedError<RecruitingMutationUnsupportedError>()(
  "RecruitingMutationUnsupportedError",
  { message: Schema.String }
) {}
