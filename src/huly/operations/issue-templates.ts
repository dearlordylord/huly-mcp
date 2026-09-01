/* eslint-disable max-lines -- template CRUD + children management + issue-from-template form a single domain */
/**
 * Issue template domain operations for Huly MCP server.
 *
 * Provides typed operations for managing issue templates within Huly projects.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Person } from "@hcengineering/contact"
import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type {
  Component as HulyComponent,
  Issue as HulyIssue,
  IssueTemplate as HulyIssueTemplate,
  IssueTemplateChild as HulyIssueTemplateChild,
  Project as HulyProject
} from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  AddTemplateChildParams,
  CreateIssueFromTemplateParams,
  CreateIssueParams,
  CreateIssueTemplateParams,
  DeleteIssueTemplateParams,
  GetIssueTemplateParams,
  IssueTemplate,
  IssueTemplateChild,
  IssueTemplateSummary,
  ListIssueTemplatesParams,
  RemoveTemplateChildParams,
  UpdateIssueTemplateParams
} from "../../domain/schemas.js"
import type {
  AddTemplateChildResult,
  ChildTemplateInput,
  CreateIssueFromTemplateResult,
  CreateIssueTemplateResult,
  DeleteIssueTemplateResult,
  RemoveTemplateChildResult,
  UpdateIssueTemplateResult
} from "../../domain/schemas/issue-templates.js"
import {
  DEFAULT_INCLUDE_TEMPLATE_CHILDREN,
  UPDATE_ISSUE_TEMPLATE_FIELDS
} from "../../domain/schemas/issue-templates.js"
import { DEFAULT_ISSUE_PRIORITY } from "../../domain/schemas/issues.js"
import {
  ComponentLabel,
  Count,
  IssueTemplateChildId,
  IssueTemplateId,
  NonNegativeNumber,
  PersonName,
  Timestamp
} from "../../domain/schemas/shared.js"
import { PositiveTimeHours } from "../../domain/schemas/time.js"
import { assertAt } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  HulyConnectionError,
  HulyDataInvalidError,
  HulyError,
  InvalidStatusError,
  IssueNotFoundError,
  IssueReferenceError,
  NoUpdateFieldsError,
  ProjectNotFoundError
} from "../errors.js"
import {
  ComponentNotFoundError,
  IssueTemplateNotFoundError,
  PersonNotFoundError,
  TemplateChildNotFoundError
} from "../errors.js"
import { clearTextAsEmptyString } from "./clear-field-updates.js"
import { findComponentByIdOrLabel } from "./components.js"
import { findPersonByEmailOrName } from "./contacts-shared.js"
import { attachIssueChild } from "./issues-parent.js"
import { findProject, priorityToString, stringToPriority, zeroAsUnset } from "./issues-shared.js"
import { createIssueWithResolvedAssignee } from "./issues-write.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

import { contact, tracker } from "../huly-plugins.js"
import { type MarkupUrlConfig, optionalMarkdownToMarkup, optionalMarkupToMarkdown } from "./markup.js"

const NOT_FOUND_INDEX = -1

type ListIssueTemplatesError = HulyClientError | ProjectNotFoundError

type GetIssueTemplateError = HulyClientError | HulyDataInvalidError | ProjectNotFoundError | IssueTemplateNotFoundError

type CreateIssueTemplateError = HulyClientError | ProjectNotFoundError | PersonNotFoundError | ComponentNotFoundError

type CreateIssueFromTemplateError =
  | HulyClientError
  | HulyConnectionError
  | HulyDataInvalidError
  | HulyError
  | ProjectNotFoundError
  | IssueNotFoundError
  | IssueReferenceError
  | IssueTemplateNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

type UpdateIssueTemplateError =
  | HulyClientError
  | NoUpdateFieldsError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | PersonNotFoundError
  | ComponentNotFoundError

type DeleteIssueTemplateError = HulyClientError | ProjectNotFoundError | IssueTemplateNotFoundError

type AddTemplateChildError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | PersonNotFoundError
  | ComponentNotFoundError

type RemoveTemplateChildError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | TemplateChildNotFoundError

const findTemplateByIdOrTitle = (
  client: HulyClient["Service"],
  projectId: Ref<HulyProject>,
  templateIdOrTitle: string
): Effect.Effect<HulyIssueTemplate | undefined, HulyClientError> =>
  Effect.gen(function* () {
    const template =
      (yield* client.findOne<HulyIssueTemplate>(tracker.class.IssueTemplate, {
        space: projectId,
        _id: toRef<HulyIssueTemplate>(templateIdOrTitle)
      })) ??
      (yield* client.findOne<HulyIssueTemplate>(tracker.class.IssueTemplate, {
        space: projectId,
        title: templateIdOrTitle
      }))

    return template
  })

const findProjectAndTemplate = (params: {
  project: string
  template: string
}): Effect.Effect<
  { client: HulyClient["Service"]; project: HulyProject; template: HulyIssueTemplate },
  ProjectNotFoundError | IssueTemplateNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)

    const template = yield* findTemplateByIdOrTitle(client, project._id, params.template)

    if (template === undefined) {
      return yield* new IssueTemplateNotFoundError({ identifier: params.template, project: params.project })
    }

    return { client, project, template }
  })

// --- Child resolution helpers ---

const resolveTemplateReferenceLabels = (
  client: HulyClient["Service"],
  assignee: Ref<Person> | null,
  component: Ref<HulyComponent> | null
): Effect.Effect<{ readonly assigneeName?: string; readonly componentLabel?: string }, HulyClientError> =>
  Effect.gen(function* () {
    const assigneeName =
      assignee === null
        ? undefined
        : (yield* client.findOne<Person>(contact.class.Person, hulyQuery<Person>({ _id: assignee })))?.name
    const componentLabel =
      component === null
        ? undefined
        : (yield* client.findOne<HulyComponent>(tracker.class.Component, hulyQuery<HulyComponent>({ _id: component })))
            ?.label
    return {
      ...(assigneeName === undefined ? {} : { assigneeName }),
      ...(componentLabel === undefined ? {} : { componentLabel })
    }
  })

const templateChildProjection = (
  child: HulyIssueTemplateChild,
  description: string | undefined,
  labels: Effect.Success<ReturnType<typeof resolveTemplateReferenceLabels>>
): IssueTemplateChild => {
  const rawEstimation = zeroAsUnset(NonNegativeNumber.make(child.estimation))
  const estimation = rawEstimation === undefined ? undefined : PositiveTimeHours.make(rawEstimation)
  return {
    id: IssueTemplateChildId.make(child.id),
    title: child.title,
    priority: priorityToString(child.priority),
    ...(description === undefined ? {} : { description }),
    ...(labels.assigneeName === undefined ? {} : { assignee: PersonName.make(labels.assigneeName) }),
    ...(labels.componentLabel === undefined ? {} : { component: ComponentLabel.make(labels.componentLabel) }),
    ...(estimation === undefined ? {} : { estimation })
  }
}

/**
 * Resolve a single HulyIssueTemplateChild to our domain IssueTemplateChild.
 * Looks up assignee name and component label from refs.
 */
const resolveChild = (
  client: HulyClient["Service"],
  markupUrlConfig: MarkupUrlConfig,
  child: HulyIssueTemplateChild
): Effect.Effect<IssueTemplateChild, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const labels = yield* resolveTemplateReferenceLabels(client, child.assignee, child.component)
    const description = child.description
      ? yield* optionalMarkupToMarkdown(child.description, markupUrlConfig, "", {
          operation: "getIssueTemplate",
          entity: "issue template child description"
        })
      : undefined
    return templateChildProjection(child, description, labels)
  })

/**
 * Build a HulyIssueTemplateChild from a ChildTemplateInput, resolving assignee and component refs.
 */
const buildTemplateChild = (
  client: HulyClient["Service"],
  markupUrlConfig: MarkupUrlConfig,
  projectId: Ref<HulyProject>,
  projectIdentifier: string,
  input: ChildTemplateInput
): Effect.Effect<HulyIssueTemplateChild, PersonNotFoundError | ComponentNotFoundError | HulyClientError> =>
  Effect.gen(function* () {
    const assigneeParam = input.assignee
    const assigneeRef: Ref<Person> | null =
      assigneeParam !== undefined
        ? yield* Effect.gen(function* () {
            const person = yield* findPersonByEmailOrName(client, assigneeParam)
            if (person === undefined) {
              return yield* new PersonNotFoundError({ identifier: assigneeParam })
            }
            return person._id
          })
        : null

    const componentParam = input.component
    const componentRef: Ref<HulyComponent> | null =
      componentParam !== undefined
        ? yield* Effect.gen(function* () {
            const component = yield* findComponentByIdOrLabel(client, projectId, componentParam)
            if (component === undefined) {
              return yield* new ComponentNotFoundError({ identifier: componentParam, project: projectIdentifier })
            }
            return component._id
          })
        : null

    return {
      id: generateId<HulyIssue>(),
      title: input.title,
      description: optionalMarkdownToMarkup(input.description, markupUrlConfig, ""),
      priority: stringToPriority(input.priority ?? DEFAULT_ISSUE_PRIORITY),
      assignee: assigneeRef,
      component: componentRef,
      estimation: input.estimation ?? 0
    }
  })

// --- Operations ---

export const listIssueTemplates = (
  params: ListIssueTemplatesParams
): Effect.Effect<Array<IssueTemplateSummary>, ListIssueTemplatesError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)

    const limit = clampLimit(params.limit)

    const templates = yield* client.findAll<HulyIssueTemplate>(
      tracker.class.IssueTemplate,
      { space: project._id },
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )

    const summaries: Array<IssueTemplateSummary> = templates.map((t) => {
      const base: IssueTemplateSummary = {
        id: IssueTemplateId.make(t._id),
        title: t.title,
        priority: priorityToString(t.priority),
        modifiedOn: Timestamp.make(t.modifiedOn)
      }
      // exactOptionalPropertyTypes: only set childrenCount when > 0
      if (t.children.length > 0) {
        return { ...base, childrenCount: Count.make(t.children.length) }
      }
      return base
    })

    return summaries
  })

export const getIssueTemplate = (
  params: GetIssueTemplateParams
): Effect.Effect<IssueTemplate, GetIssueTemplateError, HulyClient> =>
  Effect.gen(function* () {
    const { client, template } = yield* findProjectAndTemplate(params)
    const markupUrlConfig = client.markupUrlConfig

    const labels = yield* resolveTemplateReferenceLabels(client, template.assignee, template.component)
    const description = yield* optionalMarkupToMarkdown(template.description, markupUrlConfig, "", {
      operation: "getIssueTemplate",
      entity: "issue template description"
    })

    const resolvedChildren: Array<IssueTemplateChild> = []
    for (const child of template.children) {
      resolvedChildren.push(yield* resolveChild(client, markupUrlConfig, child))
    }

    const result: IssueTemplate = {
      id: IssueTemplateId.make(template._id),
      title: template.title,
      description,
      priority: priorityToString(template.priority),
      assignee: labels.assigneeName !== undefined ? PersonName.make(labels.assigneeName) : undefined,
      component: labels.componentLabel !== undefined ? ComponentLabel.make(labels.componentLabel) : undefined,
      estimation: template.estimation > 0 ? PositiveTimeHours.make(template.estimation) : undefined,
      project: params.project,
      modifiedOn: Timestamp.make(template.modifiedOn),
      createdOn: template.createdOn === undefined ? undefined : Timestamp.make(template.createdOn)
    }

    // exactOptionalPropertyTypes: only set children when non-empty
    if (resolvedChildren.length > 0) {
      return { ...result, children: resolvedChildren }
    }
    return result
  })

export const createIssueTemplate = (
  params: CreateIssueTemplateParams
): Effect.Effect<CreateIssueTemplateResult, CreateIssueTemplateError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)
    const markupUrlConfig = client.markupUrlConfig

    const templateId: Ref<HulyIssueTemplate> = generateId()

    const assigneeParam = params.assignee
    const assigneeRef: Ref<Person> | null =
      assigneeParam !== undefined
        ? yield* Effect.gen(function* () {
            const person = yield* findPersonByEmailOrName(client, assigneeParam)
            if (person === undefined) {
              return yield* new PersonNotFoundError({ identifier: assigneeParam })
            }
            return person._id
          })
        : null

    const componentParam = params.component
    const componentRef: Ref<HulyComponent> | null =
      componentParam !== undefined
        ? yield* Effect.gen(function* () {
            const component = yield* findComponentByIdOrLabel(client, project._id, componentParam)
            if (component === undefined) {
              return yield* new ComponentNotFoundError({ identifier: componentParam, project: params.project })
            }
            return component._id
          })
        : null

    const priority = stringToPriority(params.priority ?? DEFAULT_ISSUE_PRIORITY)

    // Build children from input if provided
    const children: Array<HulyIssueTemplateChild> = []
    if (params.children !== undefined) {
      for (const childInput of params.children) {
        children.push(yield* buildTemplateChild(client, markupUrlConfig, project._id, params.project, childInput))
      }
    }

    const templateData: Data<HulyIssueTemplate> = {
      title: params.title,
      description: optionalMarkdownToMarkup(params.description, markupUrlConfig, ""),
      priority,
      assignee: assigneeRef,
      component: componentRef,
      estimation: params.estimation ?? 0,
      children,
      comments: 0
    }

    yield* client.createDoc(tracker.class.IssueTemplate, project._id, templateData, templateId)

    return { id: IssueTemplateId.make(templateId), title: params.title }
  })

const resolveIssueFromTemplateAssignee = (
  client: HulyClient["Service"],
  params: CreateIssueFromTemplateParams,
  template: HulyIssueTemplate
): Effect.Effect<Ref<Person> | null, HulyClientError | PersonNotFoundError> =>
  Effect.gen(function* () {
    if (params.assignee === undefined) {
      if (template.assignee === null) return null
      const templatePerson = yield* client.findOne<Person>(
        contact.class.Person,
        hulyQuery<Person>({ _id: template.assignee })
      )
      return templatePerson?._id ?? null
    }
    const person = yield* findPersonByEmailOrName(client, params.assignee)
    if (person === undefined) return yield* new PersonNotFoundError({ identifier: params.assignee })
    return person._id
  })

const templateChildCreateParams = (
  params: CreateIssueFromTemplateParams,
  child: HulyIssueTemplateChild,
  markupUrlConfig: MarkupUrlConfig
) =>
  optionalMarkupToMarkdown(child.description, markupUrlConfig, undefined, {
    operation: "createIssueFromTemplate",
    entity: "issue template child description"
  }).pipe(
    Effect.map(
      (description): CreateIssueParams => ({
        project: params.project,
        title: child.title,
        priority: priorityToString(child.priority),
        ...(description === undefined ? {} : { description })
      })
    )
  )

const templateChildUpdate = (child: HulyIssueTemplateChild): DocumentUpdate<HulyIssue> => ({
  ...(child.assignee === null ? {} : { assignee: child.assignee }),
  ...(child.component === null ? {} : { component: child.component }),
  ...(child.estimation > 0 ? { estimation: child.estimation } : {})
})

const createTemplateChildIssues = (
  client: HulyClient["Service"],
  project: HulyProject,
  template: HulyIssueTemplate,
  params: CreateIssueFromTemplateParams,
  parentResult: Effect.Success<ReturnType<typeof createIssueWithResolvedAssignee>>,
  title: CreateIssueParams["title"],
  markupUrlConfig: MarkupUrlConfig
): Effect.Effect<void, CreateIssueFromTemplateError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const parentIssue = {
      _id: toRef<HulyIssue>(parentResult.issueId),
      identifier: parentResult.identifier,
      title,
      parents: []
    }
    for (const child of template.children) {
      const childParams = yield* templateChildCreateParams(params, child, markupUrlConfig)
      const childResult = yield* createIssueWithResolvedAssignee(childParams, null)
      yield* attachIssueChild(
        client,
        project._id,
        toRef<HulyIssue>(childResult.issueId),
        parentIssue,
        templateChildUpdate(child)
      )
    }
  })

/**
 * Create an issue from a template, optionally including sub-issues from template children.
 *
 * Children are created as native top-level issues, then attached by direct ID.
 * Direct updates avoid read-after-write lookup of the just-created parent.
 */
export const createIssueFromTemplate = (
  params: CreateIssueFromTemplateParams
): Effect.Effect<CreateIssueFromTemplateResult, CreateIssueFromTemplateError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, project, template } = yield* findProjectAndTemplate(params)
    const markupUrlConfig = client.markupUrlConfig

    const title = params.title ?? template.title
    const description =
      params.description ??
      (yield* optionalMarkupToMarkdown(template.description, markupUrlConfig, undefined, {
        operation: "createIssueFromTemplate",
        entity: "issue template description"
      }))
    const priority = params.priority ?? priorityToString(template.priority)

    const assignee = yield* resolveIssueFromTemplateAssignee(client, params, template)

    const issueParams: CreateIssueParams = {
      project: params.project,
      title,
      description,
      priority,
      status: params.status
    }

    const result = yield* createIssueWithResolvedAssignee(issueParams, assignee)

    if (template.component !== null) {
      yield* client.updateDoc(tracker.class.Issue, project._id, toRef<HulyIssue>(result.issueId), {
        component: template.component
      })
    }

    // Create sub-issues from template children if includeChildren is not false
    const includeChildren = params.includeChildren ?? DEFAULT_INCLUDE_TEMPLATE_CHILDREN
    if (includeChildren && template.children.length > 0) {
      yield* createTemplateChildIssues(client, project, template, params, result, title, markupUrlConfig)
      return { ...result, childrenCreated: Count.make(template.children.length) }
    }

    return result
  })

export const updateIssueTemplate = (
  params: UpdateIssueTemplateParams
): Effect.Effect<UpdateIssueTemplateResult, UpdateIssueTemplateError, HulyClient> =>
  Effect.gen(function* () {
    yield* requireUpdateFields("update_issue_template", params, UPDATE_ISSUE_TEMPLATE_FIELDS)

    const { client, project, template } = yield* findProjectAndTemplate(params)
    const markupUrlConfig = client.markupUrlConfig

    type UpdateIssueTemplateField = (typeof UPDATE_ISSUE_TEMPLATE_FIELDS)[number]
    type UpdateIssueTemplateEntries = {
      readonly [Field in UpdateIssueTemplateField]: Effect.Effect<
        DirectUpdateEntry<UpdateIssueTemplateField, DocumentUpdate<HulyIssueTemplate>, Field>,
        HulyClientError | ComponentNotFoundError | PersonNotFoundError
      >
    }
    const updateEntries = {
      title: Effect.succeed(params.title === undefined ? {} : { title: params.title }),
      description: Effect.succeed(
        params.description === undefined
          ? {}
          : { description: optionalMarkdownToMarkup(clearTextAsEmptyString(params.description), markupUrlConfig, "") }
      ),
      priority: Effect.succeed(params.priority === undefined ? {} : { priority: stringToPriority(params.priority) }),
      assignee: Effect.gen(function* () {
        if (params.assignee === undefined) return {}
        if (params.assignee === null) return { assignee: null }
        const person = yield* findPersonByEmailOrName(client, params.assignee)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: params.assignee })
        }
        return { assignee: person._id }
      }),
      component: Effect.gen(function* () {
        if (params.component === undefined) return {}
        if (params.component === null) return { component: null }
        const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
        if (component === undefined) {
          return yield* new ComponentNotFoundError({ identifier: params.component, project: params.project })
        }
        return { component: component._id }
      }),
      estimation: Effect.succeed(
        params.estimation === undefined ? {} : { estimation: params.estimation === null ? 0 : params.estimation }
      )
    } satisfies UpdateIssueTemplateEntries
    const updateOps: DocumentUpdate<HulyIssueTemplate> = mergeUpdateEntries(
      yield* Effect.all(Object.values(updateEntries))
    )

    yield* client.updateDoc(tracker.class.IssueTemplate, project._id, template._id, updateOps)

    return { id: IssueTemplateId.make(template._id), updated: true }
  })

export const deleteIssueTemplate = (
  params: DeleteIssueTemplateParams
): Effect.Effect<DeleteIssueTemplateResult, DeleteIssueTemplateError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    yield* client.removeDoc(tracker.class.IssueTemplate, project._id, template._id)

    return { id: IssueTemplateId.make(template._id), deleted: true }
  })

export const addTemplateChild = (
  params: AddTemplateChildParams
): Effect.Effect<AddTemplateChildResult, AddTemplateChildError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project, template } = yield* findProjectAndTemplate(params)
    const markupUrlConfig = client.markupUrlConfig

    const child = yield* buildTemplateChild(client, markupUrlConfig, project._id, params.project, {
      title: params.title,
      description: params.description,
      priority: params.priority,
      assignee: params.assignee,
      component: params.component,
      estimation: params.estimation
    })

    const newChildren = [...template.children, child]

    yield* client.updateDoc(tracker.class.IssueTemplate, project._id, template._id, { children: newChildren })

    return { id: IssueTemplateChildId.make(child.id), title: child.title, added: true }
  })

export const removeTemplateChild = (
  params: RemoveTemplateChildParams
): Effect.Effect<RemoveTemplateChildResult, RemoveTemplateChildError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    // String() needed: c.id is Ref<Issue>, params.childId is IssueTemplateChildId — both plain strings at runtime
    const childIndex = template.children.findIndex((c) => String(c.id) === String(params.childId))
    if (childIndex === NOT_FOUND_INDEX) {
      return yield* new TemplateChildNotFoundError({
        childId: params.childId,
        template: params.template,
        project: params.project
      })
    }

    const removedChild = assertAt(template.children, childIndex)
    const newChildren = template.children.filter((_, i) => i !== childIndex)

    yield* client.updateDoc(tracker.class.IssueTemplate, project._id, template._id, { children: newChildren })

    return { id: IssueTemplateChildId.make(removedChild.id), title: removedChild.title, removed: true }
  })
