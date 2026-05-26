#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const requiredString = (value, field) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string`)
  }
  return value
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"))

const normalizeRepositoryUrl = (url) =>
  url.replace(/^git\+/, "").replace(/\.git$/, "")

const checkMode = process.argv.includes("--check")
const packageJsonPath = join(process.cwd(), "package.json")
const serverJsonPath = join(process.cwd(), "server.json")

const packageJson = readJson(packageJsonPath)
const serverJson = readJson(serverJsonPath)

const packageName = requiredString(packageJson.name, "package.json name")
const packageVersion = requiredString(packageJson.version, "package.json version")
const mcpName = requiredString(packageJson.mcpName, "package.json mcpName")
const homepage = requiredString(packageJson.homepage, "package.json homepage")
const repositoryUrl = requiredString(packageJson.repository?.url, "package.json repository.url")

if (!Array.isArray(serverJson.packages)) {
  throw new Error("Expected server.json packages to be an array")
}

const updatedServerJson = {
  ...serverJson,
  name: mcpName,
  repository: {
    ...serverJson.repository,
    url: normalizeRepositoryUrl(repositoryUrl)
  },
  websiteUrl: homepage,
  version: packageVersion,
  packages: serverJson.packages.map((entry) =>
    entry?.registryType === "npm"
      ? {
        ...entry,
        identifier: packageName,
        version: packageVersion
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
