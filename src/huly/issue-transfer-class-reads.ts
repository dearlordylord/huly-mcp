import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import { Effect } from "effect"
import type { ObjectClassName } from "../domain/schemas/shared.js"
import { makeOperationConnectionError } from "./errors-base.js"
import type { RecordOwner } from "./issue-transfer-records.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"

export const OWNER_CLASS_READ_CONCURRENCY = 4

export const readAttachedClassWindow = Effect.fn("transfer.readClassWindow")(function* (
  client: TxOperations,
  owner: RecordOwner,
  classes: ReadonlyArray<ObjectClassName>,
  resultLimit: number
) {
  return yield* Effect.forEach(
    classes,
    (cls) =>
      Effect.tryPromise({
        try: () =>
          client.findAll<AttachedDoc>(
            toClassRef<AttachedDoc>(cls),
            hulyQuery<AttachedDoc>({ attachedTo: toRef<Doc>(owner._id) }),
            { limit: resultLimit, total: true }
          ),
        catch: (cause) => makeOperationConnectionError("findAll", cause)
      }).pipe(
        Effect.result,
        Effect.map((result) => ({ cls, result }))
      ),
    { concurrency: OWNER_CLASS_READ_CONCURRENCY }
  )
})
