import { Count, DEFAULT_LIMIT, NonNegativeInteger } from "../../domain/schemas.js"

export const pageHrRequestResults = <T>(
  items: ReadonlyArray<T>,
  limitInput: number | undefined,
  offsetInput: number | undefined
) => {
  const limit = limitInput ?? DEFAULT_LIMIT
  const offset = offsetInput ?? 0
  const values = items.slice(offset, offset + limit)
  const next = offset + values.length
  return {
    values,
    total: Count.make(items.length),
    offset: NonNegativeInteger.make(offset),
    returned: Count.make(values.length),
    truncated: next < items.length,
    ...(next < items.length ? { nextOffset: NonNegativeInteger.make(next) } : {})
  }
}
