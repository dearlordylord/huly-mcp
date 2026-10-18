import { ConfigProvider, Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { expect, it } from "vitest"

import { makeManualResidentBackend } from "../../src/resident/manual-backend.js"
import { ResidentLiveStatus, RESIDENT_STATUS_PATH } from "../../src/resident/status-contract.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

it("reports starting before application readiness without dispatching or acquiring a client", async () =>
  withRegistryDirectory((directory) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* makeManualResidentBackend()
        const response = yield* backend.httpPolicy
          .httpMiddleware(Effect.die("Status must not dispatch MCP"))
          .pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(new Request(`http://localhost${RESIDENT_STATUS_PATH}`))
            )
          )
        const status = yield* Effect.promise(() => HttpServerResponse.toWeb(response).json()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ResidentLiveStatus))
        )
        expect(status).toMatchObject({
          readiness: "starting",
          work: { attachments: 0, retainedRequests: 0 },
          retirement: "unconfirmed"
        })
      }).pipe(
        Effect.scoped,
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: directory })))
      )
    )
  ))
