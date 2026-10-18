import { Context, Effect, Exit, Layer, Ref, Schema } from "effect"
import { toDraft07JsonSchema } from "../../src/domain/schemas/json-schema.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"

import { makeEffectMcpRegistry } from "../../src/mcp/effect-ai-registry.js"
import type { ToolRegistry } from "../../src/mcp/tools/index.js"
import { defineTool } from "../../src/mcp/tools/registry.js"
import type { ResidentEndpoint, ResidentTlsIdentity } from "../../src/resident/tls-channel.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import type { ManagedPolicyScenario } from "../resident/managed-policy-observation.js"
import { withNativeServer, type Owner, type OwnerName } from "./resident-native-fixture.js"

export const OUTPUT_VALIDATION_TOOL = "fixture_output"
const INVALID_COUNT = -1
const attachmentPolicy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1000,
  lease: DEFAULT_LEASE_POLICY
})
const Params = Schema.Struct({ valid: Schema.Boolean })
const Result = Schema.Struct({ count: Schema.Number.check(Schema.isGreaterThan(0)) })
export const OutputValidationError = Schema.Struct({
  isError: Schema.Literal(true),
  structuredContent: Schema.optionalKey(Schema.Never),
  content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }))
})
export const OutputValidationSuccess = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: Schema.Json })
})

// Internal fixture resource ports; schemas own operation and wire payloads.
export const withOutputValidationServer = <A, E, R>(
  mode: Schema.Schema.Type<typeof ManagedPolicyScenario>,
  use: (endpoint: ResidentEndpoint, identity: ResidentTlsIdentity, calls: Ref.Ref<number>) => Effect.Effect<A, E, R>,
  attachments = false
) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0)
    const tool = defineTool(
      {
        name: OUTPUT_VALIDATION_TOOL,
        description: "Exercise output validation over the native HTTP boundary.",
        inputSchema: toDraft07JsonSchema(Params),
        resultSchema: Result,
        category: "test"
      },
      Schema.decodeUnknownEffect(Params),
      ({ valid }) => Ref.update(calls, (count) => count + 1).pipe(Effect.as({ count: valid ? 1 : INVALID_COUNT }))
    )
    const registry: ToolRegistry = {
      tools: new Map([[tool.name, tool]]),
      definitions: [tool],
      handleToolCall: (name, args, huly, storage, workspace) =>
        name === tool.name ? tool.handler(args, huly, storage, workspace) : Promise.resolve(null)
    }
    const services = yield* Layer.build(
      Layer.merge(
        Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
        TelemetryService.testLayer({})
      )
    )
    const bundle = {
      hulyClient: Context.get(services, HulyClient),
      storageClient: Context.get(services, HulyStorageClient)
    }
    const registered = makeEffectMcpRegistry({
      registry,
      resolveClients: async () => Exit.succeed(bundle),
      discoverConcreteResources: false,
      telemetry: Context.get(services, TelemetryService),
      getHulyContext: () => Effect.die("Unexpected context lookup"),
      exposureOptions: {
        exposureConfig: {
          configuredMode: mode === "native" ? "native" : "proxy",
          proxyOutputStrict: mode === "proxy-strict"
        }
      }
    })

    const admissions = yield* makeResidentAdmissions(attachmentPolicy)
    const nativeContext = requestContextMiddleware({ resolveClients: async () => Exit.succeed(bundle) })
    return yield* withNativeServer(
      new Map<OwnerName, Owner>(),
      (endpoint, identity) => use(endpoint, identity, calls),
      {
        registration: registered.registration,
        ...(attachments ? { middleware: (app) => residentAdmissionMiddleware(admissions)(nativeContext(app)) } : {})
      }
    )
  }).pipe(Effect.scoped)
