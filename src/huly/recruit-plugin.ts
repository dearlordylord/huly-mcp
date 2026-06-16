/**
 * Recruiting plugin class and mixin references.
 *
 * `@hcengineering/recruit` is not published with this project, so Recruiting
 * refs are kept behind this SDK-boundary module as opaque Huly identifiers.
 *
 * Upstream reference: .reference/platform_fork/plugins/recruit/src/index.ts
 *
 * @module
 */
import type { Class, Doc, Mixin, Ref } from "@hcengineering/core"
import type { Applicant, ApplicantMatch, Candidate, Opinion, Review, Vacancy } from "./types/recruiting.js"

// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream recruit plugin refs are opaque phantom strings without constructors
const recruitClassRef = <T extends Doc>(identifier: string): Ref<Class<T>> => identifier as Ref<Class<T>>
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream recruit mixin refs are opaque phantom strings without constructors
const recruitMixinRef = <T extends Doc>(identifier: string): Ref<Mixin<T>> => identifier as Ref<Mixin<T>>
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: upstream model refs are opaque phantom strings without constructors
const recruitDocRef = <T extends Doc>(identifier: string): Ref<T> => identifier as Ref<T>

export const recruitIds = {
  class: {
    Applicant: recruitClassRef<Applicant>("recruit:class:Applicant"),
    ApplicantMatch: recruitClassRef<ApplicantMatch>("recruit:class:ApplicantMatch"),
    Opinion: recruitClassRef<Opinion>("recruit:class:Opinion"),
    Review: recruitClassRef<Review>("recruit:class:Review"),
    Vacancy: recruitClassRef<Vacancy>("recruit:class:Vacancy")
  },
  mixin: {
    ApplicantTypeData: recruitMixinRef<Applicant>("recruit:mixin:ApplicantTypeData"),
    Candidate: recruitMixinRef<Candidate>("recruit:mixin:Candidate"),
    DefaultVacancyTypeData: recruitMixinRef<Vacancy>("recruit:mixin:DefaultVacancyTypeData")
  },
  template: {
    DefaultVacancy: recruitDocRef<Doc>("recruit:template:DefaultVacancy")
  },
  descriptors: {
    Application: recruitDocRef<Doc>("recruit:descriptors:Application"),
    VacancyType: recruitDocRef<Doc>("recruit:descriptors:VacancyType")
  },
  taskTypes: {
    Applicant: recruitDocRef<Doc>("recruit:taskTypes:Applicant")
  },
  attribute: {
    State: recruitDocRef<Doc>("recruit:attribute:State")
  }
} as const
