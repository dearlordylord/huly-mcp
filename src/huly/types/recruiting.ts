import type { Organization, Person } from "@hcengineering/contact"
import type { Collection, MarkupBlobRef, Ref, Status, Timestamp } from "@hcengineering/core"
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
}

export interface Applicant extends Task {
  readonly space: Ref<Vacancy>
  readonly attachedTo: Ref<Candidate>
  readonly status: Ref<Status>
  readonly startDate: Timestamp | null
  readonly polls?: Collection<never> | undefined
}
