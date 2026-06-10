/**
 * Component domain operations for Huly MCP server.
 *
 * Provides typed operations for managing components within Huly projects.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Employee, Person } from "@hcengineering/contact"
import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { Component as HulyComponent, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  Component,
  ComponentSummary,
  CreateComponentParams,
  DeleteComponentParams,
  GetComponentParams,
  ListComponentsParams,
  SetIssueComponentParams,
  UpdateComponentParams
} from "../../domain/schemas.js"
import type {
  CreateComponentResult,
  DeleteComponentResult,
  SetIssueComponentResult,
  UpdateComponentResult
} from "../../domain/schemas/components.js"
import { UPDATE_COMPONENT_FIELDS } from "../../domain/schemas/components.js"
import { ComponentId, ComponentLabel, IssueIdentifier, PersonName, Timestamp } from "../../domain/schemas/shared.js"
import { isExistent } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { HulyConnectionError, IssueNotFoundError, NoUpdateFieldsError, ProjectNotFoundError } from "../errors.js"
import { ComponentNotFoundError, PersonNotFoundError } from "../errors.js"
import { clearTextAsEmptyString } from "./clear-field-updates.js"
import { findPersonByEmailOrName } from "./contacts-shared.js"
import { findProject, findProjectAndIssue } from "./issues-shared.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

import { contact, tracker } from "../huly-plugins.js"
import { optionalMarkdownToMarkup, optionalMarkupToMarkdown } from "./markup.js"

type ListComponentsError =
  | HulyClientError
  | ProjectNotFoundError

type GetComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | ComponentNotFoundError

type CreateComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | PersonNotFoundError

type UpdateComponentError =
  | HulyClientError
  | HulyConnectionError
  | NoUpdateFieldsError
  | ProjectNotFoundError
  | ComponentNotFoundError
  | PersonNotFoundError

type SetIssueComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | ComponentNotFoundError

type DeleteComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | ComponentNotFoundError

export const findComponentByIdOrLabel = (
  client: HulyClient["Type"],
  projectId: Ref<HulyProject>,
  componentIdOrLabel: string
): Effect.Effect<HulyComponent | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const component = (yield* client.findOne<HulyComponent>(
      tracker.class.Component,
      {
        space: projectId,
        _id: toRef<HulyComponent>(componentIdOrLabel)
      }
    )) ?? (yield* client.findOne<HulyComponent>(
      tracker.class.Component,
      {
        space: projectId,
        label: componentIdOrLabel
      }
    ))

    return component
  })

const findProjectAndComponent = (
  params: { project: string; component: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; component: HulyComponent },
  ProjectNotFoundError | ComponentNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const component = yield* findComponentByIdOrLabel(client, project._id, params.component)

    if (component === undefined) {
      return yield* new ComponentNotFoundError({
        identifier: params.component,
        project: params.project
      })
    }

    return { client, project, component }
  })

export const listComponents = (
  params: ListComponentsParams
): Effect.Effect<Array<ComponentSummary>, ListComponentsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const limit = Math.min(params.limit ?? 50, 200)

    const components = yield* client.findAll<HulyComponent>(
      tracker.class.Component,
      { space: project._id },
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const leadIds = [
      ...new Set(
        components.map(c => c.lead).filter(isExistent)
      )
    ]

    const persons = leadIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: leadIds } }
      )
      : []

    const personMap = new Map(persons.map(p => [p._id, p]))

    const summaries: Array<ComponentSummary> = components.map(c => {
      const leadName = c.lead !== null ? personMap.get(c.lead)?.name : undefined
      return {
        id: ComponentId.make(c._id),
        label: ComponentLabel.make(c.label),
        lead: leadName !== undefined ? PersonName.make(leadName) : undefined,
        modifiedOn: Timestamp.make(c.modifiedOn)
      }
    })

    return summaries
  })

export const getComponent = (
  params: GetComponentParams
): Effect.Effect<Component, GetComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, component } = yield* findProjectAndComponent(params)
    const markupUrlConfig = client.markupUrlConfig

    const leadName = component.lead !== null
      ? (yield* client.findOne<Person>(contact.class.Person, { _id: component.lead }))?.name
      : undefined

    const result: Component = {
      id: ComponentId.make(component._id),
      label: ComponentLabel.make(component.label),
      description: optionalMarkupToMarkdown(component.description, markupUrlConfig, undefined),
      lead: leadName !== undefined ? PersonName.make(leadName) : undefined,
      project: params.project,
      modifiedOn: Timestamp.make(component.modifiedOn),
      createdOn: component.createdOn === undefined ? undefined : Timestamp.make(component.createdOn)
    }

    return result
  })

export const createComponent = (
  params: CreateComponentParams
): Effect.Effect<CreateComponentResult, CreateComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)
    const markupUrlConfig = client.markupUrlConfig

    const componentId: Ref<HulyComponent> = generateId()

    const leadParam = params.lead
    const leadRef: Ref<Employee> | null = leadParam !== undefined
      ? yield* Effect.gen(function*() {
        const person = yield* findPersonByEmailOrName(client, leadParam)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: leadParam })
        }
        // Huly API: Component.lead expects Ref<Employee>, but we look up Person by email.
        // Employee extends Person, so this is safe when person is actually an employee.
        return toRef<Employee>(person._id)
      })
      : null

    const componentData: Data<HulyComponent> = {
      label: params.label,
      description: optionalMarkdownToMarkup(params.description, markupUrlConfig, ""),
      lead: leadRef,
      comments: 0
    }

    yield* client.createDoc(
      tracker.class.Component,
      project._id,
      componentData,
      componentId
    )

    return { id: ComponentId.make(componentId), label: ComponentLabel.make(params.label) }
  })

export const updateComponent = (
  params: UpdateComponentParams
): Effect.Effect<UpdateComponentResult, UpdateComponentError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_component", params, UPDATE_COMPONENT_FIELDS)

    const { client, component, project } = yield* findProjectAndComponent(params)
    const markupUrlConfig = client.markupUrlConfig

    type UpdateComponentField = typeof UPDATE_COMPONENT_FIELDS[number]
    type UpdateComponentEntries = {
      readonly [Field in UpdateComponentField]: Effect.Effect<
        DirectUpdateEntry<UpdateComponentField, DocumentUpdate<HulyComponent>, Field>,
        HulyClientError | PersonNotFoundError
      >
    }
    const updateEntries = {
      label: Effect.succeed(params.label === undefined ? {} : { label: params.label }),
      description: Effect.succeed(
        params.description === undefined
          ? {}
          : { description: optionalMarkdownToMarkup(clearTextAsEmptyString(params.description), markupUrlConfig, "") }
      ),
      lead: Effect.gen(function*() {
        if (params.lead === undefined) return {}
        if (params.lead === null) return { lead: null }
        const person = yield* findPersonByEmailOrName(client, params.lead)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: params.lead })
        }
        // Huly API: Component.lead expects Ref<Employee>, but we look up Person by email.
        // Employee extends Person, so this is safe when person is actually an employee.
        return { lead: toRef<Employee>(person._id) }
      })
    } satisfies UpdateComponentEntries
    const updateOps: DocumentUpdate<HulyComponent> = mergeUpdateEntries(yield* Effect.all(Object.values(updateEntries)))

    yield* client.updateDoc(
      tracker.class.Component,
      project._id,
      component._id,
      updateOps
    )

    return { id: ComponentId.make(component._id), updated: true }
  })

export const setIssueComponent = (
  params: SetIssueComponentParams
): Effect.Effect<SetIssueComponentResult, SetIssueComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    const componentParam = params.component
    const componentRef: Ref<HulyComponent> | null = componentParam !== null
      ? yield* Effect.gen(function*() {
        const component = yield* findComponentByIdOrLabel(client, project._id, componentParam)

        if (component === undefined) {
          return yield* new ComponentNotFoundError({
            identifier: componentParam,
            project: params.project
          })
        }

        return component._id
      })
      : null

    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      { component: componentRef }
    )

    return { identifier: IssueIdentifier.make(issue.identifier), componentSet: true }
  })

export const deleteComponent = (
  params: DeleteComponentParams
): Effect.Effect<DeleteComponentResult, DeleteComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, component, project } = yield* findProjectAndComponent(params)

    yield* client.removeDoc(
      tracker.class.Component,
      project._id,
      component._id
    )

    return { id: ComponentId.make(component._id), deleted: true }
  })
