import { type Data, type DocumentUpdate, generateId, type Ref, SortingOrder } from "@hcengineering/core"
import {
  type Issue as HulyIssue,
  type Milestone as HulyMilestone,
  MilestoneStatus,
  type Project as HulyProject
} from "@hcengineering/tracker"
import { absurd, Effect } from "effect"

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
import { MilestoneId, MilestoneLabel } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ProjectNotFoundError } from "../errors.js"
import { IssueNotFoundError, MilestoneNotFoundError } from "../errors.js"
import { findProject, parseIssueIdentifier, toRef } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default

export type ListMilestonesError =
  | HulyClientError
  | ProjectNotFoundError

export type GetMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | MilestoneNotFoundError

export type CreateMilestoneError =
  | HulyClientError
  | ProjectNotFoundError

export type UpdateMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | MilestoneNotFoundError

export type SetIssueMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | MilestoneNotFoundError

export type DeleteMilestoneError =
  | HulyClientError
  | ProjectNotFoundError
  | MilestoneNotFoundError

const milestoneStatusToString = (status: MilestoneStatus): MilestoneStatusStr => {
  switch (status) {
    case MilestoneStatus.Planned:
      return "planned"
    case MilestoneStatus.InProgress:
      return "in-progress"
    case MilestoneStatus.Completed:
      return "completed"
    case MilestoneStatus.Canceled:
      return "canceled"
    default:
      absurd(status)
      throw new Error("Invalid milestone status")
  }
}

const stringToMilestoneStatus = (status: MilestoneStatusStr): MilestoneStatus => {
  switch (status) {
    case "planned":
      return MilestoneStatus.Planned
    case "in-progress":
      return MilestoneStatus.InProgress
    case "completed":
      return MilestoneStatus.Completed
    case "canceled":
      return MilestoneStatus.Canceled
    default:
      absurd(status)
      throw new Error("Invalid milestone status")
  }
}

const findProjectAndMilestone = (
  params: { project: string; milestone: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; milestone: HulyMilestone },
  ProjectNotFoundError | MilestoneNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    let milestone = yield* client.findOne<HulyMilestone>(
      tracker.class.Milestone,
      {
        space: project._id,
        _id: toRef<HulyMilestone>(params.milestone)
      }
    )

    if (milestone === undefined) {
      milestone = yield* client.findOne<HulyMilestone>(
        tracker.class.Milestone,
        {
          space: project._id,
          label: params.milestone
        }
      )
    }

    if (milestone === undefined) {
      return yield* new MilestoneNotFoundError({
        identifier: params.milestone,
        project: params.project
      })
    }

    return { client, project, milestone }
  })

export const listMilestones = (
  params: ListMilestonesParams
): Effect.Effect<Array<MilestoneSummary>, ListMilestonesError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const limit = Math.min(params.limit ?? 50, 200)

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
      targetDate: m.targetDate,
      modifiedOn: m.modifiedOn
    }))

    return summaries
  })

export const getMilestone = (
  params: GetMilestoneParams
): Effect.Effect<Milestone, GetMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { milestone } = yield* findProjectAndMilestone(params)

    const result: Milestone = {
      id: MilestoneId.make(milestone._id),
      label: MilestoneLabel.make(milestone.label),
      description: milestone.description,
      status: milestoneStatusToString(milestone.status),
      targetDate: milestone.targetDate,
      project: params.project,
      modifiedOn: milestone.modifiedOn,
      createdOn: milestone.createdOn
    }

    return result
  })

export interface CreateMilestoneResult {
  id: string
  label: string
}

export const createMilestone = (
  params: CreateMilestoneParams
): Effect.Effect<CreateMilestoneResult, CreateMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const milestoneId: Ref<HulyMilestone> = generateId()

    const milestoneData: Data<HulyMilestone> = {
      label: params.label,
      description: params.description ?? "",
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

    return { id: milestoneId, label: params.label }
  })

export interface UpdateMilestoneResult {
  id: string
  updated: boolean
}

export const updateMilestone = (
  params: UpdateMilestoneParams
): Effect.Effect<UpdateMilestoneResult, UpdateMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, milestone, project } = yield* findProjectAndMilestone(params)

    const updateOps: DocumentUpdate<HulyMilestone> = {}

    if (params.label !== undefined) {
      updateOps.label = params.label
    }

    if (params.description !== undefined) {
      updateOps.description = params.description
    }

    if (params.targetDate !== undefined) {
      updateOps.targetDate = params.targetDate
    }

    if (params.status !== undefined) {
      updateOps.status = stringToMilestoneStatus(params.status)
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: milestone._id, updated: false }
    }

    yield* client.updateDoc(
      tracker.class.Milestone,
      project._id,
      milestone._id,
      updateOps
    )

    return { id: milestone._id, updated: true }
  })

export interface SetIssueMilestoneResult {
  identifier: string
  milestoneSet: boolean
}

export const setIssueMilestone = (
  params: SetIssueMilestoneParams
): Effect.Effect<SetIssueMilestoneResult, SetIssueMilestoneError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const { fullIdentifier, number } = parseIssueIdentifier(
      params.identifier,
      params.project
    )

    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      {
        space: project._id,
        identifier: fullIdentifier
      }
    )
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        {
          space: project._id,
          number
        }
      )
    }
    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project
      })
    }

    let milestoneRef: Ref<HulyMilestone> | null = null

    if (params.milestone !== null) {
      let milestone = yield* client.findOne<HulyMilestone>(
        tracker.class.Milestone,
        {
          space: project._id,
          _id: toRef<HulyMilestone>(params.milestone)
        }
      )

      if (milestone === undefined) {
        milestone = yield* client.findOne<HulyMilestone>(
          tracker.class.Milestone,
          {
            space: project._id,
            label: params.milestone
          }
        )
      }

      if (milestone === undefined) {
        return yield* new MilestoneNotFoundError({
          identifier: params.milestone,
          project: params.project
        })
      }

      milestoneRef = milestone._id
    }

    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      { milestone: milestoneRef }
    )

    return { identifier: issue.identifier, milestoneSet: true }
  })

export interface DeleteMilestoneResult {
  id: string
  deleted: boolean
}

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

    return { id: milestone._id, deleted: true }
  })
