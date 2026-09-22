import { builtinModules } from "node:module"
import { readFileSync } from "node:fs"

import { Console, Effect, Schema } from "effect"

const CliPackageJsonSchema = Schema.Struct({
  bin: Schema.Struct({ huly: Schema.Literal("./dist/index.cjs") }),
  dependencies: Schema.Record(Schema.String, Schema.String),
  files: Schema.Array(Schema.String),
  main: Schema.Literal("./dist/index.cjs"),
  name: Schema.Literal("@firfi/huly-cli")
})

const cliPackageJson = Schema.decodeUnknownSync(Schema.fromJsonString(CliPackageJsonSchema))(
  readFileSync("packages/huly-cli/package.json", "utf8")
)
const bundle = readFileSync("packages/huly-cli/dist/index.cjs", "utf8")
const requirePattern = /require\("([^".][^"]*)"\)/g
const requiredModules = new Set(
  Array.from(bundle.matchAll(requirePattern), (match) => match[1]).filter((name): name is string => name !== undefined)
)
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])
const externalModules = [...requiredModules].filter((name) => !name.startsWith("node:") && !builtins.has(name)).sort()
const undeclared = externalModules.filter((name) => cliPackageJson.dependencies[name] === undefined)
const EXPECTED_EXTERNAL_MODULES: ReadonlyArray<string> = ["ws"]
const EXPECTED_PACKAGE_FILE_COUNT = 2

const errors = [
  cliPackageJson.files.length === EXPECTED_PACKAGE_FILE_COUNT &&
  cliPackageJson.files[0] === "dist/index.cjs" &&
  cliPackageJson.files[1] === "skills"
    ? undefined
    : "CLI package files must contain dist/index.cjs and the Agent Skill directory.",
  undeclared.length === 0 ? undefined : `CLI bundle has undeclared runtime dependencies: ${undeclared.join(", ")}.`,
  externalModules.length === EXPECTED_EXTERNAL_MODULES.length &&
  externalModules.every((name, index) => name === EXPECTED_EXTERNAL_MODULES[index])
    ? undefined
    : `CLI bundle external dependency set must be exactly ${EXPECTED_EXTERNAL_MODULES.join(", ")}; found ${externalModules.join(", ") || "none"}.`
].filter((message) => message !== undefined)

if (errors.length > 0) {
  for (const error of errors) Effect.runSync(Console.error(error))
  process.exitCode = 1
} else {
  Effect.runSync(
    Console.log(
      `CLI package closure verified: bundled shared registry plus exactly one declared external runtime dependency (${EXPECTED_EXTERNAL_MODULES[0]}).`
    )
  )
}
