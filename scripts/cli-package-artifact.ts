import { createReadStream } from "node:fs"
import { createGunzip } from "node:zlib"

import { Schema } from "effect"
import * as tar from "tar-stream"

const PackMetadataSchema = Schema.Struct({
  filename: Schema.String.pipe(Schema.check(Schema.isEndingWith(".tgz"))),
  files: Schema.Array(Schema.Struct({ path: Schema.NonEmptyString })),
  name: Schema.Literal("@firfi/huly-cli"),
  version: Schema.NonEmptyString
})
export type PackMetadata = Schema.Schema.Type<typeof PackMetadataSchema>

const TarEntryHeaderSchema = Schema.Struct({ size: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))) })

export const parsePnpmPackMetadata = Schema.decodeUnknownSync(Schema.fromJsonString(PackMetadataSchema))

export const tarArchiveUnpackedSize = (archivePath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const extract = tar.extract()
    let total = 0
    extract.on("entry", (header, stream, next) => {
      total += Schema.decodeUnknownSync(TarEntryHeaderSchema)(header).size
      stream.on("end", next)
      stream.resume()
    })
    extract.on("finish", () => resolve(total))
    extract.on("error", reject)
    createReadStream(archivePath).on("error", reject).pipe(createGunzip()).on("error", reject).pipe(extract)
  })
