import { Effect } from "effect"

import {
  HrLocale,
  HrRequestTypeLabel,
  type HrRequestTypeLabel as HrRequestTypeLabelType,
  type HrRequestTypeLabelResource,
  type HrRequestTypeIdentifier,
  HrRequestTypeNormalizedLocator,
  type HrRequestTypeNormalizedLocator as HrRequestTypeNormalizedLocatorType
} from "../../domain/schemas/hr-requests.js"
import { HulyDataInvalidError } from "../errors.js"

export const HR_LOCALES = HrLocale.literals
const EMBEDDED_PREFIX = "embedded:embedded:"
const HR_STRING_PREFIX = "hr:string:"

const RequestTypeLabelKey = ["Vacation", "Sick", "PTO", "PTO2", "Remote", "Overtime", "Overtime2"] as const
type RequestTypeLabelKey = (typeof RequestTypeLabelKey)[number]

// Exact request-type strings from plugins/hr-assets/lang/*.json at pinned Huly
// 2a985b31e314c0793dd965e5a1d8abe28f262f34. The assets package is not published to npm, so the distributable
// MCP/CLI carries this focused catalog while retaining the authoritative resource ID in every result.
const translations: Record<HrLocale, Record<RequestTypeLabelKey, HrRequestTypeLabelType>> = {
  cs: {
    Vacation: HrRequestTypeLabel.make("Dovolená"),
    Sick: HrRequestTypeLabel.make("Nemoc"),
    PTO: HrRequestTypeLabel.make("PTO"),
    PTO2: HrRequestTypeLabel.make("PTO/2"),
    Remote: HrRequestTypeLabel.make("Vzdáleně"),
    Overtime: HrRequestTypeLabel.make("Přesčas"),
    Overtime2: HrRequestTypeLabel.make("Přesčas/2")
  },
  de: {
    Vacation: HrRequestTypeLabel.make("Urlaub"),
    Sick: HrRequestTypeLabel.make("Krankheit"),
    PTO: HrRequestTypeLabel.make("Bezahlter Urlaub"),
    PTO2: HrRequestTypeLabel.make("Bezahlter Urlaub/2"),
    Remote: HrRequestTypeLabel.make("Homeoffice"),
    Overtime: HrRequestTypeLabel.make("Überstunden"),
    Overtime2: HrRequestTypeLabel.make("Überstunden/2")
  },
  en: {
    Vacation: HrRequestTypeLabel.make("Vacation"),
    Sick: HrRequestTypeLabel.make("Sick"),
    PTO: HrRequestTypeLabel.make("PTO"),
    PTO2: HrRequestTypeLabel.make("PTO/2"),
    Remote: HrRequestTypeLabel.make("Remote"),
    Overtime: HrRequestTypeLabel.make("Overtime"),
    Overtime2: HrRequestTypeLabel.make("Overtime/2")
  },
  es: {
    Vacation: HrRequestTypeLabel.make("Vacaciones"),
    Sick: HrRequestTypeLabel.make("Enfermedad"),
    PTO: HrRequestTypeLabel.make("Permiso retribuido"),
    PTO2: HrRequestTypeLabel.make("Permiso retribuido/2"),
    Remote: HrRequestTypeLabel.make("Teletrabajo"),
    Overtime: HrRequestTypeLabel.make("Horas extra"),
    Overtime2: HrRequestTypeLabel.make("Horas extra/2")
  },
  fr: {
    Vacation: HrRequestTypeLabel.make("Vacances"),
    Sick: HrRequestTypeLabel.make("Malade"),
    PTO: HrRequestTypeLabel.make("Congé payé"),
    PTO2: HrRequestTypeLabel.make("Congé payé/2"),
    Remote: HrRequestTypeLabel.make("Télétravail"),
    Overtime: HrRequestTypeLabel.make("Heures supplémentaires"),
    Overtime2: HrRequestTypeLabel.make("Heures supplémentaires/2")
  },
  it: {
    Vacation: HrRequestTypeLabel.make("Vacanza"),
    Sick: HrRequestTypeLabel.make("Malattia"),
    PTO: HrRequestTypeLabel.make("PTO"),
    PTO2: HrRequestTypeLabel.make("PTO/2"),
    Remote: HrRequestTypeLabel.make("Remoto"),
    Overtime: HrRequestTypeLabel.make("Straordinario"),
    Overtime2: HrRequestTypeLabel.make("Straordinario/2")
  },
  ja: {
    Vacation: HrRequestTypeLabel.make("休暇"),
    Sick: HrRequestTypeLabel.make("病気"),
    PTO: HrRequestTypeLabel.make("有給休暇"),
    PTO2: HrRequestTypeLabel.make("半日有給休暇"),
    Remote: HrRequestTypeLabel.make("リモート"),
    Overtime: HrRequestTypeLabel.make("残業"),
    Overtime2: HrRequestTypeLabel.make("半日残業")
  },
  ko: {
    Vacation: HrRequestTypeLabel.make("휴가"),
    Sick: HrRequestTypeLabel.make("병가"),
    PTO: HrRequestTypeLabel.make("유급 휴가"),
    PTO2: HrRequestTypeLabel.make("반일 유급 휴가"),
    Remote: HrRequestTypeLabel.make("재택근무"),
    Overtime: HrRequestTypeLabel.make("초과 근무"),
    Overtime2: HrRequestTypeLabel.make("반일 초과 근무")
  },
  "pt-br": {
    Vacation: HrRequestTypeLabel.make("Férias"),
    Sick: HrRequestTypeLabel.make("Doença"),
    PTO: HrRequestTypeLabel.make("Ausência remunerada"),
    PTO2: HrRequestTypeLabel.make("Folga remunerada/2"),
    Remote: HrRequestTypeLabel.make("Remoto"),
    Overtime: HrRequestTypeLabel.make("Horas extras"),
    Overtime2: HrRequestTypeLabel.make("Horas extra/2")
  },
  pt: {
    Vacation: HrRequestTypeLabel.make("Férias"),
    Sick: HrRequestTypeLabel.make("Doença"),
    PTO: HrRequestTypeLabel.make("Ausência remunerada"),
    PTO2: HrRequestTypeLabel.make("Ausência remunerada/2"),
    Remote: HrRequestTypeLabel.make("Remoto"),
    Overtime: HrRequestTypeLabel.make("Horas extra"),
    Overtime2: HrRequestTypeLabel.make("Horas extra/2")
  },
  ru: {
    Vacation: HrRequestTypeLabel.make("Отпуск"),
    Sick: HrRequestTypeLabel.make("Больничный"),
    PTO: HrRequestTypeLabel.make("Отгул(PTO)"),
    PTO2: HrRequestTypeLabel.make("Отгул(PTO)/2"),
    Remote: HrRequestTypeLabel.make("Удаленно"),
    Overtime: HrRequestTypeLabel.make("Переработка"),
    Overtime2: HrRequestTypeLabel.make("Переработка/2")
  },
  tr: {
    Vacation: HrRequestTypeLabel.make("Tatil"),
    Sick: HrRequestTypeLabel.make("Hastalık"),
    PTO: HrRequestTypeLabel.make("İzin"),
    PTO2: HrRequestTypeLabel.make("İzin/2"),
    Remote: HrRequestTypeLabel.make("Uzaktan"),
    Overtime: HrRequestTypeLabel.make("Fazla mesai"),
    Overtime2: HrRequestTypeLabel.make("Fazla mesai/2")
  },
  zh: {
    Vacation: HrRequestTypeLabel.make("休假"),
    Sick: HrRequestTypeLabel.make("病假"),
    PTO: HrRequestTypeLabel.make("带薪休假"),
    PTO2: HrRequestTypeLabel.make("带薪休假/2"),
    Remote: HrRequestTypeLabel.make("远程工作"),
    Overtime: HrRequestTypeLabel.make("加班"),
    Overtime2: HrRequestTypeLabel.make("加班/2")
  }
}

const isRequestTypeLabelKey = (key: string): key is RequestTypeLabelKey =>
  RequestTypeLabelKey.some((candidate) => candidate === key)

export const translateHrRequestTypeLabel = (
  resource: HrRequestTypeLabelResource,
  locale: HrLocale
): Effect.Effect<HrRequestTypeLabelType, HulyDataInvalidError> => {
  if (resource.startsWith(EMBEDDED_PREFIX)) {
    const embedded = resource.slice(EMBEDDED_PREFIX.length)
    return embedded.trim() === ""
      ? Effect.fail(
          new HulyDataInvalidError({ operation: "translateHrRequestType", entity: "empty embedded request-type label" })
        )
      : Effect.succeed(HrRequestTypeLabel.make(embedded))
  }
  if (!resource.startsWith(HR_STRING_PREFIX))
    return Effect.fail(
      new HulyDataInvalidError({
        operation: "translateHrRequestType",
        entity: `unsupported request-type label resource '${resource}'`
      })
    )
  const key = resource.slice(HR_STRING_PREFIX.length)
  return isRequestTypeLabelKey(key)
    ? Effect.succeed(HrRequestTypeLabel.make(translations[locale][key]))
    : Effect.fail(
        new HulyDataInvalidError({
          operation: "translateHrRequestType",
          entity: `unknown '${key}' label in the pinned ${locale} HR translation catalog`
        })
      )
}

export const allHrRequestTypeLabels = (resource: HrRequestTypeLabelResource) =>
  Effect.forEach(HR_LOCALES, (locale) => translateHrRequestTypeLabel(resource, locale))

export const normalizeRequestTypeLocator = (identifier: HrRequestTypeIdentifier): HrRequestTypeNormalizedLocatorType =>
  HrRequestTypeNormalizedLocator.make(identifier.trim().toLocaleLowerCase())
