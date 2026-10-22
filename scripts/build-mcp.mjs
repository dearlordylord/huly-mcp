import { chmod, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { build } from "esbuild"
import { Schema } from "effect"

const Manifest = Schema.Struct({version: Schema.NonEmptyString, engines: Schema.Struct({node: Schema.NonEmptyString}), files: Schema.Array(Schema.NonEmptyString)})
const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(await readFile("package.json","utf8"))
const args = Schema.decodeUnknownSync(Schema.Array(Schema.String.check(Schema.makeFilter((value)=>value.startsWith("--outfile=") || value.startsWith("--define:PKG_VERSION=")))))(process.argv.slice(2))
const outputArgs = args.filter((value) => value.startsWith("--outfile="))
const versionArgs = args.filter((value) => value.startsWith("--define:PKG_VERSION="))
if (outputArgs.length > 1 || versionArgs.length > 1) throw new Error("build:mcp accepts one output path and version override")
const packageVersion = versionArgs[0] === undefined ? manifest.version : Schema.decodeUnknownSync(Schema.fromJsonString(Schema.NonEmptyString))(versionArgs[0].slice("--define:PKG_VERSION=".length))
const outputPath = Schema.decodeUnknownSync(Schema.NonEmptyString)(outputArgs[0]?.slice("--outfile=".length) ?? "dist/index.cjs")
const output = resolve(outputPath)
const application = join(dirname(output), "application.cjs")
await build({entryPoints:["src/launcher.ts"], bundle:true, platform:"node", format:"cjs", outfile:application, logLevel:"warning", external:["ws","@napi-rs/keyring","dbus-next"], define:{PKG_VERSION:JSON.stringify(packageVersion), NODE_ENGINE_REQUIREMENT:JSON.stringify(manifest.engines.node)}})
const launcher = `
import { nativeExecutableFor } from "./src/resident/native-availability.js";
if (process.env.MCP_TRANSPORT === "stdio-resident") {
  const executable = nativeExecutableFor({ platform: process.platform, architecture: process.arch, packageFile: __filename, execveAvailable: typeof process.execve === "function" });
  if (executable !== undefined) {
    process.execve(executable, [executable, process.execPath, __filename], { ...process.env, MCP_NATIVE_EXPECTED_VERSION: ${JSON.stringify(packageVersion)} });
  } else {
    process.stderr.write("Native resident bridge unavailable; starting ordinary stdio\\n");
    process.env.MCP_TRANSPORT = "stdio";
    require("./application.cjs");
  }
} else {
  require("./application.cjs");
}
`
await build({stdin:{contents:launcher,resolveDir:process.cwd(),sourcefile:"native-launcher.js"},bundle:true,platform:"node",format:"cjs",outfile:output,logLevel:"warning",external:["./application.cjs"],banner:{js:"#!/usr/bin/env node"}})
await chmod(output,0o755)
await chmod(application,0o755)

for (const asset of manifest.files.filter((path) => path.startsWith("dist/native/"))) {
  const target = join(dirname(output), asset.slice("dist/".length))
  if (resolve(asset) === target) continue
  await mkdir(dirname(target), {recursive:true})
  await copyFile(resolve(asset), target)
  await chmod(target,(await stat(asset)).mode & 0o777)
}
