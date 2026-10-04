import type { Component, Milestone, Project } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import {
  MAX_SUPPORTED_ATTRIBUTE_VALUES,
  TransferComponentValueSchema,
  TransferMilestoneValueSchema
} from "../../domain/schemas/issue-transfer-attributes.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { Count, type DocId } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import { toRef } from "./sdk-boundary.js"
import { hulyQuery } from "./query-helpers.js"
import type { AttributeInventory } from "./issue-transfer-attribute-resolution.js"

const QUERY_LIMIT = MAX_SUPPORTED_ATTRIBUTE_VALUES + 1
export const inspectTransferAttributes = Effect.fn("transfer.inspectAttributes")(function* (
  client: HulyClient["Service"],
  source: MovementProject,
  destination: MovementProject
) {
  const inventories: Array<AttributeInventory> = []
  for (const field of ["component", "milestone"] satisfies Array<AttributeInventory["field"]>) {
    const sourceRows =
      field === "component"
        ? yield* client.findAll<Component>(
            tracker.class.Component,
            hulyQuery<Component>({ space: toRef<Project>(source._id) }),
            { limit: QUERY_LIMIT, total: true }
          )
        : yield* client.findAll<Milestone>(
            tracker.class.Milestone,
            hulyQuery<Milestone>({ space: toRef<Project>(source._id) }),
            { limit: QUERY_LIMIT, total: true }
          )
    const destinationRows =
      field === "component"
        ? yield* client.findAll<Component>(
            tracker.class.Component,
            hulyQuery<Component>({ space: toRef<Project>(destination._id) }),
            { limit: QUERY_LIMIT, total: true }
          )
        : yield* client.findAll<Milestone>(
            tracker.class.Milestone,
            hulyQuery<Milestone>({ space: toRef<Project>(destination._id) }),
            { limit: QUERY_LIMIT, total: true }
          )
    inventories.push(makeInventory(field, sourceRows, destinationRows, source._id, destination._id))
  }
  return inventories
})

// SDK metadata and rows are decoded before becoming inventory facts.
type RawRows = ReadonlyArray<unknown> & { readonly total: unknown }
interface ParsedRows<A> {
  readonly values: ReadonlyArray<A>
  readonly complete: boolean
}
const parseRows = <A extends { readonly _id: DocId; readonly space: DocId }>(
  schema: Schema.ConstraintDecoder<A>,
  rows: RawRows,
  space: DocId
): ParsedRows<A> => {
  const values = rows.flatMap((row) => {
    const parsed = parseAttribute(schema, row)
    return parsed._tag === "Some" && parsed.value.space === space ? [parsed.value] : []
  })
  const total = Schema.decodeUnknownOption(Count)(rows.total)
  return {
    values,
    complete:
      total._tag === "Some" && total.value === rows.length && rows.length < QUERY_LIMIT && values.length === rows.length
  }
}
const parseAttribute = <A>(schema: Schema.ConstraintDecoder<A>, input: unknown) =>
  Schema.decodeUnknownOption(schema)(input)
const makeInventory = (
  field: AttributeInventory["field"],
  sourceRows: RawRows,
  destinationRows: RawRows,
  sourceId: DocId,
  destinationId: DocId
): AttributeInventory => {
  if (field === "component") {
    const source = parseRows(TransferComponentValueSchema, sourceRows, sourceId)
    const destination = parseRows(TransferComponentValueSchema, destinationRows, destinationId)
    return {
      field,
      source: source.values,
      destination: destination.values,
      complete: completeInventory(source, destination)
    }
  }
  const source = parseRows(TransferMilestoneValueSchema, sourceRows, sourceId)
  const destination = parseRows(TransferMilestoneValueSchema, destinationRows, destinationId)
  return {
    field,
    source: source.values,
    destination: destination.values,
    complete: completeInventory(source, destination)
  }
}
const completeInventory = <A extends { readonly _id: DocId }>(source: ParsedRows<A>, destination: ParsedRows<A>) => {
  const values = [...source.values, ...destination.values]
  return source.complete && destination.complete && new Set(values.map((value) => value._id)).size === values.length
}
