import { Effect, Ref, Schema, Stream } from "effect"
import { expect, it } from "vitest"
import { MAX_ADAPTER_RESPONSE_BYTES } from "../../src/resident/adapter-limits.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { decodeBackendMessages } from "../../src/resident/response-stream.js"
import { exchange, initialize } from "../helpers/resident-native-fixture.js"
import {
  withOutputValidationServer,
  OUTPUT_VALIDATION_TOOL,
  OutputValidationError,
  OutputValidationSuccess
} from "../helpers/output-validation-server.js"
import { ManagedPolicyScenario } from "./managed-policy-observation.js"
const BOUND = "5 seconds"
const HTTP_OK = 200
it.each(ManagedPolicyScenario.literals)(
  "rejects invalid operation output at the native HTTPS server in %s mode and preserves subsequent calls",
  async (mode) => {
    await Effect.runPromise(
      withOutputValidationServer(mode, (endpoint, identity, calls) =>
        Effect.gen(function* () {
          const initialized = yield* exchange(endpoint, identity, "first", initialize("first"))
          expect(initialized.status).toBe(HTTP_OK)
          const call = (valid: boolean, id: number) =>
            Effect.gen(function* () {
              const response = yield* exchange(
                endpoint,
                identity,
                "first",
                HostMessage.make({
                  jsonrpc: "2.0",
                  id,
                  method: "tools/call",
                  params:
                    mode === "native"
                      ? { name: OUTPUT_VALIDATION_TOOL, arguments: { valid } }
                      : { name: "invoke_tool", arguments: { toolName: OUTPUT_VALIDATION_TOOL, arguments: { valid } } }
                }),
                initialized.session
              )
              expect(response.status).toBe(HTTP_OK)
              const messages = yield* decodeBackendMessages({
                body: Stream.make(new TextEncoder().encode(response.body)),
                contentType: response.contentType,
                maxBytes: MAX_ADAPTER_RESPONSE_BYTES
              }).pipe(Stream.runCollect)
              expect(messages).toHaveLength(1)
              return yield* Schema.decodeUnknownEffect(
                Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: Schema.Literal(id), result: Schema.Unknown })
              )(messages[0])
            })
          const rejected = yield* call(false, 2)
          const error = yield* Schema.decodeUnknownEffect(OutputValidationError)(rejected.result)
          expect(error.content.map((item) => item.text)).toEqual(["Tool fixture_output produced invalid output"])
          const accepted = yield* call(true, 3)
          const expected = mode === "native" ? { count: 1 } : { toolName: OUTPUT_VALIDATION_TOOL, result: { count: 1 } }
          const successful = yield* Schema.decodeUnknownEffect(OutputValidationSuccess)(accepted.result)
          expect(successful.structuredContent.result).toEqual(expected)
          expect(yield* Ref.get(calls)).toBe(2)
        })
      ).pipe(Effect.timeout(BOUND))
    )
  }
)
