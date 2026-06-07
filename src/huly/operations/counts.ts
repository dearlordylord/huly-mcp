import { Count, type ListTotal, UNKNOWN_TOTAL } from "../../domain/schemas/shared.js"

export const listTotal = (value: number): ListTotal => value === UNKNOWN_TOTAL ? UNKNOWN_TOTAL : Count.make(value)

export const optionalCount = (value: number | undefined): Count | undefined =>
  value === undefined ? undefined : Count.make(value)
