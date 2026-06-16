import type { Event } from "@hcengineering/calendar"
import type { Organization, Person } from "@hcengineering/contact"
import type { AttachedDoc, Collection, Markup, MarkupBlobRef, Ref, Status, Timestamp } from "@hcengineering/core"
import type { Project, Task } from "@hcengineering/task"

export interface Vacancy extends Project {
  readonly name: string
  readonly description: string
  readonly fullDescription: MarkupBlobRef | null
  readonly dueTo?: Timestamp | undefined
  readonly location?: string | undefined
  readonly company?: Ref<Organization> | undefined
  readonly comments?: number | undefined
  readonly attachments?: number | undefined
  readonly number: number
  readonly archived: boolean
  readonly private: boolean
  readonly applications?: number | undefined
}

export interface Candidate extends Person {
  readonly title?: string | undefined
  readonly applications?: number | undefined
  readonly onsite?: boolean | undefined
  readonly remote?: boolean | undefined
  readonly source?: string | undefined
  readonly skills?: number | undefined
  readonly reviews?: number | undefined
  readonly polls?: Collection<never> | undefined
  readonly vacancyMatch?: number | undefined
}

export interface Applicant extends Task {
  readonly space: Ref<Vacancy>
  readonly attachedTo: Ref<Candidate>
  readonly status: Ref<Status>
  readonly startDate: Timestamp | null
  readonly polls?: Collection<never> | undefined
}

export interface ApplicantMatch extends AttachedDoc {
  readonly attachedTo: Ref<Candidate>
  readonly complete: boolean
  readonly vacancy: string
  readonly summary: string
  readonly response: Markup
}

export interface Review extends Event {
  readonly attachedTo: Ref<Candidate>
  readonly number: number
  readonly verdict: string
  readonly application?: Ref<Applicant> | undefined
  readonly company?: Ref<Organization> | undefined
  readonly opinions?: number | undefined
}

export interface Opinion extends AttachedDoc {
  readonly attachedTo: Ref<Review>
  readonly number: number
  readonly description: Markup
  readonly value: string
  readonly comments?: number | undefined
  readonly attachments?: number | undefined
}
