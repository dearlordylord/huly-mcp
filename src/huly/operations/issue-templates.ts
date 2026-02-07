/**
 * Issue template domain operations for Huly MCP server.
 *
 * Provides typed operations for managing issue templates within Huly projects.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Channel, Person } from "@hcengineering/contact"
import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type {
  Component as HulyComponent,
  Issue as HulyIssue,
  IssueTemplate as HulyIssueTemplate,
  Project as HulyProject
} from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  CreateIssueFromTemplateParams,
  CreateIssueParams,
  CreateIssueTemplateParams,
  DeleteIssueTemplateParams,
  GetIssueTemplateParams,
  IssueTemplate,
  IssueTemplateSummary,
  ListIssueTemplatesParams,
  UpdateIssueTemplateParams
} from "../../domain/schemas.js"
import type {
  CreateIssueTemplateResult,
  DeleteIssueTemplateResult,
  UpdateIssueTemplateResult
} from "../../domain/schemas/issue-templates.js"
import type { CreateIssueResult } from "../../domain/schemas/issues.js"
import { ComponentLabel, Email, IssueTemplateId, NonNegativeNumber, PersonName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { InvalidStatusError, ProjectNotFoundError } from "../errors.js"
import { ComponentNotFoundError, IssueTemplateNotFoundError, PersonNotFoundError } from "../errors.js"
import { findComponentByIdOrLabel } from "./components.js"
import { createIssue } from "./issues.js"
import {
  findPersonByEmailOrName,
  findProject,
  priorityToString,
  stringToPriority,
  toRef,
  zeroAsUnset
} from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default

export type ListIssueTemplatesError =
  | HulyClientError
  | ProjectNotFoundError

export type GetIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError

export type CreateIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | PersonNotFoundError
  | ComponentNotFoundError

export type CreateIssueFromTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

export type UpdateIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | PersonNotFoundError
  | ComponentNotFoundError

export type DeleteIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError

export type { CreateIssueTemplateResult, DeleteIssueTemplateResult, UpdateIssueTemplateResult }

const findTemplateByIdOrTitle = (
  client: HulyClient["Type"],
  projectId: Ref<HulyProject>,
  templateIdOrTitle: string
): Effect.Effect<HulyIssueTemplate | undefined, HulyClientError> =>
  Effect.gen(function*() {
    let template = yield* client.findOne<HulyIssueTemplate>(
      tracker.class.IssueTemplate,
      {
        space: projectId,
        _id: toRef<HulyIssueTemplate>(templateIdOrTitle)
      }
    )

    if (template === undefined) {
      template = yield* client.findOne<HulyIssueTemplate>(
        tracker.class.IssueTemplate,
        {
          space: projectId,
          title: templateIdOrTitle
        }
      )
    }

    return template
  })

const findProjectAndTemplate = (
  params: { project: string; template: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; template: HulyIssueTemplate },
  ProjectNotFoundError | IssueTemplateNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const template = yield* findTemplateByIdOrTitle(client, project._id, params.template)

    if (template === undefined) {
      return yield* new IssueTemplateNotFoundError({
        identifier: params.template,
        project: params.project
      })
    }

    return { client, project, template }
  })

export const listIssueTemplates = (
  params: ListIssueTemplatesParams
): Effect.Effect<Array<IssueTemplateSummary>, ListIssueTemplatesError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const limit = Math.min(params.limit ?? 50, 200)

    const templates = yield* client.findAll<HulyIssueTemplate>(
      tracker.class.IssueTemplate,
      { space: project._id },
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const summaries: Array<IssueTemplateSummary> = templates.map(t => ({
      id: IssueTemplateId.make(t._id),
      title: t.title,
      priority: priorityToString(t.priority),
      modifiedOn: t.modifiedOn
    }))

    return summaries
  })

export const getIssueTemplate = (
  params: GetIssueTemplateParams
): Effect.Effect<IssueTemplate, GetIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, template } = yield* findProjectAndTemplate(params)

    let assigneeName: string | undefined
    if (template.assignee !== null) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: template.assignee }
      )
      if (person) {
        assigneeName = person.name
      }
    }

    let componentLabel: string | undefined
    if (template.component !== null) {
      const component = yield* client.findOne<HulyComponent>(
        tracker.class.Component,
        { _id: template.component }
      )
      if (component) {
        componentLabel = component.label
      }
    }

    const result: IssueTemplate = {
      id: IssueTemplateId.make(template._id),
      title: template.title,
      description: template.description,
      priority: priorityToString(template.priority),
      assignee: assigneeName !== undefined ? PersonName.make(assigneeName) : undefined,
      component: componentLabel !== undefined ? ComponentLabel.make(componentLabel) : undefined,
      estimation: zeroAsUnset(NonNegativeNumber.make(template.estimation)),
      project: params.project,
      modifiedOn: template.modifiedOn,
      createdOn: template.createdOn
    }

    return result
  })

export const createIssueTemplate = (
  params: CreateIssueTemplateParams
): Effect.Effect<CreateIssueTemplateResult, CreateIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const templateId: Ref<HulyIssueTemplate> = generateId()

    let assigneeRef: Ref<Person> | null = null
    if (params.assignee !== undefined) {
      const person = yield* findPersonByEmailOrName(client, params.assignee)
      if (person === undefined) {
        return yield* new PersonNotFoundError({ identifier: params.assignee })
      }
      assigneeRef = person._id
    }

    let componentRef: Ref<HulyComponent> | null = null
    if (params.component !== undefined) {
      const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
      if (component === undefined) {
        return yield* new ComponentNotFoundError({
          identifier: params.component,
          project: params.project
        })
      }
      componentRef = component._id
    }

    const priority = stringToPriority(params.priority || "no-priority")

    const templateData: Data<HulyIssueTemplate> = {
      title: params.title,
      description: params.description ?? "",
      priority,
      assignee: assigneeRef,
      component: componentRef,
      estimation: params.estimation ?? 0,
      children: [],
      comments: 0
    }

    yield* client.createDoc(
      tracker.class.IssueTemplate,
      project._id,
      templateData,
      templateId
    )

    return { id: IssueTemplateId.make(templateId), title: params.title }
  })

export const createIssueFromTemplate = (
  params: CreateIssueFromTemplateParams
): Effect.Effect<CreateIssueResult, CreateIssueFromTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    const title = params.title ?? template.title
    const description = params.description ?? template.description
    const priority = params.priority ?? priorityToString(template.priority)

    let assignee = params.assignee
    if (assignee === undefined && template.assignee !== null) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: template.assignee }
      )
      if (person) {
        const emailCh = yield* client.findOne<Channel>(
          contact.class.Channel,
          {
            attachedTo: person._id,
            provider: contact.channelProvider.Email
          }
        )
        // Fall back to name for findPersonByEmailOrName lookup
        assignee = Email.make(emailCh?.value ?? person.name)
      }
    }

    const issueParams: CreateIssueParams = {
      project: params.project,
      title,
      description,
      priority,
      assignee,
      status: params.status
    }

    const result = yield* createIssue(issueParams)

    if (template.component !== null) {
      yield* client.updateDoc(
        tracker.class.Issue,
        project._id,
        toRef<HulyIssue>(result.issueId),
        { component: template.component }
      )
    }

    return result
  })

export const updateIssueTemplate = (
  params: UpdateIssueTemplateParams
): Effect.Effect<UpdateIssueTemplateResult, UpdateIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    const updateOps: DocumentUpdate<HulyIssueTemplate> = {}

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.description !== undefined) {
      updateOps.description = params.description
    }

    if (params.priority !== undefined) {
      updateOps.priority = stringToPriority(params.priority)
    }

    if (params.assignee !== undefined) {
      if (params.assignee === null) {
        updateOps.assignee = null
      } else {
        const person = yield* findPersonByEmailOrName(client, params.assignee)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: params.assignee })
        }
        updateOps.assignee = person._id
      }
    }

    if (params.component !== undefined) {
      if (params.component === null) {
        updateOps.component = null
      } else {
        const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
        if (component === undefined) {
          return yield* new ComponentNotFoundError({
            identifier: params.component,
            project: params.project
          })
        }
        updateOps.component = component._id
      }
    }

    if (params.estimation !== undefined) {
      updateOps.estimation = params.estimation
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: IssueTemplateId.make(template._id), updated: false }
    }

    yield* client.updateDoc(
      tracker.class.IssueTemplate,
      project._id,
      template._id,
      updateOps
    )

    return { id: IssueTemplateId.make(template._id), updated: true }
  })

export const deleteIssueTemplate = (
  params: DeleteIssueTemplateParams
): Effect.Effect<DeleteIssueTemplateResult, DeleteIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    yield* client.removeDoc(
      tracker.class.IssueTemplate,
      project._id,
      template._id
    )

    return { id: IssueTemplateId.make(template._id), deleted: true }
  })
