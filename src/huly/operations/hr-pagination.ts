import type { Class, Doc, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Option, Schema, Stream } from "effect"

import { PositiveInteger } from "../../domain/schemas.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"

export const HrPageSize = PositiveInteger.pipe(Schema.brand("HrPageSize"))
export type HrPageSize = Schema.Schema.Type<typeof HrPageSize>
const DEFAULT_HR_PAGE_SIZE_VALUE = 200
export const DEFAULT_HR_PAGE_SIZE = HrPageSize.make(DEFAULT_HR_PAGE_SIZE_VALUE)

export const collectHrPages = Effect.fn("HrPagination.collectPages")(function* <A, C, E>(
  fetchPage: (excluded: ReadonlyArray<C>, pageSize: HrPageSize) => Effect.Effect<ReadonlyArray<A>, E>,
  cursorOf: (value: A) => C,
  pageSize: HrPageSize = DEFAULT_HR_PAGE_SIZE
): Effect.fn.Return<ReadonlyArray<A>, E> {
  const stream = Stream.paginate<ReadonlyArray<C>, A, E>([], (excluded) =>
    Effect.map(fetchPage(excluded, pageSize), (page) => {
      const next =
        page.length < pageSize ? Option.none<ReadonlyArray<C>>() : Option.some([...excluded, ...page.map(cursorOf)])
      return [page, next] satisfies readonly [ReadonlyArray<A>, Option.Option<ReadonlyArray<C>>]
    })
  )
  const initial: ReadonlyArray<A> = []
  return yield* Stream.runFold(
    stream,
    () => initial,
    (values, value) => [...values, value]
  )
})

export const loadAllHrDocuments = Effect.fn("HrPagination.loadAllDocuments")(function* <T extends Doc>(
  client: HulyClient["Service"],
  classRef: Ref<Class<T>>,
  query: StrictDocumentQuery<T>,
  pageSize: HrPageSize = DEFAULT_HR_PAGE_SIZE
): Effect.fn.Return<ReadonlyArray<T>, HulyClientError> {
  return yield* collectHrPages(
    (excluded, pageSize) => {
      const pageQuery: StrictDocumentQuery<T> = excluded.length === 0 ? query : { ...query, _id: { $nin: excluded } }
      return client.findAll<T>(classRef, hulyQuery(pageQuery), {
        limit: pageSize,
        sort: { modifiedOn: SortingOrder.Ascending }
      })
    },
    (document) => document._id,
    pageSize
  )
})
