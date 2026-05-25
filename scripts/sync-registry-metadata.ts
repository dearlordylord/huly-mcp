#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { Schema } from "effect"

const PackageJsonSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  mcpName: Schema.String,
  repository: Schema.Struct({
    url: Schema.String
  })
})

const ServerPackageSchema = Schema.Struct({
  registryType: Schema.String,
  identifier: Schema.String,
  version: Schema.String,
  transport: Schema.Unknown,
  environmentVariables: Schema.Unknown
})

const ServerJsonSchema = Schema.Struct({
  $schema: Schema.String,
  name: Schema.String,
  description: Schema.String,
  repository: Schema.Struct({
    url: Schema.String,
    source: Schema.String
  }),
  version: Schema.String,
  packages: Schema.Array(ServerPackageSchema)
})

const normalizeRepositoryUrl = (url: string): string =>
  url.replace(/^git\+/, "").replace(/\.git$/, "")

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf-8"))

const checkMode = process.argv.includes("--check")
const packageJsonPath = join(process.cwd(), "package.json")
const serverJsonPath = join(process.cwd(), "server.json")

const packageJson = Schema.decodeUnknownSync(PackageJsonSchema)(readJson(packageJsonPath))
const serverJson = Schema.decodeUnknownSync(ServerJsonSchema)(readJson(serverJsonPath))

const updatedServerJson = {
  ...serverJson,
  name: packageJson.mcpName,
  repository: {
    ...serverJson.repository,
    url: normalizeRepositoryUrl(packageJson.repository.url)
  },
  version: packageJson.version,
  packages: serverJson.packages.map((entry) =>
    entry.registryType === "npm"
      ? {
        ...entry,
        identifier: packageJson.name,
        version: packageJson.version
      }
      : entry
  )
}

const currentContent = readFileSync(serverJsonPath, "utf-8")
const updatedContent = `${JSON.stringify(updatedServerJson, null, 2)}\n`

if (currentContent === updatedContent) {
  console.log("server.json is in sync with package.json")
  process.exit(0)
}

if (checkMode) {
  console.error("server.json is out of sync with package.json. Run `pnpm sync-registry-metadata`.")
  process.exit(1)
}

writeFileSync(serverJsonPath, updatedContent, "utf-8")
console.log("Updated server.json from package.json")
