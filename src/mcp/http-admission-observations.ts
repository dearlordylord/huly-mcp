import { Schema } from "effect"
import { channel, hasSubscribers } from "node:diagnostics_channel"

import { Count } from "../domain/schemas/shared.js"

export const HTTP_ADMISSION_SCOPE = "http-transport-admission"
export const HTTP_ADMISSION_CHANNEL = `huly.${HTTP_ADMISSION_SCOPE}`

const LifecycleObservationSchema = Schema.TaggedUnion({
  createRequestAdmission: {},
  RequestAdmission_enter: { admitted: Schema.Boolean },
  RequestLease_release: { active: Count },
  RequestAdmission_quiesce: { drained: Schema.Boolean },
  createRequestClientLifecycle: {},
  RequestClientLifecycle_resolve: { closed: Schema.Boolean },
  RequestClientLifecycle_acquireSettles: { rejected: Schema.Boolean },
  RequestClientLifecycle_close: { firstClose: Schema.Boolean },
  RequestClientLifecycle_leaseCloseSettles: { failed: Schema.Boolean },
  attachRequestClientLifecycle: {},
  Server_onclose: {},
  Server_closeStarts: {},
  Server_close: { underlyingFails: Schema.Boolean, leaseCloseFails: Schema.Boolean },
  createClientResolver: {},
  ClientResolver_resolve: { startedAcquisition: Schema.Boolean },
  ClientResolver_close: { firstClose: Schema.Boolean },
  McpServerCloseTracker_closeSettles: { failed: Schema.Boolean },
  createMountedMcpHttpHandler: {
    loopback: Schema.Boolean,
    token: Schema.Literals(["NoToken", "BlankToken", "SecretToken"])
  },
  createMountedMcpHttpHandler_fetch: {
    hostOk: Schema.Boolean,
    originOk: Schema.Boolean,
    bearer: Schema.Literals(["NoBearer", "MalformedAuthorization", "MatchingBearer", "WrongBearer"]),
    dispatched: Schema.Boolean
  },
  createMountedMcpHttpHandler_fetchSettles: {},
  createMountedMcpHttpHandler_fetchRejectedDuringShutdown: {},
  createMountedMcpHttpHandler_close: {},
  startHttpTransport: { bindOk: Schema.Boolean }
})

const ClientAcquisitionObservationSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("buildScopedClientBundle"),
    outcome: Schema.Literals(["Succeeded", "FailedFatal"]),
    evicted: Schema.Literal(false)
  }),
  Schema.Struct({
    _tag: Schema.Literal("buildScopedClientBundle"),
    outcome: Schema.Literal("FailedRecoverable"),
    evicted: Schema.Boolean
  })
])

const HttpLeaseObservationSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("createHttpClientLeaseResolver"),
    headers: Schema.Literal("InvalidHulyHeaders"),
    succeeded: Schema.Literal(false)
  }),
  Schema.Struct({
    _tag: Schema.Literal("createHttpClientLeaseResolver"),
    headers: Schema.Literal("NoHulyHeaders"),
    succeeded: Schema.Boolean
  }),
  Schema.Struct({
    _tag: Schema.Literal("createHttpClientLeaseResolver"),
    headers: Schema.Literal("ValidHulyHeaders"),
    buildOk: Schema.Literal(true),
    succeeded: Schema.Literal(true)
  }),
  Schema.Struct({
    _tag: Schema.Literal("createHttpClientLeaseResolver"),
    headers: Schema.Literal("ValidHulyHeaders"),
    buildOk: Schema.Literal(false),
    succeeded: Schema.Literal(false)
  })
])

const ShutdownObservationSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("createMountedMcpHttpHandler_closeSettles"),
    timedOut: Schema.Literal(true),
    failed: Schema.Literal(false)
  }),
  Schema.Struct({
    _tag: Schema.Literal("createMountedMcpHttpHandler_closeSettles"),
    timedOut: Schema.Literal(false),
    failed: Schema.Boolean
  })
])

export const HttpAdmissionObservationSchema = Schema.Union([
  LifecycleObservationSchema,
  ClientAcquisitionObservationSchema,
  HttpLeaseObservationSchema,
  ShutdownObservationSchema
])

export type HttpAdmissionObservation = Schema.Schema.Type<typeof HttpAdmissionObservationSchema>
type ObservationInput = Schema.Codec.Encoded<typeof HttpAdmissionObservationSchema>
type ObservationAction = ObservationInput["_tag"]
type WithoutTag<Input> = Input extends ObservationInput ? Omit<Input, "_tag"> : never
type ObservationFields<Action extends ObservationAction> = WithoutTag<Extract<ObservationInput, { _tag: Action }>>
type DeferredFields<Fields> = { [Key in keyof Fields]: Fields[Key] | (() => Fields[Key]) }
export type ObservedBearer = Extract<HttpAdmissionObservation, { _tag: "createMountedMcpHttpHandler_fetch" }>["bearer"]

export const admissionObservationsEnabled = (): boolean => hasSubscribers(HTTP_ADMISSION_CHANNEL)

export const observeHttpAdmission = <Action extends ObservationAction>(
  action: Action,
  fields: DeferredFields<ObservationFields<Action>>
): void => {
  if (!admissionObservationsEnabled()) return
  const resolved = Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, typeof value === "function" ? value() : value])
  )
  // A malformed internal observation is a programming defect; the channel carries only parsed domain data.
  const observation = Schema.decodeUnknownSync(HttpAdmissionObservationSchema)({ _tag: action, ...resolved })
  channel(HTTP_ADMISSION_CHANNEL).publish(observation)
}
