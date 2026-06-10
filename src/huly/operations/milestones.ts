import { type Data, type DocumentUpdate, generateId, type Ref, SortingOrder } from "@hcengineering/core"
import { type Milestone as HulyMilestone, MilestoneStatus, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  CreateMilestoneParams,
  DeleteMilestoneParams,
  GetMilestoneParams,
  ListMilestonesParams,
  Milestone,
  MilestoneStatus as MilestoneStatusStr,
  MilestoneSummary,
  SetIssueMilestoneParams,
  UpdateMilestoneParams
} from "../../domain/schemas.js"
import type {
  CreateMilestoneResult,
  DeleteMilestoneResult,
  SetIssueMilestoneResult,
  UpdateMilestoneResult
} from "../../domain/schemas/milestones.js"
import { UPDATE_MILESTONE_FIELDS } from "../../domain/schemas/milestones.js"
import { IssueIdentifier, MilestoneId, MilestoneLabel, Timestamp } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { IssueNotFoundError, NoUpdateFieldsError, ProjectNotFoundError } from "../errors.js"
import { MilestoneNotFoundError } from "../errors.js"
import { clearTextAsEmptyString, textContentOrClear } from "./clear-field-updates.js"
import { findProject, findProjectAndIssue } from "./issues-shared.js"
import { clampLimit, findByNameOrId } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

import { tracker } from "../huly-plugins.js"
import { optionalMarkdownToMarkup, optionalMarkupToMarkdown } from "./markup.js"

type ListMilestonesError =
  | HulyClientError
  | ProjectNotFoundError

type GetMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | MilestoneNotFoundError

type CreateMilestoneError =
  | HulyClientError
  | ProjectNotFoundError

type UpdateMilestoneError =
  | HulyClientError
  | NoUpdateFieldsError
  | ProjectNotFoundError
  | MilestoneNotFoundError

type SetIssueMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | MilestoneNotFoundError

type DeleteMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | MilestoneNotFoundError

const milestoneStatusToStringMap = {
  [MilestoneStatus.Planned]: "planned",
  [MilestoneStatus.InProgress]: "in-progress",
  [MilestoneStatus.Completed]: "completed",
  [MilestoneStatus.Canceled]: "canceled"
} as const satisfies Record<MilestoneStatus, MilestoneStatusStr>

const milestoneStatusToString = (status: MilestoneStatus): MilestoneStatusStr => milestoneStatusToStringMap[status]

const stringToMilestoneStatusMap = {
  "planned": MilestoneStatus.Planned,
  "in-progress": MilestoneStatus.InProgress,
  "completed": MilestoneStatus.Completed,
  "canceled": MilestoneStatus.Canceled
} as const satisfies Record<MilestoneStatusStr, MilestoneStatus>

const stringToMilestoneStatus = (status: MilestoneStatusStr): MilestoneStatus => stringToMilestoneStatusMap[status]

const findMilestone = (
  client: HulyClient["Type"],
  project: HulyProject,
  milestoneIdentifier: string,
  projectIdentifier: string
): Effect.Effect<HulyMilestone, MilestoneNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const milestone = yield* findByNameOrId(
      client,
      tracker.class.Milestone,
      { space: project._id, _id: toRef<HulyMilestone>(milestoneIdentifier) },
      { space: project._id, label: milestoneIdentifier }
    )

    if (milestone === undefined) {
      return yield* new MilestoneNotFoundError({
        identifier: milestoneIdentifier,
        project: projectIdentifier
      })
    }

    return milestone
  })

const findProjectAndMilestone = (
  params: { project: string; milestone: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; milestone: HulyMilestone },
  ProjectNotFoundError | MilestoneNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)
    const milestone = yield* findMilestone(client, project, params.milestone, params.project)
    return { client, project, milestone }
  })

export const listMilestones = (
  params: ListMilestonesParams
): Effect.Effect<Array<MilestoneSummary>, ListMilestonesError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const limit = clampLimit(params.limit)

    const milestones = yield* client.findAll<HulyMilestone>(
      tracker.class.Milestone,
      { space: project._id },
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const summaries: Array<MilestoneSummary> = milestones.map(m => ({
      id: MilestoneId.make(m._id),
      label: MilestoneLabel.make(m.label),
      status: milestoneStatusToString(m.status),
      targetDate: Timestamp.make(m.targetDate),
      modifiedOn: Timestamp.make(m.modifiedOn)
    }))

    return summaries
  })

export const getMilestone = (
  params: GetMilestoneParams
): Effect.Effect<Milestone, GetMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, milestone } = yield* findProjectAndMilestone(params)
    const markupUrlConfig = client.markupUrlConfig

    const result: Milestone = {
      id: MilestoneId.make(milestone._id),
      label: MilestoneLabel.make(milestone.label),
      description: optionalMarkupToMarkdown(milestone.description, markupUrlConfig, ""),
      status: milestoneStatusToString(milestone.status),
      targetDate: Timestamp.make(milestone.targetDate),
      project: params.project,
      modifiedOn: Timestamp.make(milestone.modifiedOn),
      createdOn: milestone.createdOn === undefined ? undefined : Timestamp.make(milestone.createdOn)
    }

    return result
  })

export const createMilestone = (
  params: CreateMilestoneParams
): Effect.Effect<CreateMilestoneResult, CreateMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)
    const markupUrlConfig = client.markupUrlConfig

    const milestoneId: Ref<HulyMilestone> = generateId()

    const milestoneData: Data<HulyMilestone> = {
      label: params.label,
      description: optionalMarkdownToMarkup(params.description, markupUrlConfig, ""),
      status: MilestoneStatus.Planned,
      targetDate: params.targetDate,
      comments: 0
    }

    yield* client.createDoc(
      tracker.class.Milestone,
      project._id,
      milestoneData,
      milestoneId
    )

    // Milestone.description is typed as Markup (not MarkupBlobRef), so we must
    // dual-write: the raw Markup field (above, in milestoneData) for API reads,
    // plus the collaborative document (below) for Huly UI rendering.
    if (params.description !== undefined && params.description.trim() !== "") {
      yield* client.uploadMarkup(
        tracker.class.Milestone,
        milestoneId,
        "description",
        params.description,
        "markdown"
      )
    }

    return { id: MilestoneId.make(milestoneId), label: MilestoneLabel.make(params.label) }
  })

export const updateMilestone = (
  params: UpdateMilestoneParams
): Effect.Effect<UpdateMilestoneResult, UpdateMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_milestone", params, UPDATE_MILESTONE_FIELDS)

    const { client, milestone, project } = yield* findProjectAndMilestone(params)
    const markupUrlConfig = client.markupUrlConfig

    type UpdateMilestoneField = typeof UPDATE_MILESTONE_FIELDS[number]
    type UpdateMilestoneEntries = {
      readonly [Field in UpdateMilestoneField]: Effect.Effect<
        DirectUpdateEntry<UpdateMilestoneField, DocumentUpdate<HulyMilestone>, Field>,
        HulyClientError
      >
    }
    const updateEntries = {
      label: Effect.succeed(params.label === undefined ? {} : { label: params.label }),
      description: Effect.gen(function*() {
        if (params.description === undefined) return {}
        const description = textContentOrClear(params.description)
        // Dual-write: see comment in createMilestone for rationale.
        if (description !== undefined) {
          yield* client.uploadMarkup(
            tracker.class.Milestone,
            milestone._id,
            "description",
            description,
            "markdown"
          )
        }
        return {
          description: optionalMarkdownToMarkup(clearTextAsEmptyString(params.description), markupUrlConfig, "")
        }
      }),
      targetDate: Effect.succeed(params.targetDate === undefined ? {} : { targetDate: params.targetDate }),
      status: Effect.succeed(params.status === undefined ? {} : { status: stringToMilestoneStatus(params.status) })
    } satisfies UpdateMilestoneEntries
    const updateOps: DocumentUpdate<HulyMilestone> = mergeUpdateEntries(yield* Effect.all(Object.values(updateEntries)))

    yield* client.updateDoc(
      tracker.class.Milestone,
      project._id,
      milestone._id,
      updateOps
    )

    return { id: MilestoneId.make(milestone._id), updated: true }
  })

export const setIssueMilestone = (
  params: SetIssueMilestoneParams
): Effect.Effect<SetIssueMilestoneResult, SetIssueMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    const milestoneRef: Ref<HulyMilestone> | null = params.milestone !== null
      ? (yield* findMilestone(client, project, params.milestone, params.project))._id
      : null

    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      { milestone: milestoneRef }
    )

    return { identifier: IssueIdentifier.make(issue.identifier), milestoneSet: true }
  })

export const deleteMilestone = (
  params: DeleteMilestoneParams
): Effect.Effect<DeleteMilestoneResult, DeleteMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, milestone, project } = yield* findProjectAndMilestone(params)

    yield* client.removeDoc(
      tracker.class.Milestone,
      project._id,
      milestone._id
    )

    return { id: MilestoneId.make(milestone._id), deleted: true }
  })
