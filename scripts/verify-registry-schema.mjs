#!/usr/bin/env node

import addFormats from "ajv-formats"
import Ajv from "ajv"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const serverJsonPath = join(process.cwd(), "server.json")
const serverJson = JSON.parse(readFileSync(serverJsonPath, "utf-8"))

if (typeof serverJson.$schema !== "string" || serverJson.$schema.length === 0) {
  throw new Error("server.json must define a non-empty $schema URL")
}

const schemaResponse = await fetch(serverJson.$schema)
if (!schemaResponse.ok) {
  throw new Error(`Failed to fetch ${serverJson.$schema}: HTTP ${schemaResponse.status}`)
}

const schema = await schemaResponse.json()
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const validate = ajv.compile(schema)
if (validate(serverJson)) {
  console.log(`server.json validates against ${serverJson.$schema}`)
  process.exit(0)
}

const details = (validate.errors ?? [])
  .map((error) => {
    const location = error.instancePath.length > 0 ? error.instancePath : "/"
    return `- ${location}: ${error.message ?? "schema validation failed"}`
  })
  .join("\n")

throw new Error(`server.json failed schema validation against ${serverJson.$schema}\n${details}`)
