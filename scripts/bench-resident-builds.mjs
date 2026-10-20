import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { build } from "esbuild"
import { Schema } from "effect"
import { readFileSync } from "node:fs"

const output = resolve(process.argv[2] ?? ".bench/resident-builds")
await mkdir(output, { recursive: true })
const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString, engines: Schema.Struct({ node: Schema.NonEmptyString }) })))(readFileSync("package.json", "utf8"))
// Keep the JS adapter as an explicit comparison baseline; these are experimental artifacts.
const legacyAdapter = {
  name: "resident-js-adapter-baseline",
  setup(builder) {
    builder.onLoad({ filter: /\/resident\/native-exec\.ts$/ }, ({ path }) => ({
      contents: 'export const startNativeResident = () => import("./managed-adapter-main.js")',
      loader: "js",
      resolveDir: dirname(path)
    }))
  }
}
for (const format of ["cjs", "esm"]) {
  const result = await build({
    entryPoints: ["src/launcher.ts"],
    bundle: true,
    platform: "node",
    format,
    splitting: format === "esm",
    outdir: resolve(output, format),
    outExtension: { ".js": format === "esm" ? ".mjs" : ".cjs" },
    banner: format === "esm" ? { js: 'import {createRequire as __benchmarkRequire} from "node:module"; const require = __benchmarkRequire(import.meta.url);' } : {},
    external: ["ws", "@napi-rs/keyring", "dbus-next"],
    define: { PKG_VERSION: JSON.stringify(manifest.version), NODE_ENGINE_REQUIREMENT: JSON.stringify(manifest.engines.node) },
    metafile: true,
    plugins: [legacyAdapter]
  })
  await writeFile(resolve(output, `${format}-metafile.json`), JSON.stringify(result.metafile, null, 2))
}
