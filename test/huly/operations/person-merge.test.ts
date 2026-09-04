import { describe, it } from "@effect/vitest"
import { Effect, Layer, Ref, Schema } from "effect"
import { expect } from "vitest"

import {
  type MergePeopleParams,
  parseMergePeopleParams,
  PersonMergeReferenceImpactSchema
} from "../../../src/domain/schemas/person-merge.js"
import { HulyClient } from "../../../src/huly/client.js"
import {
  HulyDataInvalidError,
  PersonMergeAccountBlockedError,
  PersonMergePreflightMismatchError,
  PersonMergeSelfError,
  PersonNotFoundError
} from "../../../src/huly/errors.js"
import { decodeResolvedPerson } from "../../../src/huly/operations/person-administration-boundaries.js"
import { mergePeople, mergeResolvedPeople, personMergeImpact } from "../../../src/huly/operations/person-merge.js"
import { WorkspaceClient } from "../../../src/huly/workspace-client.js"

const resolvedPerson = (id: string, name: string, personUuid?: string) =>
  Effect.runSync(
    decodeResolvedPerson({
      _id: id,
      name,
      space: "contact:space:Contacts",
      avatarType: "color",
      ...(personUuid === undefined ? {} : { personUuid })
    })
  )

const source = resolvedPerson("source", "Source Person")
const survivor = resolvedPerson("survivor", "Survivor Person")

const reference = (
  category: "identity" | "channel" | "membership" | "comment" | "attachment" | "other",
  count: number
) =>
  Schema.decodeUnknownSync(PersonMergeReferenceImpactSchema)({
    attributeId: `attribute-${category}`,
    ownerClass: "core:class:Doc",
    concreteClass: `test:class:${category}`,
    field: "person",
    kind: "single",
    category,
    count
  })

const impacts = [
  reference("identity", 1),
  reference("channel", 2),
  reference("membership", 3),
  reference("comment", 4),
  reference("attachment", 5),
  reference("other", 6)
]

const previewParams = Effect.runSync(parseMergePeopleParams({ source: { id: "source" }, survivor: { id: "survivor" } }))

const run = <A, E>(effect: Effect.Effect<A, E, HulyClient | WorkspaceClient>, accountMergeable = true) =>
  Effect.gen(function* () {
    const migrations = yield* Ref.make(0)
    const accountMerges = yield* Ref.make(0)
    const result = yield* effect.pipe(
      Effect.provide(
        Layer.merge(
          HulyClient.testLayer({
            inspectPersonReferences: () => Effect.succeed(impacts),
            migratePersonReferences: () => Ref.update(migrations, (count) => count + 1)
          }),
          WorkspaceClient.testLayer({
            canMergeSpecifiedPersons: () => Effect.succeed(accountMergeable),
            mergeSpecifiedPersons: () => Ref.update(accountMerges, (count) => count + 1)
          })
        )
      )
    )
    return { result, migrations: yield* Ref.get(migrations), accountMerges: yield* Ref.get(accountMerges) }
  })

describe("person merge", () => {
  it("aggregates every supported reference category deterministically", () => {
    const impact = personMergeImpact([...impacts].reverse())
    expect(impact).toMatchObject({
      identities: 1,
      channels: 2,
      memberships: 3,
      comments: 4,
      attachments: 5,
      otherReferences: 6,
      totalReferences: 21
    })
    expect(impact.references.map(({ category }) => category)).toEqual([
      "attachment",
      "channel",
      "comment",
      "identity",
      "membership",
      "other"
    ])
  })

  it.effect("previews workspace-only people without mutating", () =>
    Effect.gen(function* () {
      const outcome = yield* run(mergeResolvedPeople(previewParams, source, survivor))
      expect(outcome.result).toMatchObject({
        executed: false,
        accountAction: "not-needed",
        sourceRecordRetained: true,
        impact: { totalReferences: 21 }
      })
      expect(outcome.result.preflightToken).toHaveLength(64)
      expect(outcome.migrations).toBe(0)
    })
  )

  it.effect("executes only with the exact current preflight token", () =>
    Effect.gen(function* () {
      const preview = (yield* run(mergeResolvedPeople(previewParams, source, survivor))).result
      const executeParams = yield* parseMergePeopleParams({
        source: { id: "source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: preview.preflightToken
      })
      const outcome = yield* run(mergeResolvedPeople(executeParams, source, survivor))
      expect(outcome.result.executed).toBe(true)
      expect(outcome.migrations).toBe(1)
      expect(outcome.accountMerges).toBe(0)
    })
  )

  it.effect("rejects self merges and stale tokens", () =>
    Effect.gen(function* () {
      const selfError = yield* Effect.flip(run(mergeResolvedPeople(previewParams, source, source)))
      expect(selfError).toBeInstanceOf(PersonMergeSelfError)
      expect(selfError.message).toContain("Choose two distinct people")

      const stale = yield* parseMergePeopleParams({
        source: { id: "source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: "stale"
      })
      const staleError = yield* Effect.flip(run(mergeResolvedPeople(stale, source, survivor)))
      expect(staleError).toBeInstanceOf(PersonMergePreflightMismatchError)
      expect(staleError.message).toContain("changed since preflight")
    })
  )

  it.effect("blocks global merges that Huly cannot safely perform", () =>
    Effect.gen(function* () {
      const globalSource = resolvedPerson("source", "Source Person", "source-uuid")
      const globalSurvivor = resolvedPerson("survivor", "Survivor Person", "survivor-uuid")
      const preview = (yield* run(mergeResolvedPeople(previewParams, globalSource, globalSurvivor), false)).result
      expect(preview.accountAction).toBe("blocked")
      const execute = yield* parseMergePeopleParams({
        source: { id: "source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: preview.preflightToken
      })
      const error = yield* Effect.flip(run(mergeResolvedPeople(execute, globalSource, globalSurvivor), false))
      expect(error).toBeInstanceOf(PersonMergeAccountBlockedError)
      expect(error.message).toContain("cannot safely merge")
    })
  )

  it.effect("merges distinct eligible global people after workspace references", () =>
    Effect.gen(function* () {
      const globalSource = resolvedPerson("source", "Source Person", "source-uuid")
      const globalSurvivor = resolvedPerson("survivor", "Survivor Person", "survivor-uuid")
      const preview = (yield* run(mergeResolvedPeople(previewParams, globalSource, globalSurvivor))).result
      expect(preview.accountAction).toBe("ready")
      const execute: MergePeopleParams = yield* parseMergePeopleParams({
        source: { id: "source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: preview.preflightToken
      })
      const outcome = yield* run(mergeResolvedPeople(execute, globalSource, globalSurvivor))
      expect(outcome.result.accountAction).toBe("merged")
      expect(outcome.migrations).toBe(1)
      expect(outcome.accountMerges).toBe(1)
    })
  )

  it.effect("reports already-unified global people without invoking the account merge", () =>
    Effect.gen(function* () {
      const globalSource = resolvedPerson("source", "Source Person", "shared-uuid")
      const globalSurvivor = resolvedPerson("survivor", "Survivor Person", "shared-uuid")
      const preview = (yield* run(mergeResolvedPeople(previewParams, globalSource, globalSurvivor))).result
      expect(preview.accountAction).toBe("already-unified")
      const execute = yield* parseMergePeopleParams({
        source: { id: "source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: preview.preflightToken
      })
      const outcome = yield* run(mergeResolvedPeople(execute, globalSource, globalSurvivor))
      expect(outcome.result.accountAction).toBe("already-unified")
      expect(outcome.migrations).toBe(1)
      expect(outcome.accountMerges).toBe(0)
    })
  )

  it.effect("fails before mutation when a required native or account merge capability is unavailable", () =>
    Effect.gen(function* () {
      const missingNative = yield* Effect.flip(
        mergeResolvedPeople(previewParams, source, survivor).pipe(
          Effect.provide(Layer.merge(HulyClient.testLayer({}), WorkspaceClient.testLayer({})))
        )
      )
      expect(missingNative).toBeInstanceOf(HulyDataInvalidError)
      expect(missingNative).toMatchObject({ entity: "native person reference migration capability" })

      const globalSource = resolvedPerson("source", "Source Person", "source-uuid")
      const globalSurvivor = resolvedPerson("survivor", "Survivor Person", "survivor-uuid")
      const missingEligibility = yield* Effect.flip(
        mergeResolvedPeople(previewParams, globalSource, globalSurvivor).pipe(
          Effect.provide(
            Layer.merge(
              HulyClient.testLayer({
                inspectPersonReferences: () => Effect.succeed(impacts),
                migratePersonReferences: () => Effect.void
              }),
              WorkspaceClient.testLayer({})
            )
          )
        )
      )
      expect(missingEligibility).toBeInstanceOf(HulyDataInvalidError)
      expect(missingEligibility).toMatchObject({ entity: "account client merge capability" })

      const preview = (yield* run(mergeResolvedPeople(previewParams, globalSource, globalSurvivor))).result
      const execute = yield* parseMergePeopleParams({
        source: { id: "source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: preview.preflightToken
      })
      const migrations = yield* Ref.make(0)
      const missingMerge = yield* Effect.flip(
        mergeResolvedPeople(execute, globalSource, globalSurvivor).pipe(
          Effect.provide(
            Layer.merge(
              HulyClient.testLayer({
                inspectPersonReferences: () => Effect.succeed(impacts),
                migratePersonReferences: () => Ref.update(migrations, (count) => count + 1)
              }),
              WorkspaceClient.testLayer({ canMergeSpecifiedPersons: () => Effect.succeed(true) })
            )
          )
        )
      )
      expect(missingMerge).toBeInstanceOf(HulyDataInvalidError)
      expect(missingMerge).toMatchObject({ entity: "account merge capability" })
      expect(yield* Ref.get(migrations)).toBe(0)
    })
  )

  it.effect("resolves exact locators through the public merge operation", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        mergePeople(previewParams).pipe(
          Effect.provide(Layer.merge(HulyClient.testLayer({}), WorkspaceClient.testLayer({})))
        )
      )
      expect(error).toBeInstanceOf(PersonNotFoundError)
      expect(error).toMatchObject({ identifier: expect.stringMatching(/^(source|survivor)$/u) })
    })
  )
})
