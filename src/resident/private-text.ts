import type * as fs from "node:fs/promises"
import * as path from "node:path"
import { Effect } from "effect"

import {
  closePrivateFile,
  currentPosixOwner,
  fileFailure,
  inspectPrivateDirectory,
  inspectPrivateFile,
  openPrivateFile,
  ProtectedFileError,
  ResidentDirectory,
  ResidentFilePath
} from "./protected-path.js"

const invalidText = () =>
  new ProtectedFileError({ kind: "input", message: "Private resident file is invalid or oversized" })

const readBounded = (handle: fs.FileHandle, maximumBytes: number) =>
  Effect.gen(function* () {
    const bytes = Buffer.alloc(maximumBytes + 1)
    let offset = 0
    while (offset < bytes.length) {
      const next = yield* Effect.tryPromise({
        try: () => handle.read(bytes, offset, bytes.length - offset, offset),
        catch: fileFailure
      })
      if (next.bytesRead === 0) break
      offset += next.bytesRead
    }
    if (offset > maximumBytes) return yield* invalidText()
    return yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset)),
      catch: invalidText
    })
  })

export const readPrivateText = Effect.fn("readPrivateText")(function* (
  requested: ResidentFilePath,
  maximumBytes: number
) {
  const owner = yield* currentPosixOwner
  const absolute = path.resolve(requested)
  const directory = yield* inspectPrivateDirectory(ResidentDirectory.make(path.dirname(absolute)), owner)
  const file = ResidentFilePath.make(path.join(directory, path.basename(absolute)))
  return yield* Effect.acquireUseRelease(
    openPrivateFile(file),
    (handle) => inspectPrivateFile(handle, owner).pipe(Effect.andThen(readBounded(handle, maximumBytes))),
    closePrivateFile
  )
})
