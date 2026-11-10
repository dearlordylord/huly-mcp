import { it } from "@effect/vitest"
import { Hierarchy, ModelDb, TxBuilder } from "@hcengineering/core"
import type { Document, Teamspace } from "@hcengineering/document"
import { Deferred, Effect, Exit, Fiber, Redacted, Schema } from "effect"
import { expect } from "vitest"

import { SocialIdentityId } from "../../src/domain/schemas/person-administration.js"
import {
  AccountUuid,
  DocumentId,
  NonEmptyString,
  PositiveInteger,
  TeamspaceId,
  UrlString,
  WorkspaceUrlSlug
} from "../../src/domain/schemas/shared.js"
import { type ClientOperationsConnection, makeClientOperations } from "../../src/huly/client-operations.js"
import { makeDocumentMoveGate } from "../../src/huly/document-move-gate.js"
import { commitDocumentMove, type DocumentMoveWrite } from "../../src/huly/document-move-adapter.js"
import { core, documentPlugin } from "../../src/huly/huly-plugins.js"
import { MovementTransportError, type MovementHttpPort } from "../../src/huly/movement-transaction-transport.js"
import { parseMovementTransportConfig, withMovementWriteClient } from "../../src/huly/movement-write-client.js"
import { toAccountUuid, toCorePersonId, toRef } from "../../src/huly/operations/sdk-boundary.js"
import { HulySdk } from "../../src/huly/sdk-deps.js"

const space = toRef<Teamspace>(TeamspaceId.make("teamspace"))
const source = toRef<Document>(DocumentId.make("source"))
const previousParent = toRef<Document>(DocumentId.make("previous-parent"))
const target = toRef<Document>(DocumentId.make("target"))
const ancestor = toRef<Document>(DocumentId.make("ancestor"))
const root = documentPlugin.ids.NoParent
const rank = "0|hzzzzz:"
const decodeTransaction = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))
const documentMove: DocumentMoveWrite = {
  space,
  source: { _id: source, parent: previousParent },
  rank,
  destination: { type: "nested", id: target, parent: { type: "nested", id: ancestor, parent: { type: "root" } } }
}

for (const { outcome, reply } of [
  { reply: { success: true, serverTime: 1 }, outcome: "applied" },
  { reply: { success: false }, outcome: "condition-not-met" }
]) {
  it.effect(`sends one guarded document transaction and reports ${outcome}`, () =>
    Effect.gen(function* () {
      const hierarchy = new Hierarchy()
      const ordinary = new TxBuilder(hierarchy, new ModelDb(hierarchy), toCorePersonId(SocialIdentityId.make("person")))
      const config = yield* parseMovementTransportConfig({
        endpoint: "http://huly.invalid",
        workspace: "workspace",
        token: Redacted.make(NonEmptyString.make("test-token")),
        timeoutMs: 1000
      })
      const sent: Array<Schema.JsonObject> = []
      const http: MovementHttpPort = {
        send: (request) =>
          Effect.sync(() => {
            sent.push(decodeTransaction(request.body))
            return { status: PositiveInteger.make(200), body: JSON.stringify(reply) }
          })
      }

      const result = yield* withMovementWriteClient(ordinary, config, http, "conditionalUpdateDoc", (client) =>
        commitDocumentMove(client, documentMove)
      )

      expect(result).toBe(outcome)
      expect(ordinary.txes).toEqual([])
      expect(sent).toEqual([
        expect.objectContaining({
          _class: core.class.TxApplyIf,
          scope: "document-move:teamspace",
          match: [
            { _class: documentPlugin.class.Teamspace, query: { _id: space, archived: false } },
            { _class: documentPlugin.class.Document, query: { _id: source, space, parent: previousParent } },
            { _class: documentPlugin.class.Document, query: { _id: target, space, parent: ancestor } },
            { _class: documentPlugin.class.Document, query: { _id: ancestor, space, parent: root } }
          ],
          notMatch: [{ _class: documentPlugin.class.Document, query: { space, parent: target, rank: { $gte: rank } } }],
          txes: [
            expect.objectContaining({
              _class: core.class.TxUpdateDoc,
              objectClass: documentPlugin.class.Document,
              objectId: source,
              objectSpace: space,
              operations: { parent: target, rank }
            })
          ]
        })
      ])
    })
  )
}

it.effect("keeps another client's guarded send queued until a cancelled request's send settles", () =>
  Effect.gen(function* () {
    const sdk = yield* HulySdk
    const gate = makeDocumentMoveGate()
    const firstSent = yield* Deferred.make<void>()
    const releaseFirst = yield* Deferred.make<void>()
    const secondResolved = yield* Deferred.make<void>()
    const hierarchy = new Hierarchy()
    const primarySocialId = toCorePersonId(SocialIdentityId.make("person"))
    const ordinary = new TxBuilder(hierarchy, new ModelDb(hierarchy), primarySocialId)
    const url = UrlString.make("http://huly.invalid")
    const transport = yield* parseMovementTransportConfig({
      endpoint: url,
      workspace: "workspace",
      token: Redacted.make(NonEmptyString.make("test-token")),
      timeoutMs: 1000
    })
    const unexpectedMarkupOperation = () => Promise.reject(new Error("Unexpected markup operation"))
    const connection = {
      client: ordinary,
      accountUuid: toAccountUuid(AccountUuid.make("62ff7aa4-f57a-4a6e-83c1-620b2a16b7a8")),
      primarySocialId,
      socialIds: [primarySocialId],
      workspaceUrlSlug: WorkspaceUrlSlug.make("workspace"),
      markupOps: {
        fetchMarkup: unexpectedMarkupOperation,
        uploadMarkup: unexpectedMarkupOperation,
        updateMarkup: unexpectedMarkupOperation
      },
      refUrl: url,
      imageUrl: url,
      movementTransportConfig: transport
    }
    const clientConnection: ClientOperationsConnection = { ...connection, client: Effect.succeed(ordinary) }
    const events: Array<string> = []
    const reply = { status: PositiveInteger.make(200), body: '{"success":true,"serverTime":1}' }
    const first = makeClientOperations(
      clientConnection,
      {
        ...sdk,
        movementHttp: {
          send: () =>
            Effect.gen(function* () {
              events.push("first sent")
              yield* Deferred.succeed(firstSent, undefined)
              yield* Deferred.await(releaseFirst)
              events.push("first settled")
              return reply
            })
        }
      },
      { url },
      gate
    )
    const second = makeClientOperations(
      {
        ...clientConnection,
        resolveFullConnection: Deferred.succeed(secondResolved, undefined).pipe(Effect.as(connection))
      },
      {
        ...sdk,
        movementHttp: {
          send: () =>
            Effect.sync(() => {
              events.push("second sent")
              return reply
            })
        }
      },
      { url },
      gate
    )
    const firstMove = yield* Effect.forkChild(first.commitDocumentMove(documentMove))
    yield* Deferred.await(firstSent)
    const cancellation = yield* Effect.forkChild(Fiber.interrupt(firstMove), { startImmediately: true })
    const secondMove = yield* Effect.forkChild(second.commitDocumentMove(documentMove), { startImmediately: true })
    yield* Deferred.await(secondResolved)
    // The SDK queues its transaction through promises after connection resolution.
    yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)))
    const eventsWhilePending = [...events]
    yield* Deferred.succeed(releaseFirst, undefined)

    expect(yield* Fiber.join(secondMove)).toBe("applied")
    yield* Fiber.join(cancellation)
    expect(Exit.hasInterrupts(yield* Fiber.await(firstMove))).toBe(true)
    expect(eventsWhilePending).toEqual(["first sent"])
    expect(events).toEqual(["first sent", "first settled", "second sent"])
  }).pipe(Effect.provide(HulySdk.defaultLayer))
)

it.effect("blocks another send after an uncertain outcome, scoped to the teamspace", () =>
  Effect.gen(function* () {
    const gate = makeDocumentMoveGate()
    const workspace = NonEmptyString.make("workspace")
    const otherWorkspace = NonEmptyString.make("other-workspace")
    const otherSpace = toRef<Teamspace>(TeamspaceId.make("other-teamspace"))
    const sent = Effect.sync(() => "sent")
    const failure = (phase: "before-send" | "after-send") =>
      Effect.fail(new MovementTransportError({ phase, reason: NonEmptyString.make("fixture transport failure") }))

    yield* Effect.flip(gate(workspace, space, failure("before-send")))
    expect(yield* gate(workspace, space, sent)).toBe("sent")
    yield* Effect.flip(gate(workspace, space, failure("after-send")))
    const blocked = yield* Effect.flip(gate(workspace, space, sent))
    expect(blocked).toMatchObject({ phase: "before-send", reason: expect.stringContaining("may still be executing") })
    expect(yield* gate(workspace, otherSpace, sent)).toBe("sent")
    expect(yield* gate(otherWorkspace, space, sent)).toBe("sent")
  })
)
