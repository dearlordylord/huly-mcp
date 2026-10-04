import type { Component, Milestone, Project } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import {
  TransferAttributeValueSchema,
  TransferMilestoneStatusSchema,
  type TransferAttributeValue
} from "../../domain/schemas/issue-transfer-attributes.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { Timestamp } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import { toRef } from "./sdk-boundary.js"
import { hulyQuery } from "./query-helpers.js"
import type { AttributeInventory } from "./issue-transfer-attribute-resolution.js"

const LIMIT = 1_001
const ComponentSchema = Schema.Struct({
  ...TransferAttributeValueSchema.fields,
  lead: Schema.NullOr(TransferAttributeValueSchema.fields._id)
})
const MilestoneSchema = Schema.Struct({
  ...TransferAttributeValueSchema.fields,
  status: TransferMilestoneStatusSchema,
  targetDate: Timestamp
})
export const inspectTransferAttributes = Effect.fn("transfer.inspectAttributes")(function* (
  client: HulyClient["Service"],
  source: MovementProject,
  destination: MovementProject
) {
  const inventories: Array<AttributeInventory> = []
  for (const field of ["component", "milestone"] satisfies Array<AttributeInventory["field"]>) {
    const cls = field === "component" ? tracker.class.Component : tracker.class.Milestone
    const sourceRows =
      field === "component"
        ? yield* client.findAll<Component>(
            tracker.class.Component,
            hulyQuery<Component>({ space: toRef<Project>(source._id) }),
            { limit: LIMIT }
          )
        : yield* client.findAll<Milestone>(
            tracker.class.Milestone,
            hulyQuery<Milestone>({ space: toRef<Project>(source._id) }),
            { limit: LIMIT }
          )
    const destinationRows =
      field === "component"
        ? yield* client.findAll<Component>(
            tracker.class.Component,
            hulyQuery<Component>({ space: toRef<Project>(destination._id) }),
            { limit: LIMIT }
          )
        : yield* client.findAll<Milestone>(
            tracker.class.Milestone,
            hulyQuery<Milestone>({ space: toRef<Project>(destination._id) }),
            { limit: LIMIT }
          )
    const schema = field === "component" ? ComponentSchema : MilestoneSchema
    const rows = [...sourceRows, ...destinationRows].flatMap((row) => {
      const parsed = parseAttribute(schema, row)
      return parsed._tag === "Some" ? [parsed.value] : []
    })
    const valid = rows.filter((row) => row._class === String(cls))
    inventories.push({
      field,
      source: valid.filter((row) => row.space === source._id),
      destination: valid.filter((row) => row.space === destination._id),
      complete: inventoryComplete(sourceRows, destinationRows, rows, valid, source, destination)
    })
  }
  return inventories
})

const completeRows = (rows: ReadonlyArray<unknown> & { readonly total: number }) =>
  rows.total <= rows.length && rows.length < LIMIT

const correctSpaces = (rows: ReadonlyArray<{ readonly space: string }>, space: string) =>
  rows.every((row) => row.space === space)

const inventoryComplete = (
  sourceRows: ReadonlyArray<{ readonly space: string }> & { readonly total: number },
  destinationRows: ReadonlyArray<{ readonly space: string }> & { readonly total: number },
  rows: ReadonlyArray<TransferAttributeValue>,
  valid: ReadonlyArray<TransferAttributeValue>,
  source: MovementProject,
  destination: MovementProject
) =>
  rows.length === sourceRows.length + destinationRows.length &&
  completeRows(sourceRows) &&
  completeRows(destinationRows) &&
  valid.length === rows.length &&
  correctSpaces(sourceRows, source._id) &&
  correctSpaces(destinationRows, destination._id) &&
  new Set(rows.map((row) => row._id)).size === rows.length

const parseAttribute = (schema: Schema.ConstraintDecoder<TransferAttributeValue>, input: unknown) =>
  Schema.decodeUnknownOption(schema)(input)
