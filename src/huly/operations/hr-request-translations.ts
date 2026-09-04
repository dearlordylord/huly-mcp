import { Effect } from "effect"

import { HrLocale, type HrRequestTypeIdentifier } from "../../domain/schemas/hr-requests.js"
import { NonEmptyString, type NonEmptyString as NonEmptyStringType } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

export const HR_LOCALES = HrLocale.literals
const EMBEDDED_PREFIX = "embedded:embedded:"
const HR_STRING_PREFIX = "hr:string:"

const RequestTypeLabelKey = ["Vacation", "Sick", "PTO", "PTO2", "Remote", "Overtime", "Overtime2"] as const
type RequestTypeLabelKey = (typeof RequestTypeLabelKey)[number]

// Exact request-type strings from plugins/hr-assets/lang/*.json at pinned Huly
// 2a985b31e314c0793dd965e5a1d8abe28f262f34. The assets package is not published to npm, so the distributable
// MCP/CLI carries this focused catalog while retaining the authoritative resource ID in every result.
const translations: Record<HrLocale, Record<RequestTypeLabelKey, string>> = {
  cs: {
    Vacation: "Dovolená",
    Sick: "Nemoc",
    PTO: "PTO",
    PTO2: "PTO/2",
    Remote: "Vzdáleně",
    Overtime: "Přesčas",
    Overtime2: "Přesčas/2"
  },
  de: {
    Vacation: "Urlaub",
    Sick: "Krankheit",
    PTO: "Bezahlter Urlaub",
    PTO2: "Bezahlter Urlaub/2",
    Remote: "Homeoffice",
    Overtime: "Überstunden",
    Overtime2: "Überstunden/2"
  },
  en: {
    Vacation: "Vacation",
    Sick: "Sick",
    PTO: "PTO",
    PTO2: "PTO/2",
    Remote: "Remote",
    Overtime: "Overtime",
    Overtime2: "Overtime/2"
  },
  es: {
    Vacation: "Vacaciones",
    Sick: "Enfermedad",
    PTO: "Permiso retribuido",
    PTO2: "Permiso retribuido/2",
    Remote: "Teletrabajo",
    Overtime: "Horas extra",
    Overtime2: "Horas extra/2"
  },
  fr: {
    Vacation: "Vacances",
    Sick: "Malade",
    PTO: "Congé payé",
    PTO2: "Congé payé/2",
    Remote: "Télétravail",
    Overtime: "Heures supplémentaires",
    Overtime2: "Heures supplémentaires/2"
  },
  it: {
    Vacation: "Vacanza",
    Sick: "Malattia",
    PTO: "PTO",
    PTO2: "PTO/2",
    Remote: "Remoto",
    Overtime: "Straordinario",
    Overtime2: "Straordinario/2"
  },
  ja: {
    Vacation: "休暇",
    Sick: "病気",
    PTO: "有給休暇",
    PTO2: "半日有給休暇",
    Remote: "リモート",
    Overtime: "残業",
    Overtime2: "半日残業"
  },
  ko: {
    Vacation: "휴가",
    Sick: "병가",
    PTO: "유급 휴가",
    PTO2: "반일 유급 휴가",
    Remote: "재택근무",
    Overtime: "초과 근무",
    Overtime2: "반일 초과 근무"
  },
  "pt-br": {
    Vacation: "Férias",
    Sick: "Doença",
    PTO: "Ausência remunerada",
    PTO2: "Folga remunerada/2",
    Remote: "Remoto",
    Overtime: "Horas extras",
    Overtime2: "Horas extra/2"
  },
  pt: {
    Vacation: "Férias",
    Sick: "Doença",
    PTO: "Ausência remunerada",
    PTO2: "Ausência remunerada/2",
    Remote: "Remoto",
    Overtime: "Horas extra",
    Overtime2: "Horas extra/2"
  },
  ru: {
    Vacation: "Отпуск",
    Sick: "Больничный",
    PTO: "Отгул(PTO)",
    PTO2: "Отгул(PTO)/2",
    Remote: "Удаленно",
    Overtime: "Переработка",
    Overtime2: "Переработка/2"
  },
  tr: {
    Vacation: "Tatil",
    Sick: "Hastalık",
    PTO: "İzin",
    PTO2: "İzin/2",
    Remote: "Uzaktan",
    Overtime: "Fazla mesai",
    Overtime2: "Fazla mesai/2"
  },
  zh: {
    Vacation: "休假",
    Sick: "病假",
    PTO: "带薪休假",
    PTO2: "带薪休假/2",
    Remote: "远程工作",
    Overtime: "加班",
    Overtime2: "加班/2"
  }
}

const isRequestTypeLabelKey = (key: string): key is RequestTypeLabelKey =>
  RequestTypeLabelKey.some((candidate) => candidate === key)

export const translateHrRequestTypeLabel = (
  resource: NonEmptyStringType,
  locale: HrLocale
): Effect.Effect<NonEmptyStringType, HulyDataInvalidError> => {
  if (resource.startsWith(EMBEDDED_PREFIX)) {
    const embedded = resource.slice(EMBEDDED_PREFIX.length)
    return embedded.trim() === ""
      ? Effect.fail(
          new HulyDataInvalidError({ operation: "translateHrRequestType", entity: "empty embedded request-type label" })
        )
      : Effect.succeed(NonEmptyString.make(embedded))
  }
  if (!resource.startsWith(HR_STRING_PREFIX)) return Effect.succeed(resource)
  const key = resource.slice(HR_STRING_PREFIX.length)
  return isRequestTypeLabelKey(key)
    ? Effect.succeed(NonEmptyString.make(translations[locale][key]))
    : Effect.fail(
        new HulyDataInvalidError({
          operation: "translateHrRequestType",
          entity: `unknown '${key}' label in the pinned ${locale} HR translation catalog`
        })
      )
}

export const allHrRequestTypeLabels = (resource: NonEmptyStringType) =>
  Effect.forEach(HR_LOCALES, (locale) => translateHrRequestTypeLabel(resource, locale))

export const normalizeRequestTypeLocator = (identifier: HrRequestTypeIdentifier): string =>
  identifier.trim().toLocaleLowerCase()
