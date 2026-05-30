#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const LEDGER_PATH = "plans/sdk-parity-ledger.json"

const MODEL_ROOT_NAMES = [
  "ActivityMessage",
  "AttachedDoc",
  "Attachment",
  "Calendar",
  "Card",
  "ChunterSpace",
  "Class",
  "Doc",
  "Event",
  "Mixin",
  "Preference",
  "Project",
  "Space",
  "Status",
  "Task",
  "ToDo",
  "Type",
  "TypedSpace"
]

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"))

const listHcengineeringPackages = () => {
  const packageJson = readJson("package.json")
  return Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
    .filter((name) => name.startsWith("@hcengineering/"))
    .sort()
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const extendsModelRoot = (extendsClause) =>
  MODEL_ROOT_NAMES.some((root) => new RegExp(`\\b${escapeRegExp(root)}\\b`).test(extendsClause))

const addCandidate = (candidates, entry) => {
  const existing = candidates.get(entry.key)
  if (existing === undefined) {
    candidates.set(entry.key, entry)
    return
  }

  candidates.set(entry.key, {
    ...existing,
    sources: [...existing.sources, ...entry.sources].sort()
  })
}

const walkFiles = (directory, predicate) => {
  if (!existsSync(directory)) return []

  const result = []
  const entries = readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath, predicate))
      continue
    }
    if (predicate(fullPath)) result.push(fullPath)
  }
  return result.sort()
}

const extractClassBlockNames = (text) =>
  [...text.matchAll(/class:\s*\{([\s\S]*?)\n\s*};/g)].flatMap((block) =>
    [...block[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((match) => match[1])
  )

const extractModelDeclarations = (text) =>
  [...text.matchAll(/^export\s+(?:declare\s+)?(?:interface|class)\s+([A-Za-z0-9_]+)\s+extends\s+([^{]+)/gm)]
    .filter((match) => extendsModelRoot(match[2]))
    .map((match) => match[1])

const extractCandidates = () => {
  const candidates = new Map()

  for (const packageName of listHcengineeringPackages()) {
    const packagePathParts = packageName.split("/")
    const typesDir = join("node_modules", ...packagePathParts, "types")
    if (!existsSync(typesDir)) continue

    const files = [
      "analytics.d.ts",
      "classes.d.ts",
      "component.d.ts",
      "index.d.ts",
      "plugin.d.ts",
      "status.d.ts",
      "types.d.ts",
      "versioning.d.ts"
    ].filter((fileName) => existsSync(join(typesDir, fileName)))

    for (const fileName of files) {
      const filePath = join(typesDir, fileName)
      const text = readFileSync(filePath, "utf-8")

      for (const exportName of extractClassBlockNames(text)) {
        addCandidate(candidates, {
          key: `${packageName}#${exportName}`,
          packageName,
          exportName,
          sources: [`${filePath}:plugin-class`]
        })
      }

      for (const exportName of extractModelDeclarations(text)) {
        addCandidate(candidates, {
          key: `${packageName}#${exportName}`,
          packageName,
          exportName,
          sources: [`${filePath}:model-declaration`]
        })
      }
    }
  }

  return candidates
}

const extractReferenceModelAreas = () => {
  const root = ".reference/platform/models"
  if (!existsSync(root)) return new Set()

  const areas = new Set()
  const modelFiles = walkFiles(root, (filePath) => filePath.endsWith(".ts") && !filePath.endsWith(".test.ts"))

  for (const filePath of modelFiles) {
    const text = readFileSync(filePath, "utf-8")
    if (!/@(?:Model|Mixin)\(/.test(text)) continue

    const relativePath = filePath.slice(`${root}/`.length)
    const [area] = relativePath.split("/")
    if (area !== undefined && area.length > 0) areas.add(area)
  }

  return areas
}

const flattenLedger = (ledger) => {
  const entries = new Map()
  const duplicateKeys = []

  for (const group of ledger.groups ?? []) {
    for (const exportName of group.exports ?? []) {
      const key = `${group.package}#${exportName}`
      if (entries.has(key)) duplicateKeys.push(key)
      entries.set(key, {
        key,
        packageName: group.package,
        exportName,
        status: group.status,
        matrixLocation: group.matrixLocation,
        rationale: group.rationale
      })
    }
  }

  return { entries, duplicateKeys }
}

const flattenReferenceAreas = (ledger) => {
  const entries = new Map()
  const duplicateKeys = []

  for (const group of ledger.referenceModelAreas ?? []) {
    for (const area of group.areas ?? []) {
      if (entries.has(area)) duplicateKeys.push(area)
      entries.set(area, {
        area,
        status: group.status,
        matrixLocation: group.matrixLocation,
        rationale: group.rationale
      })
    }
  }

  return { entries, duplicateKeys }
}

const validateLedgerShape = (ledger) => {
  const validStatuses = new Set(["covered", "gap", "ignored", "not-mcp-facing"])
  const errors = []

  if (ledger.schemaVersion !== 1) errors.push("ledger schemaVersion must be 1")
  if (!Array.isArray(ledger.groups)) errors.push("ledger groups must be an array")
  if (!Array.isArray(ledger.referenceModelAreas)) errors.push("ledger referenceModelAreas must be an array")

  for (const [index, group] of (ledger.groups ?? []).entries()) {
    if (typeof group.package !== "string" || !group.package.startsWith("@hcengineering/")) {
      errors.push(`group ${index} has invalid package`)
    }
    if (!validStatuses.has(group.status)) errors.push(`group ${index} has invalid status '${group.status}'`)
    if (typeof group.rationale !== "string" || group.rationale.length === 0) {
      errors.push(`group ${index} must include a rationale`)
    }
    if ((group.status === "covered" || group.status === "gap") && typeof group.matrixLocation !== "string") {
      errors.push(`group ${index} with status ${group.status} must include matrixLocation`)
    }
    if (!Array.isArray(group.exports) || group.exports.length === 0) {
      errors.push(`group ${index} must include at least one export`)
    }
  }

  for (const [index, group] of (ledger.referenceModelAreas ?? []).entries()) {
    if (!validStatuses.has(group.status)) {
      errors.push(`referenceModelAreas group ${index} has invalid status '${group.status}'`)
    }
    if (typeof group.rationale !== "string" || group.rationale.length === 0) {
      errors.push(`referenceModelAreas group ${index} must include a rationale`)
    }
    if ((group.status === "covered" || group.status === "gap") && typeof group.matrixLocation !== "string") {
      errors.push(`referenceModelAreas group ${index} with status ${group.status} must include matrixLocation`)
    }
    if (!Array.isArray(group.areas) || group.areas.length === 0) {
      errors.push(`referenceModelAreas group ${index} must include at least one area`)
    }
  }

  return errors
}

const formatEntry = (entry) => `${entry.key} (${entry.sources.join(", ")})`

const main = () => {
  const candidates = extractCandidates()
  const referenceAreas = extractReferenceModelAreas()
  const ledger = readJson(LEDGER_PATH)
  const shapeErrors = validateLedgerShape(ledger)
  const { entries, duplicateKeys } = flattenLedger(ledger)
  const {
    entries: referenceAreaEntries,
    duplicateKeys: duplicateReferenceAreas
  } = flattenReferenceAreas(ledger)

  const unmapped = [...candidates.values()].filter((candidate) => !entries.has(candidate.key))
  const stale = [...entries.values()].filter((entry) => !candidates.has(entry.key))
  const unmappedReferenceAreas = [...referenceAreas.values()].filter((area) => !referenceAreaEntries.has(area))
  const staleReferenceAreas = [...referenceAreaEntries.values()].filter((entry) => !referenceAreas.has(entry.area))
  const errors = [
    ...shapeErrors,
    ...duplicateKeys.map((key) => `duplicate ledger classification for ${key}`),
    ...duplicateReferenceAreas.map((area) => `duplicate reference model area classification for ${area}`),
    ...unmapped.map((entry) => `unmapped SDK model export: ${formatEntry(entry)}`),
    ...stale.map((entry) => `stale ledger classification: ${entry.key}`),
    ...unmappedReferenceAreas.map((area) => `unmapped reference model area: ${area}`),
    ...staleReferenceAreas.map((entry) => `stale reference model area classification: ${entry.area}`)
  ]

  if (errors.length > 0) {
    console.error("SDK parity ledger is out of sync:")
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }

  const statusCounts = [...entries.values()].reduce((counts, entry) => {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1)
    return counts
  }, new Map())

  const summary = [...statusCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ")

  console.log(
    `SDK parity ledger covers ${entries.size} SDK model exports (${summary}) and ${referenceAreaEntries.size} reference model areas`
  )
}

main()
