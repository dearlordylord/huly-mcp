import { Effect, Schema } from "effect"
import { expect, it } from "vitest"

import { VERSION } from "../../src/version.js"
import { registerEffectMcpResources } from "../../src/mcp/effect-ai-resources.js"
import { createRequestAdmission } from "../../src/mcp/request-admission.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { withResidentExchange } from "../../src/resident/attachment-exchange.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import {
  AUTHORIZATION,
  exchange,
  initialize,
  withNativeServer,
  type Owner,
  type OwnerName
} from "../helpers/resident-native-fixture.js"

it("refuses native resource discovery after quiescing before acquiring Huly", async () => {
  let acquisitions = 0
  const admission = createRequestAdmission()
  await admission.quiesce()
  const registration = registerEffectMcpResources(async () => {
    acquisitions++
    throw new Error("Quiesced resource discovery must not acquire Huly")
  }, admission)
  await Effect.runPromise(
    withNativeServer(
      new Map<OwnerName, Owner>(),
      (endpoint, identity) =>
        Effect.gen(function* () {
          const initialized = yield* exchange(endpoint, identity, "none", initialize("none"))
          const attachment = ResidentAttachment.make({
            version: 1,
            transport: "tls13-external-psk-v1",
            implementation: { name: "@firfi/huly-mcp", version: VERSION },
            endpoint,
            identity,
            authorization: AUTHORIZATION
          })
          const body = yield* withResidentExchange(
            attachment,
            Schema.decodeUnknownSync(HostMessage)({ jsonrpc: "2.0", id: 2, method: "resources/list" }),
            initialized.session,
            (response) => response.text
          )
          expect(body).toContain("Huly MCP is shutting down")
          expect(acquisitions).toBe(0)
        }),
      { registration }
    ).pipe(Effect.scoped, Effect.timeout("5 seconds"))
  )
})
