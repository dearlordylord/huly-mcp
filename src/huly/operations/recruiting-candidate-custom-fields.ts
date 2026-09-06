import type { DocumentUpdate, Enum as HulyEnum, MixinUpdate } from "@hcengineering/core"
import type { Person } from "@hcengineering/contact"
import { Effect, Option, Schema } from "effect"

import type {
  RecruitingCandidateCustomFieldMutationResult,
  GetRecruitingCandidateCustomFieldValuesParams,
  ListRecruitingCandidateCustomFieldsParams,
  SetRecruitingCandidateCustomFieldParams
} from "../../domain/schemas/recruiting.js"
import {
  CustomFieldDateTimestamp,
  type CustomFieldDateTimestamp as CustomFieldDateTimestampType
} from "../../domain/schemas/custom-field-date.js"
import type {
  CustomFieldInfo,
  CustomFieldTypeName,
  RecruitingCandidateCustomFieldValue
} from "../../domain/schemas/custom-fields.js"
import { CUSTOM_FIELDS_DEFAULT_LIMIT } from "../../domain/schemas/custom-fields.js"
import type { CustomFieldId } from "../../domain/schemas/shared.js"
import { HulyEnumId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  CustomFieldMetadataMalformedError,
  CustomFieldNotFoundError,
  RecruitingCandidateCustomFieldOwnerError,
  RecruitingCandidateCustomFieldTypeUnsupportedError,
  type InvalidCustomFieldBooleanValueError,
  type CustomFieldObjectNotFoundError,
  type InvalidCustomFieldDateValueError,
  InvalidCustomFieldEnumValueError,
  type InvalidCustomFieldNumberValueError
} from "../errors-custom-fields.js"
import type {
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  RecruitingCandidateNotFoundError
} from "../errors.js"
import { Diagnostics } from "../diagnostics.js"
import { contact, core } from "../huly-plugins.js"
import {
  RECRUITING_CANDIDATE_CUSTOM_FIELD_CANDIDATE_OWNER_ID,
  RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_IDS,
  RECRUITING_CANDIDATE_CUSTOM_FIELD_PERSON_OWNER_ID
} from "../recruiting-candidate-custom-field-config.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Candidate } from "../types/recruiting.js"
import { RecruitingCandidateCustomFieldMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import {
  getCustomFieldDefinitionProjection,
  listCustomFieldDefinitionProjectionsForOwners,
  parseCustomFieldValue,
  readCustomFieldValue
} from "./custom-fields.js"
import type { CustomFieldInfoProjection } from "./custom-fields-metadata.js"
import { hulyQuery } from "./query-helpers.js"
import { resolveCandidate, toCandidateRef, candidateEmail } from "./recruiting-candidate-shared.js"
import { toRef } from "./sdk-boundary.js"

type CandidateCustomFieldReadError =
  | HulyClientError
  | CustomFieldMetadataMalformedError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingCandidateNotFoundError

type CandidateCustomFieldWriteError =
  | CandidateCustomFieldReadError
  | CustomFieldNotFoundError
  | CustomFieldObjectNotFoundError
  | RecruitingCandidateCustomFieldOwnerError
  | RecruitingCandidateCustomFieldTypeUnsupportedError
  | InvalidCustomFieldBooleanValueError
  | InvalidCustomFieldDateValueError
  | InvalidCustomFieldEnumValueError
  | InvalidCustomFieldNumberValueError

type WritableCandidateCustomFieldType = Exclude<CustomFieldInfo["type"], "array" | "ref" | "unknown">
type CandidateCustomFieldOwner = "candidate" | "person"
type WritableCandidateCustomFieldByType = {
  [Type in WritableCandidateCustomFieldType]: {
    readonly owner: CandidateCustomFieldOwner
    readonly field: Extract<CustomFieldInfo, { readonly type: Type }>
  }
}
type WritableCandidateCustomField = WritableCandidateCustomFieldByType[WritableCandidateCustomFieldType]

type WritableCandidateCustomFieldConstructor<Type extends WritableCandidateCustomFieldType> = (
  owner: CandidateCustomFieldOwner,
  field: Extract<CustomFieldInfo, { readonly type: Type }>
) => WritableCandidateCustomFieldByType[Type]

const UNSUPPORTED_CANDIDATE_CUSTOM_FIELD_TYPES = new Set<CustomFieldInfo["type"]>(["array", "ref", "unknown"])

const isWritableCandidateCustomField = (
  field: CustomFieldInfo
): field is Extract<CustomFieldInfo, { readonly type: WritableCandidateCustomFieldType }> =>
  !UNSUPPORTED_CANDIDATE_CUSTOM_FIELD_TYPES.has(field.type)

const candidateCustomFieldOwner = (
  ownerClassId: CustomFieldInfo["ownerClassId"]
): Option.Option<CandidateCustomFieldOwner> => {
  if (ownerClassId === RECRUITING_CANDIDATE_CUSTOM_FIELD_CANDIDATE_OWNER_ID) return Option.some("candidate")
  if (ownerClassId === RECRUITING_CANDIDATE_CUSTOM_FIELD_PERSON_OWNER_ID) return Option.some("person")
  return Option.none()
}

const writableCandidateCustomFieldConstructors: {
  [Type in WritableCandidateCustomFieldType]: WritableCandidateCustomFieldConstructor<Type>
} = {
  string: (owner, field) => ({ owner, field }),
  markup: (owner, field) => ({ owner, field }),
  number: (owner, field) => ({ owner, field }),
  date: (owner, field) => ({ owner, field }),
  boolean: (owner, field) => ({ owner, field }),
  enum: (owner, field) => ({ owner, field })
}

const makeWritableCandidateCustomField = <Type extends WritableCandidateCustomFieldType>(
  type: Type,
  owner: CandidateCustomFieldOwner,
  field: Extract<CustomFieldInfo, { readonly type: Type }>
): WritableCandidateCustomFieldByType[Type] => writableCandidateCustomFieldConstructors[type](owner, field)

const EnumTypeDetailsSchema = Schema.Struct({ enumRef: HulyEnumId })
const NativeEnumValuesSchema = Schema.Struct({ enumValues: Schema.Array(Schema.String) })
const decodeEnumTypeDetails = Schema.decodeUnknownEffect(EnumTypeDetailsSchema)
const decodeNativeEnumValues = Schema.decodeUnknownEffect(NativeEnumValuesSchema)

const enumReference = Effect.fn("RecruitingCandidateCustomFields.enumReference")(function* (
  field: Extract<CustomFieldInfo, { readonly type: "enum" }>
): Effect.fn.Return<HulyEnumId, CustomFieldMetadataMalformedError> {
  return yield* decodeEnumTypeDetails(field.typeDetails).pipe(
    Effect.map((details) => details.enumRef),
    Effect.mapError(
      () =>
        new CustomFieldMetadataMalformedError({
          identifier: field.id,
          reason: "enum custom-field metadata must include a non-empty string enumRef"
        })
    )
  )
})

const nativeEnumValues = Effect.fn("RecruitingCandidateCustomFields.nativeEnumValues")(function* (
  client: HulyClient["Service"],
  field: CustomFieldInfo
): Effect.fn.Return<ReadonlyArray<string>, HulyClientError | CustomFieldMetadataMalformedError> {
  if (field.type !== "enum") return []
  const enumRef = yield* enumReference(field)
  const enumDocument = yield* client.findOne<HulyEnum>(
    core.class.Enum,
    hulyQuery<HulyEnum>({ _id: toRef<HulyEnum>(enumRef) })
  )
  if (enumDocument === undefined) {
    return yield* new CustomFieldMetadataMalformedError({
      identifier: field.id,
      reason: `enum metadata references missing native enum '${enumRef}'`
    })
  }
  return yield* decodeNativeEnumValues(enumDocument).pipe(
    Effect.mapError(
      () =>
        new CustomFieldMetadataMalformedError({
          identifier: field.id,
          reason: `native enum '${enumRef}' has malformed enumValues metadata`
        })
    ),
    Effect.map((enumValues) => enumValues.enumValues)
  )
})

const parseEnumValue = Effect.fn("RecruitingCandidateCustomFields.parseEnumValue")(function* (
  client: HulyClient["Service"],
  field: Extract<CustomFieldInfo, { readonly type: "enum" }>,
  value: string
): Effect.fn.Return<string, HulyClientError | CustomFieldMetadataMalformedError | InvalidCustomFieldEnumValueError> {
  const values = yield* nativeEnumValues(client, field)
  if (!values.includes(value)) {
    const enumRef = yield* enumReference(field)
    return yield* new InvalidCustomFieldEnumValueError({ fieldId: field.id, enumRef, value, allowedValues: values })
  }
  return value
})

type ParsedCandidateCustomFieldValue =
  | { readonly type: "string" | "markup" | "enum"; readonly value: string }
  | { readonly type: "number"; readonly value: number }
  | { readonly type: "date"; readonly value: CustomFieldDateTimestampType }
  | { readonly type: "boolean"; readonly value: boolean }

type CandidateCustomFieldValueParseError =
  | InvalidCustomFieldBooleanValueError
  | InvalidCustomFieldDateValueError
  | InvalidCustomFieldNumberValueError

type PrimitiveWritableCandidateCustomFieldType = Exclude<WritableCandidateCustomFieldType, "enum">
type CandidateCustomFieldValueParser = (
  value: string
) => Effect.Effect<ParsedCandidateCustomFieldValue, CandidateCustomFieldValueParseError>

const primitiveCandidateCustomFieldValueParsers: Record<
  PrimitiveWritableCandidateCustomFieldType,
  CandidateCustomFieldValueParser
> = {
  string: (value) =>
    parseCustomFieldValue(value, "string").pipe(Effect.map((parsed) => ({ type: "string", value: parsed }))),
  markup: (value) =>
    parseCustomFieldValue(value, "markup").pipe(Effect.map((parsed) => ({ type: "markup", value: parsed }))),
  number: (value) =>
    parseCustomFieldValue(value, "number").pipe(Effect.map((parsed) => ({ type: "number", value: parsed }))),
  date: (value) => parseCustomFieldValue(value, "date").pipe(Effect.map((parsed) => ({ type: "date", value: parsed }))),
  boolean: (value) =>
    parseCustomFieldValue(value, "boolean").pipe(Effect.map((parsed) => ({ type: "boolean", value: parsed })))
}

const parseWritableCandidateCustomField = Effect.fn("RecruitingCandidateCustomFields.parseWritableField")(function* (
  field: CustomFieldInfo
): Effect.fn.Return<
  WritableCandidateCustomField,
  RecruitingCandidateCustomFieldOwnerError | RecruitingCandidateCustomFieldTypeUnsupportedError
> {
  const owner = candidateCustomFieldOwner(field.ownerClassId)
  if (Option.isNone(owner)) {
    return yield* new RecruitingCandidateCustomFieldOwnerError({ fieldId: field.id, ownerClassId: field.ownerClassId })
  }
  if (!isWritableCandidateCustomField(field)) {
    return yield* new RecruitingCandidateCustomFieldTypeUnsupportedError({ fieldId: field.id, type: field.type })
  }
  return makeWritableCandidateCustomField(field.type, owner.value, field)
})

const parseWritableCandidateCustomFieldValue = Effect.fn("RecruitingCandidateCustomFields.parseValue")(function* (
  client: HulyClient["Service"],
  writable: WritableCandidateCustomField,
  value: string
): Effect.fn.Return<
  ParsedCandidateCustomFieldValue,
  | HulyClientError
  | CustomFieldMetadataMalformedError
  | InvalidCustomFieldEnumValueError
  | InvalidCustomFieldBooleanValueError
  | InvalidCustomFieldDateValueError
  | InvalidCustomFieldNumberValueError
> {
  const { field } = writable
  const type = field.type
  if (type === "enum") {
    return { type, value: yield* parseEnumValue(client, field, value) }
  }
  return yield* primitiveCandidateCustomFieldValueParsers[type](value)
})

interface CandidateFieldValueProjection {
  readonly value: RecruitingCandidateCustomFieldValue
  readonly runtimeTypeMismatch: boolean
}

interface CandidateFieldValueBase {
  readonly fieldId: CustomFieldId
  readonly name: string
  readonly label: string
  readonly ownerClassId: CustomFieldInfo["ownerClassId"]
  readonly ownerLabel: string
}

type CandidateFieldValueProjector = (base: CandidateFieldValueBase, value: unknown) => CandidateFieldValueProjection

const decodeCustomFieldDateTimestamp = Schema.decodeUnknownOption(CustomFieldDateTimestamp)
const decodeRuntimeDate = (value: unknown): Option.Option<CustomFieldDateTimestampType> =>
  decodeCustomFieldDateTimestamp(value instanceof Date ? value.getTime() : value)

const [isJsonArray, isJsonValue] = [Schema.is(Schema.Array(Schema.Json)), Schema.is(Schema.Json)]

const candidateFieldValueBase = (field: CustomFieldInfo): CandidateFieldValueBase => ({
  fieldId: field.id,
  name: field.name,
  label: field.label,
  ownerClassId: field.ownerClassId,
  ownerLabel: field.ownerLabel
})

const projectTextCandidateFieldValue = (
  base: CandidateFieldValueBase,
  type: "string" | "markup" | "enum",
  value: unknown
): CandidateFieldValueProjection =>
  typeof value === "string"
    ? { value: { ...base, type, value }, runtimeTypeMismatch: false }
    : { value: { ...base, type }, runtimeTypeMismatch: value !== undefined }

const candidateFieldValueProjectors: Record<CustomFieldTypeName, CandidateFieldValueProjector> = {
  string: (base, value) => projectTextCandidateFieldValue(base, "string", value),
  markup: (base, value) => projectTextCandidateFieldValue(base, "markup", value),
  enum: (base, value) => projectTextCandidateFieldValue(base, "enum", value),
  number: (base, value) =>
    typeof value === "number" && Number.isFinite(value)
      ? { value: { ...base, type: "number", value }, runtimeTypeMismatch: false }
      : { value: { ...base, type: "number" }, runtimeTypeMismatch: value !== undefined },
  date: (base, value) => {
    const timestamp = decodeRuntimeDate(value)
    return Option.isSome(timestamp)
      ? { value: { ...base, type: "date", value: timestamp.value }, runtimeTypeMismatch: false }
      : { value: { ...base, type: "date" }, runtimeTypeMismatch: value !== undefined }
  },
  boolean: (base, value) =>
    typeof value === "boolean"
      ? { value: { ...base, type: "boolean", value }, runtimeTypeMismatch: false }
      : { value: { ...base, type: "boolean" }, runtimeTypeMismatch: value !== undefined },
  array: (base, value) =>
    isJsonArray(value)
      ? { value: { ...base, type: "array", value }, runtimeTypeMismatch: false }
      : { value: { ...base, type: "array" }, runtimeTypeMismatch: value !== undefined },
  ref: (base, value) =>
    typeof value === "string"
      ? { value: { ...base, type: "ref", value }, runtimeTypeMismatch: false }
      : { value: { ...base, type: "ref" }, runtimeTypeMismatch: value !== undefined },
  unknown: (base, value) =>
    isJsonValue(value)
      ? { value: { ...base, type: "unknown", value }, runtimeTypeMismatch: false }
      : { value: { ...base, type: "unknown" }, runtimeTypeMismatch: value !== undefined }
}

const warnCandidateCustomFieldMetadataDegraded = (
  diagnostics: Diagnostics["Service"],
  projections: ReadonlyArray<CustomFieldInfoProjection>,
  runtimeTypeMismatchIds: ReadonlyArray<CustomFieldId>
): Effect.Effect<void> => {
  const fallbackIds = projections
    .filter((projection) => projection.degradationReasons.length > 0)
    .map((projection) => projection.info.id)
  if (fallbackIds.length === 0 && runtimeTypeMismatchIds.length === 0) return Effect.void
  const clauses: Array<string> = []
  if (fallbackIds.length > 0) {
    clauses.push(`fallback labels/owners were used for ${fallbackIds.length} field(s): ${fallbackIds.join(", ")}`)
  }
  if (runtimeTypeMismatchIds.length > 0) {
    clauses.push(
      `runtime values were omitted for ${runtimeTypeMismatchIds.length} field(s) because their types disagreed with metadata: ${runtimeTypeMismatchIds.join(", ")}`
    )
  }
  return diagnostics.warnAgent({
    code: RecruitingCandidateCustomFieldMetadataDegradedWarningCode,
    message:
      `Recruiting Candidate custom-field metadata/value fidelity was degraded: ${clauses.join("; ")}. ` +
      "Treat omitted values as unknown rather than confirmed unset, and inspect the Huly attribute metadata."
  })
}

const candidateFieldValue = (candidate: Candidate, field: CustomFieldInfo): CandidateFieldValueProjection => {
  const value = readCustomFieldValue(candidate, field.ownerClassId, field.name)
  return candidateFieldValueProjectors[field.type](candidateFieldValueBase(field), value)
}

const toMutationResult = (
  candidate: Candidate,
  email: string | undefined,
  field: CustomFieldInfo,
  parsed: ParsedCandidateCustomFieldValue
): RecruitingCandidateCustomFieldMutationResult => {
  const base = {
    candidate: toCandidateRef(candidate, email),
    fieldId: field.id,
    name: field.name,
    label: field.label,
    ownerClassId: field.ownerClassId
  }
  switch (parsed.type) {
    case "string":
    case "markup":
    case "enum":
      return { ...base, type: parsed.type, value: parsed.value, updated: true }
    case "number":
      return { ...base, type: parsed.type, value: parsed.value, updated: true }
    case "date":
      return { ...base, type: parsed.type, value: parsed.value, updated: true }
    case "boolean":
      return { ...base, type: parsed.type, value: parsed.value, updated: true }
  }
}

export const listRecruitingCandidateCustomFields = Effect.fn("RecruitingCandidateCustomFields.list")(function* (
  params: ListRecruitingCandidateCustomFieldsParams
): Effect.fn.Return<ReadonlyArray<CustomFieldInfo>, CandidateCustomFieldReadError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const diagnostics = yield* Diagnostics
  yield* resolveCandidate(client, params.candidate)
  const projections = yield* listCustomFieldDefinitionProjectionsForOwners(
    client,
    RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_IDS,
    params.limit ?? CUSTOM_FIELDS_DEFAULT_LIMIT
  )
  yield* warnCandidateCustomFieldMetadataDegraded(diagnostics, projections, [])
  return projections.map((projection) => projection.info)
})

export const getRecruitingCandidateCustomFieldValues = Effect.fn("RecruitingCandidateCustomFields.getValues")(
  function* (
    params: GetRecruitingCandidateCustomFieldValuesParams
  ): Effect.fn.Return<
    ReadonlyArray<RecruitingCandidateCustomFieldValue>,
    CandidateCustomFieldReadError,
    HulyClient | Diagnostics
  > {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const candidate = yield* resolveCandidate(client, params.candidate)
    const projections = yield* listCustomFieldDefinitionProjectionsForOwners(
      client,
      RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_IDS
    )
    const values = projections.map((projection) => candidateFieldValue(candidate, projection.info))
    const mismatches = values
      .filter((projection) => projection.runtimeTypeMismatch)
      .map((projection) => projection.value.fieldId)
    yield* warnCandidateCustomFieldMetadataDegraded(diagnostics, projections, mismatches)
    return values.map((projection) => projection.value)
  }
)

export const setRecruitingCandidateCustomField = Effect.fn("RecruitingCandidateCustomFields.set")(function* (
  params: SetRecruitingCandidateCustomFieldParams
): Effect.fn.Return<
  RecruitingCandidateCustomFieldMutationResult,
  CandidateCustomFieldWriteError,
  HulyClient | Diagnostics
> {
  const client = yield* HulyClient
  const diagnostics = yield* Diagnostics
  const candidate = yield* resolveCandidate(client, params.candidate)
  const projection = yield* getCustomFieldDefinitionProjection(client, params.fieldId)
  if (projection === undefined) {
    return yield* new CustomFieldNotFoundError({ identifier: params.fieldId })
  }
  yield* warnCandidateCustomFieldMetadataDegraded(diagnostics, [projection], [])
  const writable = yield* parseWritableCandidateCustomField(projection.info)
  const parsed = yield* parseWritableCandidateCustomFieldValue(client, writable, params.value)

  if (writable.owner === "candidate") {
    const mixinAttributes: MixinUpdate<Person, Candidate> = { [writable.field.name]: parsed.value }
    yield* client.updateMixin(
      candidate._id,
      contact.class.Person,
      candidate.space,
      recruitIds.mixin.Candidate,
      mixinAttributes
    )
  } else {
    const personAttributes: DocumentUpdate<Person> = { [writable.field.name]: parsed.value }
    yield* client.updateDoc(contact.class.Person, candidate.space, candidate._id, personAttributes)
  }

  const email = yield* candidateEmail(client, candidate._id)
  return toMutationResult(candidate, email, writable.field, parsed)
})
