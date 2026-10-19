import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { Schema } from "effect"

export const StdioBundleGrant = Schema.Struct({
  path: Schema.NonEmptyString.check(Schema.makeFilter(isAbsolute)),
  sha256: Schema.String.check(Schema.makeFilter((value) => /^[0-9a-f]{64}$/.test(value)))
})

export const makeStdioBundleGrant = async (path: string): Promise<string> =>
  Schema.encodeSync(Schema.fromJsonString(StdioBundleGrant))({
    path,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex")
  })
