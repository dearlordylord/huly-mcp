import { execFileSync } from "node:child_process"

import { Schema } from "effect"

const EFFECT_COHORT_VERSION = "4.0.0-rc.117"
const TSGO_VERSION = "0.36.4"

const requiredVersions = new Map([
  ["effect", EFFECT_COHORT_VERSION],
  ["@effect/platform-node", EFFECT_COHORT_VERSION],
  ["@effect/vitest", EFFECT_COHORT_VERSION],
  ["@effect/tsgo", TSGO_VERSION],
  ["vitest", "5.0.1"],
  ["@vitest/coverage-v8", "5.0.1"],
  ["ioredis", "5.11.1"]
])
const prohibitedPackages = new Set(["@effect/cli", "@effect/platform"])
const foundVersions = new Map()

const DependencySchema = Schema.suspend(() =>
  Schema.Struct({
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, DependencySchema)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, DependencySchema)),
    optionalDependencies: Schema.optionalKey(Schema.Record(Schema.String, DependencySchema)),
    version: Schema.optionalKey(Schema.String)
  })
)
const InstalledProjectsSchema = Schema.Array(DependencySchema)

const recordDependency = (name, dependency) => {
  if (typeof dependency !== "object" || dependency === null) return

  if (requiredVersions.has(name) || prohibitedPackages.has(name) || name.startsWith("@effect/")) {
    const versions = foundVersions.get(name) ?? new Set()
    if (typeof dependency.version === "string") versions.add(dependency.version)
    foundVersions.set(name, versions)
  }

  visitPackage(dependency)
}

const visitPackage = (entry) => {
  if (typeof entry !== "object" || entry === null) return
  for (const [name, dependency] of Object.entries(entry.dependencies ?? {})) recordDependency(name, dependency)
  for (const [name, dependency] of Object.entries(entry.devDependencies ?? {})) recordDependency(name, dependency)
  for (const [name, dependency] of Object.entries(entry.optionalDependencies ?? {})) recordDependency(name, dependency)
}

const installedProjects = Schema.decodeUnknownSync(Schema.fromJsonString(InstalledProjectsSchema))(
  execFileSync("pnpm", ["list", "--recursive", "--depth", "Infinity", "--json"], { encoding: "utf8" })
)

for (const project of installedProjects) visitPackage(project)

const failures = []
for (const [name, expectedVersion] of requiredVersions) {
  const versions = foundVersions.get(name) ?? new Set()
  if (versions.size !== 1 || !versions.has(expectedVersion)) {
    failures.push(
      `${name}: expected only ${expectedVersion}, found ${[...versions].sort((left, right) => left.localeCompare(right)).join(", ") || "nothing"}`
    )
  }
}
for (const name of prohibitedPackages) {
  const versions = foundVersions.get(name) ?? new Set()
  if (versions.size > 0) {
    failures.push(
      `${name}: prohibited package found at ${[...versions].sort((left, right) => left.localeCompare(right)).join(", ")}`
    )
  }
}
for (const [name, versions] of foundVersions) {
  if (requiredVersions.has(name) || prohibitedPackages.has(name)) continue

  const expectedVersion = name.startsWith("@effect/tsgo-") ? TSGO_VERSION : EFFECT_COHORT_VERSION
  if (versions.size !== 1 || !versions.has(expectedVersion)) {
    failures.push(
      `${name}: expected only ${expectedVersion}, found ${[...versions].sort((left, right) => left.localeCompare(right)).join(", ") || "nothing"}`
    )
  }
}

if (failures.length > 0) throw new Error(`Effect dependency cohort mismatch:\n${failures.join("\n")}`)

const tsgoVersion = Schema.decodeUnknownSync(Schema.String)(
  execFileSync("pnpm", ["exec", "effect-tsgo", "--version"], { encoding: "utf8" }).trim()
)
if (tsgoVersion !== `tsgo v${TSGO_VERSION}`) {
  throw new Error(`Effect tsgo native startup mismatch: expected tsgo v${TSGO_VERSION}, found ${tsgoVersion}`)
}

process.stdout.write(
  `Verified exact Effect ${EFFECT_COHORT_VERSION} dependency cohort and native tsgo ${TSGO_VERSION} startup.\n`
)
