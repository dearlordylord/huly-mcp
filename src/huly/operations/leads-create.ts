/**
 * Native lead creation.
 *
 * The operation resolves every caller-controlled reference before the first
 * mutation, then follows Huly's authoritative Customer → Sequence → Lead write
 * protocol without reading the new lead back.
 *
 * @module
 */
import type { MarkupRef } from "@hcengineering/api-client"
import type {
  Contact,
  Employee as HulyEmployee,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import type {
  AttachedData,
  AttachedDoc,
  Doc,
  DocumentUpdate,
  MarkupBlobRef,
  Ref,
  Sequence,
  Space,
  Status,
  Timestamp
} from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { makeRank, type Rank } from "@hcengineering/rank"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect, Option, Schema } from "effect"

import type { CreateLeadParams, CreateLeadResult, LeadCustomerLocator } from "../../domain/schemas/leads.js"
import { FunnelIdentifier, LeadIdentifier } from "../../domain/schemas/leads.js"
import { DocId } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import {
  type FunnelIdentifierAmbiguousError,
  type FunnelNotFoundError,
  HulyDataInvalidError,
  HulyError,
  type OrganizationIdentifierAmbiguousError,
  type OrganizationNotFoundError,
  type PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { contact, core, task } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { findPersonByIdOrExactEmailOrName } from "./contacts-shared.js"
import { findStatusDocs } from "./issues-shared.js"
import { renderMarkdownWithNativeReferencesForWrite } from "./native-reference-markup.js"
import { resolveOrganizationByIdentifier } from "./organization-resolvers.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"
import { resolveFunnel } from "./funnels-shared.js"

interface HulyFunnel extends Doc {
  readonly name: string
  readonly archived: boolean
  readonly type?: Ref<ProjectType>
}

interface HulyLead extends AttachedDoc {
  readonly title: CreateLeadParams["title"]
  readonly description: MarkupBlobRef | null
  readonly identifier: LeadIdentifier
  readonly number: LeadSequenceNumber
  readonly status: Ref<Status>
  readonly kind: Ref<TaskType>
  readonly rank: Rank
  readonly assignee: Ref<HulyPerson> | null
  readonly startDate: Timestamp | null
  readonly dueDate: Timestamp | null
}

type HulyCustomer = HulyPerson | HulyOrganization

interface HulyCustomerMixin extends Contact {
  readonly customerDescription: MarkupBlobRef | null
}

interface LeadWorkflow {
  readonly taskType: TaskType
  readonly status: Ref<Status>
}

const LeadSequenceNumber = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("LeadSequenceNumber"))
type LeadSequenceNumber = Schema.Schema.Type<typeof LeadSequenceNumber>

const SequenceIncrementResultSchema = Schema.Struct({ object: Schema.Struct({ sequence: LeadSequenceNumber }) })

const resolveCustomer = (
  client: HulyClient["Service"],
  locator: LeadCustomerLocator
): Effect.Effect<
  HulyCustomer,
  | HulyClientError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
> =>
  locator.kind === "organization"
    ? resolveOrganizationByIdentifier(client, locator.identifier)
    : Effect.gen(function* () {
        const person = yield* findPersonByIdOrExactEmailOrName(client, locator.identifier)
        return person === undefined ? yield* new PersonNotFoundError({ identifier: locator.identifier }) : person
      })

const taskTypeMatches = (candidate: TaskType, identifier: NonNullable<CreateLeadParams["taskType"]>): boolean =>
  String(candidate._id) === identifier || normalizeForComparison(candidate.name) === normalizeForComparison(identifier)

const compatibleTaskTypes = (projectType: ProjectType, taskTypes: ReadonlyArray<TaskType>): ReadonlyArray<TaskType> => {
  const configuredIds = new Set(projectType.tasks.map(String))
  return taskTypes.filter(
    (candidate) => configuredIds.has(String(candidate._id)) && candidate.ofClass === leadClassIds.class.Lead
  )
}

const describeTaskTypes = (taskTypes: ReadonlyArray<TaskType>): string =>
  taskTypes.length === 0
    ? "No Lead-compatible task types are configured."
    : `Available Lead types: ${taskTypes.map((candidate) => `${candidate.name} (${candidate._id})`).join(", ")}.`

const failTaskTypeSelection = (
  selector: string,
  reason: string,
  compatible: ReadonlyArray<TaskType>,
  funnel: HulyFunnel
): Effect.Effect<never, HulyError> =>
  Effect.fail(
    new HulyError({ message: `${selector} ${reason} in funnel '${funnel.name}'. ${describeTaskTypes(compatible)}` })
  )

const chooseRequestedTaskType = (
  requested: NonNullable<CreateLeadParams["taskType"]>,
  compatible: ReadonlyArray<TaskType>,
  funnel: HulyFunnel
): Effect.Effect<TaskType, HulyError> => {
  const matches = compatible.filter((candidate) => taskTypeMatches(candidate, requested))
  return matches.length === 1 && matches[0] !== undefined
    ? Effect.succeed(matches[0])
    : failTaskTypeSelection(
        `Task type '${requested}'`,
        matches.length > 1 ? "matched more than one compatible type" : "was not found as a compatible type",
        compatible,
        funnel
      )
}

const chooseDefaultTaskType = (
  compatible: ReadonlyArray<TaskType>,
  funnel: HulyFunnel
): Effect.Effect<TaskType, HulyError> => {
  const defaultNative = compatible.find((candidate) => candidate._id === leadClassIds.taskType.Lead)
  const chosen = defaultNative ?? (compatible.length === 1 ? compatible[0] : undefined)
  return chosen === undefined
    ? failTaskTypeSelection(
        "No deterministic native Lead task type",
        compatible.length > 1 ? "matched more than one compatible type" : "was not found as a compatible type",
        compatible,
        funnel
      )
    : Effect.succeed(chosen)
}

const chooseTaskType = (
  projectType: ProjectType,
  taskTypes: ReadonlyArray<TaskType>,
  requested: CreateLeadParams["taskType"],
  funnel: HulyFunnel
): Effect.Effect<TaskType, HulyError> => {
  const compatible = compatibleTaskTypes(projectType, taskTypes)
  return requested === undefined
    ? chooseDefaultTaskType(compatible, funnel)
    : chooseRequestedTaskType(requested, compatible, funnel)
}

const chooseStatus = (
  taskType: TaskType,
  statusDocs: ReadonlyArray<{ readonly _id: Ref<Status>; readonly name: string }>,
  requested: CreateLeadParams["status"],
  funnel: HulyFunnel
): Effect.Effect<Ref<Status>, HulyError> => {
  if (requested === undefined) {
    const defaultStatus = taskType.statuses[0]
    return defaultStatus === undefined
      ? Effect.fail(
          new HulyError({
            message: `Task type '${taskType.name}' in funnel '${funnel.name}' has no deterministic default status`
          })
        )
      : Effect.succeed(defaultStatus)
  }

  const allowedIds = new Set(taskType.statuses.map(String))
  const matches = statusDocs.filter(
    (candidate) =>
      allowedIds.has(String(candidate._id)) &&
      normalizeForComparison(candidate.name) === normalizeForComparison(requested)
  )
  return matches.length === 1 && matches[0] !== undefined
    ? Effect.succeed(matches[0]._id)
    : Effect.fail(
        new HulyError({
          message:
            matches.length > 1
              ? `Status '${requested}' matched more than one status in task type '${taskType.name}'`
              : `Status '${requested}' is not valid for task type '${taskType.name}' in funnel '${funnel.name}'`
        })
      )
}

const resolveWorkflow = (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  params: CreateLeadParams
): Effect.Effect<LeadWorkflow, HulyClientError | HulyDataInvalidError | HulyError, Diagnostics> =>
  Effect.gen(function* () {
    if (funnel.type === undefined) {
      return yield* new HulyDataInvalidError({
        operation: "createLead",
        entity: `funnel '${funnel._id}' ProjectType reference`
      })
    }
    const projectType = yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ _id: funnel.type })
    )
    if (projectType === undefined) {
      return yield* new HulyDataInvalidError({
        operation: "createLead",
        entity: `funnel '${funnel._id}' missing ProjectType '${funnel.type}'`
      })
    }
    const taskTypes = yield* client.findAll<TaskType>(
      task.class.TaskType,
      hulyQuery<TaskType>({ _id: { $in: [...projectType.tasks] } })
    )
    const selectedTaskType = yield* chooseTaskType(projectType, taskTypes, params.taskType, funnel)
    const statusDocs = yield* findStatusDocs(client, selectedTaskType.statuses)
    const status = yield* chooseStatus(selectedTaskType, statusDocs, params.status, funnel)
    return { taskType: selectedTaskType, status }
  })

const resolveAssignee = (
  client: HulyClient["Service"],
  identifier: CreateLeadParams["assignee"]
): Effect.Effect<
  Ref<HulyPerson> | null,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotAnEmployeeError | PersonNotFoundError
> =>
  identifier === undefined
    ? Effect.succeed(null)
    : Effect.gen(function* () {
        const person = yield* findPersonByIdOrExactEmailOrName(client, identifier)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier })
        }
        const employee = yield* client.findOne<HulyEmployee>(
          contact.mixin.Employee,
          hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(person._id) })
        )
        if (employee === undefined) {
          return yield* new PersonNotAnEmployeeError({ identifier })
        }
        return toRef<HulyPerson>(employee._id)
      })

const applyCustomerMixin = (
  client: HulyClient["Service"],
  customer: HulyCustomer
): Effect.Effect<void, HulyClientError> =>
  Object.hasOwn(customer, String(leadClassIds.mixin.Customer))
    ? Effect.void
    : client
        .createMixin<Contact, HulyCustomerMixin>(
          toRef<Contact>(customer._id),
          toClassRef<Contact>(customer._class),
          customer.space,
          toMixinRef<HulyCustomerMixin>(leadClassIds.mixin.Customer),
          { customerDescription: null }
        )
        .pipe(Effect.asVoid)

const resolveLeadSequence = (
  client: HulyClient["Service"]
): Effect.Effect<Sequence, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const sequence = yield* client.findOne<Sequence>(
      core.class.Sequence,
      hulyQuery<Sequence>({ attachedTo: leadClassIds.class.Lead })
    )
    if (sequence === undefined) {
      return yield* new HulyDataInvalidError({ operation: "createLead", entity: "Lead sequence" })
    }
    return sequence
  })

const incrementLeadSequence = (
  client: HulyClient["Service"],
  sequence: Sequence
): Effect.Effect<LeadSequenceNumber, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const update: DocumentUpdate<Sequence> = { $inc: { sequence: 1 } }
    const result = yield* client.updateDoc(core.class.Sequence, sequence.space, sequence._id, update, true)
    return yield* Schema.decodeUnknownEffect(SequenceIncrementResultSchema)(result).pipe(
      Effect.map((decoded) => decoded.object.sequence),
      Effect.mapError(
        (cause) =>
          new HulyDataInvalidError({ operation: "createLead", entity: "Lead sequence increment result", cause })
      )
    )
  })

const markupRefAsBlobRef = (value: MarkupRef): MarkupBlobRef => {
  // SDK brands are erased at runtime; MarkupRef and MarkupBlobRef are both strings.
  // eslint-disable-next-line no-restricted-syntax -- final SDK boundary between two opaque markup ref brands
  return value as MarkupBlobRef
}

type CreateLeadError =
  | HulyClientError
  | FunnelNotFoundError
  | FunnelIdentifierAmbiguousError
  | HulyDataInvalidError
  | HulyError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError

export const createLead = (
  params: CreateLeadParams
): Effect.Effect<CreateLeadResult, CreateLeadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const funnel = yield* resolveFunnel(client, params.funnel)
    if (funnel.archived) {
      return yield* new HulyError({
        message: `Funnel '${FunnelIdentifier.make(funnel._id)}' is archived and cannot accept new leads`
      })
    }

    const customer = yield* resolveCustomer(client, params.customer)
    const workflow = yield* resolveWorkflow(client, funnel, params)
    const assignee = yield* resolveAssignee(client, params.assignee)
    const sequence = yield* resolveLeadSequence(client)
    const renderedDescriptionCandidate = Option.fromNullishOr(params.description).pipe(
      Option.filter((description) => description.trim() !== ""),
      Option.map((description) =>
        renderMarkdownWithNativeReferencesForWrite(description, client.markupUrlConfig, "description")
      )
    )
    const renderedDescription = yield* Option.match(renderedDescriptionCandidate, {
      onNone: () => Effect.succeed(Option.none()),
      onSome: (rendered) =>
        rendered._tag === "malformed"
          ? Effect.fail(new HulyError({ message: rendered.reason }))
          : Effect.succeed(Option.some(rendered.rendered))
    })

    yield* applyCustomerMixin(client, customer)

    const leadId = generateId<HulyLead>()
    const number = yield* incrementLeadSequence(client, sequence)
    const description = yield* Option.match(renderedDescription, {
      onNone: () => Effect.succeed<MarkupBlobRef | null>(null),
      onSome: (rendered) =>
        client
          .uploadMarkup(leadClassIds.class.Lead, leadId, "description", rendered.markup, rendered.format)
          .pipe(Effect.map(markupRefAsBlobRef))
    })
    const identifier = Schema.decodeUnknownSync(LeadIdentifier)(`LEAD-${number}`)
    const data: AttachedData<HulyLead> = {
      title: params.title,
      description,
      identifier,
      number,
      status: workflow.status,
      kind: workflow.taskType._id,
      rank: makeRank(undefined, undefined),
      assignee,
      startDate: null,
      dueDate: null
    }

    yield* client.addCollection(
      toClassRef<HulyLead>(leadClassIds.class.Lead),
      toRef<Space>(funnel._id),
      toRef<Contact>(customer._id),
      leadClassIds.mixin.Customer,
      "leads",
      data,
      leadId
    )

    return { leadId: DocId.make(leadId), identifier }
  })
