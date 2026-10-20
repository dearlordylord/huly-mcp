import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import { Schema } from "effect"

const EXECUTABLE_MODE = 0o755
const DATA_MODE = 0o644
const PERMISSION_BITS = 0o777

const Sha256 = Schema.String.check(Schema.makeFilter((value) => /^[0-9a-f]{64}$/.test(value)))
const ExecutableCompanion = Schema.Struct({
  path: Schema.Literals([
    "native/huly-stdio-linux-arm64",
    "native/huly-stdio-linux-x64",
    "native/huly-stdio-darwin-arm64",
    "native/huly-stdio-darwin-x64"
  ]),
  sha256: Sha256,
  mode: Schema.Literal(EXECUTABLE_MODE)
})
const LicenseCompanion = Schema.Struct({
  path: Schema.Literal("native/GO-LICENSE"),
  sha256: Sha256,
  mode: Schema.Literal(DATA_MODE)
})
const RuntimeCompanion = Schema.Struct({
  path: Schema.Literal("application.cjs"),
  sha256: Sha256,
  mode: Schema.Literal(EXECUTABLE_MODE)
})
const Companion = Schema.Union([ExecutableCompanion, LicenseCompanion, RuntimeCompanion])
const companionNames = [
  ...ExecutableCompanion.fields.path.literals,
  LicenseCompanion.fields.path.literal,
  RuntimeCompanion.fields.path.literal
]
const Companions = Schema.Array(Companion).check(
  Schema.makeFilter(
    (entries) =>
      entries.length === companionNames.length &&
      new Set(entries.map((entry) => entry.path)).size === companionNames.length
  )
)
export const StdioBundleGrant = Schema.Struct({
  path: Schema.NonEmptyString.check(Schema.makeFilter(isAbsolute)),
  sha256: Sha256,
  companions: Companions
})

export const makeStdioBundleGrant = async (path: string): Promise<string> => {
  const companions = await Promise.all(
    companionNames.map(async (name) => {
      const file = join(dirname(path), name)
      const bytes = await readFile(file)
      return Schema.decodeUnknownSync(Companion)({
        path: name,
        mode: (await stat(file)).mode & PERMISSION_BITS,
        sha256: createHash("sha256").update(bytes).digest("hex")
      })
    })
  )
  return Schema.encodeSync(Schema.fromJsonString(StdioBundleGrant))({
    path,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    companions
  })
}
